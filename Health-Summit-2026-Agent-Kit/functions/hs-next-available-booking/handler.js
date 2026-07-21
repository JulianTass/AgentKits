'use strict';

const {
  loadStore,
  saveStore,
  generateNextAvailableAppointment,
  bookingView,
  formatDateDisplayAU,
  resolveAttendeeForBookingOpen,
  SUMMIT_EARLIEST_DATE,
  SUMMIT_CUTOFF_LABEL,
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
  const attendeeIdRaw = pickStr(input, [
    'attendeeId',
    'AttendeeId',
    'clientId',
    'ClientId',
    'customerId',
    'CustomerId',
  ]);
  const dobRaw = pickStr(input, [
    'dob',
    'Dob',
    'DOB',
    'dateOfBirth',
    'DateOfBirth',
  ]);
  const fullName = pickStr(input, ['fullName', 'FullName', 'name', 'Name']);

  if (!attendeeIdRaw && !dobRaw) {
    return fail('attendeeId is required (from hs_idv_attendee).', 'MISSING_ATTENDEE');
  }

  const { data } = loadStore(input.storePath);
  const attendee = resolveAttendeeForBookingOpen(data, {
    attendeeId: attendeeIdRaw,
    dob: dobRaw,
    fullName,
  });
  if (!attendee) {
    return fail('Unknown attendeeId. Run hs_idv_attendee first.', 'ATTENDEE_NOT_FOUND');
  }

  const attendeeId = attendee.attendeeId;

  const { booking, source } = generateNextAvailableAppointment(data, attendeeId);
  saveStore(input.storePath, data);

  const view = bookingView(booking);
  return ok({
    demoMode: true,
    attendeeId,
    fullName: attendee.fullName,
    appointmentSource: source,
    bookingReference: view.bookingReference,
    bookingId: view.bookingId,
    appointmentType: view.appointmentType,
    scheduledStart: view.scheduledStart,
    scheduledStartDisplay: view.scheduledStartDisplay,
    appointmentDate: view.scheduledStart.slice(0, 10),
    appointmentDateDisplay: formatDateDisplayAU(view.scheduledStart.slice(0, 10)),
    appointmentTime: view.scheduledStart.split('T')[1]?.slice(0, 5) || '',
    onlyDatesAfterJune9: true,
    datesAfterCutoff: SUMMIT_CUTOFF_LABEL,
    summitEarliestDate: SUMMIT_EARLIEST_DATE,
    summitEarliestDateDisplay: formatDateDisplayAU(SUMMIT_EARLIEST_DATE),
    message:
      source === 'existing'
        ? `Next appointment (after ${SUMMIT_CUTOFF_LABEL} only): ${view.scheduledStartDisplay}. Booking reference ${view.bookingReference}.`
        : `Next available appointment after ${SUMMIT_CUTOFF_LABEL}: ${view.scheduledStartDisplay}. Booking reference ${view.bookingReference}.`,
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
