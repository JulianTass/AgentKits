'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `claim-kit-smoke-${Date.now()}.json`);
process.env.CLAIMS_STORE_PATH = tmp;

const idv = require('../functions/cm-idv-claimant/handler');
const claim = require('../functions/cm-capture-claim/handler');

async function main() {
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  const verified = await idv.run({
    fullName: 'Sam Example',
    dob: '11th of April 1991',
    memberId: 'WF-112233',
    policy: 'Gold Ultimate Hospital',
  });
  if (!verified.success) throw new Error(JSON.stringify(verified));
  if (verified.policy !== 'Gold Ultimate Hospital') {
    throw new Error(`Expected policy on IDV output, got ${verified.policy}`);
  }

  const single = await claim.run({
    claimantId: verified.claimantId,
    claimType: 'Extras',
  });
  if (!single.success) throw new Error(JSON.stringify(single));
  if (single.memberId !== 'WF-112233') {
    throw new Error(`Expected memberId on claim output, got ${single.memberId}`);
  }
  if (single.policy !== 'Gold Ultimate Hospital') {
    throw new Error(`Expected policy on claim output, got ${single.policy}`);
  }
  if (single.providerName !== 'Generic Provider') {
    throw new Error(`Expected generic provider, got ${single.providerName}`);
  }
  if (!single.claimAmount || Number(single.claimAmount) <= 0) {
    throw new Error(`Expected generated claim amount, got ${single.claimAmount}`);
  }

  const missingMember = await claim.run({ claimType: 'Extras' });
  if (missingMember.success || missingMember.code !== 'MISSING_MEMBER_ID') {
    throw new Error(`Expected MISSING_MEMBER_ID, got ${JSON.stringify(missingMember)}`);
  }
  if (!/^CLM\d+$/.test(single.claimNumber)) {
    throw new Error(`Bad claim number: ${single.claimNumber}`);
  }

  const multi = await claim.run({
    claimantId: verified.claimantId,
    claims: [
      {
        claimType: 'Extras',
        serviceType: 'Dental',
        providerName: 'Westfund Dental',
        providerId: 'PRV-DENT-1',
        dateOfService: '11th of April 2026',
        descriptionOfTreatment: 'Dental consultation',
        claimAmount: '120.00',
        itemNumbers: ['011'],
      },
      {
        claimType: 'Extras',
        serviceType: 'Physio',
        providerName: 'Westfund Physio',
        providerId: 'PRV-PHY-1',
        dateOfService: '12/04/2026',
        descriptionOfTreatment: 'Physio treatment',
        claimAmount: 98.2,
      },
    ],
  });
  if (!multi.success) throw new Error(JSON.stringify(multi));
  if (!Array.isArray(multi.claimNumbers) || multi.claimNumbers.length !== 2) {
    throw new Error(`Bad multi claimNumbers: ${JSON.stringify(multi.claimNumbers)}`);
  }
  console.log(JSON.stringify({ verified, single, multi }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
