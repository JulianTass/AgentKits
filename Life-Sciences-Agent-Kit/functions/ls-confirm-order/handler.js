'use strict';

const {
  loadStore,
  saveStore,
  findProduct,
  checkAvailability,
  quoteLine,
  roundMoney,
  nextOrderNumber,
  productView,
  resolveCustomerForOrderOpen,
  normalizeCustomerId,
} = require('./lib/lifeSciencesStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function pickQuantity(input, keys) {
  const raw = keys.reduce((acc, k) => (acc != null ? acc : input[k]), null);
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseLineItems(input) {
  const raw = input.lineItems ?? input.LineItems ?? input.items ?? input.Items ?? input.orderLines;
  if (Array.isArray(raw) && raw.length) {
    return raw.filter((x) => x && typeof x === 'object');
  }
  const productName = pickStr(input, [
    'productName',
    'ProductName',
    'productName_ls',
    'product',
    'Product',
    'productId',
    'ProductId',
  ]);
  const quantity = pickQuantity(input, ['quantity', 'Quantity', 'qty', 'Qty', 'quantity_stock_ls']);
  const unit = pickStr(input, ['unit', 'Unit', 'unit_ls']);
  if (productName && quantity != null) {
    return [{ productName, quantity, unit }];
  }
  return [];
}

async function run(input) {
  const linesIn = parseLineItems(input);
  if (!linesIn.length) {
    return fail(
      'Provide lineItems (array) or a single productName with quantity and unit (case or bag).',
      'MISSING_LINE_ITEMS',
    );
  }

  const customerId = normalizeCustomerId(
    pickStr(input, ['customerId', 'CustomerId', 'customer_id', 'CustomerID', 'customerId_ls']),
  );
  const accountNumber = pickStr(input, [
    'accountNumber',
    'AccountNumber',
    'accountNumber_ls',
    'uniqueNumber',
    'UniqueNumber',
    'customerNumber',
  ]);
  const phone = pickStr(input, [
    'phone',
    'Phone',
    'phone_ls',
    'phoneNumber',
    'PhoneNumber',
    'mobile',
    'CallerPhone',
  ]);

  if (!customerId && !(accountNumber && phone)) {
    return fail(
      'Provide customerId from ls_idv_customer, or accountNumber and phone together.',
      'MISSING_CUSTOMER',
    );
  }

  const { data } = loadStore(input.storePath);
  const customer = resolveCustomerForOrderOpen(data, {
    customerId,
    accountNumber,
    phone,
    organizationName: pickStr(input, [
      'organizationName',
      'OrganizationName',
      'organizationName_ls',
      'customerName',
      'FacilityName',
    ]),
    uniqueIdentifier: pickStr(input, [
      'uniqueIdentifier',
      'UniqueIdentifier',
      'uniqueId',
      'UniqueId',
    ]),
  });

  if (!customer) {
    return fail(
      'Could not resolve customer. Pass customerId from IDV or accountNumber with phone.',
      'CUSTOMER_NOT_FOUND',
    );
  }

  const resolvedLines = [];
  const stockIssues = [];

  for (const row of linesIn) {
    const productName = pickStr(row, [
      'productName',
      'ProductName',
      'product',
      'Product',
      'productId',
      'ProductId',
      'name',
      'Name',
    ]);
    const quantity = pickQuantity(row, ['quantity', 'Quantity', 'qty', 'Qty']);
    if (quantity == null) {
      return fail('Each order line needs a positive quantity.', 'MISSING_QUANTITY');
    }
    const unit = pickStr(row, ['unit', 'Unit']) || 'bag';
    const product = findProduct(data, productName);
    if (!product) {
      return fail(`Unknown product in order line: ${productName}`, 'PRODUCT_NOT_FOUND');
    }
    const availability = checkAvailability(product, quantity, unit);
    if (!availability.canFulfill) {
      stockIssues.push(availability);
      continue;
    }
    resolvedLines.push({
      product,
      availability,
      quantity: availability.requestedQuantity,
      unit: availability.requestedUnit,
      bagsFulfilled: availability.bagsRequested,
    });
  }

  if (stockIssues.length) {
    return fail(
      'One or more lines cannot be fulfilled due to insufficient or unavailable stock.',
      'INSUFFICIENT_STOCK',
      { stockIssues, lowStockLines: stockIssues.filter((s) => s.lowStock) },
    );
  }

  for (const line of resolvedLines) {
    line.product.stockBags -= line.bagsFulfilled;
  }

  const orderNumber = nextOrderNumber(data);
  const createdAt = new Date().toISOString();
  const orderLines = resolvedLines.map((line) => {
    const pricing = quoteLine(line.product, line.quantity, line.unit);
    return {
      productId: line.product.productId,
      productName: line.product.shortName,
      quantity: line.quantity,
      unit: line.unit,
      bagsFulfilled: line.bagsFulfilled,
      stockStatusAtOrder: line.availability.stockStatus,
      unitPriceAud: pricing.unitPriceAud,
      lineTotalAud: pricing.lineTotalAud,
      currency: pricing.currency,
    };
  });
  const orderTotalAud = roundMoney(orderLines.reduce((sum, l) => sum + l.lineTotalAud, 0));
  const primary = orderLines[0];

  data.orders.push({
    orderNumber,
    orderConfirmationNumber: orderNumber,
    customerId: customer.customerId,
    organizationName: customer.organizationName,
    status: 'confirmed',
    lines: orderLines,
    createdAt,
  });

  customer.lastOrder = {
    orderNumber,
    productId: primary.productId,
    productName: primary.productName,
    quantity: primary.quantity,
    unit: primary.unit,
    orderedAt: createdAt,
  };
  saveStore(input.storePath, data);

  return ok({
    orderConfirmationNumber: orderNumber,
    orderNumber,
    orderStatus: 'confirmed',
    demoMode: true,
    demoOpenConfirm: true,
    customerId: customer.customerId,
    organizationName: customer.organizationName,
    accountNumber: customer.accountNumber,
    currency: orderLines[0]?.currency || 'AUD',
    orderTotalAud,
    orderTotalDisplay: `AUD $${orderTotalAud.toFixed(2)}`,
    productName: primary.productName,
    quantity: primary.quantity,
    unit: primary.unit,
    lines: orderLines.map((l) => ({
      ...l,
      productStockAfterOrder: productView(
        data.products.find((p) => p.productId === l.productId),
      ),
    })),
    estimatedDeliveryWindow: '2–3 business days',
    message: `Order ${orderNumber} confirmed (total ${orderTotalAud.toFixed(2)} AUD). Read back orderConfirmationNumber, lines, and total to the caller.`,
  });
}

module.exports.run = run;

module.exports.handler = async function (event) {
  try {
    const input = extractInput(event);
    return await run(input);
  } catch (err) {
    const message = err && err.message ? err.message : 'Unhandled error';
    return fail(message);
  }
};
