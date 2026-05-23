'use strict';

const {
  loadTours,
  saveTours,
  getTourDateTimeSlots,
  parseCalendarDateToIso,
  findVillage,
  resolveBookingVillage,
  isSlotBookedForVillage,
  nextBookingReference,
  normalizeAuPhone,
  formatDateDisplayAU,
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

/**
 * Book is deployed separately from availability: callers may send contact + village only.
 * When no tour date/time is provided, use LEVANDE_DEFAULT_TOUR_DATE + LEVANDE_DEFAULT_TOUR_TIME
 * if both env vars are set; otherwise next calendar day (Australia/Sydney) at 10:00.
 */
function applyImplicitBookSlot(input) {
  const envD = String(process.env.LEVANDE_DEFAULT_TOUR_DATE || '').trim();
  const envT = String(process.env.LEVANDE_DEFAULT_TOUR_TIME || '').trim();
  if (envD && envT) {
    return { ...input, tourDate: envD, tourTime: envT };
  }
  const tz = 'Australia/Sydney';
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date());
  const y = parseInt(parts.find((p) => p.type === 'year')?.value ?? '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'month')?.value ?? '0', 10);
  const d = parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10);
  const next = new Date(Date.UTC(y, m - 1, d));
  next.setUTCDate(next.getUTCDate() + 1);
  const tourDate = `${next.getUTCDate()}/${next.getUTCMonth() + 1}/${next.getUTCFullYear()}`;
  return { ...input, tourDate, tourTime: '10:00' };
}

/** Same wall-clock time, next calendar day (ISO date part is UTC-aligned civil date). */
function advanceSlotOneDay(slot) {
  const d = slot.iso.slice(0, 10);
  const t = slot.iso.slice(11, 16);
  const [y, m, da] = d.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, da + 1));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  const iso = `${yy}-${mm}-${dd}T${t}`;
  const tourDate = formatDateDisplayAU(`${yy}-${mm}-${dd}`) || `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${yy}`;
  return { iso, tourDate, tourTime: t };
}

function mapSlotError(r, villageName, fullName) {
  if (r.error === 'ARRAY_LENGTH') {
    return fail(r.message, 'MISMATCH_TOUR_ARRAYS', { villageName, fullName });
  }
  if (r.error === 'EMPTY_SLOT') {
    return fail(r.message, 'EMPTY_TOUR_SLOT', { villageName, fullName, index: r.index });
  }
  if (r.error === 'INVALID_DATETIME' && r.index != null) {
    return fail('Could not parse a tour date and time in the list.', 'INVALID_DATETIME', {
      villageName,
      fullName,
      index: r.index,
      tourDate: r.tourDate,
      tourTime: r.tourTime,
    });
  }
  if (r.error === 'INVALID_DATETIME') {
    return fail('Could not parse tourDate and tourTime.', 'INVALID_DATETIME', {
      villageName,
      fullName,
      tourDate: r.tourDate,
      tourTime: r.tourTime,
    });
  }
  if (r.error === 'MISSING' && r.missing === 'tourTime') {
    return fail(
      'tourTime is required. Re-call with the same tourDate and a tourTime (or use tourDates/tourTimes).',
      'MISSING_TOUR_TIME',
      { villageName, tourDate: r.tourDate, fullName },
    );
  }
  if (r.error === 'MISSING' && r.missing === 'tourDate') {
    return fail(
      'tourDate is required. Re-call with tourDate and the same tourTime (or use tourDates/tourTimes).',
      'MISSING_TOUR_DATE',
      { villageName, tourTime: r.tourTime, fullName },
    );
  }
  if (r.error === 'MISSING' && r.missing === 'both') {
    return fail(
      'tourDate and tourTime are required (or tourDates and tourTimes arrays of the same length).',
      'MISSING_TOUR_DATETIME',
      { villageName, fullName },
    );
  }
  return fail(r.message || 'Invalid tour date/time input.', 'INVALID_TOUR_INPUT', { villageName, fullName });
}

