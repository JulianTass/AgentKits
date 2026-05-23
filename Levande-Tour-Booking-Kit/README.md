# Levande Tour Booking Kit

Genesys-friendly Cloud Functions for checking and booking Levande village tours.

## Functions

- `lv-check-tour-availability`
- `lv-book-tour`

## Features

- Multiple preferred dates/times
- Date parsing for `dd/mm/yyyy` and natural text like `22nd of April 2026`
- Booking reference auto-generated as `BK###`
- Confirmation-first interaction support in outputs

## Build/test

```bash
npm run test:smoke
npm run zip
npm run verify:zip
```
