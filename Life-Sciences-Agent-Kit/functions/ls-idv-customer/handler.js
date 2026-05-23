'use strict';

const {
  loadStore,
  findCustomer,
  lastOrderForCustomer,
  lastOrderShape,
  verifyStatedLastOrder,
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
  const uniqueIdentifier = pickStr(input, [
    'uniqueIdentifier',
    'UniqueIdentifier',
    'uniqueId',
    'UniqueId',
    'uid',
    'UID',
  ]);
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

  if (!uniqueIdentifier && !accountNumber && !phone) {
    return fail(
      'Provide at least one identifier: uniqueIdentifier (UID-LS-…), accountNumber (ACC-…), or phone (+61… or 04…).',
      'MISSING_IDENTIFIER',
    );
  }

  const { data } = loadStore(input.storePath);
  const customer = findCustomer(data, { uniqueIdentifier, phone, accountNumber });

  if (!customer) {
    return fail(
      'No unique customer match. Use a combination of unique identifier, account number, and phone that identifies exactly one account.',
      'IDV_NO_MATCH',
    );
  }

  const onFileLast = lastOrderForCustomer(data, customer);
  const lastOrder = lastOrderShape(onFileLast);
  const lastOrderVerification = verifyStatedLastOrder(data, onFileLast, {
    productName: statedLastProduct,
    quantity: statedLastQuantity,
    unit: statedLastUnit,
  });

  if (lastOrderVerification.match === false) {
    return fail(
      'Account found but stated last order does not match our records. Ask the caller to confirm product, quantity, and unit (case or bag).',
      'IDV_LAST_ORDER_MISMATCH',
      { lastOrder, lastOrderVerification },
    );
  }

  const pendingVerification = lastOrderVerification.match === null;

  return ok({
    idvStatus: pendingVerification ? 'PENDING_LAST_ORDER' : 'VERIFIED',
    customerId: customer.customerId,
    organizationName: customer.organizationName,
    uniqueIdentifier: customer.uniqueIdentifier,
    accountNumber: customer.accountNumber,
    maskedPhone: maskPhone(customer.phone),
    lastOrder,
    lastOrderVerification,
    message: pendingVerification
      ? 'Account matched. Ask what their last order was, then call again with statedLastProduct, statedLastQuantity, and statedLastUnit.'
      : 'Identity verified: identifiers and stated last order match records.',
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
