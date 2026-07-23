'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `seek-ads-smoke-${Date.now()}.json`);
process.env.SEEK_ADS_STORE_PATH = tmp;

const idv = require('../functions/sa-idv-advertiser/handler');
const tierPkg = require('../functions/sa-get-ad-tier-package/handler');
const confirmOrder = require('../functions/sa-confirm-ad-order/handler');

async function main() {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  const idvBadCode = await idv.run({ mobileConfirmationCode: '12', seekId: 'HC4MG2' });
  if (idvBadCode.success || idvBadCode.code !== 'INVALID_MOBILE_CODE') {
    throw new Error(`IDV bad mobile code: ${JSON.stringify(idvBadCode)}`);
  }

  const idvBadSeek = await idv.run({ mobileConfirmationCode: '1234', seekId: 'ABC' });
  if (idvBadSeek.success || idvBadSeek.code !== 'INVALID_SEEK_ID') {
    throw new Error(`IDV bad seek id: ${JSON.stringify(idvBadSeek)}`);
  }

  const idvSeed = await idv.run({ mobileConfirmationCode: '4829', seekId: 'HC4MG2' });
  if (
    !idvSeed.success ||
    idvSeed.idvStatus !== 'VERIFIED' ||
    idvSeed.advertiserId !== 'SA-ADV-101' ||
    idvSeed.contactName !== 'Sarah Johnson'
  ) {
    throw new Error(`Seed IDV: ${JSON.stringify(idvSeed)}`);
  }

  const idvOpen = await idv.run({ mobileConfirmationCode: '0000', seekId: 'DEMO99' });
  if (
    !idvOpen.success ||
    !/^SA-ADV-\d+$/.test(idvOpen.advertiserId) ||
    idvOpen.companyName === 'Seek Advertiser' ||
    idvOpen.contactName === 'Advertiser Contact'
  ) {
    throw new Error(`Open IDV: ${JSON.stringify(idvOpen)}`);
  }

  const occasional = await tierPkg.run({ tier: 'occasional', adCount: 3, advertiserId: idvSeed.advertiserId });
  if (
    !occasional.success ||
    occasional.tier !== 'occasional' ||
    occasional.recommendedBudgetAud !== 1150 ||
    !occasional.summaryText.includes('15% off')
  ) {
    throw new Error(`Occasional tier: ${JSON.stringify(occasional)}`);
  }

  const regular = await tierPkg.run({ tier: 'regular', adCount: 5 });
  if (!regular.success || regular.tier !== 'regular' || regular.recommendedBudgetAud !== 1990) {
    throw new Error(`Regular tier: ${JSON.stringify(regular)}`);
  }

  const frequent = await tierPkg.run({ tier: 'frequent', adCount: 10 });
  if (
    !frequent.success ||
    frequent.tier !== 'frequent' ||
    frequent.recommendedBudgetAud !== 3700 ||
    !frequent.openingLine.includes('10 job ads')
  ) {
    throw new Error(`Frequent tier: ${JSON.stringify(frequent)}`);
  }

  const fromCount = await tierPkg.run({ adCount: 4 });
  if (!fromCount.success || fromCount.tier !== 'regular') {
    throw new Error(`Ad count mapping: ${JSON.stringify(fromCount)}`);
  }

  const mismatch = await tierPkg.run({ tier: 'occasional', adCount: 8 });
  if (mismatch.success || mismatch.code !== 'AD_COUNT_TIER_MISMATCH') {
    throw new Error(`Tier mismatch: ${JSON.stringify(mismatch)}`);
  }

  const listTiers = await tierPkg.run({ listTiers: true });
  if (!listTiers.success || listTiers.availableTiers.length !== 3) {
    throw new Error(`List tiers: ${JSON.stringify(listTiers)}`);
  }

  const order = await confirmOrder.run({
    advertiserId: idvSeed.advertiserId,
    adCount: 5,
  });
  if (
    !order.success ||
    !/^SA-ORD-\d+$/.test(order.orderNumber) ||
    order.orderStatus !== 'on_the_way' ||
    order.contactName !== 'Sarah Johnson' ||
    order.tier !== 'regular' ||
    order.recommendedBudgetAud !== 1990
  ) {
    throw new Error(`Confirm order: ${JSON.stringify(order)}`);
  }

  // Cross-function IDV id (not in seed) must still confirm — separate Genesys zips.
  const crossFn = await confirmOrder.run({
    advertiserId: 'SA-ADV-104',
    adCount: 3,
    companyName: 'Cross Function Pty Ltd',
    contactName: 'Sam Lee',
  });
  if (
    !crossFn.success ||
    crossFn.advertiserId !== 'SA-ADV-104' ||
    !/^SA-ORD-\d+$/.test(crossFn.orderNumber) ||
    crossFn.orderStatus !== 'on_the_way' ||
    crossFn.tier !== 'occasional'
  ) {
    throw new Error(`Cross-function order: ${JSON.stringify(crossFn)}`);
  }

  console.log(
    JSON.stringify(
      {
        idvSeed: idvSeed.advertiserId,
        contactName: idvSeed.contactName,
        occasionalBudget: occasional.recommendedBudgetDisplay,
        regularBudget: regular.recommendedBudgetDisplay,
        frequentBudget: frequent.recommendedBudgetDisplay,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        crossFnOrder: crossFn.orderNumber,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