async function run(input) {
  const villageNameRaw = pickStr(input, ['villageName', 'VillageName', 'village', 'Village']);

  const fullName = pickStr(input, ['fullName', 'FullName', 'name', 'Name']);
  const dobRaw = pickStr(input, ['dob', 'DOB', 'Dob', 'dateOfBirth']);
  const phoneRaw = pickStr(input, [
    'phone',
    'Phone',
    'mobile',
    'Mobile',
    'phoneNumber',
    'PhoneNumber',
  ]);
  if (!fullName || !dobRaw || !phoneRaw) {
    return fail('fullName, dob and phone are required.', 'MISSING_CONTACT_DETAILS');
  }
  const phoneNorm = normalizeAuPhone(phoneRaw);
  if (!phoneNorm.ok) {
    return fail(
      'Use an Australian mobile in 04XXXXXXXX form or +61 4XXXXXXXX (e.g. 0406910251 or +61406910251).',
      'INVALID_PHONE',
      { phone: phoneRaw },
    );
  }
  const phoneLocal = phoneNorm.local;
  const phoneE164 = phoneNorm.e164;
  const dobIso = parseCalendarDateToIso(dobRaw) || dobRaw;

  let bookInput = input;
  let implicitTourSlot = false;
  let r = getTourDateTimeSlots(bookInput);
  if (r.error === 'MISSING' && r.missing === 'both') {
    bookInput = applyImplicitBookSlot(input);
    implicitTourSlot = true;
    r = getTourDateTimeSlots(bookInput);
  }
  if (r.error) {
    return mapSlotError(r, villageNameRaw, fullName);
  }

  const { mode } = r;
  let { slots } = r;
  const { data } = loadTours(bookInput.storePath);

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

  let implicitSlotAdjusted = false;
  if (implicitTourSlot && mode === 'single' && slots.length === 1) {
    let s = { ...slots[0] };
    let guard = 0;
    const maxAdvanceDays = 800;
    while (isSlotBookedForVillage(data, village.villageId, s.iso) && guard < maxAdvanceDays) {
      implicitSlotAdjusted = true;
      guard += 1;
      s = advanceSlotOneDay(s);
    }
    if (isSlotBookedForVillage(data, village.villageId, s.iso)) {
      return fail(
        'No free tour slot found for this village in the automatic date range.',
        'NO_FREE_SLOT',
        { villageName: village.villageName, fullName },
      );
    }
    slots = [s];
  } else {
    for (const slot of slots) {
      if (isSlotBookedForVillage(data, village.villageId, slot.iso)) {
        return fail('That time is already booked for this village.', 'SLOT_TAKEN', {
          scheduledStart: slot.iso,
          scheduledStartDisplay: formatDateTimeDisplayAU(slot.iso),
          tourDate: slot.tourDate,
          tourTime: slot.tourTime,
          villageName: village.villageName,
        });
      }
    }
  }

  const created = [];
  for (const slot of slots) {
    const bookingReference = nextBookingReference(data);
    data.bookings.push({
      bookingReference,
      villageId: village.villageId,
      villageName: village.villageName,
      fullName,
      dob: dobIso,
      phone: phoneLocal,
      phoneE164,
      scheduledStart: slot.iso,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    });
    created.push({
      bookingReference,
      tourDate: slot.tourDate,
      tourTime: slot.tourTime,
      scheduledStart: slot.iso,
      scheduledStartDisplay: formatDateTimeDisplayAU(slot.iso),
    });
  }
  saveTours(bookInput.storePath, data);

  if (mode === 'list') {
    return ok({
      villageName: village.villageName,
      fullName,
      tourDates: slots.map((s) => s.tourDate),
      tourTimes: slots.map((s) => s.tourTime),
      slotCount: slots.length,
      bookingReferences: created.map((c) => c.bookingReference),
      bookings: created,
      dob: formatDateDisplayAU(dobIso) || dobIso,
      dobIso,
      phone: phoneLocal,
      phoneE164,
      implicitTourSlot,
      implicitSlotAdjusted,
      requiresConfirmation: true,
      confirmationPrompt:
        'Please confirm the tour booking details with the resident before ending the conversation.',
      message: `Booked ${created.length} tour(s) successfully. Read back and confirm with the resident.`,
    });
  }

  const c0 = created[0];
  return ok({
    bookingReference: c0.bookingReference,
    bookingId: c0.bookingReference,
    villageName: village.villageName,
    fullName,
    tourDate: c0.tourDate,
    tourTime: c0.tourTime,
    dob: formatDateDisplayAU(dobIso) || dobIso,
    dobIso,
    phone: phoneLocal,
    phoneE164,
    scheduledStart: c0.scheduledStart,
    scheduledStartDisplay: c0.scheduledStartDisplay,
    implicitTourSlot,
    implicitSlotAdjusted,
    requiresConfirmation: true,
    confirmationPrompt:
      'Please confirm the tour booking details with the resident before ending the conversation.',
    message: 'Tour booked successfully. Please read back and confirm with the resident.',
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
