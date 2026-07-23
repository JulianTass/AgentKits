'use strict';

const {
  loadStore,
  saveStore,
  normalizeSeekId,
  isValidMobileConfirmationCode,
  isValidSeekId,
  resolveOrCreateAdvertiserOpen,
  maskPhone,
} = require('./lib/seekAdsStore');
const { ok, fail, extractInput } = require('./lib/parseEvent');

function pickStr(input, keys) {
  for (const k of keys) {
    const v = input[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

async function run(input) {
  const mobileConfirmationCode = pickStr(input, [
    'mobileConfirmationCode',
    'MobileConfirmationCode',
    'confirmationCode',
    'ConfirmationCode',
    'mobileCode',
    'MobileCode',
    'otp',
    'OTP',
    'verificationCode',
    'VerificationCode',
  ]);
  const seekId = pickStr(input, [
    'seekId',
    'SeekId',
    'seekID',
    'SeekID',
    'seekPin',
    'SeekPin',
    'seekPIN',
    'SeekPIN',
    'pin',
    'PIN',
  ]);
  const companyName = pickStr(input, [
    'companyName',
    'CompanyName',
    'organisationName',
    'OrganisationName',
    'organizationName',
    'OrganizationName',
  ]);
  const contactName = pickStr(input, [
    'contactName',
    'ContactName',
    'name',
    'Name',
    'fullName',
    'FullName',
  ]);
  const phone = pickStr(input, [
    'phone',
    'Phone',
    'phoneNumber',
    'PhoneNumber',
    'mobile',
    'Mobile',
  ]);

  const missing = [];
  if (!mobileConfirmationCode) missing.push('mobileConfirmationCode');
  if (!seekId) missing.push('seekId');

  if (missing.length) {
    return fail(
      'Required in one call: mobileConfirmationCode (4 digits sent to the Seek mobile app) and seekId (6-character Seek PIN).',
      'MISSING_REQUIRED_FIELDS',
      { missing },
    );
  }

  if (!isValidMobileConfirmationCode(mobileConfirmationCode)) {
    return fail(
      'mobileConfirmationCode must be exactly 4 digits (the code sent to the Seek mobile app).',
      'INVALID_MOBILE_CODE',
      { provided: mobileConfirmationCode },
    );
  }

  if (!isValidSeekId(seekId)) {
    return fail(
      'seekId must be exactly 6 characters (letters and/or numbers).',
      'INVALID_SEEK_ID',
      { provided: seekId },
    );
  }

  const { data } = loadStore(input.storePath);
  const normalizedSeekId = normalizeSeekId(seekId);
  const advertiser = resolveOrCreateAdvertiserOpen(data, {
    seekId: normalizedSeekId,
    companyName,
    contactName,
    phone,
  });
  saveStore(input.storePath, data);

  return ok({
    idvStatus: 'VERIFIED',
    demoMode: true,
    mobileConfirmationCode,
    mobileConfirmationAccepted: true,
    advertiserId: advertiser.advertiserId,
    companyName: advertiser.companyName,
    contactName: advertiser.contactName,
    seekId: advertiser.seekId,
    maskedPhone: advertiser.phone ? maskPhone(advertiser.phone) : null,
    message:
      'Identity verified (demo mode). The 4-digit mobile confirmation code and 6-character Seek ID were accepted. Use advertiserId with sa_get_ad_tier_package.',
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
