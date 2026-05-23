'use strict';

const { loadClaims, saveClaims, parseCalendarDateToIso, formatDateDisplayAU, nextClaimantId } = require('./lib/claimStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

async function run(input) {
  const fullName = pickStr(input, [
    'fullName',
    'name',
    'Name',
    'FullName',
    'customerName',
    'CustomerName',
  ]);
  const dobRaw = pickStr(input, ['dob', 'DOB', 'Dob', 'dateOfBirth', 'DateOfBirth']);
  const memberId = pickStr(input, ['memberId', 'MemberId', 'memberNumber', 'MemberNumber']);
  const policy = pickStr(input, ['policy', 'Policy', 'policyName', 'PolicyName']);
  const dobIso = parseCalendarDateToIso(dobRaw) || dobRaw || '';

  const { data } = loadClaims(input.storePath);
  const existing = data.claimants.find((c) =>
    (memberId && c.memberId === memberId) ||
    (fullName && dobIso && c.fullName === fullName && c.dob === dobIso),
  );
  let claimant = existing;
  if (!claimant) {
    claimant = {
      claimantId: nextClaimantId(data),
      fullName: fullName || 'Unknown Member',
      dob: dobIso || '',
      memberId: memberId || '',
      policy: policy || 'Gold Ultimate Hospital',
    };
    data.claimants.push(claimant);
    saveClaims(input.storePath, data);
  }
  if (!claimant.policy) {
    claimant.policy = policy || 'Gold Ultimate Hospital';
    saveClaims(input.storePath, data);
  }
  if (memberId && !claimant.memberId) {
    claimant.memberId = memberId;
    saveClaims(input.storePath, data);
  }

  return ok({
    idvStatus: 'VERIFIED',
    planName: claimant.policy || 'Gold Ultimate Hospital',
    claimantId: claimant.claimantId,
    fullName: claimant.fullName,
    dob: formatDateDisplayAU(claimant.dob) || claimant.dob || null,
    dobIso: claimant.dob || null,
    memberId: claimant.memberId || null,
    policy: claimant.policy || 'Gold Ultimate Hospital',
    message:
      'IDV captured for claim intake. Any supplied name, DOB, member id, and policy are accepted for this demo.',
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
