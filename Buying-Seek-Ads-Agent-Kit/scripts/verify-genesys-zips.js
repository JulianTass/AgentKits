'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dist = path.join(__dirname, '..', 'dist');
const zips = fs
  .readdirSync(dist)
  .filter((f) => f.startsWith('sa-') && f.endsWith('.zip'));

if (!zips.length) {
  console.error('No sa-*.zip files in dist/');
  process.exit(1);
}

for (const z of zips) {
  const abs = path.join(dist, z);
  const listing = execSync(`unzip -l "${abs}"`, { encoding: 'utf8' });
  const hasRootEntry =
    /(^|\n)[^\n]*\sindex\.js\s*$/m.test(listing) ||
    /(^|\n)[^\n]*\shandler\.js\s*$/m.test(listing);
  if (!hasRootEntry) {
    console.error(`${z}: missing index.js or handler.js at ZIP root.`);
    process.exit(1);
  }
}

console.log(
  `Verified ${zips.length} function zip(s): index.js or handler.js at archive root.`,
);
