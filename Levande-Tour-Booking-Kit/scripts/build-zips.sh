#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
rm -rf "$DIST"
mkdir -p "$DIST"
node "$ROOT/scripts/sync-lib.js"
for d in "$ROOT"/functions/lv-*; do
  name="$(basename "$d")"
  (cd "$d" && zip -r "$DIST/${name}.zip" . -x '**/.DS_Store')
done
(
  cd "$ROOT"
  zip -r "$DIST/Levande-Tour-Booking-Kit-All-Functions-Source.zip" \
    shared functions scripts data package.json LAM-ROLE-Levande-Tours.md \
    -x 'dist/*' -x '**/.DS_Store'
)
node "$ROOT/scripts/verify-genesys-zips.js"
echo "Built zips in $DIST"
