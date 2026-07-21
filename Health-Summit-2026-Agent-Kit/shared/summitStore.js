'use strict';

const fs = require('fs');
const path = require('path');

/** Only dates after 9 June 2026 are valid (first bookable calendar day: 10 June). */
const SUMMIT_CUTOFF_LABEL = '9 June 2026';
const SUMMIT_EARLIEST_DATE = '2026-06-10';
const SUMMIT_LATEST_DATE = '2026-06-20';
const SLOT_TIMES = ['09:15', '10:30', '11:45', '13:00', '14:30', '16:00'];

function defaultData() {
  return {
    meta: {
      lastAttendeeSeq: 103,
      lastBookingSeq: 2005,
      lastCancellationSeq: 3000,
    },
    event: {
      name: 'Health Summit 2026',
      venue: 'Sydney Convention Centre',
      earliestDate: SUMMIT_EARLIEST_DATE,
      latestDate: SUMMIT_LATEST_DATE,
    },
    attendees: [],
    bookings: [],
  };
}

function isReadonlyDeployLayout() {
  const defaultFile = path.join(__dirname, '..', 'data', 'summit.json');
  return defaultFile.replace(/\\/g, '/').startsWith('/var/task/');
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
  return path.join('/tmp', 'health-summit-2026.json');
}

