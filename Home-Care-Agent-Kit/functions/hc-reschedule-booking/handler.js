'use strict';

const {
  loadBookings,
  saveBookings,
  mondayOfWeekContaining,
  normalizeDateTimeInputToIso,
  formatDateDisplayAU,
  formatDateTimeDisplayAU,
} = require('./lib/bookingsStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

async function run(input) {
  const clientId = input.clientId && String(input.clientId).trim();
  const bookingId = String(
    input.bookingId || input.bookingReference || '',
  )
    .trim()
    .toUpperCase();
  const newScheduledStartRaw = String(input.newScheduledStart || '').trim();
  const newScheduledStartIso = normalizeDateTimeInputToIso(newScheduledStartRaw);

  if (!clientId) return fail('clientId is required (from idv_booking).');
  if (!bookingId) return fail('bookingId is required.');
  if (!newScheduledStartRaw) {
    return fail(
      'newScheduledStart is required (dd/mm/yyyy HH:mm or ISO-8601, e.g. 28/04/2026 14:00 or 2026-04-28T14:00:00).',
    );
  }
  if (!newScheduledStartIso) {
    return fail(
      'Could not parse newScheduledStart. Use dd/mm/yyyy with time, e.g. 28/04/2026 14:00',
    );
  }

  const { data } = loadBookings(input.storePath);
  const booking = data.bookings.find(
    (b) => b.bookingId.toUpperCase() === bookingId && b.clientId === clientId,
  );
  if (!booking) return fail('Booking not found for this client.', 'NOT_FOUND');
  if (booking.status === 'cancelled') {
    return fail('Cancelled bookings cannot be rescheduled.', 'INVALID_STATUS');
  }

  const skipConflict = Boolean(input.skipConflictCheck);
  if (!skipConflict) {
    const clash = data.bookings.some(
      (b) =>
        b.clientId === clientId &&
        b.bookingId !== booking.bookingId &&
        b.status === 'confirmed' &&
        b.serviceName === booking.serviceName &&
        b.scheduledStart === newScheduledStartIso,
    );
    if (clash) {
      return fail(
        'That slot is already taken for this service. Call next_available_bookings first.',
        'SLOT_CONFLICT',
      );
    }
  }

  const previousStart = booking.scheduledStart;
  booking.scheduledStart = newScheduledStartIso;
  booking.weekStart = mondayOfWeekContaining(newScheduledStartIso.slice(0, 10));

  saveBookings(input.storePath, data);

  return ok({
    clientId,
    bookingId: booking.bookingId,
    serviceName: booking.serviceName,
    previousStart,
    previousStartDisplay: formatDateTimeDisplayAU(previousStart),
    scheduledStart: booking.scheduledStart,
    scheduledStartDisplay: formatDateTimeDisplayAU(booking.scheduledStart),
    weekStart: booking.weekStart,
    weekStartDisplay: formatDateDisplayAU(booking.weekStart),
    message: 'Booking updated. Confirm verbally with the customer.',
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
