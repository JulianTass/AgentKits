'use strict';

const fs = require('fs');
const path = require('path');

function defaultData() {
  return {
    meta: { lastBookingSeq: 344 },
    villages: [
      {
        villageId: 'VIL-LINCOLN',
        villageName: 'Lincoln',
        aliases: [
          'Linc',
          'Lincoln Village',
          'Lincolin',
          'Lyncoln',
        ],
      },
      {
        villageId: 'VIL-WARATAH',
        villageName: 'Waratah',
        aliases: [
          'Warata',
          'Warratah',
          'Waratta',
          'Woratah',
        ],
      },
      {
        villageId: 'VIL-MAYBROOK',
        villageName: 'Maybrook',
        aliases: [
          'May brook',
          'Maybrok',
          'Maybrooke',
          'Mabrook',
        ],
      },
    ],
    slots: [],
    bookings: [],
  };
}

function isReadonlyDeployLayout() {
  const defaultFile = path.join(__dirname, '..', 'data', 'tours.json');
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
  return path.join('/tmp', 'levande-tour-bookings.json');
}

function resolveStorePath(explicit) {
  if (explicit) return explicit;
  if (process.env.LEVANDE_TOURS_STORE_PATH) return process.env.LEVANDE_TOURS_STORE_PATH;
  if (isReadonlyDeployLayout() || isAwsLambdaEnv()) return cloudWritableStorePath();
  return path.join(__dirname, '..', 'data', 'tours.json');
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadTours(storePath) {
  const p = resolveStorePath(storePath);
  if (!fs.existsSync(p)) {
    const seedPath = path.join(__dirname, '..', 'data', 'tours.json');
    const seed = fs.existsSync(seedPath)
      ? JSON.parse(fs.readFileSync(seedPath, 'utf8'))
      : defaultData();
    ensureDirForFile(p);
    fs.writeFileSync(p, JSON.stringify(seed, null, 2), 'utf8');
    return { path: p, data: seed };
  }
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function saveTours(storePath, data) {
  const p = resolveStorePath(storePath);
  ensureDirForFile(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function parseCalendarDateToIso(datePart) {
  const raw = String(datePart || '').trim();
  if (!raw) return null;
  const s = raw.split(/[T\s]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[^\d]/.test(raw)) {
    const ymd = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (ymd) return ymd[1];
  }
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\b|[\s].*)?/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  const natural = raw.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-zA-Z]+)\s+(\d{4})(?=\b|\s|[^\d]|$)/i,
  );
  if (!natural) return null;
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
  const mm = months[natural[2].toLowerCase()];
  if (!mm) return null;
  return `${natural[3]}-${mm}-${natural[1].padStart(2, '0')}`;
}

