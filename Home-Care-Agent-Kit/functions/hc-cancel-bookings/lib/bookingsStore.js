'use strict';

const fs = require('fs');
const path = require('path');

const PLAN_ILMP = {
  planId: 'PLAN-ILMP',
  planName: 'Independent Living Maintenance Plan',
  services: [
    'Personal Care',
    'Mobility & Safety',
    'Medication Support',
    'Domestic Assistance',
  ],
};

function defaultData() {
  return {
    meta: { lastBookingSeq: 148, lastClientSeq: 1000, lastGroupSeq: 0 },
    planCatalog: { [PLAN_ILMP.planId]: PLAN_ILMP },
    clients: [],
    bookings: [],
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Genesys Cloud Functions deploy the zip under /var/task, which is read-only; only /tmp is writable. */
function isReadonlyDeployLayout() {
  const defaultFile = path.join(__dirname, '..', 'data', 'bookings.json');
  const norm = defaultFile.replace(/\\/g, '/');
  return norm.startsWith('/var/task/');
}

/** Some hosted runtimes still expose AWS Lambda env vars; treat like cloud deploy. */
function isAwsLambdaEnv() {
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      (process.env.AWS_EXECUTION_ENV &&
        String(process.env.AWS_EXECUTION_ENV).includes('Lambda')),
  );
}

/** Writable JSON path for Genesys Cloud Functions and similar hosts (one file per deploy so all kit functions share state). */
function cloudWritableStorePath() {
  return path.join('/tmp', 'home-care-bookings.json');
}

function resolveStorePath(explicit) {
  if (explicit) return explicit;
  if (process.env.HOME_CARE_BOOKINGS_PATH) return process.env.HOME_CARE_BOOKINGS_PATH;
  if (isReadonlyDeployLayout() || isAwsLambdaEnv()) {
    return cloudWritableStorePath();
  }
  return path.join(__dirname, '..', 'data', 'bookings.json');
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Packaged demo roster next to `lib/` (included in function zips when `data/bookings.json` is shipped). */
function bundledDemoBookingsPath() {
  return path.join(__dirname, '..', 'data', 'bookings.json');
}

function loadBookings(storePath) {
  const p = resolveStorePath(storePath);
  if (!fs.existsSync(p)) {
    const bundled = bundledDemoBookingsPath();
    let seed;
    if (fs.existsSync(bundled)) {
      seed = JSON.parse(fs.readFileSync(bundled, 'utf8'));
    } else {
      seed = seedDemoWeek(deepClone(defaultData()));
    }
    ensureDirForFile(p);
    fs.writeFileSync(p, JSON.stringify(seed, null, 2), 'utf8');
    return { path: p, data: seed };
  }
  const raw = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(raw);
  return { path: p, data };
}

function saveBookings(storePath, data) {
  const p = resolveStorePath(storePath);
  ensureDirForFile(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function normalizePhone(input) {
  if (input == null) return '';
  let d = String(input).replace(/\D/g, '');
  if (!d) return '';
  // AU national 0xxxxxxxx (10 digits) ↔ +61… (e.g. 0406910251 and +61406910251)
  if (d.startsWith('0') && d.length === 10) {
    return `61${d.slice(1)}`;
  }
  return d;
}

/**
 * Parses a calendar date as day/month/year (Australian style) or ISO yyyy-mm-dd.
 * @returns {string|null} YYYY-MM-DD or null
 */
function parseCalendarDateToIso(datePart) {
  const s = String(datePart || '').trim().split(/[T\s]/)[0];
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

/** Normalises DOB input to ISO YYYY-MM-DD for storage and matching. Accepts dd/mm/yyyy or yyyy-mm-dd. */
function normalizeDob(input) {
  if (!input) return '';
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = parseCalendarDateToIso(s);
  return iso || s;
}

/** Formats YYYY-MM-DD as DD/MM/YYYY for responses. */
function formatDateDisplayAU(isoDate) {
  const head = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return null;
  const [y, m, d] = head.split('-');
  return `${d}/${m}/${y}`;
}

/** Formats an ISO-like datetime as DD/MM/YYYY HH:mm (24h). */
function formatDateTimeDisplayAU(isoDateTime) {
  const s = String(isoDateTime || '').trim();
  const datePart = s.slice(0, 10);
  const t = s.includes('T') ? s.split('T')[1] : s.includes(' ') ? s.split(/\s+/)[1] : '';
  const disp = formatDateDisplayAU(datePart);
  if (!disp) return s;
  if (!t) return disp;
  const [hh = '00', mm = '00'] = t.split(':');
  return `${disp} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Accepts YYYY-MM-DD or DD/MM/YYYY (or D/M/YYYY) for week anchors. */
function normalizeCalendarInputToIsoDate(value) {
  if (value == null || value === '') return null;
  const head = String(value).trim().split(/[T\s]/)[0];
  return parseCalendarDateToIso(head);
}

function nextId(seq, prefix) {
  return `${prefix}${seq}`;
}

function seedDemoWeek(data) {
  const weekStart = '2026-04-27';
  data.meta.lastGroupSeq = 501;
  const bookingGroupId = 'GRP-501';
  const demoClient = {
    clientId: 'CLI-1001',
    fullName: 'Alex Morgan',
    dob: '1958-03-12',
    phone: '61400111222',
    planId: PLAN_ILMP.planId,
  };
  data.clients.push(demoClient);
  data.meta.lastClientSeq = 1001;

  const slots = [
    { service: 'Personal Care', dayOffset: 0, time: '09:00' },
    { service: 'Mobility & Safety', dayOffset: 1, time: '10:30' },
    { service: 'Medication Support', dayOffset: 2, time: '08:00' },
    { service: 'Domestic Assistance', dayOffset: 3, time: '13:15' },
  ];

  let bk = 140;
  for (const row of slots) {
    const d = addDays(weekStart, row.dayOffset);
    data.bookings.push({
      bookingId: nextId(bk, 'BK'),
      bookingGroupId,
      clientId: demoClient.clientId,
      serviceName: row.service,
      planId: PLAN_ILMP.planId,
      scheduledStart: `${d}T${row.time}:00`,
      status: 'confirmed',
      weekStart,
    });
    bk += 1;
  }
  data.meta.lastBookingSeq = bk - 1;
  return data;
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function mondayOfWeekContaining(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const mondayDow = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + mondayDow);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function findBookingByReference(data, ref) {
  const r = String(ref).trim().toUpperCase();
  if (!r) return null;
  const byId = data.bookings.find((x) => x.bookingId.toUpperCase() === r);
  if (byId) return byId;
  const byGroup = data.bookings.find(
    (x) => (x.bookingGroupId || '').toUpperCase() === r,
  );
  return byGroup || null;
}

/**
 * Identity resolution: any of booking reference, phone, or DOB can identify the customer.
 * - Booking reference alone is always sufficient when it matches a booking or group.
 * - Phone alone or DOB alone when it matches exactly one customer.
 * - If both phone and DOB are supplied, they must match the same customer (no partial mismatch).
 */
function findClient(data, { phone, dob, bookingReference }) {
  const p = phone ? normalizePhone(phone) : '';
  const d = dob ? normalizeDob(dob) : '';
  const br = bookingReference ? String(bookingReference).trim().toUpperCase() : '';

  if (br) {
    const b = findBookingByReference(data, br);
    if (b) return data.clients.find((c) => c.clientId === b.clientId) || null;
  }

  const byPhone = p
    ? data.clients.filter((c) => normalizePhone(c.phone) === p)
    : [];
  const byDob = d
    ? data.clients.filter((c) => normalizeDob(c.dob) === d)
    : [];

  if (p && d) {
    const strict = byPhone.filter((c) => normalizeDob(c.dob) === d);
    if (strict.length === 1) return strict[0];
    return null;
  }

  if (p && byPhone.length === 1) return byPhone[0];
  if (d && byDob.length === 1) return byDob[0];

  return null;
}

function planForClient(data, client) {
  if (!client) return null;
  return data.planCatalog[client.planId] || null;
}

function bookingsForClient(data, clientId) {
  return data.bookings.filter((b) => b.clientId === clientId && b.status !== 'cancelled');
}

function bookingsInWeek(data, clientId, weekStart) {
  return bookingsForClient(data, clientId).filter((b) => b.weekStart === weekStart);
}

function splitDateTime(isoLike) {
  const s = String(isoLike).trim();
  let m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?/);
  if (m) {
    const hhmmss =
      m[3] != null ? `${m[2]}:${m[3]}` : `${m[2]}:00`;
    return { date: m[1], hhmmss };
  }
  m = s.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[T\s]+(\d{2}:\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    const date = parseCalendarDateToIso(`${m[1]}/${m[2]}/${m[3]}`);
    if (!date) return null;
    const hhmmss =
      m[5] != null ? `${m[4]}:${m[5]}` : `${m[4]}:00`;
    return { date, hhmmss };
  }
  const dOnlyIso = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dOnlyIso) return { date: dOnlyIso[1], hhmmss: '10:00:00' };
  const dOnlySlash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dOnlySlash) {
    const date = parseCalendarDateToIso(
      `${dOnlySlash[1]}/${dOnlySlash[2]}/${dOnlySlash[3]}`,
    );
    if (!date) return null;
    return { date, hhmmss: '10:00:00' };
  }
  return null;
}

/** Normalises a datetime input (ISO or dd/mm/yyyy [T| ]HH:mm) to YYYY-MM-DDTHH:mm:ss style string. */
function normalizeDateTimeInputToIso(value) {
  const parts = splitDateTime(String(value || '').trim());
  if (!parts) return null;
  return `${parts.date}T${parts.hhmmss}`;
}

function buildPlanServiceRows(anchorIso, services) {
  const parts = splitDateTime(anchorIso);
  if (!parts) return null;
  const weekStart = mondayOfWeekContaining(parts.date);
  const rows = [];
  services.forEach((serviceName, idx) => {
    const day = addDays(weekStart, Math.min(idx, 4));
    rows.push({
      serviceName,
      scheduledStart: `${day}T${parts.hhmmss}`,
      weekStart,
    });
  });
  return rows;
}

function suggestSlots(fromIsoDate, serviceName, count = 5) {
  const start = fromIsoDate || new Date().toISOString().slice(0, 10);
  const times = ['09:00', '11:00', '14:00', '16:00'];
  const out = [];
  for (let i = 0; i < 14 && out.length < count; i++) {
    const day = addDays(start, i);
    const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    for (const t of times) {
      if (out.length >= count) break;
      out.push({
        serviceName,
        scheduledStart: `${day}T${t}:00`,
        weekStart: mondayOfWeekContaining(day),
      });
    }
  }
  return out;
}

module.exports = {
  PLAN_ILMP,
  defaultData,
  loadBookings,
  saveBookings,
  normalizePhone,
  normalizeDob,
  parseCalendarDateToIso,
  formatDateDisplayAU,
  formatDateTimeDisplayAU,
  normalizeCalendarInputToIsoDate,
  nextId,
  findBookingByReference,
  findClient,
  planForClient,
  bookingsForClient,
  bookingsInWeek,
  mondayOfWeekContaining,
  suggestSlots,
  splitDateTime,
  normalizeDateTimeInputToIso,
  buildPlanServiceRows,
};
