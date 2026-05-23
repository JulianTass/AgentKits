'use strict';

const {
  loadBookings,
  findClient,
  planForClient,
  bookingsForClient,
  bookingsInWeek,
  mondayOfWeekContaining,
  normalizeCalendarInputToIsoDate,
  formatDateDisplayAU,
  formatDateTimeDisplayAU,
} = require('./lib/bookingsStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function maskPhone(digits) {
  const d = String(digits || '');
  if (d.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

function defaultWeekStart(input) {
  const weekRaw = pickStr(input, [
    'weekStart',
    'WeekStart',
    'rosterWeekStart',
    'RosterWeekStart',
  ]);
  if (weekRaw) {
    const iso =
      normalizeCalendarInputToIsoDate(weekRaw) ||
      (/^\d{4}-\d{2}-\d{2}$/.test(weekRaw) ? weekRaw.slice(0, 10) : null);
    if (iso) return mondayOfWeekContaining(iso);
  }
  const refRaw = pickStr(input, [
    'referenceDate',
    'ReferenceDate',
    'asAtDate',
    'AsAtDate',
    'weekReferenceDate',
    'WeekReferenceDate',
  ]);
  if (refRaw) {
    const iso =
      normalizeCalendarInputToIsoDate(refRaw) ||
      (/^\d{4}-\d{2}-\d{2}$/.test(refRaw) ? refRaw.slice(0, 10) : null);
    if (iso) return mondayOfWeekContaining(iso);
  }
  return mondayOfWeekContaining(new Date().toISOString().slice(0, 10));
}

async function run(input) {
  const phoneRaw = pickStr(input, [
    'phone',
    'Phone',
    'mobile',
    'Mobile',
    'phoneNumber',
    'PhoneNumber',
    'callerPhone',
    'CallerPhone',
    'ani',
    'ANI',
  ]);
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
    'bookingNumber',
    'BookingNumber',
    'reference',
    'Reference',
    'groupId',
    'GroupId',
    'bookingGroupId',
    'BookingGroupId',
  ]);

  if (!phoneRaw && !dobRaw && !bookingReference) {
    return fail(
      'Provide at least one of: booking reference (BK… or GRP…), phone number, or date of birth (dd/mm/yyyy). Any one identifier is enough when it uniquely matches a customer.',
    );
  }

  const { data } = loadBookings(input.storePath);
  const client = findClient(data, {
    phone: phoneRaw,
    dob: dobRaw,
    bookingReference,
  });

  if (!client) {
    return fail(
      'No unique customer match was found. Use a booking reference, or a phone number or date of birth (dd/mm/yyyy) that identifies exactly one customer. If both phone and DOB are supplied, they must match the same record.',
      'IDV_NO_MATCH',
    );
  }

  const plan = planForClient(data, client);
  const weekStart = defaultWeekStart(input);
  const active = bookingsForClient(data, client.clientId).filter(
    (b) => b.status === 'confirmed',
  );
  const weekBookings = bookingsInWeek(data, client.clientId, weekStart).filter(
    (b) => b.status === 'confirmed',
  );

  return ok({
    idvStatus: 'VERIFIED',
    clientId: client.clientId,
    displayName: client.fullName,
    dob: formatDateDisplayAU(client.dob),
    dobIso: client.dob,
    maskedPhone: maskPhone(client.phone),
    planName: plan ? plan.planName : null,
    planServices: plan ? plan.services : [],
    bookingsThisWeek: weekBookings.map((b) => ({
      bookingId: b.bookingId,
      bookingGroupId: b.bookingGroupId,
      serviceName: b.serviceName,
      scheduledStart: b.scheduledStart,
      scheduledStartDisplay: formatDateTimeDisplayAU(b.scheduledStart),
      status: b.status,
    })),
    allActiveBookings: active.map((b) => ({
      bookingId: b.bookingId,
      bookingGroupId: b.bookingGroupId,
      serviceName: b.serviceName,
      scheduledStart: b.scheduledStart,
      scheduledStartDisplay: formatDateTimeDisplayAU(b.scheduledStart),
      weekStart: b.weekStart,
      weekStartDisplay: formatDateDisplayAU(b.weekStart),
      status: b.status,
    })),
    weekStart,
    weekStartDisplay: formatDateDisplayAU(weekStart),
    message:
      'Identity verified. Use clientId with get_care_plan_and_services for plan detail and next_available_bookings for openings.',
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
