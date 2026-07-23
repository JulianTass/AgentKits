'use strict';

const {
  normalizeTier,
  normalizeSeekId,
  tierFromAdCount,
  adCountFitsTier,
  buildPackageSummary,
  resolveAdvertiserForOrderOpen,
  createAdOrder,
  loadStore,
  saveStore,
} = require('./lib/seekAdsStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function pickNumber(input, keys) {
  const raw = keys.reduce((acc, k) => (acc != null ? acc : input[k]), null);
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

async function run(input) {
  const advertiserId = pickStr(input, [
    'advertiserId',
    'AdvertiserId',
    'advertiserID',
    'AdvertiserID',
  ]);
  const seekId = pickStr(input, ['seekId', 'SeekId', 'seekPin', 'SeekPin', 'pin', 'PIN']);
  const companyName = pickStr(input, [
    'companyName',
    'CompanyName',
    'organisationName',
    'OrganisationName',
  ]);
  const contactName = pickStr(input, [
    'contactName',
    'ContactName',
    'name',
    'Name',
    'fullName',
    'FullName',
  ]);
  const tierRaw = pickStr(input, [
    'tier',
    'Tier',
    'hiringTier',
    'HiringTier',
    'adTier',
    'AdTier',
    'packageTier',
    'PackageTier',
  ]);
  const adCount = pickNumber(input, [
    'adCount',
    'AdCount',
    'numberOfAds',
    'NumberOfAds',
    'jobAdCount',
    'JobAdCount',
    'ads',
    'Ads',
  ]);

  if (!advertiserId && !seekId) {
    return fail(
      'Provide advertiserId from sa_idv_advertiser (preferred) or seekId.',
      'MISSING_ADVERTISER',
    );
  }

  let resolvedTier = normalizeTier(tierRaw);
  if (!resolvedTier && adCount != null) {
    resolvedTier = tierFromAdCount(adCount);
    if (!resolvedTier) {
      return fail(
        'adCount must be between 2 and 10 to map to a hiring tier (Occasional 2–3, Regular 4–6, Frequent 6–10).',
        'AD_COUNT_OUT_OF_RANGE',
        { adCount },
      );
    }
  }

  if (!resolvedTier) {
    return fail(
      'Provide adCount (2–10) so the order can select the best package. Optionally pass tier.',
      'MISSING_TIER_OR_AD_COUNT',
    );
  }

  const resolvedAdCount =
    adCount != null ? adCount : buildPackageSummary(resolvedTier).adCount;

  if (adCount != null && !adCountFitsTier(adCount, resolvedTier)) {
    return fail(
      `adCount ${adCount} does not fit the ${resolvedTier} tier (${buildPackageSummary(resolvedTier).adRangeDisplay}).`,
      'AD_COUNT_TIER_MISMATCH',
      {
        adCount,
        tier: resolvedTier,
        adRangeDisplay: buildPackageSummary(resolvedTier).adRangeDisplay,
        suggestedTier: tierFromAdCount(adCount),
      },
    );
  }

  const { data } = loadStore(input.storePath);
  const advertiser = resolveAdvertiserForOrderOpen(data, {
    advertiserId,
    seekId,
    companyName,
    contactName,
  });

  if (!advertiser) {
    return fail(
      'Advertiser not found. Run sa_idv_advertiser first and pass the returned advertiserId.',
      'ADVERTISER_NOT_FOUND',
      { advertiserId: advertiserId || null, seekId: seekId || null },
    );
  }

  const packageDetails = buildPackageSummary(resolvedTier, resolvedAdCount);
  const order = createAdOrder(data, { advertiser, packageDetails });
  saveStore(input.storePath, data);

  const summaryText = [
    `Your branded ad budget order is on the way.`,
    `Order number: ${order.orderNumber}.`,
    `Package: ${packageDetails.tierLabel} (${packageDetails.adRangeDisplay}) for ${packageDetails.adCount} job ads.`,
    `Recommended budget: ${packageDetails.recommendedBudgetDisplay}.`,
    `Account: ${advertiser.companyName}${advertiser.contactName ? ` — ${advertiser.contactName}` : ''}.`,
  ].join(' ');

  return ok({
    demoMode: true,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    orderStatusLabel: order.orderStatusLabel,
    tier: packageDetails.tier,
    tierLabel: packageDetails.tierLabel,
    adCount: packageDetails.adCount,
    adRangeDisplay: packageDetails.adRangeDisplay,
    recommendedBudgetAud: packageDetails.recommendedBudgetAud,
    recommendedBudgetDisplay: packageDetails.recommendedBudgetDisplay,
    cardPriceDisplay: packageDetails.cardPriceDisplay,
    advertiserId: advertiser.advertiserId,
    companyName: advertiser.companyName,
    contactName: advertiser.contactName,
    seekId: advertiser.seekId || (seekId ? normalizeSeekId(seekId) : null),
    summaryText,
    message: `Order ${order.orderNumber} is on the way for ${advertiser.companyName}.`,
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
