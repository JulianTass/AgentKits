'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sharedDir = path.join(root, 'shared');
const files = ['tourStore.js', 'parseEvent.js'];
const funcRoot = path.join(root, 'functions');
const seed = path.join(root, 'data', 'tours.json');

const dirs = fs
  .readdirSync(funcRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith('lv-'))
  .map((d) => path.join(funcRoot, d.name));

for (const dir of dirs) {
  const lib = path.join(dir, 'lib');
  fs.mkdirSync(lib, { recursive: true });
  for (const f of files) {
    fs.copyFileSync(path.join(sharedDir, f), path.join(lib, f));
  }
  if (fs.existsSync(seed)) {
    const dataDir = path.join(dir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.copyFileSync(seed, path.join(dataDir, 'tours.json'));
  }
}

console.log(`Synced shared libraries into ${dirs.length} function folders.`);
