'use strict';

const {
  loadStore,
  saveStore,
  resolveAttendeeOpen,
  bookingsForAttendee,
  bookingView,
  formatDateDisplayAU,
  SUMMIT_EARLIEST_DATE,
} = require('./lib/summitStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

async function run(input) {
  const dobRaw = pickStr(input, [
    'dob',
    'Dob',
    'DOB',
    'dateOfBirth',
    'DateOfBirth',
    'birthDate',
    'BirthDate',
  ]);
  const bookingReference = pickStr(input, [
    'bookingReference',
    'BookingReference',
    'bookingId',
    'BookingId',
    'bookingRef',
    'BookingRef',
    'reference',
    'Reference',
  ]);
  const fullName = pickStr(input, [
    'fullName',
    'FullName',
    'name',
    'Name',
    'attendeeName',
    'AttendeeName',
  ]);

  if (!dobRaw && !bookingReference && !fullName) {
    return fail(
      'Provide date of birth (any value accepted in demo), and/or booking reference. Booking reference may be empty — DOB alone finds or creates the account.',
      'MISSING_IDV_FIELDS',
    );
  }

  const { data } = loadStore(input.storePath);
  const resolved = resolveAttendeeOpen(data, {
    dob: dobRaw,
    bookingReference,
    fullName,
  });

  if (!resolved || !resolved.attendee) {
    const hint = bookingReference
      ? 'Booking reference was not found in the demo data.'
      : 'Could not resolve attendee from the details provided.';
    return fail(hint, 'IDV_FAILED');
  }

  saveStore(input.storePath, data);

  const { attendee, matchedBy, created } = resolved;
  const active = bookingsForAttendee(data, attendee.attendeeId).map(bookingView);

  return ok({
    idvStatus: 'VERIFIED',
    demoMode: true,
    demoOpenIdv: true,
    attendeeId: attendee.attendeeId,
    fullName: attendee.fullName,
    dob: formatDateDisplayAU(attendee.dob),
    dobIso: attendee.dob,
    matchedBy,
    attendeeCreated: Boolean(created),
    bookingReferenceProvided: Boolean(bookingReference),
    activeBookings: active,
    summitEarliestDate: SUMMIT_EARLIEST_DATE,
    summitEarliestDateDisplay: formatDateDisplayAU(SUMMIT_EARLIEST_DATE),
    message:
      'Identity verified (demo open mode). Any DOB is accepted; booking reference is optional and may be omitted. Appointments are only offered after 9 June 2026. Use attendeeId for next available, cancel, or reschedule tools.',
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