function resolveStorePath(explicit) {
  if (explicit) return explicit;
  if (process.env.HEALTH_SUMMIT_STORE_PATH) return process.env.HEALTH_SUMMIT_STORE_PATH;
  if (isReadonlyDeployLayout() || isAwsLambdaEnv()) return cloudWritableStorePath();
  return path.join(__dirname, '..', 'data', 'summit.json');
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function bundledDemoPath() {
  return path.join(__dirname, '..', 'data', 'summit.json');
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
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function saveStore(storePath, data) {
  const p = resolveStorePath(storePath);
  ensureDirForFile(p);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function parseCalendarDateToIso(datePart) {
  const s = String(datePart || '').trim().split(/[T\s]/)[0];
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function normalizeDob(input) {
  if (!input) return '';
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return parseCalendarDateToIso(s) || s;
}

function formatDateDisplayAU(isoDate) {
  const head = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return null;
  const [y, m, d] = head.split('-');
  return `${d}/${m}/${y}`;
}

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

function normalizeDateTimeInputToIso(value) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{2})/);
  if (m) {
    return `${m[1]}T${String(m[2]).padStart(2, '0')}:${m[3]}:00`;
  }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[T\s]+(\d{1,2}):(\d{2})/);
  if (m) {
    const date = parseCalendarDateToIso(`${m[1]}/${m[2]}/${m[3]}`);
    if (!date) return null;
    return `${date}T${String(m[4]).padStart(2, '0')}:${m[5]}:00`;
  }
  const dOnly = parseCalendarDateToIso(s);
  if (dOnly) return `${dOnly}T10:30:00`;
  return null;
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function compareIsoDate(a, b) {
  return String(a).localeCompare(String(b));
}

function isOnOrAfterSummitWindow(isoDate) {
  return compareIsoDate(isoDate.slice(0, 10), SUMMIT_EARLIEST_DATE) >= 0;
}

function isWithinSummitWindow(isoDate) {
  const d = isoDate.slice(0, 10);
  return compareIsoDate(d, SUMMIT_EARLIEST_DATE) >= 0 && compareIsoDate(d, SUMMIT_LATEST_DATE) <= 0;
}

function hashSeed(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickRandomSlot(attendeeId, dateIso, salt = '') {
  const h = hashSeed(`${attendeeId}:${dateIso}:${salt}`);
  const dayOffset = h % 8;
  const timeIdx = (h >> 8) % SLOT_TIMES.length;
  let date = dateIso;
  if (!isWithinSummitWindow(date)) {
    date = addDays(SUMMIT_EARLIEST_DATE, dayOffset % 6);
  }
  if (!isWithinSummitWindow(date)) date = SUMMIT_EARLIEST_DATE;
  return `${date}T${SLOT_TIMES[timeIdx]}:00`;
}

function findBookingByReference(data, ref) {
  const r = String(ref || '')
    .trim()
    .toUpperCase();
  if (!r) return null;
  return (
    data.bookings.find(
      (b) =>
        b.bookingId.toUpperCase() === r ||
        (b.bookingReference && b.bookingReference.toUpperCase() === r),
    ) || null
  );
}

function nextAttendeeId(data) {
  data.meta.lastAttendeeSeq += 1;
  return `HS-ATT-${data.meta.lastAttendeeSeq}`;
}

function nextBookingId(data) {
  data.meta.lastBookingSeq += 1;
  return `HS-BK-${data.meta.lastBookingSeq}`;
}

function nextCancellationReference(data) {
  data.meta.lastCancellationSeq += 1;
  return `HS-CX-${data.meta.lastCancellationSeq}`;
}

function bookingsForAttendee(data, attendeeId) {
  return data.bookings.filter(
    (b) => b.attendeeId === attendeeId && b.status === 'confirmed',
  );
}

function nextConfirmedBooking(data, attendeeId) {
  const active = bookingsForAttendee(data, attendeeId)
    .filter((b) => isOnOrAfterSummitWindow(b.scheduledStart))
    .sort((a, b) => String(a.scheduledStart).localeCompare(String(b.scheduledStart)));
  return active[0] || null;
}

function normalizeBookingReference(value) {
  const r = String(value || '')
    .trim()
    .toUpperCase();
  if (!r || r === 'NULL' || r === 'UNDEFINED' || r === 'N/A' || r === 'NONE') return '';
  return r;
}

/**
 * Demo/open IDV: any DOB accepted; booking reference optional (empty omitted).
 * Lookup order: booking reference → DOB → full name → create attendee.
 */
function resolveAttendeeOpen(data, { dob, bookingReference, fullName }) {
  const br = normalizeBookingReference(bookingReference);
  const d = dob != null && String(dob).trim() !== '' ? normalizeDob(dob) : '';
  const name = fullName ? String(fullName).trim() : '';

  if (br) {
    const b = findBookingByReference(data, br);
    if (b) {
      const attendee = data.attendees.find((a) => a.attendeeId === b.attendeeId);
      if (attendee) {
        if (d) attendee.dob = d;
        if (name) attendee.fullName = name;
        return { attendee, matchedBy: 'bookingReference' };
      }
    }
  }

  if (d) {
    let attendee = data.attendees.find((a) => normalizeDob(a.dob) === d);
    if (attendee) {
      if (name) attendee.fullName = name;
      return { attendee, matchedBy: 'dob' };
    }

    if (name) {
      const byName = data.attendees.find(
        (a) => String(a.fullName || '').trim().toLowerCase() === name.toLowerCase(),
      );
      if (byName) {
        byName.dob = d;
        return { attendee: byName, matchedBy: 'fullName' };
      }
    }

    attendee = {
      attendeeId: nextAttendeeId(data),
      fullName: name || 'Health Summit Attendee',
      dob: d,
    };
    data.attendees.push(attendee);
    return { attendee, matchedBy: 'created', created: true };
  }

  if (name) {
    const attendee = data.attendees.find(
      (a) => String(a.fullName || '').trim().toLowerCase() === name.toLowerCase(),
    );
    if (attendee) {
      return { attendee, matchedBy: 'fullName' };
    }
  }

  return null;
}

function normalizeAttendeeId(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^hs-att-(\d+)$/i);
  if (!m) return '';
  return `HS-ATT-${m[1]}`;
}

function syncAttendeeSeqFromId(data, attendeeId) {
  const m = String(attendeeId).match(/^HS-ATT-(\d+)$/);
  if (!m) return;
  const seq = Number(m[1]);
  if (Number.isFinite(seq) && seq > data.meta.lastAttendeeSeq) {
    data.meta.lastAttendeeSeq = seq;
  }
}

/**
 * Demo/open booking tools: accept attendeeId from a prior IDV call even when this
 * function instance has a fresh store (separate Genesys zip deployments).
 */
function resolveAttendeeForBookingOpen(data, fields) {
  const attendeeId = normalizeAttendeeId(fields.attendeeId);
  const dob =
    fields.dob != null && String(fields.dob).trim() !== '' ? normalizeDob(fields.dob) : '';
  const fullName = fields.fullName ? String(fields.fullName).trim() : '';

  if (attendeeId) {
    let attendee = data.attendees.find(
      (a) => normalizeAttendeeId(a.attendeeId) === attendeeId,
    );
    if (attendee) {
      if (dob) attendee.dob = dob;
      if (fullName) attendee.fullName = fullName;
      return attendee;
    }
    syncAttendeeSeqFromId(data, attendeeId);
    attendee = {
      attendeeId,
      fullName: fullName || 'Health Summit Attendee',
      dob: dob || '',
    };
    data.attendees.push(attendee);
    return attendee;
  }

  if (dob) {
    const resolved = resolveAttendeeOpen(data, {
      dob,
      bookingReference: fields.bookingReference,
      fullName,
    });
    return resolved ? resolved.attendee : null;
  }

  return null;
}

function bookingView(b) {
  return {
    bookingId: b.bookingId,
    bookingReference: b.bookingReference || b.bookingId,
    appointmentType: b.appointmentType,
    scheduledStart: b.scheduledStart,
    scheduledStartDisplay: formatDateTimeDisplayAU(b.scheduledStart),
    status: b.status,
  };
}

function generateNextAvailableAppointment(data, attendeeId) {
  const existing = nextConfirmedBooking(data, attendeeId);
  if (existing && isOnOrAfterSummitWindow(existing.scheduledStart)) {
    return { booking: existing, source: 'existing' };
  }

  const h = hashSeed(`${attendeeId}:next:${Date.now()}`);
  const dayOffset = h % 7;
  const date = addDays(SUMMIT_EARLIEST_DATE, dayOffset);
  const scheduledStart = pickRandomSlot(attendeeId, date, 'next-available');

  const booking = {
    bookingId: nextBookingId(data),
    bookingReference: '',
    attendeeId,
    appointmentType: 'Health Summit Session',
    scheduledStart,
    status: 'confirmed',
  };
  booking.bookingReference = booking.bookingId;
  data.bookings.push(booking);
  return { booking, source: 'generated' };
}

function cancelBooking(data, attendeeId, bookingId) {
  const id = bookingId ? String(bookingId).trim().toUpperCase() : '';
  let targets = bookingsForAttendee(data, attendeeId);
  if (id) {
    targets = targets.filter(
      (b) =>
        b.bookingId.toUpperCase() === id ||
        (b.bookingReference && b.bookingReference.toUpperCase() === id),
    );
  } else if (targets.length) {
    const next = nextConfirmedBooking(data, attendeeId);
    targets = next ? [next] : [targets[0]];
  }

  if (!targets.length) return null;

  const cancelled = [];
  for (const b of targets) {
    b.status = 'cancelled';
    b.cancelledAt = new Date().toISOString();
    b.cancellationReferenceId = nextCancellationReference(data);
    cancelled.push({
      bookingId: b.bookingId,
      bookingReference: b.bookingReference || b.bookingId,
      cancellationReferenceId: b.cancellationReferenceId,
      scheduledStart: b.scheduledStart,
      scheduledStartDisplay: formatDateTimeDisplayAU(b.scheduledStart),
    });
  }
  return cancelled;
}

function proposeRescheduleSlots(attendeeId, proposalPairs) {
  const options = [];
  let optionIndex = 0;
  for (const [dateVal, timeVal] of proposalPairs) {
    if (!dateVal || String(dateVal).trim() === '') continue;
    optionIndex += 1;
    const resolved = resolveSummitDateTime(dateVal, timeVal, attendeeId, `propose-${optionIndex}`);
    if (resolved.error === 'missing_time') {
      options.push({
        optionIndex,
        valid: false,
        proposedDate: dateVal,
        proposedTime: timeVal,
        message: 'Provide proposedTime (HH:mm) with each proposedDate.',
      });
      continue;
    }
    if (resolved.error === 'invalid_window') {
      options.push({
        optionIndex,
        valid: false,
        proposedDate: resolved.raw || dateVal,
        proposedTime: timeVal,
        message: `Only dates after ${SUMMIT_CUTOFF_LABEL} are available (${formatDateDisplayAU(SUMMIT_EARLIEST_DATE)} – ${formatDateDisplayAU(SUMMIT_LATEST_DATE)}).`,
      });
      continue;
    }
    if (resolved.error) continue;
    const { scheduledStart } = resolved;
    options.push({
      optionIndex,
      valid: true,
      proposedDate: scheduledStart.slice(0, 10),
      proposedDateDisplay: formatDateDisplayAU(scheduledStart.slice(0, 10)),
      proposedTime: scheduledStart.split('T')[1]?.slice(0, 5) || '',
      scheduledStart,
      scheduledStartDisplay: formatDateTimeDisplayAU(scheduledStart),
      message: `Option ${optionIndex} available at ${formatDateTimeDisplayAU(scheduledStart)}.`,
    });
  }
  return options;
}

function resolveSummitDateTime(dateValue, timeValue, attendeeId, randomSalt) {
  if (!dateValue || String(dateValue).trim() === '') {
    return { error: 'missing_date' };
  }

  const combined = timeValue ? `${dateValue} ${timeValue}` : dateValue;
  let scheduledStart = normalizeDateTimeInputToIso(combined);

  if (!scheduledStart && timeValue) {
    const dateIso = parseCalendarDateToIso(dateValue);
    const hm = String(timeValue).trim().match(/^(\d{1,2}):(\d{2})/);
    if (dateIso && hm) {
      scheduledStart = `${dateIso}T${String(hm[1]).padStart(2, '0')}:${hm[2]}:00`;
    }
  }

  if (!scheduledStart) {
    const dateIso = parseCalendarDateToIso(dateValue) || dateValue;
    if (!dateIso || !isWithinSummitWindow(dateIso)) {
      return { error: 'invalid_window', raw: dateIso || dateValue };
    }
    if (!timeValue || String(timeValue).trim() === '') {
      return { error: 'missing_time' };
    }
    return { error: 'invalid_window', raw: dateIso };
  }

  const datePart = scheduledStart.slice(0, 10);
  if (!isWithinSummitWindow(datePart)) {
    return { error: 'invalid_window', raw: datePart };
  }

  return { scheduledStart };
}

function confirmReschedule(data, attendeeId, bookingId, selectedDate, selectedTime) {
  const id = String(bookingId || '')
    .trim()
    .toUpperCase();
  let booking = data.bookings.find(
    (b) =>
      b.attendeeId === attendeeId &&
      (b.bookingId.toUpperCase() === id ||
        (b.bookingReference && b.bookingReference.toUpperCase() === id)),
  );
  if (!booking) {
    booking = data.bookings.find(
      (b) => b.attendeeId === attendeeId && b.status === 'cancelled',
    );
  }
  if (!booking) {
    booking = {
      bookingId: nextBookingId(data),
      attendeeId,
      appointmentType: 'Health Summit Session',
      status: 'confirmed',
    };
    data.bookings.push(booking);
  }

  const resolved = resolveSummitDateTime(selectedDate, selectedTime, attendeeId, 'confirm');
  if (resolved.error === 'missing_time') return null;
  if (resolved.error) return null;
  const scheduledStart = resolved.scheduledStart;

  booking.scheduledStart = scheduledStart;
  booking.status = 'confirmed';
  booking.rescheduledAt = new Date().toISOString();
  if (!booking.bookingReference) booking.bookingReference = booking.bookingId;

  return booking;
}

module.exports = {
  SUMMIT_CUTOFF_LABEL,
  SUMMIT_EARLIEST_DATE,
  SUMMIT_LATEST_DATE,
  loadStore,
  saveStore,
  normalizeDob,
  parseCalendarDateToIso,
  formatDateDisplayAU,
  formatDateTimeDisplayAU,
  normalizeDateTimeInputToIso,
  findBookingByReference,
  resolveAttendeeOpen,
  resolveAttendeeForBookingOpen,
  bookingsForAttendee,
  nextConfirmedBooking,
  bookingView,
  generateNextAvailableAppointment,
  cancelBooking,
  proposeRescheduleSlots,
  confirmReschedule,
  isWithinSummitWindow,
  pickRandomSlot,
};
