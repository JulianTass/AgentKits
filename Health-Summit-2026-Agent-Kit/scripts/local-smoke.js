'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `health-summit-smoke-${Date.now()}.json`);
process.env.HEALTH_SUMMIT_STORE_PATH = tmp;

const idv = require('../functions/hs-idv-attendee/handler');
const nextAvail = require('../functions/hs-next-available-booking/handler');
const cancel = require('../functions/hs-cancel-booking/handler');
const reschedule = require('../functions/hs-reschedule-booking/handler');

async function main() {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  const idvOnlyDob = await idv.run({ dob: '15/06/1988' });
  if (!idvOnlyDob.success || idvOnlyDob.idvStatus !== 'VERIFIED' || !idvOnlyDob.attendeeId) {
    throw new Error(`Open IDV DOB only: ${JSON.stringify(idvOnlyDob)}`);
  }

  const idvDobNoBookingRef = await idv.run({
    dob: '22/04/1985',
    bookingReference: '',
  });
  if (
    !idvDobNoBookingRef.success ||
    idvDobNoBookingRef.attendeeId !== 'HS-ATT-101' ||
    idvDobNoBookingRef.matchedBy !== 'dob'
  ) {
    throw new Error(`Open IDV DOB empty booking ref: ${JSON.stringify(idvDobNoBookingRef)}`);
  }

  const idvBookingOnly = await idv.run({ bookingReference: 'HS-BK-2002' });
  if (!idvBookingOnly.success || idvBookingOnly.attendeeId !== 'HS-ATT-102') {
    throw new Error(`Open IDV booking ref only: ${JSON.stringify(idvBookingOnly)}`);
  }

  const idvSeed = await idv.run({
    dob: '22/04/1985',
    bookingReference: 'HS-BK-2001',
  });
  if (!idvSeed.success || idvSeed.attendeeId !== 'HS-ATT-101') {
    throw new Error(`Seed IDV: ${JSON.stringify(idvSeed)}`);
  }

  const idvStore = path.join(os.tmpdir(), `hs-idv-store-${Date.now()}.json`);
  const nextStore = path.join(os.tmpdir(), `hs-next-store-${Date.now()}.json`);
  if (fs.existsSync(idvStore)) fs.unlinkSync(idvStore);
  if (fs.existsSync(nextStore)) fs.unlinkSync(nextStore);

  const idvSeparate = await idv.run({ dob: '15/06/1988', storePath: idvStore });
  if (!idvSeparate.success || !/^HS-ATT-\d+$/.test(idvSeparate.attendeeId)) {
    throw new Error(`Separate IDV store: ${JSON.stringify(idvSeparate)}`);
  }

  const nextSeparate = await nextAvail.run({
    attendeeId: idvSeparate.attendeeId,
    storePath: nextStore,
  });
  if (!nextSeparate.success || !nextSeparate.bookingReference) {
    throw new Error(`Separate next-available store: ${JSON.stringify(nextSeparate)}`);
  }

  const nextSlot = await nextAvail.run({ attendeeId: idvOnlyDob.attendeeId });
  if (!nextSlot.success || !nextSlot.bookingReference || !nextSlot.onlyDatesAfterJune9) {
    throw new Error(`Next available: ${JSON.stringify(nextSlot)}`);
  }
  if (nextSlot.scheduledStart < '2026-06-10') {
    throw new Error('Appointment must be after 9 June 2026');
  }

  const cancelled = await cancel.run({
    attendeeId: idvOnlyDob.attendeeId,
    bookingReference: nextSlot.bookingReference,
  });
  if (!cancelled.success || !/^HS-CX-\d+$/.test(cancelled.cancellationReferenceId)) {
    throw new Error(`Cancel: ${JSON.stringify(cancelled)}`);
  }

  const rescheduled = await reschedule.run({
    attendeeId: idvOnlyDob.attendeeId,
    date: '16/06/2026',
    time: '14:30',
  });
  if (
    !rescheduled.success ||
    rescheduled.rescheduleStatus !== 'confirmed' ||
    !rescheduled.bookingReference ||
    rescheduled.appointmentDate !== '16/06/2026' ||
    rescheduled.appointmentTime !== '14:30'
  ) {
    throw new Error(`Reschedule: ${JSON.stringify(rescheduled)}`);
  }

  console.log(
    JSON.stringify(
      {
        idvOnlyDob: idvOnlyDob.attendeeId,
        nextSlot: nextSlot.scheduledStartDisplay,
        cancelRef: cancelled.cancellationReferenceId,
        newBooking: rescheduled.bookingReference,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
