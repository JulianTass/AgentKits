'use strict';

const {
  loadTours,
  getTourDateTimeSlots,
  checkOpenTimesForVillage,
  findVillage,
  resolveBookingVillage,
  formatDateTimeDisplayAU,
} = require('./lib/tourStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function mapSlotError(r, contextVillageName) {
  const vn = contextVillageName || undefined;
  if (r.error === 'ARRAY_LENGTH') {
    return fail(r.message, 'MISMATCH_TOUR_ARRAYS', { villageName: vn });
  }
  if (r.error === 'EMPTY_SLOT') {
    return fail(r.message, 'EMPTY_TOUR_SLOT', { villageName: vn, index: r.index });
  }
  if (r.error === 'INVALID_DATETIME' && r.index != null) {
    return fail('Could not parse a tour date and time in the list.', 'INVALID_DATETIME', {
      villageName: vn,
      index: r.index,
      tourDate: r.tourDate,
      tourTime: r.tourTime,
    });
  }
  if (r.error === 'INVALID_DATETIME') {
    return fail('Could not parse tourDate and tourTime.', 'INVALID_DATETIME', {
      villageName: vn,
      tourDate: r.tourDate,
      tourTime: r.tourTime,
    });
  }
  if (r.error === 'MISSING' && r.missing === 'tourTime') {
    return fail(
      'tourTime is required. Re-call with the same tourDate and a tourTime (or use tourDates/tourTimes arrays).',
      'MISSING_TOUR_TIME',
      { villageName: vn, tourDate: r.tourDate },
    );
  }
  if (r.error === 'MISSING' && r.missing === 'tourDate') {
    return fail(
      'tourDate is required. Re-call with tourDate and the same tourTime (or use tourDates/tourTimes arrays).',
      'MISSING_TOUR_DATE',
      { villageName: vn, tourTime: r.tourTime },
    );
  }
  if (r.error === 'MISSING' && r.missing === 'both') {
    return fail(
      'tourDate and tourTime are required (or tourDates and tourTimes arrays of the same length).',
      'MISSING_TOUR_DATETIME',
      { villageName: vn },
    );
  }
  return fail(r.message || 'Invalid tour date/time input.', 'INVALID_TOUR_INPUT', { villageName: vn });
}

async function run(input) {
  const villageNameRaw = pickStr(input, ['villageName', 'VillageName', 'village', 'Village']);

  const r = getTourDateTimeSlots(input);
  if (r.error) {
    return mapSlotError(r, villageNameRaw);
  }

  const { mode, slots } = r;
  const preferredIsos = slots.map((s) => s.iso);
  const { data } = loadTours(input.storePath);

  let village;
  if (villageNameRaw) {
    village = findVillage(data, villageNameRaw);
    if (!village) {
      return fail('Village not found.', 'VILLAGE_NOT_FOUND');
    }
  } else {
    village = resolveBookingVillage(data, '');
    if (!village) {
      return fail('No village is configured in the store.', 'VILLAGE_NOT_FOUND');
    }
  }

  const { village: vRes, available, conflicts } = checkOpenTimesForVillage(
    data,
    village,
    preferredIsos,
  );
  if (!vRes) {
    return fail('Village not found.', 'VILLAGE_NOT_FOUND');
  }
  if (conflicts.length > 0) {
    return fail(
      'One or more requested times are already booked for that village.',
      'SLOT_TAKEN',
      {
        conflictingTours: conflicts.map((scheduledStart) => ({
          scheduledStart,
          scheduledStartDisplay: formatDateTimeDisplayAU(scheduledStart),
        })),
        freeTours: available.map((scheduledStart) => ({
          scheduledStart,
          scheduledStartDisplay: formatDateTimeDisplayAU(scheduledStart),
        })),
        villageName: vRes.villageName,
      },
    );
  }

  const availableTours = available.map((scheduledStart) => ({
    scheduledStart,
    scheduledStartDisplay: formatDateTimeDisplayAU(scheduledStart),
  }));

  if (mode === 'list') {
    return ok({
      villageName: vRes.villageName,
      tourDates: slots.map((s) => s.tourDate),
      tourTimes: slots.map((s) => s.tourTime),
      slotCount: slots.length,
      availableCount: availableTours.length,
      availableTours,
      requiresConfirmation: true,
      confirmationPrompt:
        'Please confirm the tour time(s) before we place the booking(s).',
      message:
        'The requested time(s) are open for that village. Confirm with the caller before booking.',
    });
  }

  const s0 = slots[0];
  return ok({
    villageName: vRes.villageName,
    tourDate: s0.tourDate,
    tourTime: s0.tourTime,
    availableCount: availableTours.length,
    availableTours,
    requiresConfirmation: true,
    confirmationPrompt: 'Please confirm this tour time before we place the booking.',
    message: 'The requested time is open for that village. Confirm with the caller before booking.',
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
