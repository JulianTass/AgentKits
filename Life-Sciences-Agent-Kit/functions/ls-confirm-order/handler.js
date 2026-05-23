'use strict';

const {
  loadStore,
  saveStore,
  findCustomer,
  findProduct,
  checkAvailability,
  quoteLine,
  roundMoney,
  nextOrderNumber,
  productView,
} = require('./lib/lifeSciencesStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseLineItems(input) {
  const raw = input.lineItems ?? input.LineItems ?? input.items ?? input.Items ?? input.orderLines;
  if (Array.isArray(raw) && raw.length) {
    return raw.filter((x) => x && typeof x === 'object');
  }
  const productName = pickStr(input, [
    'productName',
    'ProductName',
    'product',
    'Product',
    'productId',
    'ProductId',
  ]);
  const quantity = input.quantity ?? input.Quantity ?? input.qty;
  const unit = pickStr(input, ['unit', 'Unit']);
  if (productName && quantity != null) {
    return [{ productName, quantity, unit }];
  }
  return [];
}

function resolveCustomer(data, input) {
  const customerId = pickStr(input, ['customerId', 'CustomerId']);
  if (customerId) {
    const existing = data.customers.find((c) => c.customerId === customerId);
    if (existing) return existing;
    return fail(`Unknown customerId: ${customerId}`, 'UNKNOWN_CUSTOMER');
  }
  const customer = findCustomer(data, {
    uniqueIdentifier: pickStr(input, [
      'uniqueIdentifier',
      'UniqueIdentifier',
      'uniqueId',
      'UniqueId',
      'uid',
    ]),
    accountNumber: pickStr(input, [
      'accountNumber',
      'AccountNumber',
      'uniqueNumber',
      'UniqueNumber',
      'customerNumber',
    ]),
    phone: pickStr(input, ['phone', 'Phone', 'phoneNumber', 'PhoneNumber', 'mobile']),
  });
  if (!customer) {
    return fail(
      'Customer not found. Run ls_idv_customer first or pass customerId plus verified identifiers.',
      'CUSTOMER_NOT_FOUND',
    );
  }
  return customer;
}

async function run(input) {
  const linesIn = parseLineItems(input);
  if (!linesIn.length) {
    return fail(
      'Provide lineItems (array) or a single productName with quantity and unit (case or bag).',
      'MISSING_LINE_ITEMS',
    );
  }

  const { data } = loadStore(input.storePath);
  const customerResult = resolveCustomer(data, input);
  if (customerResult.success === false) return customerResult;
  const customer = customerResult;

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
    const quantity = row.quantity ?? row.Quantity ?? row.qty;
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

  const order = {
    orderNumber,
    orderConfirmationNumber: orderNumber,
    customerId: customer.customerId,
    organizationName: customer.organizationName,
    status: 'confirmed',
    lines: orderLines,
    createdAt,
  };

  data.orders.push(order);
  const primary = orderLines[0];
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
    customerId: customer.customerId,
    organizationName: customer.organizationName,
    currency: orderLines[0]?.currency || 'AUD',
    orderTotalAud,
    orderTotalDisplay: `AUD $${orderTotalAud.toFixed(2)}`,
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
