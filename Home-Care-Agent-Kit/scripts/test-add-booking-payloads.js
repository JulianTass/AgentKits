'use strict';

/**
 * Regression tests for Genesys-style event shapes where fullName (or aliases)
 * was previously dropped by extractInput.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.HOME_CARE_BOOKINGS_PATH = path.join(
  os.tmpdir(),
  `hc-add-test-${Date.now()}.json`,
);

const { handler } = require('../functions/hc-add-new-booking/handler');

const base = {
  dob: '19/07/1962',
  phone: '0400111222',
  scheduledStart: '29/04/2026T10:00:00',
};

async function runCase(label, event) {
  const res = await handler(event);
  if (!res.success) {
    throw new Error(`${label}: ${JSON.stringify(res)}`);
  }
  if (!res.bookingId || !String(res.bookingId).startsWith('BK')) {
    throw new Error(`${label}: bad bookingId ${res.bookingId}`);
  }
  if (!res.fullName || !res.startschedule) {
    throw new Error(`${label}: missing echo fields ${JSON.stringify(res)}`);
  }
  console.log(`${label} -> ${res.bookingId}`);
}

async function main() {
  const store = process.env.HOME_CARE_BOOKINGS_PATH;
  if (fs.existsSync(store)) fs.unlinkSync(store);

  await runCase('flat-root-fullName', {
    ...base,
    fullName: 'Julian Brian',
  });

  await runCase('flat-root-Name', {
    ...base,
    Name: 'Julian Brian',
  });

  await runCase('request.arguments-name', {
    request: {
      arguments: {
        name: 'Julian Brian',
        dob: base.dob,
        phone: base.phone,
        scheduledStart: base.scheduledStart,
      },
    },
  });

  await runCase('body-json-string', {
    body: JSON.stringify({
      fullName: 'Julian Brian',
      dob: base.dob,
      phone: base.phone,
      scheduledStart: base.scheduledStart,
    }),
  });

  await runCase('firstName-lastName', {
    firstName: 'Julian',
    lastName: 'Brian',
    dob: base.dob,
    phone: base.phone,
    scheduledStart: base.scheduledStart,
  });

  await runCase('event-root-string', JSON.stringify({
    fullName: 'Julian Brian',
    dob: base.dob,
    phone: base.phone,
    scheduledStart: base.scheduledStart,
  }));

  await runCase('data-wrapper', {
    data: {
      fullName: 'Julian Brian',
      dob: base.dob,
      phone: base.phone,
      scheduledStart: base.scheduledStart,
    },
  });

  fs.unlinkSync(store);
  console.log('all add-booking payload tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
