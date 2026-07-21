'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sharedDir = path.join(root, 'shared');
const files = ['summitStore.js', 'parseEvent.js'];
const funcRoot = path.join(root, 'functions');
const seedData = path.join(root, 'data', 'summit.json');

const dirs = fs
  .readdirSync(funcRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith('hs-'))
  .map((d) => path.join(funcRoot, d.name));

for (const dir of dirs) {
  const lib = path.join(dir, 'lib');
  fs.mkdirSync(lib, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(sharedDir, f), path.join(lib, f));
  }
  if (fs.existsSync(seedData)) {
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.copyFileSync(seedData, path.join(dataDir, 'summit.json'));
  }
}

console.log(`Synced shared libraries into ${dirs.length} function folders.`);
