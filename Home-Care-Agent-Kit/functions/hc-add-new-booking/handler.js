'use strict';

const {
  loadBookings,
  saveBookings,
  normalizePhone,
  normalizeDob,
  parseCalendarDateToIso,
  formatDateTimeDisplayAU,
  formatDateDisplayAU,
  PLAN_ILMP,
  buildPlanServiceRows,
} = require('./lib/bookingsStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickFirstString(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function deriveFullName(input) {
  let n = pickFirstString(input, [
    'fullName',
    'name',
    'customerName',
    'full_name',
    'FullName',
    'Name',
    'CustomerName',
    'callerName',
    'CallerName',
    'fullname',
  ]);
  if (!n) {
    const g = pickFirstString(input, ['givenName', 'GivenName', 'firstName', 'FirstName']);
    const f = pickFirstString(input, ['familyName', 'FamilyName', 'lastName', 'LastName']);
    if (g && f) n = `${g} ${f}`;
    else if (g) n = g;
  }
  return n;
}

function combineDateTime(appointmentDate, appointmentTime, scheduledStart) {
  if (scheduledStart) return String(scheduledStart).trim();
  if (appointmentDate && appointmentTime) {
    const dateIso = parseCalendarDateToIso(String(appointmentDate).trim());
    if (!dateIso) return '';
    const t = String(appointmentTime).trim();
    const tt = t.length === 5 ? `${t}:00` : t;
    return `${dateIso}T${tt}`;
  }
  return '';
}

async function run(input) {
  const fullName = deriveFullName(input);
  const dobRaw = pickFirstString(input, [
    'dob',
    'dateOfBirth',
    'date_of_birth',
    'Dob',
    'DateOfBirth',
  ]);
  const dob = dobRaw ? normalizeDob(dobRaw) : '';
  const phoneRaw = pickFirstString(input, [
    'phone',
    'phoneNumber',
    'mobile',
    'Phone',
    'PhoneNumber',
  ]);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : '';
  const appointmentDate = pickFirstString(input, [
    'appointmentDate',
    'appointmentdate',
    'AppointmentDate',
  ]);
  const appointmentTime = pickFirstString(input, [
    'appointmentTime',
    'appointmenttime',
    'AppointmentTime',
  ]);
  const anchorRaw = pickFirstString(input, [
    'scheduledStart',
    'startschedule',
    'startSchedule',
    'StartSchedule',
  ]);
  const scheduledStart = combineDateTime(
    appointmentDate,
    appointmentTime,
    anchorRaw,
  );

  if (!fullName) return fail('fullName is required');
  if (!dob) return fail('dob is required (dd/mm/yyyy or yyyy-mm-dd)');
  if (!phone) return fail('phone is required');
  if (!scheduledStart) {
    return fail(
      'scheduledStart is required (dd/mm/yyyy time or ISO), or appointmentDate (dd/mm/yyyy) + appointmentTime',
    );
  }

  const { data } = loadBookings(input.storePath);
  const plan = PLAN_ILMP;
  const rows = buildPlanServiceRows(scheduledStart, plan.services);
  if (!rows || !rows.length) {
    return fail(
      'Could not parse date and time. Examples: 29/04/2026T11:00:00 or 29/04/2026 11:00, or 2026-04-29T11:00:00',
    );
  }

  let client = data.clients.find(
    (c) => normalizePhone(c.phone) === phone && normalizeDob(c.dob) === dob,
  );
  if (!client) {
    data.meta.lastClientSeq += 1;
    client = {
      clientId: `CLI-${data.meta.lastClientSeq}`,
      fullName,
      dob,
      phone,
      planId: plan.planId,
    };
    data.clients.push(client);
  } else {
    client.fullName = fullName;
    client.planId = plan.planId;
  }

  data.meta.lastGroupSeq += 1;
  const bookingGroupId = `GRP-${data.meta.lastGroupSeq}`;

  const created = [];
  for (const row of rows) {
    data.meta.lastBookingSeq += 1;
    const bookingId = `BK${data.meta.lastBookingSeq}`;
    const booking = {
      bookingId,
      bookingGroupId,
      clientId: client.clientId,
      serviceName: row.serviceName,
      planId: plan.planId,
      scheduledStart: row.scheduledStart,
      status: 'confirmed',
      weekStart: row.weekStart,
    };
    data.bookings.push(booking);
    created.push(booking);
  }

  saveBookings(input.storePath, data);

  const bookingId = created[0].bookingId;
  const firstStart = created[0].scheduledStart;
  const dateIso = firstStart.slice(0, 10);
  const timeHm =
    firstStart.length >= 16 ? firstStart.slice(11, 16) : firstStart.slice(11);

  const result = ok({
    clientId: client.clientId,
    bookingGroupId,
    bookingId,
    primaryBookingReference: bookingId,
    bookingIds: created.map((b) => b.bookingId),
    fullName,
    dob: formatDateDisplayAU(dob) || dob,
    dobIso: dob,
    phone,
    startschedule: firstStart,
    appointmentDate: dateIso,
    appointmentTime: timeHm,
    planName: plan.planName,
    servicesBooked: created.map((b) => ({
      bookingId: b.bookingId,
      serviceName: b.serviceName,
      scheduledStart: b.scheduledStart,
      scheduledStartDisplay: formatDateTimeDisplayAU(b.scheduledStart),
    })),
    message:
      'Created weekly service bookings on the Independent Living Maintenance Plan.',
  });
  notifyDashboardIfConfigured(result);
  return result;
}

function notifyDashboardIfConfigured(result) {
  if (!result || !result.success) return;
  const url =
    process.env.ROSTER_NOTIFY_URL && String(process.env.ROSTER_NOTIFY_URL).trim();
  if (!url) return;
  const headers = { 'Content-Type': 'application/json' };
  const sec = process.env.ROSTER_NOTIFY_SECRET;
  if (sec) headers['X-Notify-Secret'] = String(sec);
  queueMicrotask(() => {
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(result),
    }).catch(() => {});
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
