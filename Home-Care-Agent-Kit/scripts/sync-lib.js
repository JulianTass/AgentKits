'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sharedDir = path.join(root, 'shared');
const files = ['bookingsStore.js', 'parseEvent.js'];
const funcRoot = path.join(root, 'functions');

const dirs = fs
  .readdirSync(funcRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith('hc-'))
  .map((d) => path.join(funcRoot, d.name));

const kitBookings = path.join(root, 'data', 'bookings.json');

for (const dir of dirs) {
  const lib = path.join(dir, 'lib');
  fs.mkdirSync(lib, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(sharedDir, f), path.join(lib, f));
  }
  if (fs.existsSync(kitBookings)) {
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.copyFileSync(kitBookings, path.join(dataDir, 'bookings.json'));
  }
}

console.log(`Synced shared libraries into ${dirs.length} function folders.`);
