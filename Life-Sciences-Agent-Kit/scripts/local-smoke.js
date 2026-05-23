'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `life-sciences-smoke-${Date.now()}.json`);
process.env.LIFE_SCIENCES_STORE_PATH = tmp;

const products = require('../functions/ls-get-life-science-products/handler');
const idv = require('../functions/ls-idv-customer/handler');
const order = require('../functions/ls-confirm-order/handler');

async function main() {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  const catalog = await products.run({});
  if (!catalog.success || catalog.productCount < 5) {
    throw new Error(`Catalog failed: ${JSON.stringify(catalog)}`);
  }
  const d5lr = catalog.lowStockProducts.find((p) => p.shortName === 'D5LR');
  if (!d5lr || !d5lr.lowStock) {
    throw new Error('Expected D5LR in lowStockProducts');
  }

  const priceSixBags = await products.run({
    productName: 'Normal Saline',
    quantity: 6,
    unit: 'bag',
  });
  if (!priceSixBags.success || priceSixBags.pricing?.lineTotalAud !== 51) {
    throw new Error(`Expected 6 bags = 51 AUD: ${JSON.stringify(priceSixBags.pricing)}`);
  }

  const salineOk = await products.run({
    productName: 'Normal Saline',
    quantity: 10,
    unit: 'case',
  });
  if (!salineOk.success || !salineOk.canFulfill) {
    throw new Error(`Expected 10 cases saline OK: ${JSON.stringify(salineOk)}`);
  }

  const d5lrOk = await products.run({
    productName: 'D5LR',
    quantity: 5,
    unit: 'bag',
  });
  if (!d5lrOk.success || !d5lrOk.canFulfill) {
    throw new Error(`Expected 5 bags D5LR OK: ${JSON.stringify(d5lrOk)}`);
  }

  const d5lrFail = await products.run({
    productName: 'D5LR',
    quantity: 10,
    unit: 'case',
  });
  if (!d5lrFail.success || d5lrFail.canFulfill !== false) {
    throw new Error(`Expected 10 cases D5LR not fulfillable: ${JSON.stringify(d5lrFail)}`);
  }

  const pending = await idv.run({
    uniqueIdentifier: 'UID-LS-0042',
    accountNumber: 'ACC-88421',
    phone: '+61 400 111 222',
  });
  if (!pending.success || pending.idvStatus !== 'PENDING_LAST_ORDER') {
    throw new Error(JSON.stringify(pending));
  }

  const verified = await idv.run({
    uniqueIdentifier: 'UID-LS-0042',
    statedLastProduct: 'Normal Saline',
    statedLastQuantity: 8,
    statedLastUnit: 'case',
  });
  if (!verified.success || verified.idvStatus !== 'VERIFIED') {
    throw new Error(JSON.stringify(verified));
  }
  if (!verified.lastOrderVerification.match) {
    throw new Error(`Expected last order match: ${JSON.stringify(verified)}`);
  }

  const mismatch = await idv.run({
    uniqueIdentifier: 'UID-LS-0042',
    statedLastProduct: 'D5LR',
    statedLastQuantity: 8,
    statedLastUnit: 'case',
  });
  if (mismatch.success || mismatch.code !== 'IDV_LAST_ORDER_MISMATCH') {
    throw new Error(`Expected mismatch: ${JSON.stringify(mismatch)}`);
  }

  const confirmed = await order.run({
    customerId: verified.customerId,
    lineItems: [{ productName: 'Normal Saline', quantity: 2, unit: 'case' }],
  });
  if (!confirmed.success || !/^LSO-\d+$/.test(confirmed.orderConfirmationNumber)) {
    throw new Error(JSON.stringify(confirmed));
  }

  const lowAfter = await products.run({ productName: 'D5LR' });
  if (!lowAfter.matchedProduct.lowStock) {
    throw new Error('D5LR should still be low stock');
  }

  console.log(
    JSON.stringify({ catalog: catalog.productCount, salineOk, d5lrOk, verified, confirmed }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
