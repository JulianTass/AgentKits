# Claim Management Kit - Insurance

Genesys-friendly Node.js 22 Cloud Functions for Westfund insurance claim intake.

## Functions

- `cm-idv-claimant` — captures name, DOB, optional member id; returns `claimantId`.
- `cm-capture-claim` — captures claim details and returns generated `claimNumber` (e.g. `CLM1002`).

## Build and test

```bash
npm run test:smoke
npm run zip
npm run verify:zip
```

## Dist output

- `dist/cm-idv-claimant.zip`
- `dist/cm-capture-claim.zip`
- `dist/Claim-Management-Kit-Insurance-All-Functions-Source.zip`
