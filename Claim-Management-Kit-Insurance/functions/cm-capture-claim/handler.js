'use strict';

const {
  loadClaims,
  saveClaims,
  parseCalendarDateToIso,
  formatDateDisplayAU,
  normalizeClaimType,
  nextClaimNumber,
  nextClaimantId,
} = require('./lib/claimStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseItemNumbers(input) {
  const raw = input.itemNumbers ?? input.ItemNumbers ?? input.itemNumber ?? input.ItemNumber;
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (raw == null) return [];
  return String(raw)
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function extractClaimShape(input) {
  const claimTypeRaw = normalizeClaimType(
    pickStr(input, ['claimType', 'ClaimType', 'typeOfClaim']),
  );
  const claimType = claimTypeRaw || 'Extras';
  const serviceType =
    pickStr(input, ['serviceType', 'ServiceType']) || 'General Service';
  const providerName =
    pickStr(input, ['providerName', 'ProviderName']) || 'Generic Provider';
  const providerId =
    pickStr(input, ['providerId', 'ProviderId']) || 'PRV-GENERIC';
  const dateRaw = pickStr(input, ['dateOfService', 'DateOfService', 'serviceDate', 'ServiceDate']);
  const descriptionOfTreatment = pickStr(input, [
    'descriptionOfTreatment',
    'DescriptionOfTreatment',
    'treatmentDescription',
  ]);
  const claimAmountRaw = pickStr(input, ['claimAmount', 'ClaimAmount', 'amount']);
  const claimAmountParsed = claimAmountRaw === '' ? null : Number(claimAmountRaw);
  const claimAmount = Number.isFinite(claimAmountParsed)
    ? claimAmountParsed
    : Number((50 + Math.random() * 200).toFixed(2));
  const itemNumbersRaw = parseItemNumbers(input);
  const itemNumbers =
    itemNumbersRaw.length > 0
      ? itemNumbersRaw
      : claimType === 'Extras'
        ? ['000']
        : [];
  const dateOfServiceIso =
    parseCalendarDateToIso(dateRaw) || new Date().toISOString().slice(0, 10);
  return {
    claimType,
    serviceType,
    providerName,
    providerId,
    dateOfServiceIso,
    descriptionOfTreatment:
      descriptionOfTreatment || 'Auto-generated claim details for intake.',
    claimAmount,
    itemNumbers,
  };
}

async function run(input) {
  const { data } = loadClaims(input.storePath);
  const policyInput = pickStr(input, ['policy', 'Policy', 'policyName', 'PolicyName']);
  let claimantId = pickStr(input, ['claimantId', 'ClaimantId']);
  const memberIdInput = pickStr(input, ['memberId', 'MemberId', 'memberNumber']);
  if (!claimantId && !memberIdInput) {
    return fail('memberId is required when claimantId is not provided.', 'MISSING_MEMBER_ID');
  }
  let memberIdOut = '';
  let policyOut = '';
  if (!claimantId) {
    const memberId = memberIdInput;
    const fullName = pickStr(input, ['fullName', 'FullName', 'name', 'Name']);
    const dobIso =
      parseCalendarDateToIso(pickStr(input, ['dob', 'DOB', 'Dob', 'dateOfBirth'])) || '';
    const existing = data.claimants.find(
      (c) =>
        (memberId && c.memberId === memberId) ||
        (fullName && dobIso && c.fullName === fullName && c.dob === dobIso),
    );
    if (existing) {
      claimantId = existing.claimantId;
      memberIdOut = existing.memberId || memberId || '';
      policyOut = existing.policy || policyInput || 'Gold Ultimate Hospital';
      if (policyOut && !existing.policy) existing.policy = policyOut;
      if (memberIdOut && !existing.memberId) existing.memberId = memberIdOut;
    } else {
      const created = {
        claimantId: nextClaimantId(data),
        fullName: fullName || 'Unknown Member',
        dob: dobIso || '',
        memberId: memberId || '',
        policy: policyInput || 'Gold Ultimate Hospital',
      };
      data.claimants.push(created);
      claimantId = created.claimantId;
      memberIdOut = created.memberId || '';
      policyOut = created.policy || 'Gold Ultimate Hospital';
    }
  } else {
    const existing = data.claimants.find((c) => c.claimantId === claimantId);
    if (existing) {
      memberIdOut = existing.memberId || '';
      policyOut = existing.policy || policyInput || 'Gold Ultimate Hospital';
      if (policyOut && !existing.policy) existing.policy = policyOut;
    } else {
      memberIdOut = pickStr(input, ['memberId', 'MemberId', 'memberNumber']);
      policyOut = policyInput || 'Gold Ultimate Hospital';
    }
  }
  // Prefer IDV-linked claimant attributes over incoming overrides.
  const claimant = data.claimants.find((c) => c.claimantId === claimantId);
  if (claimant) {
    memberIdOut = claimant.memberId || memberIdOut || null;
    policyOut = claimant.policy || policyOut || 'Gold Ultimate Hospital';
  }

  const claimInputs = Array.isArray(input.claims) && input.claims.length
    ? input.claims
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({ ...input, ...x }))
    : [input];

  const created = [];
  for (const rowInput of claimInputs) {
    const row = extractClaimShape(rowInput);
    const claimNumber = nextClaimNumber(data);
    const claim = {
      claimNumber,
      claimType: row.claimType || null,
      serviceType: row.serviceType || null,
      providerName: row.providerName || null,
      providerId: row.providerId || null,
      dateOfService: row.dateOfServiceIso,
      descriptionOfTreatment: row.descriptionOfTreatment || null,
      claimAmount: row.claimAmount,
      itemNumbers: row.itemNumbers,
      claimantId,
      status: 'submitted',
      createdAt: new Date().toISOString(),
    };
    data.claims.push(claim);
    created.push(claim);
  }
  saveClaims(input.storePath, data);

  const primary = created[0];
  return ok({
    claimNumber: primary.claimNumber,
    claimNumbers: created.map((c) => c.claimNumber),
    claimsSubmitted: created.map((c) => ({
      claimNumber: c.claimNumber,
      claimType: c.claimType,
      serviceType: c.serviceType,
      providerName: c.providerName,
      providerId: c.providerId,
      dateOfService: formatDateDisplayAU(c.dateOfService) || c.dateOfService,
      dateOfServiceIso: c.dateOfService,
      descriptionOfTreatment: c.descriptionOfTreatment,
      claimAmount: c.claimAmount,
      itemNumbers: c.itemNumbers,
      status: c.status,
      memberId: memberIdOut || null,
      policy: policyOut || 'Gold Ultimate Hospital',
    })),
    claimantId,
    memberId: memberIdOut || null,
    policy: policyOut || 'Gold Ultimate Hospital',
    claimType: primary.claimType,
    serviceType: primary.serviceType,
    providerName: primary.providerName,
    providerId: primary.providerId,
    dateOfService: formatDateDisplayAU(primary.dateOfService) || primary.dateOfService,
    dateOfServiceIso: primary.dateOfService,
    descriptionOfTreatment: primary.descriptionOfTreatment,
    claimAmount: primary.claimAmount,
    itemNumbers: primary.itemNumbers,
    status: primary.status,
    message:
      created.length > 1
        ? `Submitted ${created.length} claims successfully.`
        : 'Claim submitted successfully for processing.',
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
