'use strict';

const fs = require('fs');
const path = require('path');

const TIER_DEFINITIONS = {
  occasional: {
    tier: 'occasional',
    tierLabel: 'For occasional hiring',
    adRangeMin: 2,
    adRangeMax: 3,
    adRangeDisplay: '2 – 3 ads',
    defaultAdCount: 3,
    cardPriceAud: 1150,
    cardPriceDisplay: '$1150 + GST',
  },
  regular: {
    tier: 'regular',
    tierLabel: 'For regular hiring',
    adRangeMin: 4,
    adRangeMax: 6,
    adRangeDisplay: '4 – 6 ads',
    defaultAdCount: 5,
    cardPriceAud: 1990,
    cardPriceDisplay: '$1990 + GST',
  },
  frequent: {
    tier: 'frequent',
    tierLabel: 'For frequent hiring',
    adRangeMin: 6,
    adRangeMax: 10,
    adRangeDisplay: '6 – 10 ads',
    defaultAdCount: 10,
    cardPriceAud: 2450,
    cardPriceDisplay: '$2450 + GST',
    budgetAtMinAds: 2450,
    budgetAtMaxAds: 3700,
  },
};

const DISCOUNTS = [
  { adType: 'Basic Ad', discountPercent: 15 },
  { adType: 'Branded Add-on', discountPercent: 17.65 },
  { adType: 'Advanced Ad', discountPercent: 0 },
  { adType: 'Premium Ad', discountPercent: 0 },
  { adType: 'Other Add-Ons', discountPercent: 0 },
];

const ELIGIBLE_AD_TYPES = ['Branded Basic', 'Branded Advanced', 'Premium'];

const HOW_IT_WORKS = [
  'Use your Ad Budget to post ads at a discounted rate.',
  'Your budget will activate immediately after purchase or once any existing balance is fully used.',
  'All ads posted using this budget will include branding.',
];

const TERMS_NOTE =
  'Ad prices are variable. By proceeding, you agree to your purchase in line with our Agreement Terms, Advertising Terms of Use, and Product Terms.';

function defaultData() {
  return {
    meta: { lastAdvertiserSeq: 100 },
    advertisers: [],
  };
}

function isReadonlyDeployLayout() {
  const defaultFile = path.join(__dirname, '..', 'data', 'seek-ads.json');
  const norm = defaultFile.replace(/\\/g, '/');
  return norm.startsWith('/var/task/');
}

function isAwsLambdaEnv() {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      (process.env.AWS_EXECUTION_ENV &&
        String(process.env.AWS_EXECUTION_ENV).includes('Lambda')),
  );
}

function cloudWritableStorePath() {
  return path.join('/tmp', 'seek-ads-agent.json');
}

