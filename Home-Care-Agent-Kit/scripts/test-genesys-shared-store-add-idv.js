'use strict';

/**
 * Verifies hc-add-new-booking and hc-idv-booking use the same backing store when
 * HOME_CARE_BOOKINGS_PATH is set (recommended Genesys lab: identical env on every function).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const kitData = path.join(__dirname, '..', 'data', 'bookings.json');
const storePath = path.join(
  os.tmpdir(),
  `genesys-shared-store-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
);

if (!fs.existsSync(kitData)) {
  console.error('Missing kit data/bookings.json; run from repo root after sync.');
  process.exit(1);
}
fs.copyFileSync(kitData, storePath);
process.env.HOME_CARE_BOOKINGS_PATH = storePath;

const add = require('../functions/hc-add-new-booking/handler');
const idv = require('../functions/hc-idv-booking/handler');

async function main() {
  const stamp = Date.now();
  const phone = `6141999${String(stamp).slice(-6)}`;
  const created = await add.run({
    fullName: `Shared Store Genesys Test ${stamp}`,
    dob: '15/06/1965',
    phone,
    scheduledStart: '2026-05-11T10:00:00',
  });
  assert.strictEqual(created.success, true, JSON.stringify(created));

  const byPhone = await idv.run({ phone });
  assert.strictEqual(byPhone.success, true, JSON.stringify(byPhone));
  assert.strictEqual(
    byPhone.clientId,
    created.clientId,
    'IDV by phone must see client created by add-booking on same store',
  );

  const byRef = await idv.run({ bookingReference: created.bookingId });
  assert.strictEqual(byRef.success, true, JSON.stringify(byRef));
  assert.strictEqual(
    byRef.clientId,
    created.clientId,
    'IDV by booking id must align with add-booking',
  );

  console.log('genesys shared store (add + IDV) ok:', storePath);
  fs.unlinkSync(storePath);
  delete process.env.HOME_CARE_BOOKINGS_PATH;
}

main().catch((err) => {
  console.error(err);
  try {
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
  } catch {
    /* ignore */
  }
  delete process.env.HOME_CARE_BOOKINGS_PATH;
  process.exit(1);
});
