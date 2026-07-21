# Health Summit 2026 Agent Kit

Genesys-friendly Node.js 22 Cloud Functions for **Health Summit 2026** attendee identity, appointment lookup, cancellation, and rescheduling (demo / open mode).

## Functions

| Function | Genesys tool name (suggested) | Purpose |
|----------|-------------------------------|---------|
| `hs-idv-attendee` | `hs_idv_attendee` | Verify attendee: **any DOB accepted**, booking reference **optional / may be empty** (open demo) |
| `hs-next-available-booking` | `hs_next_available_booking` | Next booking — **only dates after 9 June 2026** |
| `hs-cancel-booking` | `hs_cancel_booking` | Cancel appointment; returns **cancellation reference** (`HS-CX-…`) |
| `hs-reschedule-booking` | `hs_reschedule_booking` | Reschedule to **one date + time** → **booking reference** |

## Demo attendees (seed)

| Name | DOB (speak dd/mm/yyyy) | Booking reference |
|------|------------------------|-------------------|
| Jordan Lee | 22/04/1985 | HS-BK-2001 |
| Sam Rivera | 08/11/1990 | HS-BK-2002 |
| Alex Chen | 15/06/1978 | HS-BK-2003 |

Any other DOB is accepted in open demo mode and creates a new `HS-ATT-…` id.

## Example flow

1. **IDV** — `{ "dob": "22/04/1985" }` or with optional `"bookingReference": "HS-BK-2001"`
2. **Next available** — `{ "attendeeId": "HS-ATT-101" }` (only after 9 June 2026)
3. **Cancel** — `{ "attendeeId": "…", "bookingReference": "HS-BK-2001" }` → `cancellationReferenceId`
4. **Reschedule** — `{ "attendeeId": "…", "date": "16/06/2026", "time": "14:30" }` → `bookingReference`

## Build and test

```bash
cd Health-Summit-2026-Agent-Kit
npm run test:smoke
npm run zip
npm run verify:zip
```

## Dist output

- `dist/hs-idv-attendee.zip`
- `dist/hs-next-available-booking.zip`
- `dist/hs-cancel-booking.zip`
- `dist/hs-reschedule-booking.zip`
- `dist/Health-Summit-2026-Agent-Kit-All-Functions-Source.zip`

Runtime: **nodejs_22.x**, handler: **handler.handler**

## Genesys — reschedule (simple)

**Input:** `attendeeId`, `date` (dd/mm/yyyy), `time` (HH:mm)

**Success criteria:** `$.success`

**Translation map:**

```json
{
  "translationMap": {
    "success": "$.success",
    "attendeeId": "$.attendeeId",
    "appointmentDate": "$.appointmentDate",
    "appointmentTime": "$.appointmentTime",
    "bookingReference": "$.bookingReference"
  },
  "successTemplate": "{\"success\": ${success}, \"attendeeId\": \"${attendeeId}\", \"appointmentDate\": \"${appointmentDate}\", \"appointmentTime\": \"${appointmentTime}\", \"bookingReference\": \"${bookingReference}\"}"
}
```
