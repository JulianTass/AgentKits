'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `life-sciences-smoke-${Date.now()}.json`);
process.env.LIFE_SCIENCES_STORE_PATH = tmp;

const products = require('../functions/ls-get-life-science-products/handler');
const idv = require('../functions/ls-idv-customer/handler');
const order = require('../functions/ls-confirm-order/handler');
const subscribe = require('../functions/ls-subscribe-low-stock-alert/handler');

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
  const ns = catalog.products.find((p) => p.shortName === 'Normal Saline');
  const m = ns.quantityPriceMatrix;
  if (!m || m.bag.length !== 4 || m.bag[0].lineTotalAud !== 8.5 || m.case[3].lineTotalAud !== 408) {
    throw new Error(`Bad quantityPriceMatrix: ${JSON.stringify(m)}`);
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

  const missing = await idv.run({ accountNumber: 'ACC-1', phone: '0400000000' });
  if (missing.success || missing.code !== 'MISSING_REQUIRED_FIELDS') {
    throw new Error(`Expected missing fields: ${JSON.stringify(missing)}`);
  }

  const verified = await idv.run({
    accountNumber: 'ACC-88421',
    phone: '+61 400 111 222',
    statedLastProduct: 'Normal Saline',
    statedLastQuantity: 8,
    statedLastUnit: 'case',
  });
  if (!verified.success || verified.idvStatus !== 'VERIFIED' || !verified.demoMode) {
    throw new Error(JSON.stringify(verified));
  }

  const anyInput = await idv.run({
    accountNumber: 'ACC-ANYTHING',
    phone: '0412345678',
    statedLastProduct: 'made up product',
    statedLastQuantity: 99,
    statedLastUnit: 'bag',
  });
  if (!anyInput.success || anyInput.idvStatus !== 'VERIFIED') {
    throw new Error(`Open demo should accept any input: ${JSON.stringify(anyInput)}`);
  }

  const confirmed = await order.run({
    customerId: verified.customerId,
    lineItems: [{ productName: 'Normal Saline', quantity: 2, unit: 'case' }],
  });
  if (!confirmed.success || !/^LSO-\d+$/.test(confirmed.orderConfirmationNumber)) {
    throw new Error(JSON.stringify(confirmed));
  }

  const idvOnlyStore = path.join(os.tmpdir(), `ls-idv-only-${Date.now()}.json`);
  const confirmOnlyStore = path.join(os.tmpdir(), `ls-confirm-only-${Date.now()}.json`);
  if (fs.existsSync(idvOnlyStore)) fs.unlinkSync(idvOnlyStore);
  if (fs.existsSync(confirmOnlyStore)) fs.unlinkSync(confirmOnlyStore);

  process.env.LIFE_SCIENCES_STORE_PATH = idvOnlyStore;
  const idvOnly = await idv.run({
    accountNumber: '78343',
    phone: '0406910251',
    statedLastProduct: 'Normal Saline',
    statedLastQuantity: 6,
    statedLastUnit: 'case',
  });
  if (!idvOnly.success || !idvOnly.customerId) {
    throw new Error(`IDV only store: ${JSON.stringify(idvOnly)}`);
  }

  process.env.LIFE_SCIENCES_STORE_PATH = confirmOnlyStore;
  const confirmOnly = await order.run({
    customerId: idvOnly.customerId,
    productName: 'Normal Saline',
    quantity: 6,
    unit: 'case',
  });
  process.env.LIFE_SCIENCES_STORE_PATH = tmp;
  if (!confirmOnly.success || confirmOnly.customerId !== idvOnly.customerId) {
    throw new Error(`Cross-store confirm failed: ${JSON.stringify(confirmOnly)}`);
  }
  if (confirmOnly.productName !== 'Normal Saline') {
    throw new Error(`Expected root productName: ${JSON.stringify(confirmOnly)}`);
  }

  const lsc104 = await order.run({
    customerId: 'LSC-104',
    productName: 'Normal Saline',
    quantity: '6',
    unit: 'cases',
  });
  if (!lsc104.success || lsc104.customerId !== 'LSC-104' || !/^LSO-\d+$/.test(lsc104.orderNumber)) {
    throw new Error(`LSC-104 seed confirm failed: ${JSON.stringify(lsc104)}`);
  }

  const lsc104Acct = await order.run({
    accountNumber: '78343',
    phone: '0406910251',
    productName: 'Normal Saline',
    quantity: 2,
    unit: 'case',
  });
  if (!lsc104Acct.success || lsc104Acct.customerId !== 'LSC-104') {
    throw new Error(`LSC-104 by account+phone failed: ${JSON.stringify(lsc104Acct)}`);
  }

  const lsc105 = await order.run({
    customerId_ls: 'LSC-105',
    productName_ls: 'Normal Saline',
    quantity_stock_ls: 3,
    unit_ls: 'cases',
    organizationName_ls: 'Open Demo Facility',
  });
  if (!lsc105.success || lsc105.customerId !== 'LSC-105' || !lsc105.demoOpenConfirm) {
    throw new Error(`LSC-105 open confirm failed: ${JSON.stringify(lsc105)}`);
  }

  const alert = await subscribe.run({
    accountNumber: '78343',
    phone: '0406910251',
    productName: 'D5LR',
    quantity: 10,
    unit: 'case',
    notifyWhenAvailable: true,
  });
  if (!alert.success || alert.subscriptionId !== 'LSN-1001' || !alert.lowStock) {
    throw new Error(`Subscribe D5LR failed: ${JSON.stringify(alert)}`);
  }

  const notEligible = await subscribe.run({
    customerId: 'LSC-101',
    productName: 'Normal Saline',
    notifyWhenAvailable: true,
  });
  if (notEligible.success || notEligible.code !== 'NOTIFY_NOT_ELIGIBLE') {
    throw new Error(`Expected NOTIFY_NOT_ELIGIBLE: ${JSON.stringify(notEligible)}`);
  }

  const cancel = await subscribe.run({
    accountNumber: '78343',
    phone: '0406910251',
    productName: 'D5LR',
    quantity: 10,
    unit: 'case',
    notifyWhenAvailable: false,
  });
  if (!cancel.success || cancel.status !== 'cancelled') {
    throw new Error(`Cancel alert failed: ${JSON.stringify(cancel)}`);
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
