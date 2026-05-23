import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const handler = require('./handler.js').handler;
