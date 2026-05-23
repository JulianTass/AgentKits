'use strict';

const {
  loadStore,
  productView,
  findProduct,
  checkAvailability,
} = require('./lib/lifeSciencesStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function pickQuantity(input) {
  const raw = input.quantity ?? input.Quantity ?? input.qty ?? input.Qty;
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function run(input) {
  const { data } = loadStore(input.storePath);
  const productQuery = pickStr(input, [
    'productName',
    'ProductName',
    'product',
    'Product',
    'search',
    'Search',
    'query',
    'Query',
    'productId',
    'ProductId',
  ]);
  const quantity = pickQuantity(input);
  const unit = pickStr(input, ['unit', 'Unit', 'uom', 'UOM']);

  const catalog = data.products.map(productView);
  const lowStockProducts = catalog.filter((p) => p.lowStock);
  const outOfStockProducts = catalog.filter((p) => p.stockStatus === 'out_of_stock');

  if (!productQuery && quantity == null) {
    return ok({
      products: catalog,
      productCount: catalog.length,
      lowStockProducts,
      outOfStockProducts,
      message:
        'Life sciences IV fluid catalog. Pass productName (e.g. Normal Saline, D5LR) with quantity and unit (case or bag) to check stock for an order.',
    });
  }

  const product = findProduct(data, productQuery);
  if (!product) {
    return fail(
      `No product matched "${productQuery || ''}". Try Normal Saline, D5LR, Lactated Ringer's, Sterile Water, Half Normal Saline, or D10.`,
      'PRODUCT_NOT_FOUND',
      { products: catalog.map((p) => ({ productId: p.productId, shortName: p.shortName })) },
    );
  }

  const viewed = productView(product);
  if (quantity == null) {
    return ok({
      matchedProduct: viewed,
      products: [viewed],
      pricing: {
        currency: viewed.currency,
        unitPriceAud: viewed.unitPriceAud,
        pricePerCaseAud: viewed.pricePerCaseAud,
        priceUnit: viewed.priceUnit,
      },
      lowStock: viewed.lowStock,
      message: viewed.lowStock
        ? `${viewed.shortName} is low stock (${viewed.stockBags} bags / ${viewed.stockCases} cases on hand). Price: ${viewed.unitPriceAud} AUD per bag, ${viewed.pricePerCaseAud} AUD per case.`
        : `${viewed.shortName} is ${viewed.stockStatus} (${viewed.stockBags} bags on hand). Price: ${viewed.unitPriceAud} AUD per bag, ${viewed.pricePerCaseAud} AUD per case.`,
    });
  }

  const availability = checkAvailability(product, quantity, unit);
  return ok({
    matchedProduct: viewed,
    availabilityCheck: availability,
    pricing: availability.pricing,
    lowStock: viewed.lowStock,
    canFulfill: availability.canFulfill,
    message: availability.message,
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
