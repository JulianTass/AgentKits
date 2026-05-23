'use strict';

const {
  loadBookings,
  saveBookings,
  normalizeCalendarInputToIsoDate,
  formatDateTimeDisplayAU,
} = require('./lib/bookingsStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

async function run(input) {
  const clientId = input.clientId && String(input.clientId).trim();
  if (!clientId) return fail('clientId is required (from idv_booking).');

  const bookingIds = Array.isArray(input.bookingIds)
    ? input.bookingIds.map((x) => String(x).trim().toUpperCase())
    : input.bookingId
      ? [String(input.bookingId).trim().toUpperCase()]
      : [];

  const serviceNames = Array.isArray(input.serviceNames)
    ? input.serviceNames.map((s) => String(s))
    : input.serviceName
      ? [String(input.serviceName)]
      : [];

  const weekRaw = input.weekStart != null ? String(input.weekStart).trim() : '';
  const weekStart =
    (weekRaw &&
      (normalizeCalendarInputToIsoDate(weekRaw) ||
        (/^\d{4}-\d{2}-\d{2}$/.test(weekRaw) ? weekRaw.slice(0, 10) : ''))) ||
    '';

  if (!bookingIds.length && !(serviceNames.length && weekStart)) {
    return fail(
      'Provide bookingIds (one or many) or serviceNames together with weekStart (dd/mm/yyyy or yyyy-mm-dd Monday week).',
    );
  }

  const { data } = loadBookings(input.storePath);
  const cancelled = [];

  for (const b of data.bookings) {
    if (b.clientId !== clientId) continue;
    if (b.status === 'cancelled') continue;

    let match = false;
    if (bookingIds.length) {
      match = bookingIds.includes(b.bookingId.toUpperCase());
    }
    if (!match && serviceNames.length && weekStart) {
      match =
        b.weekStart === weekStart && serviceNames.includes(b.serviceName);
    }
    if (match) {
      b.status = 'cancelled';
      cancelled.push({
        bookingId: b.bookingId,
        serviceName: b.serviceName,
        scheduledStart: b.scheduledStart,
        scheduledStartDisplay: formatDateTimeDisplayAU(b.scheduledStart),
      });
    }
  }

  if (!cancelled.length) {
    return fail('No matching bookings were found to cancel.', 'NOTHING_TO_CANCEL');
  }

  saveBookings(input.storePath, data);

  return ok({
    clientId,
    cancelledCount: cancelled.length,
    cancelled,
  });
}

async function handler(event) {
  try {
    const input = extractInput(event);
    return await run(input);
  } catch (err) {
    const message = err && err.message ? err.message : 'Unhandled error';
    return fail(message);
  }
}

module.exports = { run, handler };
