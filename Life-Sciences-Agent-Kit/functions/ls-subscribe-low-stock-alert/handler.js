'use strict';

const {
  loadStore,
  saveStore,
  findProduct,
  checkAvailability,
  productViewWithMatrix,
  resolveCustomerForOrderOpen,
  normalizeCustomerId,
  isNotifyEligible,
  cancelLowStockSubscription,
  upsertLowStockSubscription,
  subscriptionView,
  maskPhone,
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

function pickNotifyFlag(input) {
  const raw =
    input.notifyWhenAvailable ??
    input.NotifyWhenAvailable ??
    input.subscribe ??
    input.Subscribe ??
    input.optIn ??
    input.OptIn;
  if (raw == null || String(raw).trim() === '') return true;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (['true', 'yes', '1', 'subscribe', 'optin', 'opt-in'].includes(s)) return true;
  if (['false', 'no', '0', 'cancel', 'unsubscribe', 'optout', 'opt-out'].includes(s)) return false;
  return true;
}

async function run(input) {
  const productName = pickStr(input, [
    'productName',
    'ProductName',
    'product',
    'Product',
    'productId',
    'ProductId',
  ]);
  if (!productName) {
    return fail('Provide productName for the low-stock alert.', 'MISSING_PRODUCT');
  }

  const customerId = normalizeCustomerId(
    pickStr(input, ['customerId', 'CustomerId', 'customer_id', 'CustomerID']),
  );
  const accountNumber = pickStr(input, [
    'accountNumber',
    'AccountNumber',
    'uniqueNumber',
    'UniqueNumber',
    'customerNumber',
  ]);
  const phone = pickStr(input, [
    'phone',
    'Phone',
    'phoneNumber',
    'PhoneNumber',
    'mobile',
    'CallerPhone',
  ]);

  if (!customerId && !(accountNumber && phone)) {
    return fail(
      'Provide customerId from IDV, or accountNumber and phone together.',
      'MISSING_CUSTOMER',
    );
  }

  const quantity = pickQuantity(input, ['quantity', 'Quantity', 'qty', 'Qty']);
  const unit = pickStr(input, ['unit', 'Unit']);
  const notifyWhenAvailable = pickNotifyFlag(input);

  const { data } = loadStore(input.storePath);
  const customer = resolveCustomerForOrderOpen(data, {
    customerId,
    accountNumber,
    phone,
    organizationName: pickStr(input, [
      'organizationName',
      'OrganizationName',
      'customerName',
      'FacilityName',
    ]),
  });

  if (!customer) {
    return fail(
      'Could not resolve customer. Pass customerId or accountNumber with phone.',
      'CUSTOMER_NOT_FOUND',
    );
  }

  const product = findProduct(data, productName);
  if (!product) {
    return fail(`Unknown product: ${productName}`, 'PRODUCT_NOT_FOUND');
  }

  const matchedProduct = productViewWithMatrix(product);
  const eligibility = isNotifyEligible(product, quantity, unit);
  const availabilityCheck =
    quantity != null ? checkAvailability(product, quantity, unit) : null;

  if (!notifyWhenAvailable) {
    const cancelled = cancelLowStockSubscription(
      data,
      customer.customerId,
      product.productId,
      quantity,
      unit,
    );
    saveStore(input.storePath, data);
    if (!cancelled) {
      return fail('No active alert subscription found to cancel.', 'SUBSCRIPTION_NOT_FOUND', {
        matchedProduct,
        customerId: customer.customerId,
        accountNumber: customer.accountNumber,
      });
    }
    return ok({
      demoMode: true,
      notifyWhenAvailable: false,
      status: 'cancelled',
      subscription: subscriptionView(cancelled),
      customerId: customer.customerId,
      accountNumber: customer.accountNumber,
      maskedPhone: maskPhone(customer.phone),
      productName: product.shortName,
      productId: product.productId,
      lowStock: matchedProduct.lowStock,
      stockStatus: matchedProduct.stockStatus,
      matchedProduct,
      availabilityCheck,
      message: `Low-stock alert cancelled for ${product.shortName} (${cancelled.subscriptionId}).`,
    });
  }

  if (!eligibility.eligible) {
    return fail(
      `${product.shortName} has sufficient stock; a low-stock alert is not needed.`,
      'NOTIFY_NOT_ELIGIBLE',
      {
        matchedProduct,
        stockStatus: matchedProduct.stockStatus,
        lowStock: matchedProduct.lowStock,
        availabilityCheck,
        customerId: customer.customerId,
      },
    );
  }

  const { subscription, created } = upsertLowStockSubscription(
    data,
    customer,
    product,
    quantity,
    unit,
  );
  saveStore(input.storePath, data);

  const qtyNote =
    subscription.quantity != null
      ? ` for ${subscription.quantity} ${subscription.unit}(s)`
      : '';
  const masked = maskPhone(customer.phone);
  const contactNote = masked
    ? ` We will contact account ${customer.accountNumber} at ${masked}.`
    : ` We will contact account ${customer.accountNumber} on the phone number on file.`;

  return ok({
    demoMode: true,
    notifyWhenAvailable: true,
    status: subscription.status,
    subscriptionCreated: created,
    subscription: subscriptionView(subscription),
    subscriptionId: subscription.subscriptionId,
    customerId: customer.customerId,
    accountNumber: customer.accountNumber,
    maskedPhone: maskPhone(customer.phone),
    productName: product.shortName,
    productId: product.productId,
    lowStock: matchedProduct.lowStock,
    stockStatus: matchedProduct.stockStatus,
    stockBags: matchedProduct.stockBags,
    stockCases: matchedProduct.stockCases,
    matchedProduct,
    availabilityCheck,
    notifyEligibleReason: eligibility.reason,
    message: `Low-stock alert active (${subscription.subscriptionId}) for ${product.shortName}${qtyNote}.${contactNote} Demo mode: no outbound message is sent.`,
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
