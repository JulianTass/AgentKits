'use strict';

const {
  normalizeTier,
  normalizeAdvertiserId,
  normalizeSeekId,
  tierFromAdCount,
  adCountFitsTier,
  buildPackageSummary,
  listAllTiers,
  findAdvertiserBySeekId,
  loadStore,
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
  const advertiserId = pickStr(input, [
    'advertiserId',
    'AdvertiserId',
    'advertiserID',
    'AdvertiserID',
  ]);
  const seekId = pickStr(input, ['seekId', 'SeekId', 'seekPin', 'SeekPin', 'pin', 'PIN']);
  const listTiersOnly = input.listTiers === true || input.listTiers === 'true';

  if (listTiersOnly) {
    return ok({
      availableTiers: listAllTiers(),
      message:
        'Seek branded ad budget tiers: Occasional (2–3 ads), Regular (4–6 ads), Frequent (6–10 ads). Pass tier or adCount for full package details.',
    });
  }

  let resolvedTier = normalizeTier(tierRaw);

  if (!resolvedTier && adCount != null) {
    resolvedTier = tierFromAdCount(adCount);
    if (!resolvedTier) {
      return fail(
        'adCount must be between 2 and 10 to map to a hiring tier (Occasional 2–3, Regular 4–6, Frequent 6–10).',
        'AD_COUNT_OUT_OF_RANGE',
        { adCount, availableTiers: listAllTiers() },
      );
    }
  }

  if (!resolvedTier) {
    return fail(
      'Provide tier (occasional, regular, or frequent) and/or adCount (2–10). Optionally pass advertiserId from IDV.',
      'MISSING_TIER_OR_AD_COUNT',
      { availableTiers: listAllTiers() },
    );
  }

  const resolvedAdCount =
    adCount != null ? adCount : buildPackageSummary(resolvedTier).adCount;

  if (adCount != null && !adCountFitsTier(adCount, resolvedTier)) {
    return fail(
      `adCount ${adCount} does not fit the ${resolvedTier} tier (${buildPackageSummary(resolvedTier).adRangeDisplay}). Choose a matching tier or adjust ad count.`,
      'AD_COUNT_TIER_MISMATCH',
      {
        adCount,
        tier: resolvedTier,
        adRangeDisplay: buildPackageSummary(resolvedTier).adRangeDisplay,
        suggestedTier: tierFromAdCount(adCount),
        availableTiers: listAllTiers(),
      },
    );
  }

  let advertiser = null;
  if (advertiserId || seekId) {
    const { data } = loadStore(input.storePath);
    if (advertiserId) {
      const id = normalizeAdvertiserId(advertiserId);
      advertiser = data.advertisers.find((a) => normalizeAdvertiserId(a.advertiserId) === id) || null;
    } else if (seekId) {
      advertiser = findAdvertiserBySeekId(data, seekId);
    }
  }

  const packageDetails = buildPackageSummary(resolvedTier, resolvedAdCount);
  const resolvedSeekId = advertiser
    ? advertiser.seekId
    : seekId
      ? normalizeSeekId(seekId)
      : null;

  return ok({
    tier: packageDetails.tier,
    tierLabel: packageDetails.tierLabel,
    adRangeDisplay: packageDetails.adRangeDisplay,
    adCount: packageDetails.adCount,
    cardPriceDisplay: packageDetails.cardPriceDisplay,
    recommendedBudgetAud: packageDetails.recommendedBudgetAud,
    recommendedBudgetDisplay: packageDetails.recommendedBudgetDisplay,
    currency: packageDetails.currency,
    discounts: packageDetails.discounts,
    brandedAdBudget: packageDetails.brandedAdBudget,
    eligibleAdTypes: packageDetails.eligibleAdTypes,
    howItWorks: packageDetails.howItWorks,
    termsNote: packageDetails.termsNote,
    summaryText: packageDetails.summaryText,
    openingLine: packageDetails.openingLine,
    seekId: resolvedSeekId,
    advertiserId: advertiser ? advertiser.advertiserId : advertiserId || null,
    companyName: advertiser ? advertiser.companyName : null,
    availableTiers: listAllTiers(),
    message: packageDetails.openingLine,
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
