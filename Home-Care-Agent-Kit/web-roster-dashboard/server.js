'use strict';

/**
 * Demo dashboard: same add-booking logic as the kit zip, plus SSE so the page updates.
 * Genesys zip can POST success payloads to /api/notify via ROSTER_NOTIFY_URL (see README).
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

const kitRoot = path.join(__dirname, '..');
const DATA = path.join(__dirname, 'data', 'bookings.json');
const PORT = Number(process.env.PORT || 3000);
const NOTIFY_SECRET = process.env.NOTIFY_SECRET || '';

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  if (!fs.existsSync(DATA)) {
    const seed = path.join(kitRoot, 'data', 'bookings.json');
    if (fs.existsSync(seed)) {
      fs.copyFileSync(seed, DATA);
    }
  }
}

ensureDataFile();
process.env.HOME_CARE_BOOKINGS_PATH = DATA;

const { loadBookings } = require(path.join(
  kitRoot,
  'functions',
  'hc-add-new-booking',
  'lib',
  'bookingsStore',
));
const { handler: addHandler } = require(path.join(
  kitRoot,
  'functions',
  'hc-add-new-booking',
  'handler',
));

const app = express();
app.use(express.json({ limit: '512kb' }));

/** Plain check that TCP reached this process (use before opening the full page). */
app.get('/ping', (_req, res) => {
  res.type('text').send('ok');
});

/** @type {Set<import('http').ServerResponse>} */
const sseClients = new Set();

function broadcast(obj) {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(line);
    } catch {
      sseClients.delete(res);
    }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, store: DATA });
});

app.get('/api/roster', (_req, res) => {
  try {
    const { data } = loadBookings(DATA);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e && e.message ? e.message : e) });
  }
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(': ok\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.post('/api/bookings/add', async (req, res) => {
  try {
    const result = await addHandler(req.body);
    if (result && result.success) {
      broadcast({ type: 'add', result });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({
      success: false,
      error: String(e && e.message ? e.message : e),
      code: 'ERROR',
    });
  }
});

app.post('/api/notify', (req, res) => {
  if (NOTIFY_SECRET) {
    const h = req.get('x-notify-secret') || '';
    if (h !== NOTIFY_SECRET) {
      return res.status(401).json({ success: false, error: 'invalid or missing X-Notify-Secret' });
    }
  }
  broadcast({ type: 'webhook', result: req.body });
  res.json({ success: true });
});

app.get('/', (_req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return res.status(500).type('text').send(`Missing ${htmlPath}. Run server from web-roster-dashboard directory.`);
  }
  res.sendFile(htmlPath);
});

app.use(express.static(path.join(__dirname, 'public')));

/**
 * Dual-stack listen: binding only IPv4 (0.0.0.0) breaks "localhost" on many systems
 * because the browser resolves localhost → ::1 first.
 */
const LISTEN_HOST = process.env.HOST || '::';
const server = app.listen(
  { port: PORT, host: LISTEN_HOST, ipv6Only: false },
  () => {
    const addr = server.address();
    const where =
      addr && typeof addr === 'object'
        ? `${addr.address}:${addr.port}`
        : String(addr);
    console.log(
      `Roster dashboard (store: ${DATA})\n` +
        `  Open:  http://127.0.0.1:${PORT}/  (use 127.0.0.1 if localhost fails)\n` +
        `  Ping:  http://127.0.0.1:${PORT}/ping  → should show "ok"\n` +
        `  Bound: ${where} (dual-stack; ngrok: ngrok http ${PORT})\n` +
        `  POST /api/bookings/add — Genesys-shaped JSON\n` +
        `  POST /api/notify     — zip webhook (ROSTER_NOTIFY_URL)\n` +
        (NOTIFY_SECRET ? `  NOTIFY_SECRET is set (required on /api/notify)\n` : ''),
    );
  },
);

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use (e.g. another dev server). Try:\n` +
        `  PORT=3001 npm start\n` +
        `  ngrok http 3001`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
