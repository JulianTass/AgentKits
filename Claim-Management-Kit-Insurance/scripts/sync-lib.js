'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sharedDir = path.join(root, 'shared');
const files = ['claimStore.js', 'parseEvent.js'];
const funcRoot = path.join(root, 'functions');
const seedClaims = path.join(root, 'data', 'claims.json');

const dirs = fs
  .readdirSync(funcRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith('cm-'))
  .map((d) => path.join(funcRoot, d.name));

for (const dir of dirs) {
  const lib = path.join(dir, 'lib');
  fs.mkdirSync(lib, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(sharedDir, f), path.join(lib, f));
  }
  if (fs.existsSync(seedClaims)) {
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.copyFileSync(seedClaims, path.join(dataDir, 'claims.json'));
  }
}

console.log(`Synced shared libraries into ${dirs.length} function folders.`);
