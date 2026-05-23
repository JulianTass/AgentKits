'use strict';

const fs = require('fs');
const path = require('path');

function defaultData() {
  return {
    meta: { lastClaimSeq: 1000, lastClaimantSeq: 200 },
    claimants: [],
    claims: [],
  };
}

function isReadonlyDeployLayout() {
  const defaultFile = path.join(__dirname, '..', 'data', 'claims.json');
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
  return path.join('/tmp', 'claim-management-insurance.json');
}

function resolveStorePath(explicit) {
  if (explicit) return explicit;
  if (process.env.CLAIMS_STORE_PATH) return process.env.CLAIMS_STORE_PATH;
  if (isReadonlyDeployLayout() || isAwsLambdaEnv()) return cloudWritableStorePath();
  return path.join(__dirname, '..', 'data', 'claims.json');
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function bundledDemoClaimsPath() {
  return path.join(__dirname, '..', 'data', 'claims.json');
}

function loadClaims(storePath) {
  const p = resolveStorePath(storePath);
  if (!fs.existsSync(p)) {
    const bundled = bundledDemoClaimsPath();
    const seed = fs.existsSync(bundled)
      ? JSON.parse(fs.readFileSync(bundled, 'utf8'))
      : defaultData();
    ensureDirForFile(p);
    fs.writeFileSync(p, JSON.stringify(seed, null, 2), 'utf8');
    return { path: p, data: seed };
  }
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function saveClaims(storePath, data) {
  const p = resolveStorePath(storePath);
  ensureDirForFile(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function parseCalendarDateToIso(datePart) {
  const raw = String(datePart || '').trim();
  if (!raw) return null;
  const s = raw.split(/[T\s]/)[0];
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    const year = m[3];
    return `${year}-${month}-${day}`;
  }
  const natural = raw.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-zA-Z]+)\s+(\d{4})$/i,
  );
  if (!natural) return null;
  const day = natural[1].padStart(2, '0');
  const monthName = natural[2].toLowerCase();
  const year = natural[3];
  const months = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
  };
  const month = months[monthName];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

function formatDateDisplayAU(isoDate) {
  const s = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function normalizeClaimType(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'hospital') return 'Hospital';
  if (s === 'extras') return 'Extras';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function nextClaimNumber(data) {
  data.meta.lastClaimSeq += 1;
  return `CLM${data.meta.lastClaimSeq}`;
}

function nextClaimantId(data) {
  data.meta.lastClaimantSeq += 1;
  return `MEM-${data.meta.lastClaimantSeq}`;
}

module.exports = {
  loadClaims,
  saveClaims,
  parseCalendarDateToIso,
  formatDateDisplayAU,
  normalizeClaimType,
  nextClaimNumber,
  nextClaimantId,
};
