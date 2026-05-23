'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `levande-tour-smoke-${Date.now()}.json`);
process.env.LEVANDE_TOURS_STORE_PATH = tmp;

const check = require('../functions/lv-check-tour-availability/handler');
const book = require('../functions/lv-book-tour/handler');

async function main() {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  const autoVillageCheck = await check.run({
    tourDate: '07/07/2026',
    tourTime: '10:00',
  });
  if (!autoVillageCheck.success || autoVillageCheck.villageName !== 'Lincoln') {
    throw new Error(`auto village check: ${JSON.stringify(autoVillageCheck)}`);
  }

  const avail = await check.run({
    villageName: 'Maybrook',
    tourDate: '22/04/2026',
    tourTime: '9:00',
  });
  if (!avail.success) throw new Error(`check: ${JSON.stringify(avail)}`);
  if (avail.availableTours[0].scheduledStart !== '2026-04-22T09:00') {
    throw new Error(`unexpected slot: ${JSON.stringify(avail)}`);
  }

  const multiCheck = await check.run({
    villageName: 'Maybrook',
    tourDates: ['15/05/2026', '16/05/2026'],
    tourTimes: ['10:00', '14:00'],
  });
  if (!multiCheck.success) throw new Error(`multi check: ${JSON.stringify(multiCheck)}`);
  if (multiCheck.slotCount !== 2 || multiCheck.tourDates.length !== 2) {
    throw new Error(`expected 2 slots: ${JSON.stringify(multiCheck)}`);
  }

  const booked = await book.run({
    villageName: 'Maybrook',
    fullName: 'Ava Resident',
    dob: '11/04/1991',
    phone: '0406910251',
    tourDate: '22/04/2026',
    tourTime: '9:00',
  });
  if (!booked.success) throw new Error(JSON.stringify(booked));
  if (!/^BK\d+$/.test(booked.bookingReference)) {
    throw new Error(`Bad booking reference: ${booked.bookingReference}`);
  }

  const blocked = await check.run({
    villageName: 'Maybrook',
    tourDate: '22/04/2026',
    tourTime: '9:00',
  });
  if (blocked.success) {
    throw new Error(`expected SLOT_TAKEN, got: ${JSON.stringify(blocked)}`);
  }
  if (blocked.code !== 'SLOT_TAKEN') {
    throw new Error(`unexpected code: ${JSON.stringify(blocked)}`);
  }

  const lincoln = await check.run({
    villageName: 'Lincolin',
    tourDate: '20/05/2026',
    tourTime: '11:00',
  });
  if (!lincoln.success || lincoln.villageName !== 'Lincoln') {
    throw new Error(`Lincoln alias: ${JSON.stringify(lincoln)}`);
  }

  const multiBook = await book.run({
    villageName: 'Waratah',
    fullName: 'Ben Visitor',
    dob: '01/01/1980',
    phone: '0400000000',
    tourDates: ['10/06/2026', '11/06/2026'],
    tourTimes: ['09:00', '11:00'],
  });
  if (!multiBook.success) throw new Error(JSON.stringify(multiBook));
  if (!multiBook.bookingReferences || multiBook.bookingReferences.length !== 2) {
    throw new Error(`expected 2 booking refs: ${JSON.stringify(multiBook)}`);
  }

  const plus61Book = await book.run({
    villageName: 'Lincoln',
    fullName: 'Cara Caller',
    dob: '02/02/1992',
    phone: '+61 406 910 251',
    tourDate: '25/05/2026',
    tourTime: '15:00',
  });
  if (!plus61Book.success) throw new Error(JSON.stringify(plus61Book));
  if (plus61Book.phone !== '0406910251' || plus61Book.phoneE164 !== '+61406910251') {
    throw new Error(`phone normalize: ${JSON.stringify(plus61Book)}`);
  }

  const badPhone = await book.run({
    villageName: 'Maybrook',
    fullName: 'X',
    dob: '01/01/1990',
    phone: '123',
    tourDate: '30/05/2026',
    tourTime: '10:00',
  });
  if (badPhone.success || badPhone.code !== 'INVALID_PHONE') {
    throw new Error(`expected INVALID_PHONE: ${JSON.stringify(badPhone)}`);
  }

  const needTime = await check.run({ villageName: 'Maybrook', tourDate: '18/05/2026' });
  if (needTime.success || needTime.code !== 'MISSING_TOUR_TIME') {
    throw new Error(`expected MISSING_TOUR_TIME: ${JSON.stringify(needTime)}`);
  }
  const needDateTime = await check.run({ villageName: 'Maybrook' });
  if (needDateTime.success || needDateTime.code !== 'MISSING_TOUR_DATETIME') {
    throw new Error(`expected MISSING_TOUR_DATETIME: ${JSON.stringify(needDateTime)}`);
  }

  const badLen = await check.run({
    villageName: 'Maybrook',
    tourDates: ['1/1/2026', '2/1/2026'],
    tourTimes: ['9:00'],
  });
  if (badLen.success || badLen.code !== 'MISMATCH_TOUR_ARRAYS') {
    throw new Error(`expected MISMATCH: ${JSON.stringify(badLen)}`);
  }

  const autoBook = await book.run({
    fullName: 'Dee Default',
    dob: '03/03/1993',
    phone: '0411222333',
    tourDate: '08/08/2026',
    tourTime: '11:00',
  });
  if (!autoBook.success || autoBook.villageName !== 'Lincoln') {
    throw new Error(`auto book: ${JSON.stringify(autoBook)}`);
  }

  const bookNoDatetime = await book.run({
    villageName: 'Waratah',
    fullName: 'Julian',
    dob: '01/01/1990',
    phone: '0411222333',
  });
  if (!bookNoDatetime.success) {
    throw new Error(`book no datetime: ${JSON.stringify(bookNoDatetime)}`);
  }
  if (!bookNoDatetime.implicitTourSlot || bookNoDatetime.tourTime !== '10:00') {
    throw new Error(`implicit default slot: ${JSON.stringify(bookNoDatetime)}`);
  }

  const prevDefD = process.env.LEVANDE_DEFAULT_TOUR_DATE;
  const prevDefT = process.env.LEVANDE_DEFAULT_TOUR_TIME;
  process.env.LEVANDE_DEFAULT_TOUR_DATE = '03/12/2026';
  process.env.LEVANDE_DEFAULT_TOUR_TIME = '15:30';
  const bookEnvDefault = await book.run({
    villageName: 'Lincoln',
    fullName: 'Env Default',
    dob: '02/02/1992',
    phone: '0411222333',
  });
  if (!bookEnvDefault.success) {
    throw new Error(`book env default: ${JSON.stringify(bookEnvDefault)}`);
  }
  if (!bookEnvDefault.implicitTourSlot || bookEnvDefault.scheduledStart !== '2026-12-03T15:30') {
    throw new Error(`env default slot: ${JSON.stringify(bookEnvDefault)}`);
  }
  if (prevDefD !== undefined) process.env.LEVANDE_DEFAULT_TOUR_DATE = prevDefD;
  else delete process.env.LEVANDE_DEFAULT_TOUR_DATE;
  if (prevDefT !== undefined) process.env.LEVANDE_DEFAULT_TOUR_TIME = prevDefT;
  else delete process.env.LEVANDE_DEFAULT_TOUR_TIME;

  const implicitMaybrookA = await book.run({
    villageName: 'Maybrook',
    fullName: 'Implicit Maybrook A',
    dob: '01/01/1988',
    phone: '0411000111',
  });
  if (!implicitMaybrookA.success) {
    throw new Error(`implicit Maybrook A: ${JSON.stringify(implicitMaybrookA)}`);
  }
  const implicitMaybrookB = await book.run({
    villageName: 'Maybrook',
    fullName: 'Implicit Maybrook B',
    dob: '02/02/1989',
    phone: '0411000222',
  });
  if (!implicitMaybrookB.success) {
    throw new Error(`implicit Maybrook B: ${JSON.stringify(implicitMaybrookB)}`);
  }
  if (implicitMaybrookA.scheduledStart === implicitMaybrookB.scheduledStart) {
    throw new Error('implicit double-book same slot');
  }
  if (!implicitMaybrookB.implicitSlotAdjusted) {
    throw new Error(`expected implicitSlotAdjusted on second booking: ${JSON.stringify(implicitMaybrookB)}`);
  }

  console.log(
    JSON.stringify(
      {
        autoVillageCheck,
        avail,
        multiCheck,
        booked,
        blocked,
        lincoln,
        multiBook,
        plus61Book,
        badPhone,
        needTime,
        needDateTime,
        badLen,
        autoBook,
        bookNoDatetime,
        bookEnvDefault,
        implicitMaybrookA,
        implicitMaybrookB,
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
