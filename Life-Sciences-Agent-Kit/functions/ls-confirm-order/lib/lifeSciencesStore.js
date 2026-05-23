'use strict';

const fs = require('fs');
const path = require('path');

const LOW_STOCK_BAG_THRESHOLD = 24;

function defaultProducts() {
  return [
    {
      productId: 'LS-PROD-001',
      name: '0.9% Sodium Chloride Injection (Normal Saline, 1L bags)',
      shortName: 'Normal Saline',
      aliases: [
        'normal saline',
        'saline',
        'ns',
        '0.9% sodium chloride',
        'sodium chloride injection',
        'product 1',
      ],
      unit: 'bag',
      caseSize: 12,
      stockBags: 480,
      unitPriceAud: 8.5,
      currency: 'AUD',
    },
    {
      productId: 'LS-PROD-002',
      name: "5% Dextrose in Lactated Ringer's Solution (D5LR, 500ml bags)",
      shortName: 'D5LR',
      aliases: [
        'd5lr',
        'dextrose lactated ringers',
        'dextrose in lactated ringers',
        "5% dextrose in lactated ringer's",
        'product 2',
      ],
      unit: 'bag',
      caseSize: 12,
      stockBags: 18,
      unitPriceAud: 12.0,
      currency: 'AUD',
    },
    {
      productId: 'LS-PROD-003',
      name: "Lactated Ringer's Injection (1L bags)",
      shortName: "Lactated Ringer's",
      aliases: ['lactated ringers', 'lr', 'ringers', 'lactated ringer'],
      unit: 'bag',
      caseSize: 12,
      stockBags: 216,
      unitPriceAud: 9.25,
      currency: 'AUD',
    },
    {
      productId: 'LS-PROD-004',
      name: 'Sterile Water for Injection (500ml bags)',
      shortName: 'Sterile Water',
      aliases: ['sterile water', 'swfi', 'water for injection'],
      unit: 'bag',
      caseSize: 20,
      stockBags: 160,
      unitPriceAud: 6.75,
      currency: 'AUD',
    },
    {
      productId: 'LS-PROD-005',
      name: '0.45% Sodium Chloride Injection (Half Normal Saline, 1L bags)',
      shortName: 'Half Normal Saline',
      aliases: ['half normal saline', '0.45% sodium chloride', 'half ns'],
      unit: 'bag',
      caseSize: 12,
      stockBags: 96,
      unitPriceAud: 8.0,
      currency: 'AUD',
    },
    {
      productId: 'LS-PROD-006',
      name: '10% Dextrose Injection (500ml bags)',
      shortName: 'D10',
      aliases: ['d10', '10% dextrose', 'dextrose 10%'],
      unit: 'bag',
      caseSize: 12,
      stockBags: 0,
      unitPriceAud: 14.5,
      currency: 'AUD',
    },
  ];
}

function roundMoney(amount) {
  return Number(Number(amount).toFixed(2));
}

function productPricing(product) {
  const unitPriceAud = roundMoney(product.unitPriceAud ?? 0);
  const caseSize = Number(product.caseSize) || 1;
  const currency = product.currency || 'AUD';
  return {
    currency,
    unitPriceAud,
    pricePerCaseAud: roundMoney(unitPriceAud * caseSize),
    priceUnit: 'per bag',
  };
}

function quoteLine(product, quantity, unit) {
  const pricing = productPricing(product);
  const bagsRequested = bagsForQuantity(product, quantity, unit);
  const parsedUnit = parseUnit(unit) || (unit ? String(unit) : 'bag');
  const qty = Math.floor(Number(quantity) || 0);
  const lineTotalAud = roundMoney(bagsRequested * pricing.unitPriceAud);
  return {
    ...pricing,
    requestedQuantity: qty,
    requestedUnit: parsedUnit,
    bagsQuoted: bagsRequested,
    lineTotalAud,
    lineTotalDisplay: `${pricing.currency} $${lineTotalAud.toFixed(2)}`,
  };
}

