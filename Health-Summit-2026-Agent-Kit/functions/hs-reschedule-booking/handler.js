'use strict';

const {
  loadStore,
  saveStore,
  confirmReschedule,
  bookingView,
  formatDateDisplayAU,
  formatDateTimeDisplayAU,
  resolveAttendeeForBookingOpen,
  normalizeDateTimeInputToIso,
  SUMMIT_EARLIEST_DATE,
  SUMMIT_LATEST_DATE,
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

function emptyAppointment() {
  return {
    appointmentDate: '',
    appointmentTime: '',
    scheduledStartDisplay: '',
    bookingReference: '',
  };
}

function appointmentFromStart(scheduledStart) {
  const s = String(scheduledStart || '');
  const datePart = s.slice(0, 10);
  return {
    appointmentDate: formatDateDisplayAU(datePart) || '',
    appointmentTime: s.split('T')[1]?.slice(0, 5) || '',
    scheduledStartDisplay: formatDateTimeDisplayAU(s) || '',
  };
}

function rescheduleFail(message, code, attendeeId, extra = {}) {
  return fail(message, code, {
    attendeeId: attendeeId || '',
    rescheduleStatus: '',
    ...emptyAppointment(),
    ...extra,
  });
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

  const date = pickStr(input, [
    'date',
    'Date',
    'proposedDate',
    'ProposedDate',
    'proposedDate1',
    'ProposedDate1',
    'selectedDate',
    'SelectedDate',
    'appointmentDate',
    'AppointmentDate',
  ]);
  const time = pickStr(input, [
    'time',
    'Time',
    'proposedTime',
    'ProposedTime',
    'proposedTime1',
    'ProposedTime1',
    'selectedTime',
    'SelectedTime',
    'appointmentTime',
    'AppointmentTime',
  ]);
  const dateTime = pickStr(input, [
    'dateTime',
    'DateTime',
    'appointmentDateTime',
    'AppointmentDateTime',
    'selectedDateTime',
    'SelectedDateTime',
  ]);

  let dateVal = date;
  let timeVal = time;
  if (!dateVal && dateTime) {
    if (normalizeDateTimeInputToIso(dateTime)) {
      dateVal = dateTime;
      timeVal = '';
    }
  }

  const bookingReference = pickStr(input, [
    'bookingReference',
    'BookingReference',
    'bookingId',
    'BookingId',
  ]);

  if (!attendeeIdRaw && !dobRaw) {
    return rescheduleFail(
      'attendeeId is required (from hs_idv_attendee).',
      'MISSING_ATTENDEE',
      '',
    );
  }

  const { data } = loadStore(input.storePath);
  const attendee = resolveAttendeeForBookingOpen(data, {
    attendeeId: attendeeIdRaw,
    dob: dobRaw,
    fullName,
    bookingReference,
  });
  if (!attendee) {
    return rescheduleFail('Unknown attendeeId.', 'ATTENDEE_NOT_FOUND', attendeeIdRaw);
  }

  const attendeeId = attendee.attendeeId;

  if (!dateVal) {
    return rescheduleFail(
      'Provide date and time (dd/mm/yyyy and HH:mm). Example: date 16/06/2026, time 10:30.',
      'MISSING_DATE',
      attendeeId,
    );
  }

  if (!timeVal && !normalizeDateTimeInputToIso(dateVal)) {
    return rescheduleFail(
      'Provide time (HH:mm) with date. Example: time 10:30.',
      'MISSING_TIME',
      attendeeId,
    );
  }

  const booking = confirmReschedule(
    data,
    attendeeId,
    bookingReference,
    dateVal,
    timeVal,
  );
  if (!booking) {
    return rescheduleFail(
      `Only dates after ${SUMMIT_CUTOFF_LABEL} are available (${formatDateDisplayAU(SUMMIT_EARLIEST_DATE)} – ${formatDateDisplayAU(SUMMIT_LATEST_DATE)}).`,
      'INVALID_DATE',
      attendeeId,
    );
  }

  saveStore(input.storePath, data);
  const view = bookingView(booking);
  const appt = appointmentFromStart(view.scheduledStart);

  return ok({
    demoMode: true,
    rescheduleStatus: 'confirmed',
    attendeeId,
    bookingReference: view.bookingReference,
    bookingId: view.bookingId,
    ...appt,
    message: `Appointment rescheduled to ${view.scheduledStartDisplay}. Booking reference ${view.bookingReference}.`,
  });
}

module.exports.run = run;

module.exports.handler = async function (event) {
  try {
    const input = extractInput(event);
    return await run(input);
  } catch (err) {
    const message = err && err.message ? err.message : 'Unhandled error';
    return rescheduleFail(message, 'ERROR', '');
  }
};