function parseDateTimeToIso(input, fallbackTime = '10:00') {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
  let hh;
  let min;
  const tColon = raw.match(
    /\b(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(a\.?m\.?|p\.?m\.?))?(?=\b|$)/i,
  );
  if (tColon) {
    let h = parseInt(tColon[1], 10);
    min = tColon[2] || '00';
    if (tColon[3]) {
      const ap = tColon[3].toLowerCase();
      if (ap.startsWith('p') && h < 12) h += 12;
      if (ap.startsWith('a') && h === 12) h = 0;
    }
    hh = String(h).padStart(2, '0');
  } else {
    const tAm = raw.match(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (tAm) {
      let h = parseInt(tAm[1], 10);
      const ap = tAm[2].toLowerCase();
      if (ap.startsWith('p') && h < 12) h += 12;
      if (ap.startsWith('a') && h === 12) h = 0;
      hh = String(h).padStart(2, '0');
      min = '00';
    } else {
      const t2 = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
      hh = t2 ? String(Number(t2[1])).padStart(2, '0') : fallbackTime.slice(0, 2);
      min = t2 ? t2[2] : fallbackTime.slice(3, 5);
    }
  }
  const d = parseCalendarDateToIso(raw);
  if (!d) return null;
  return `${d}T${hh}:${min}`;
}

function formatDateDisplayAU(isoDate) {
  const s = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTimeDisplayAU(isoDateTime) {
  const s = String(isoDateTime || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s;
  return `${formatDateDisplayAU(s.slice(0, 10))} ${s.slice(11, 16)}`;
}

function normalizeVillageName(input) {
  return String(input || '').trim().toLowerCase();
}

/**
 * Resolves a village from canonical `villageName` or from `aliases` on each record
 * (common misspellings and short forms). Fuzzy: substring match on name or alias when
 * the query is at least 3 characters, or 2+ for exact full-name containment.
 */
function findVillage(data, rawName) {
  const n = normalizeVillageName(rawName);
  if (!n) return null;
  const villages = data.villages || [];

  for (const v of villages) {
    if (normalizeVillageName(v.villageName) === n) return v;
  }
  for (const v of villages) {
    for (const a of v.aliases || []) {
      if (normalizeVillageName(a) === n) return v;
    }
  }
  for (const v of villages) {
    const vn = normalizeVillageName(v.villageName);
    if (n.length >= 3 && (vn.includes(n) || n.includes(vn))) return v;
  }
  for (const v of villages) {
    for (const a of v.aliases || []) {
      const an = normalizeVillageName(a);
      if (an.length < 2) continue;
      if (n.length >= 3 && (an.includes(n) || n.includes(an))) return v;
    }
  }
  return null;
}

/**
 * When the caller omits village: use LEVANDE_DEFAULT_VILLAGE_NAME if set and valid, else first village in data.
 * When a name is given: same resolution as findVillage (null if unknown).
 */
function resolveBookingVillage(data, rawName) {
  const n = String(rawName || '').trim();
  if (n) {
    return findVillage(data, n);
  }
  const fromEnv = process.env.LEVANDE_DEFAULT_VILLAGE_NAME;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    const byEnv = findVillage(data, String(fromEnv).trim());
    if (byEnv) return byEnv;
  }
  const vs = data.villages || [];
  return vs[0] || null;
}

function parsePreferredDateTimes(input) {
  const out = [];
  const tdt = input.tourDateTime ?? input.TourDateTime;
  if (tdt) {
    const iso = parseDateTimeToIso(tdt);
    if (iso) out.push(iso);
  }
  const tdate = input.tourDate ?? input.TourDate;
  const ttime = input.tourTime ?? input.TourTime;
  if (tdate && ttime) {
    const iso = parseDateTimeToIso(`${tdate} ${ttime}`);
    if (iso) out.push(iso);
  }
  const arr = input.preferredDateTimes ?? input.PreferredDateTimes;
  if (Array.isArray(arr)) {
    for (const x of arr) {
      const iso = parseDateTimeToIso(x);
      if (iso) out.push(iso);
    }
  }
  const single = input.preferredDateTime ?? input.PreferredDateTime;
  if (single) {
    const iso = parseDateTimeToIso(single);
    if (iso) out.push(iso);
  }
  const dates = input.preferredDates ?? input.PreferredDates;
  if (Array.isArray(dates)) {
    for (const d of dates) {
      const iso = parseDateTimeToIso(d);
      if (iso) out.push(iso);
    }
  }
  const oneDate = input.preferredDate ?? input.PreferredDate ?? input.date;
  if (oneDate) {
    const iso = parseDateTimeToIso(oneDate);
    if (iso) out.push(iso);
  }
  return [...new Set(out)];
}

function normalizeSlotKey(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return m ? m[1] : String(s).slice(0, 16);
}

function isSlotBookedForVillage(data, villageId, slotIso) {
  const key = normalizeSlotKey(slotIso);
  return (data.bookings || []).some(
    (b) =>
      b.villageId === villageId &&
      b.status === 'confirmed' &&
      normalizeSlotKey(b.scheduledStart) === key,
  );
}

/**
 * Australian mobile: 04XX XXX XXX (10 digits) or +61 4XX XXX XXX / 614... (E.164).
 * Spaces, dashes, and parentheses are ignored.
 */
function normalizeAuPhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false };
  const compact = s.replace(/[\s\-().]/g, '');
  let m = compact.match(/^\+61(4\d{8})$/);
  if (m) {
    const national = m[1];
    return { ok: true, e164: `+61${national}`, local: `0${national}` };
  }
  m = compact.match(/^61(4\d{8})$/);
  if (m) {
    const national = m[1];
    return { ok: true, e164: `+61${national}`, local: `0${national}` };
  }
  m = compact.match(/^0(4\d{8})$/);
  if (m) {
    const national = m[1];
    return { ok: true, e164: `+61${national}`, local: `0${national}` };
  }
  m = compact.match(/^(4\d{8})$/);
  if (m) {
    const national = m[1];
    return { ok: true, e164: `+61${national}`, local: `0${national}` };
  }
  return { ok: false };
}

/**
 * Open calendar: any requested date/time is considered available for the village
 * unless the same time is already in confirmed bookings.
 */
const TOUR_DATE_KEYS = ['tourDate', 'TourDate', 'tour_date'];
const TOUR_TIME_KEYS = ['tourTime', 'TourTime', 'tour_time'];

