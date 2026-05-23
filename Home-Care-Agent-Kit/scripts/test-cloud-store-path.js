'use strict';

/**
 * Ensures default store path uses /tmp when the kit detects a cloud deploy
 * (Genesys: /var/task read-only, or optional AWS-style env for other hosts).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.AWS_LAMBDA_FUNCTION_NAME = 'hc-add-new-booking-test';
delete process.env.HOME_CARE_BOOKINGS_PATH;

const store = require('../functions/hc-add-new-booking/lib/bookingsStore');
const { handler } = require('../functions/hc-add-new-booking/handler');

const { path: p } = store.loadBookings();
assert(
  p.startsWith('/tmp/'),
  `expected /tmp default store in cloud-style env, got ${p}`,
);
try {
  if (fs.existsSync(p)) fs.unlinkSync(p);
} catch {
  /* ignore */
}

(async () => {
  const tmp = path.join(os.tmpdir(), `cloud-store-${Date.now()}.json`);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const res = await handler({
    fullName: 'Tmp Genesys',
    dob: '01/01/1960',
    phone: '0400000000',
    scheduledStart: '29/04/2026T09:00:00',
    storePath: tmp,
  });
  assert.strictEqual(res.success, true, JSON.stringify(res));
  fs.unlinkSync(tmp);
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  console.log('cloud store path ok:', p);
})();