function defaultData() {
  return {
    meta: { lastCustomerSeq: 100, lastOrderSeq: 5000 },
    products: defaultProducts(),
    customers: [],
    orders: [],
  };
}

function isReadonlyDeployLayout() {
  const defaultFile = path.join(__dirname, '..', 'data', 'life-sciences.json');
  const norm = defaultFile.replace(/\\/g, '/');
  return norm.startsWith('/var/task/');
}

function isAwsLambdaEnv() {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      (process.env.AWS_EXECUTION_ENV &&
        String(process.env.AWS_EXECUTION_ENV).includes('Lambda')),
  );
}

function cloudWritableStorePath() {
  return path.join('/tmp', 'life-sciences-agent.json');
}

function resolveStorePath(explicit) {
  if (explicit) return explicit;
  if (process.env.LIFE_SCIENCES_STORE_PATH) return process.env.LIFE_SCIENCES_STORE_PATH;
  if (isReadonlyDeployLayout() || isAwsLambdaEnv()) return cloudWritableStorePath();
  return path.join(__dirname, '..', 'data', 'life-sciences.json');
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function bundledDemoPath() {
  return path.join(__dirname, '..', 'data', 'life-sciences.json');
}

function loadStore(storePath) {
  const p = resolveStorePath(storePath);
  if (!fs.existsSync(p)) {
    const bundled = bundledDemoPath();
    const seed = fs.existsSync(bundled)
      ? JSON.parse(fs.readFileSync(bundled, 'utf8'))
      : defaultData();
    ensureDirForFile(p);
    fs.writeFileSync(p, JSON.stringify(seed, null, 2), 'utf8');
    return { path: p, data: seed };
  }
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function saveStore(storePath, data) {
  const p = resolveStorePath(storePath);
  ensureDirForFile(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function normalizePhone(input) {
  if (input == null) return '';
  let d = String(input).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0') && d.length === 10) return `61${d.slice(1)}`;
  return d;
}

function normalizeKey(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ');
}

function stockStatusForBags(stockBags) {
  if (stockBags <= 0) return 'out_of_stock';
  if (stockBags < LOW_STOCK_BAG_THRESHOLD) return 'low_stock';
  return 'available';
}

function productView(product) {
  const stockBags = Number(product.stockBags) || 0;
  const caseSize = Number(product.caseSize) || 1;
  const stockCases = Math.floor(stockBags / caseSize);
  const status = stockStatusForBags(stockBags);
  const pricing = productPricing(product);
  return {
    productId: product.productId,
    name: product.name,
    shortName: product.shortName,
    unit: product.unit,
    caseSize,
    stockBags,
    stockCases,
    stockStatus: status,
    lowStock: status === 'low_stock',
    available: status !== 'out_of_stock',
    ...pricing,
  };
}

function findProduct(data, query) {
  const q = normalizeKey(query);
  if (!q) return null;
  const byId = data.products.find(
    (p) => normalizeKey(p.productId) === q || normalizeKey(p.shortName) === q,
  );
  if (byId) return byId;
  return (
    data.products.find((p) => {
      if (normalizeKey(p.name).includes(q) || normalizeKey(p.shortName).includes(q)) {
        return true;
      }
      return (p.aliases || []).some(
        (a) => normalizeKey(a) === q || normalizeKey(a).includes(q) || q.includes(normalizeKey(a)),
      );
    }) || null
  );
}

function parseUnit(raw) {
  const s = normalizeKey(raw);
  if (!s) return null;
  if (s === 'case' || s === 'cases') return 'case';
  if (s === 'bag' || s === 'bags') return 'bag';
  return null;
}

function bagsForQuantity(product, quantity, unit) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) return 0;
  const u = parseUnit(unit) || 'bag';
  const caseSize = Number(product.caseSize) || 1;
  if (u === 'case') return qty * caseSize;
  return qty;
}

function checkAvailability(product, quantity, unit) {
  const bagsRequested = bagsForQuantity(product, quantity, unit);
  const stockBags = Number(product.stockBags) || 0;
  const caseSize = Number(product.caseSize) || 1;
  const parsedUnit = parseUnit(unit) || (unit ? String(unit) : 'bag');
  const canFulfill = bagsRequested > 0 && bagsRequested <= stockBags;
  const status = stockStatusForBags(stockBags);
  const pricing =
    bagsRequested > 0 ? quoteLine(product, quantity, unit) : productPricing(product);
  const priceNote =
    bagsRequested > 0
      ? ` Price: ${pricing.lineTotalDisplay} (${pricing.unitPriceAud} AUD per bag).`
      : '';
  return {
    productId: product.productId,
    shortName: product.shortName,
    name: product.name,
    requestedQuantity: Number(quantity) || 0,
    requestedUnit: parsedUnit,
    bagsRequested,
    stockBags,
    stockCases: Math.floor(stockBags / caseSize),
    stockStatus: status,
    lowStock: status === 'low_stock',
    canFulfill,
    shortfallBags: canFulfill ? 0 : Math.max(0, bagsRequested - stockBags),
    remainingBagsAfterOrder: canFulfill ? stockBags - bagsRequested : stockBags,
    pricing,
    message: canFulfill
      ? `Can fulfill ${quantity} ${parsedUnit}(s) of ${product.shortName}.${priceNote}`
      : bagsRequested <= 0
        ? 'Provide a positive quantity to check availability.'
        : `Insufficient stock for ${product.shortName}: need ${bagsRequested} bag(s), only ${stockBags} on hand.`,
  };
}

function findCustomer(data, { uniqueIdentifier, phone, accountNumber }) {
  const uid = uniqueIdentifier ? String(uniqueIdentifier).trim().toUpperCase() : '';
  const acct = accountNumber ? String(accountNumber).trim().toUpperCase() : '';
  const p = phone ? normalizePhone(phone) : '';

  const byUid = uid
    ? data.customers.filter(
        (c) => String(c.uniqueIdentifier || '').trim().toUpperCase() === uid,
      )
    : [];
  const byAcct = acct
    ? data.customers.filter(
        (c) => String(c.accountNumber || '').trim().toUpperCase() === acct,
      )
    : [];
  const byPhone = p
    ? data.customers.filter((c) => normalizePhone(c.phone) === p)
    : [];

  const keys = [Boolean(uid), Boolean(acct), Boolean(p)].filter(Boolean).length;
  if (keys === 0) return null;

  if (uid && acct && p) {
    const strict = data.customers.filter(
      (c) =>
        String(c.uniqueIdentifier || '').trim().toUpperCase() === uid &&
        String(c.accountNumber || '').trim().toUpperCase() === acct &&
        normalizePhone(c.phone) === p,
    );
    if (strict.length === 1) return strict[0];
    return null;
  }

  if (uid && acct) {
    const strict = data.customers.filter(
      (c) =>
        String(c.uniqueIdentifier || '').trim().toUpperCase() === uid &&
        String(c.accountNumber || '').trim().toUpperCase() === acct,
    );
    if (strict.length === 1) return strict[0];
    return null;
  }

  if (uid && p) {
    const strict = data.customers.filter(
      (c) =>
        String(c.uniqueIdentifier || '').trim().toUpperCase() === uid &&
        normalizePhone(c.phone) === p,
    );
    if (strict.length === 1) return strict[0];
    return null;
  }

  if (acct && p) {
    const strict = data.customers.filter(
      (c) =>
        String(c.accountNumber || '').trim().toUpperCase() === acct &&
        normalizePhone(c.phone) === p,
    );
    if (strict.length === 1) return strict[0];
    return null;
  }

  if (uid && byUid.length === 1) return byUid[0];
  if (acct && byAcct.length === 1) return byAcct[0];
  if (p && byPhone.length === 1) return byPhone[0];

  return null;
}

function lastOrderForCustomer(data, customer) {
  if (customer && customer.lastOrder && customer.lastOrder.orderNumber) {
    return customer.lastOrder;
  }
  const orders = data.orders
    .filter((o) => o.customerId === customer.customerId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return orders[0] || null;
}

function lastOrderShape(lastOrder) {
  if (!lastOrder) return null;
  return {
    orderNumber: lastOrder.orderNumber,
    productId: lastOrder.productId || null,
    productName:
      lastOrder.productName ||
      (lastOrder.lines && lastOrder.lines[0] && lastOrder.lines[0].productName) ||
      null,
    quantity:
      lastOrder.quantity != null
        ? lastOrder.quantity
        : lastOrder.lines && lastOrder.lines[0]
          ? lastOrder.lines[0].quantity
          : null,
    unit:
      lastOrder.unit ||
      (lastOrder.lines && lastOrder.lines[0] && lastOrder.lines[0].unit) ||
      null,
    orderedAt: lastOrder.orderedAt || lastOrder.createdAt || null,
  };
}

/** Compare caller-stated last order to on-file last order (identity validation). */
function verifyStatedLastOrder(data, onFile, stated) {
  const productName = stated.productName ? String(stated.productName).trim() : '';
  const quantityRaw = stated.quantity;
  const unitRaw = stated.unit ? String(stated.unit).trim() : '';
  const hasStated =
    productName !== '' ||
    (quantityRaw != null && String(quantityRaw).trim() !== '') ||
    unitRaw !== '';

  if (!hasStated) {
    return {
      required: true,
      match: null,
      message:
        'Collect what the caller says their last order was (product, quantity, unit) and pass statedLastProduct, statedLastQuantity, statedLastUnit.',
    };
  }

  if (!onFile) {
    return {
      required: true,
      match: false,
      message: 'No last order on file for this account; cannot validate stated last order.',
      onFile: null,
      stated: {
        productName: productName || null,
        quantity: quantityRaw != null ? Number(quantityRaw) : null,
        unit: parseUnit(unitRaw) || unitRaw || null,
      },
    };
  }

  const onFileShape = lastOrderShape(onFile);
  const onFileProduct = findProduct(data, onFileShape.productName || onFileShape.productId);
  const statedProduct = findProduct(data, productName || onFileShape.productName);
  const statedQty = Math.floor(Number(quantityRaw) || 0);
  const onFileQty = Math.floor(Number(onFileShape.quantity) || 0);
  const statedUnit = parseUnit(unitRaw) || parseUnit(onFileShape.unit) || 'bag';
  const onFileUnit = parseUnit(onFileShape.unit) || 'bag';

  const productMatch =
    !productName ||
    (onFileProduct &&
      statedProduct &&
      onFileProduct.productId === statedProduct.productId);
  const quantityMatch = quantityRaw == null || String(quantityRaw).trim() === '' || statedQty === onFileQty;
  const unitMatch = !unitRaw || statedUnit === onFileUnit;
  const match = Boolean(productMatch && quantityMatch && unitMatch);

  return {
    required: true,
    match,
    onFile: onFileShape,
    stated: {
      productName: productName || null,
      productId: statedProduct ? statedProduct.productId : null,
      quantity: statedQty || null,
      unit: statedUnit,
    },
    message: match
      ? 'Stated last order matches on-file last order.'
      : 'Stated last order does not match on-file last order.',
  };
}

function nextCustomerId(data) {
  data.meta.lastCustomerSeq += 1;
  return `LSC-${data.meta.lastCustomerSeq}`;
}

function nextOrderNumber(data) {
  data.meta.lastOrderSeq += 1;
  return `LSO-${data.meta.lastOrderSeq}`;
}

function maskPhone(digits) {
  const d = String(digits || '');
  if (d.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

module.exports = {
  LOW_STOCK_BAG_THRESHOLD,
  loadStore,
  saveStore,
  normalizePhone,
  normalizeKey,
  productView,
  findProduct,
  parseUnit,
  bagsForQuantity,
  checkAvailability,
  findCustomer,
  lastOrderForCustomer,
  lastOrderShape,
  verifyStatedLastOrder,
  nextCustomerId,
  nextOrderNumber,
  maskPhone,
  stockStatusForBags,
  productPricing,
  quoteLine,
  roundMoney,
};
