'use strict';

const { loadStore, saveStore, cancelBooking, resolveAttendeeForBookingOpen } = require('./lib/summitStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

async function run(input) {
  const attendeeIdRaw = pickStr(input, [
    'attendeeId',
    'AttendeeId',
    'clientId',
    'ClientId',
  ]);
  const dobRaw = pickStr(input, ['dob', 'Dob', 'DOB', 'dateOfBirth', 'DateOfBirth']);
  const fullName = pickStr(input, ['fullName', 'FullName', 'name', 'Name']);

  if (!attendeeIdRaw && !dobRaw) {
    return fail('attendeeId is required (from hs_idv_attendee).', 'MISSING_ATTENDEE');
  }

  const bookingReference = pickStr(input, [
    'bookingReference',
    'BookingReference',
    'bookingId',
    'BookingId',
    'reference',
    'Reference',
  ]);

  const { data } = loadStore(input.storePath);
  const attendee = resolveAttendeeForBookingOpen(data, {
    attendeeId: attendeeIdRaw,
    dob: dobRaw,
    fullName,
    bookingReference,
  });
  if (!attendee) {
    return fail('Unknown attendeeId.', 'ATTENDEE_NOT_FOUND');
  }

  const attendeeId = attendee.attendeeId;

  const cancelled = cancelBooking(data, attendeeId, bookingReference);
  if (!cancelled || !cancelled.length) {
    return fail(
      'No active booking found to cancel. Use hs_next_available_booking to check current appointments.',
      'NOTHING_TO_CANCEL',
    );
  }

  saveStore(input.storePath, data);

  const primary = cancelled[0];
  return ok({
    demoMode: true,
    attendeeId,
    cancelledCount: cancelled.length,
    cancellationReferenceId: primary.cancellationReferenceId,
    bookingReference: primary.bookingReference,
    bookingId: primary.bookingId,
    cancelled,
    message: `Booking ${primary.bookingReference} cancelled. Cancellation reference ${primary.cancellationReferenceId}. Keep this reference for your records.`,
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