function resolveStorePath(explicit) {
  if (explicit) return explicit;
  if (process.env.SEEK_ADS_STORE_PATH) return process.env.SEEK_ADS_STORE_PATH;
  if (isReadonlyDeployLayout() || isAwsLambdaEnv()) return cloudWritableStorePath();
  return path.join(__dirname, '..', 'data', 'seek-ads.json');
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function bundledDemoPath() {
  return path.join(__dirname, '..', 'data', 'seek-ads.json');
}

function loadStore(storePath) {
  const p = resolveStorePath(storePath);
  if (!fs.existsSync(p)) {
    const bundled = bundledDemoPath();
    const seed = fs.existsSync(bundled)
      ? JSON.parse(fs.readFileSync(bundled, 'utf8'))
      : defaultData();
    ensureDirForFile(p);
    fs.writeFileSync(p, JSON.stringify(seed, null, 2), 'utf8');
    return { path: p, data: seed };
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { path: p, data };
}

function saveStore(storePath, data) {
  const p = resolveStorePath(storePath);
  ensureDirForFile(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function normalizePhone(input) {
  if (input == null) return '';
  let d = String(input).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0') && d.length === 10) return `61${d.slice(1)}`;
  return d;
}

function normalizeSeekId(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeAdvertiserId(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase().replace(/\s+/g, '');
  const m = upper.match(/^SA-?ADV-?(\d+)$/);
  if (m) return `SA-ADV-${m[1]}`;
  if (/^\d+$/.test(upper)) return `SA-ADV-${upper}`;
  return upper;
}

function normalizeTier(input) {
  const s = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (!s) return '';
  if (s === 'occasional' || s === 'occasionalhiring') return 'occasional';
  if (s === 'regular' || s === 'regularhiring') return 'regular';
  if (s === 'frequent' || s === 'frequenthiring') return 'frequent';
  if (s.startsWith('occas')) return 'occasional';
  if (s.startsWith('regul')) return 'regular';
  if (s.startsWith('freq')) return 'frequent';
  return '';
}

function isValidMobileConfirmationCode(code) {
  return /^\d{4}$/.test(String(code || '').trim());
}

function isValidSeekId(seekId) {
  return /^[A-Z0-9]{6}$/.test(normalizeSeekId(seekId));
}

function bundledSeedAdvertisers() {
  const bundled = bundledDemoPath();
  if (!fs.existsSync(bundled)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(bundled, 'utf8'));
    return Array.isArray(data.advertisers) ? data.advertisers : [];
  } catch {
    return [];
  }
}

function findAdvertiserBySeekId(data, seekId) {
  const id = normalizeSeekId(seekId);
  if (!id) return null;
  const inStore = data.advertisers.find((a) => normalizeSeekId(a.seekId) === id);
  if (inStore) return inStore;
  return bundledSeedAdvertisers().find((a) => normalizeSeekId(a.seekId) === id) || null;
}

const GENERIC_COMPANY_NAME = 'Seek Advertiser';
const GENERIC_CONTACT_NAME = 'Advertiser Contact';

function demoProfileForSeekId(seekId) {
  const roster = bundledSeedAdvertisers();
  if (!roster.length) {
    return {
      companyName: 'Demo Employer Pty Ltd',
      contactName: 'Alex Morgan',
      phone: '',
    };
  }
  const idx =
    [...normalizeSeekId(seekId)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % roster.length;
  const pick = roster[idx];
  return {
    companyName: pick.companyName,
    contactName: pick.contactName,
    phone: pick.phone || '',
  };
}

function applyAdvertiserFields(advertiser, seekId, fields) {
  const demo = demoProfileForSeekId(seekId);
  if (fields.companyName) {
    advertiser.companyName = fields.companyName;
  } else if (!advertiser.companyName || advertiser.companyName === GENERIC_COMPANY_NAME) {
    advertiser.companyName = demo.companyName;
  }
  if (fields.contactName) {
    advertiser.contactName = fields.contactName;
  } else if (!advertiser.contactName || advertiser.contactName === GENERIC_CONTACT_NAME) {
    advertiser.contactName = demo.contactName;
  }
  if (fields.phone) {
    advertiser.phone = normalizePhone(fields.phone);
  } else if (!advertiser.phone && demo.phone) {
    advertiser.phone = demo.phone;
  }
}

function nextAdvertiserId(data) {
  data.meta.lastAdvertiserSeq += 1;
  return `SA-ADV-${data.meta.lastAdvertiserSeq}`;
}

function resolveOrCreateAdvertiserOpen(data, fields) {
  const seekId = normalizeSeekId(fields.seekId);
  let advertiser = findAdvertiserBySeekId(data, seekId);

  if (advertiser && !data.advertisers.some((a) => a.advertiserId === advertiser.advertiserId)) {
    data.advertisers.push({ ...advertiser });
    advertiser = data.advertisers[data.advertisers.length - 1];
  }

  if (!advertiser) {
    const demo = demoProfileForSeekId(seekId);
    advertiser = {
      advertiserId: nextAdvertiserId(data),
      companyName: fields.companyName || demo.companyName,
      seekId,
      contactName: fields.contactName || demo.contactName,
      phone: fields.phone ? normalizePhone(fields.phone) : demo.phone || '',
    };
    data.advertisers.push(advertiser);
  } else {
    applyAdvertiserFields(advertiser, seekId, fields);
  }
  return advertiser;
}

function maskPhone(digits) {
  const d = String(digits || '');
  if (d.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

function tierFromAdCount(adCount) {
  const n = Math.floor(Number(adCount));
  if (!Number.isFinite(n) || n < 2) return null;
  if (n <= 3) return 'occasional';
  if (n <= 6) return 'regular';
  if (n <= 10) return 'frequent';
  return null;
}

function adCountFitsTier(adCount, tierKey) {
  const def = TIER_DEFINITIONS[tierKey];
  if (!def) return false;
  const n = Math.floor(Number(adCount));
  return Number.isFinite(n) && n >= def.adRangeMin && n <= def.adRangeMax;
}

function recommendedBudgetAud(tierKey, adCount) {
  const def = TIER_DEFINITIONS[tierKey];
  if (!def) return null;
  const count = Math.floor(Number(adCount)) || def.defaultAdCount;

  if (tierKey === 'frequent') {
    const min = def.adRangeMin;
    const max = def.adRangeMax;
    const minBudget = def.budgetAtMinAds;
    const maxBudget = def.budgetAtMaxAds;
    if (count <= min) return minBudget;
    if (count >= max) return maxBudget;
    const ratio = (count - min) / (max - min);
    return Math.round(minBudget + ratio * (maxBudget - minBudget));
  }

  return def.cardPriceAud;
}

function formatBudgetDisplay(amountAud) {
  return `$${Number(amountAud).toLocaleString('en-AU')} (+GST)`;
}

function buildPackageSummary(tierKey, adCount) {
  const def = TIER_DEFINITIONS[tierKey];
  if (!def) return null;

  const resolvedAdCount = Math.floor(Number(adCount)) || def.defaultAdCount;
  const budgetAud = recommendedBudgetAud(tierKey, resolvedAdCount);
  const budgetDisplay = formatBudgetDisplay(budgetAud);

  const openingLine = `For ${resolvedAdCount} job ads, the recommended budget amount is ${budgetDisplay}.`;

  const discountLines = DISCOUNTS.map(
    (d) => `- **${d.adType}:** ${d.discountPercent}% off`,
  ).join('\n');

  const eligibleLines = ELIGIBLE_AD_TYPES.map((t) => `- ${t}`).join('\n');
  const howItWorksLines = HOW_IT_WORKS.map((line) => `- ${line}`).join('\n');

  const summaryText = [
    openingLine,
    '',
    '**Discounts:**',
    discountLines,
    '',
    '**Branded Ad Budget details:**',
    '',
    '**12-Month Ad Budget:**',
    'Your Ad Budget is valid for 12 months. Contract discounts apply for the entire term, even after your balance is used.',
    '',
    '**Eligible Ad Types:**',
    eligibleLines,
    '',
    '**How It Works:**',
    howItWorksLines,
    '',
    '**Note:**',
    TERMS_NOTE,
  ].join('\n');

  return {
    tier: def.tier,
    tierLabel: def.tierLabel,
    adRangeDisplay: def.adRangeDisplay,
    adRangeMin: def.adRangeMin,
    adRangeMax: def.adRangeMax,
    adCount: resolvedAdCount,
    cardPriceDisplay: def.cardPriceDisplay,
    recommendedBudgetAud: budgetAud,
    recommendedBudgetDisplay: budgetDisplay,
    currency: 'AUD',
    discounts: DISCOUNTS,
    brandedAdBudget: {
      termMonths: 12,
      description:
        'Your Ad Budget is valid for 12 months. Contract discounts apply for the entire term, even after your balance is used.',
    },
    eligibleAdTypes: ELIGIBLE_AD_TYPES,
    howItWorks: HOW_IT_WORKS,
    termsNote: TERMS_NOTE,
    summaryText,
    openingLine,
  };
}

function listAllTiers() {
  return Object.values(TIER_DEFINITIONS).map((def) => ({
    tier: def.tier,
    tierLabel: def.tierLabel,
    adRangeDisplay: def.adRangeDisplay,
    adRangeMin: def.adRangeMin,
    adRangeMax: def.adRangeMax,
    cardPriceDisplay: def.cardPriceDisplay,
  }));
}

module.exports = {
  TIER_DEFINITIONS,
  loadStore,
  saveStore,
  normalizePhone,
  normalizeSeekId,
  normalizeAdvertiserId,
  normalizeTier,
  isValidMobileConfirmationCode,
  isValidSeekId,
  findAdvertiserBySeekId,
  resolveOrCreateAdvertiserOpen,
  maskPhone,
  tierFromAdCount,
  adCountFitsTier,
  recommendedBudgetAud,
  buildPackageSummary,
  listAllTiers,
};
