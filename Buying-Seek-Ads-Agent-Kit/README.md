# Buying Seek Ads Agent Kit

Genesys-friendly Node.js 22 Cloud Functions for **Seek** employer identity verification and **branded ad budget** tier packages (Occasional, Regular, Frequent hiring).

## Functions

| Function | Genesys tool name (suggested) | Purpose |
|----------|-------------------------------|---------|
| `sa-idv-advertiser` | `sa_idv_advertiser` | Verify advertiser: **4-digit mobile confirmation code** (sent to Seek app) + **6-character Seek ID PIN** |
| `sa-get-ad-tier-package` | `sa_get_ad_tier_package` | Return tier package details — budget, discounts, eligible ad types, and summary text |

## Hiring tiers

| Tier | Ad range | Card price | Example budget |
|------|----------|------------|----------------|
| **Occasional** | 2 – 3 ads | $1150 + GST | $1,150 (+GST) for 3 ads |
| **Regular** | 4 – 6 ads | $1990 + GST | $1,990 (+GST) for 5 ads |
| **Frequent** | 6 – 10 ads | $2450 + GST | $3,700 (+GST) for 10 ads (scales within tier) |

**Ad count → tier mapping** (when tier is omitted): 2–3 occasional, 4–6 regular, 6–10 frequent.

## Demo advertisers (seed)

| Company | Seek ID | Contact |
|---------|---------|---------|
| Harbour City Medical Group | `HC4MG2` | Priya Sharma |
| Northside Aged Care | `NSAC88` | James O'Brien |
| Bright Future Early Learning | `BFEL01` | Mia Chen |

Demo mode accepts **any valid 4-digit mobile code** and **any 6-character Seek PIN** (letters/numbers).

## Example flow

1. **IDV** — collect 4-digit code from Seek mobile app + 6-character Seek ID:

```json
{
  "mobileConfirmationCode": "4829",
  "seekId": "HC4MG2"
}
```

2. **Tier package** — by tier name or ad count:

```json
{ "tier": "frequent", "adCount": 10, "advertiserId": "SA-ADV-101" }
```

Or auto-map from ad count:

```json
{ "adCount": 3 }
```

Response includes `summaryText` matching the Seek branded ad budget detail screen (discounts, 12-month budget, eligible ad types, how it works, terms note).

## Build and test

```bash
cd Buying-Seek-Ads-Agent-Kit
npm run test:smoke
npm run zip
npm run verify:zip
```

## Dist output

- `dist/sa-idv-advertiser.zip`
- `dist/sa-get-ad-tier-package.zip`
- `dist/Buying-Seek-Ads-Agent-Kit-All-Functions-Source.zip`

Runtime: **nodejs_22.x**, handler: **handler.handler**
