'use strict';

const {
  loadBookings,
  planForClient,
  suggestSlots,
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

function takenKey(serviceName, scheduledStart) {
  return `${serviceName}::${scheduledStart}`;
}

async function run(input) {
  const clientId = pickStr(input, [
    'clientId',
    'ClientId',
    'ClientID',
    'customerId',
    'CustomerId',
  ]);
  if (!clientId) return fail('clientId is required (from idv_booking).');

  const fromRaw = pickStr(input, [
    'fromDate',
    'FromDate',
    'fromdate',
    'searchFrom',
    'SearchFrom',
  ]);
  const fromDate =
    normalizeCalendarInputToIsoDate(fromRaw) ||
    (fromRaw && /^\d{4}-\d{2}-\d{2}/.test(fromRaw) ? fromRaw.slice(0, 10) : '') ||
    new Date().toISOString().slice(0, 10);
  const limitRaw =
    input.perServiceLimit != null && input.perServiceLimit !== ''
      ? input.perServiceLimit
      : input.PerServiceLimit;
  const perServiceLimit = Math.min(
    12,
    Math.max(1, Number(limitRaw != null && limitRaw !== '' ? limitRaw : 5)),
  );

  const { data } = loadBookings(input.storePath);
  const client = data.clients.find((c) => c.clientId === clientId);
  if (!client) return fail('Unknown clientId', 'CLIENT_NOT_FOUND');

  const plan = planForClient(data, client);
  if (!plan) return fail('Plan not found for client', 'PLAN_NOT_FOUND');

  const taken = new Set(
    data.bookings
      .filter(
        (b) =>
          b.clientId === clientId &&
          b.status === 'confirmed',
      )
      .map((b) => takenKey(b.serviceName, b.scheduledStart)),
  );

  const namesArr = input.serviceNames ?? input.ServiceNames;
  const singleName = input.serviceName ?? input.ServiceName;
  const serviceFilter = Array.isArray(namesArr)
    ? namesArr.map((s) => String(s))
    : singleName
      ? [String(singleName)]
      : null;

  const targetServices = serviceFilter
    ? plan.services.filter((s) => serviceFilter.includes(s))
    : plan.services;

  if (!targetServices.length) {
    return fail('No services matched the optional filter', 'NO_SERVICES');
  }

  const availability = {};
  for (const serviceName of targetServices) {
    const slots = suggestSlots(fromDate, serviceName, perServiceLimit * 3)
      .filter((s) => !taken.has(takenKey(s.serviceName, s.scheduledStart)))
      .slice(0, perServiceLimit)
      .map((s) => ({
        ...s,
        scheduledStartDisplay: formatDateTimeDisplayAU(s.scheduledStart),
        weekStartDisplay: formatDateDisplayAU(s.weekStart),
      }));
    availability[serviceName] = slots;
  }

  return ok({
    clientId,
    planName: plan.planName,
    fromDate,
    fromDateDisplay: formatDateDisplayAU(fromDate),
    availability,
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
