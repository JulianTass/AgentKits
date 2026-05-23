'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.HOME_CARE_BOOKINGS_PATH = path.join(
  os.tmpdir(),
  `home-care-smoke-${Date.now()}.json`,
);

const add = require('../functions/hc-add-new-booking/handler');
const idv = require('../functions/hc-idv-booking/handler');
const plan = require('../functions/hc-get-care-plan-and-services/handler');
const next = require('../functions/hc-next-available-bookings/handler');
const cancel = require('../functions/hc-cancel-bookings/handler');
const reschedule = require('../functions/hc-reschedule-booking/handler');

async function main() {
  const storePath = process.env.HOME_CARE_BOOKINGS_PATH;
  if (fs.existsSync(storePath)) fs.unlinkSync(storePath);

  const created = await add.run({
    storePath,
    fullName: 'Jamie River',
    dob: '1962-07-19',
    phone: '+61 400 222 333',
    scheduledStart: '2026-04-29T11:00:00',
  });
  if (!created.success) throw new Error(JSON.stringify(created));

  const verified = await idv.run({
    storePath,
    bookingReference: created.bookingId,
    weekStart: '2026-04-27',
  });
  if (!verified.success) throw new Error(JSON.stringify(verified));

  const detail = await plan.run({
    storePath,
    clientId: verified.clientId,
    weekStart: '2026-04-27',
  });
  if (!detail.success) throw new Error(JSON.stringify(detail));

  const slots = await next.run({ storePath, clientId: verified.clientId });
  if (!slots.success) throw new Error(JSON.stringify(slots));

  const firstId = created.bookingIds[0];
  const move = await reschedule.run({
    storePath,
    clientId: verified.clientId,
    bookingId: firstId,
    newScheduledStart: '2026-04-28T14:00:00',
  });
  if (!move.success) throw new Error(JSON.stringify(move));

  const cancelled = await cancel.run({
    storePath,
    clientId: verified.clientId,
    bookingIds: [created.bookingIds[1]],
  });
  if (!cancelled.success) throw new Error(JSON.stringify(cancelled));

  console.log(
    JSON.stringify(
      { created, verified, detail, slotsKeys: Object.keys(slots.availability), move, cancelled },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