function pickFirstStringFromKeys(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function getTourDateTimeParts(input) {
  return {
    tourDate: pickFirstStringFromKeys(input, TOUR_DATE_KEYS),
    tourTime: pickFirstStringFromKeys(input, TOUR_TIME_KEYS),
  };
}

/**
 * If tourDates / tourTimes are plain strings (common from Genesys test UIs), treat as one-element arrays.
 */
function normalizeTourDateTimeArrays(arrD, arrT) {
  let d = arrD;
  let t = arrT;
  if (d != null && !Array.isArray(d) && String(d).trim() !== '') {
    d = [String(d).trim()];
  }
  if (t != null && !Array.isArray(t) && String(t).trim() !== '') {
    t = [String(t).trim()];
  }
  return { arrD: d, arrT: t };
}

/**
 * One slot: tourDate + tourTime. Multiple: parallel arrays tourDates[] + tourTimes[] (same length).
 * If both array and scalar fields are set, non-empty arrays win.
 */
function getTourDateTimeSlots(input) {
  const rawD = input.tourDates ?? input.TourDates;
  const rawT = input.tourTimes ?? input.TourTimes;
  const { arrD, arrT } = normalizeTourDateTimeArrays(rawD, rawT);
  if (Array.isArray(arrD) && arrD.length > 0) {
    if (!Array.isArray(arrT) || arrT.length !== arrD.length) {
      return {
        error: 'ARRAY_LENGTH',
        message:
          'tourDates and tourTimes must be arrays of the same length when using multiple slots.',
      };
    }
    const slots = [];
    for (let i = 0; i < arrD.length; i += 1) {
      const tourDate = String(arrD[i] ?? '').trim();
      const tourTime = String(arrT[i] ?? '').trim();
      if (!tourDate || !tourTime) {
        return { error: 'EMPTY_SLOT', index: i, message: 'Each tourDates[i] needs a matching tourTimes[i].' };
      }
      const iso = buildTourStartIso(tourDate, tourTime);
      if (!iso) {
        return { error: 'INVALID_DATETIME', index: i, tourDate, tourTime };
      }
      slots.push({ tourDate, tourTime, iso });
    }
    const deduped = [];
    const seen = new Set();
    for (const s of slots) {
      if (seen.has(s.iso)) continue;
      seen.add(s.iso);
      deduped.push(s);
    }
    return { mode: 'list', slots: deduped };
  }

  const { tourDate, tourTime } = getTourDateTimeParts(input);
  if (!tourDate && !tourTime) {
    return { error: 'MISSING', missing: 'both' };
  }
  if (tourDate && !tourTime) {
    return { error: 'MISSING', missing: 'tourTime', tourDate };
  }
  if (!tourDate && tourTime) {
    return { error: 'MISSING', missing: 'tourDate', tourTime };
  }
  const iso = buildTourStartIso(tourDate, tourTime);
  if (!iso) {
    return { error: 'INVALID_DATETIME', tourDate, tourTime };
  }
  return { mode: 'single', slots: [{ tourDate, tourTime, iso }] };
}

function buildTourStartIso(tourDate, tourTime) {
  if (!tourDate || !tourTime) return null;
  return parseDateTimeToIso(`${tourDate} ${tourTime}`);
}

function checkOpenTimesForVillage(data, villageOrName, preferredDateTimes) {
  const village =
    villageOrName &&
    typeof villageOrName === 'object' &&
    villageOrName.villageId &&
    villageOrName.villageName
      ? villageOrName
      : findVillage(data, String(villageOrName || '').trim());
  if (!village) {
    return { village: null, available: [], conflicts: [] };
  }
  const available = [];
  const conflicts = [];
  for (const iso of preferredDateTimes) {
    if (!iso) continue;
    if (isSlotBookedForVillage(data, village.villageId, iso)) {
      conflicts.push(iso);
    } else {
      available.push(iso);
    }
  }
  return { village, available, conflicts };
}

function nextBookingReference(data) {
  data.meta.lastBookingSeq += 1;
  return `BK${data.meta.lastBookingSeq}`;
}

module.exports = {
  loadTours,
  saveTours,
  parseCalendarDateToIso,
  parseDateTimeToIso,
  formatDateDisplayAU,
  formatDateTimeDisplayAU,
  parsePreferredDateTimes,
  checkOpenTimesForVillage,
  isSlotBookedForVillage,
  getTourDateTimeParts,
  getTourDateTimeSlots,
  buildTourStartIso,
  normalizeAuPhone,
  findVillage,
  resolveBookingVillage,
  nextBookingReference,
};
