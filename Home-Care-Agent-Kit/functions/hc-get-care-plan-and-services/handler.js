'use strict';

const {
  loadBookings,
  planForClient,
  bookingsForClient,
  bookingsInWeek,
  mondayOfWeekContaining,
  normalizeCalendarInputToIsoDate,
  formatDateDisplayAU,
  formatDateTimeDisplayAU,
} = require('./lib/bookingsStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function defaultWeekStart(input) {
  if (input.weekStart) {
    const raw = String(input.weekStart).trim();
    const iso =
      normalizeCalendarInputToIsoDate(raw) ||
      (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(0, 10) : null);
    if (iso) return mondayOfWeekContaining(iso);
  }
  const refRaw = input.referenceDate && String(input.referenceDate).trim();
  if (refRaw) {
    const iso =
      normalizeCalendarInputToIsoDate(refRaw) ||
      (/^\d{4}-\d{2}-\d{2}$/.test(refRaw) ? refRaw.slice(0, 10) : null);
    if (iso) return mondayOfWeekContaining(iso);
  }
  return mondayOfWeekContaining(new Date().toISOString().slice(0, 10));
}

async function run(input) {
  const clientId = input.clientId && String(input.clientId).trim();
  if (!clientId) return fail('clientId is required (returned from idv_booking).');

  const { data } = loadBookings(input.storePath);
  const client = data.clients.find((c) => c.clientId === clientId);
  if (!client) return fail('Unknown clientId', 'CLIENT_NOT_FOUND');

  const plan = planForClient(data, client);
  const weekStart = defaultWeekStart(input);
  const active = bookingsForClient(data, clientId).filter(
    (b) => b.status === 'confirmed',
  );
  const weekBookings = bookingsInWeek(data, clientId, weekStart).filter(
    (b) => b.status === 'confirmed',
  );

  const servicesBooked = weekBookings.map((b) => b.serviceName);
  const servicesNotBookedThisWeek = (plan ? plan.services : []).filter(
    (s) => !servicesBooked.includes(s),
  );

  return ok({
    clientId,
    displayName: client.fullName,
    dob: formatDateDisplayAU(client.dob),
    dobIso: client.dob,
    planId: client.planId,
    planName: plan ? plan.planName : null,
    planServices: plan ? plan.services : [],
    weekStart,
    weekStartDisplay: formatDateDisplayAU(weekStart),
    servicesBookedThisWeek: servicesBooked,
    servicesNotBookedThisWeek,
    bookingsThisWeek: weekBookings.map((b) => ({
      bookingId: b.bookingId,
      bookingGroupId: b.bookingGroupId,
      serviceName: b.serviceName,
      scheduledStart: b.scheduledStart,
      scheduledStartDisplay: formatDateTimeDisplayAU(b.scheduledStart),
    })),
    allActiveBookings: active.map((b) => ({
      bookingId: b.bookingId,
      serviceName: b.serviceName,
      scheduledStart: b.scheduledStart,
      scheduledStartDisplay: formatDateTimeDisplayAU(b.scheduledStart),
      weekStart: b.weekStart,
      weekStartDisplay: formatDateDisplayAU(b.weekStart),
    })),
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
