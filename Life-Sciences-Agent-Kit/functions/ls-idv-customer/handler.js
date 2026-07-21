'use strict';

const {
  loadStore,
  saveStore,
  lastOrderShape,
  openLastOrderVerification,
  resolveOrCreateCustomerOpen,
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

async function run(input) {
  const accountNumber = pickStr(input, [
    'accountNumber',
    'AccountNumber',
    'uniqueNumber',
    'UniqueNumber',
    'customerNumber',
    'CustomerNumber',
    'accountId',
    'AccountId',
  ]);
  const phone = pickStr(input, [
    'phone',
    'Phone',
    'phoneNumber',
    'PhoneNumber',
    'mobile',
    'Mobile',
    'callerPhone',
    'CallerPhone',
    'ani',
    'ANI',
  ]);
  const statedLastProduct = pickStr(input, [
    'statedLastProduct',
    'StatedLastProduct',
    'lastOrderProduct',
    'LastOrderProduct',
    'lastOrderProductName',
    'LastOrderProductName',
    'statedProductName',
    'StatedProductName',
  ]);
  const statedLastQuantity = pickQuantity(input, [
    'statedLastQuantity',
    'StatedLastQuantity',
    'lastOrderQuantity',
    'LastOrderQuantity',
    'statedQuantity',
    'StatedQuantity',
  ]);
  const statedLastUnit = pickStr(input, [
    'statedLastUnit',
    'StatedLastUnit',
    'lastOrderUnit',
    'LastOrderUnit',
    'statedUnit',
    'StatedUnit',
  ]);
  const uniqueIdentifier = pickStr(input, [
    'uniqueIdentifier',
    'UniqueIdentifier',
    'uniqueId',
    'UniqueId',
    'uid',
    'UID',
  ]);
  const organizationName = pickStr(input, [
    'organizationName',
    'OrganizationName',
    'customerName',
    'CustomerName',
    'facilityName',
    'FacilityName',
  ]);

  const missing = [];
  if (!accountNumber) missing.push('accountNumber');
  if (!phone) missing.push('phone');
  if (!statedLastProduct) missing.push('statedLastProduct');
  if (statedLastQuantity == null) missing.push('statedLastQuantity');
  if (!statedLastUnit) missing.push('statedLastUnit');

  if (missing.length) {
    return fail(
      'Required in one call: accountNumber, phone, statedLastProduct, statedLastQuantity, statedLastUnit (case or bag). Demo mode accepts any values.',
      'MISSING_REQUIRED_FIELDS',
      { missing },
    );
  }

  const { data } = loadStore(input.storePath);
  const lastOrderVerification = openLastOrderVerification(data, {
    productName: statedLastProduct,
    quantity: statedLastQuantity,
    unit: statedLastUnit,
  });

  const customer = resolveOrCreateCustomerOpen(data, {
    accountNumber,
    phone,
    uniqueIdentifier,
    organizationName,
  });
  customer.lastOrder = {
    ...lastOrderVerification.stated,
    orderNumber: customer.lastOrder?.orderNumber || `LSO-IDV-${customer.customerId}`,
  };
  saveStore(input.storePath, data);

  const lastOrder = lastOrderShape(customer.lastOrder);

  return ok({
    idvStatus: 'VERIFIED',
    demoMode: true,
    customerId: customer.customerId,
    organizationName: customer.organizationName,
    uniqueIdentifier: customer.uniqueIdentifier,
    accountNumber: customer.accountNumber,
    maskedPhone: maskPhone(customer.phone),
    statedLastOrder: lastOrder,
    lastOrder,
    lastOrderVerification,
    message:
      'Identity verified (demo mode). Account number, phone, and stated last order were accepted. Use customerId with ls_confirm_order.',
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
