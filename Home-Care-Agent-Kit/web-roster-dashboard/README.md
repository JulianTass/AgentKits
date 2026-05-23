# Roster dashboard (ngrok + Genesys demo)

Small **Express** app that:

- Serves **`/`** — HTML table + **Server-Sent Events** for live updates.
- **`POST /api/bookings/add`** — same JSON body shape as **`hc-add-new-booking`** in Genesys (merged via `extractInput`). Writes to **`web-roster-dashboard/data/bookings.json`** (seeded from kit `data/bookings.json` on first run).
- **`POST /api/notify`** — optional receiver when the **Cloud Function zip** is configured to push success JSON here (`ROSTER_NOTIFY_URL`). Broadcasts to the page; the Genesys function’s roster file (e.g. `/tmp`) and this dashboard’s file are **different** unless you only add via this API.

## Run locally

From **this folder**:

```bash
npm install
npm start
```

Default URL: **http://127.0.0.1:3000/** (override with **`PORT`**)

Optional: require a secret on **`/api/notify`**:

```bash
export NOTIFY_SECRET='choose-a-long-random-string'
npm start
```

Match it in Genesys with **`ROSTER_NOTIFY_SECRET`** on **`hc-add-new-booking`** (same value).

## ngrok

```bash
ngrok http 3000
```

Use the HTTPS URL Genesys can reach, for example:

- **`https://YOUR-SUBDOMAIN.ngrok-free.app/api/bookings/add`** — HTTP data action POST (same fields as add-booking), **or**
- **`https://YOUR-SUBDOMAIN.ngrok-free.app/api/notify`** — set as **`ROSTER_NOTIFY_URL`** on the deployed add-booking function.

## Genesys Cloud Function (`hc-add-new-booking` zip)

| Environment variable | Purpose |
|----------------------|---------|
| **`ROSTER_NOTIFY_URL`** | After each successful add, **POST** success JSON to this URL (fire-and-forget). |
| **`ROSTER_NOTIFY_SECRET`** | Optional; sent as **`X-Notify-Secret`**; must match dashboard **`NOTIFY_SECRET`**. |

Redeploy the zip after changing env vars.

## Curl (local add)

```bash
curl -s -X POST http://127.0.0.1:3000/api/bookings/add \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"Demo User","dob":"01/01/1960","phone":"0400111222","scheduledStart":"2026-05-11T10:00:00"}' | jq .
```

From kit root you can also run **`npm run demo:dashboard`** (installs deps once per run).

### Page not loading?

- Start the server first (`npm start` in this folder or **`npm run demo:dashboard`** from kit root). Wait for **“Open: http://127.0.0.1:3000/”** in the terminal.
- Prefer **http://127.0.0.1:3000/** over **`localhost`** if the browser says the site cannot be reached (many systems resolve `localhost` to IPv6 first; the server listens in dual-stack mode, but **127.0.0.1** is the most reliable test).
- Quick check: **http://127.0.0.1:3000/ping** should return plain text **`ok`**. If that fails, the Node process is not listening (wrong port, firewall, or server crashed — read the terminal for errors).
- Use **http://** not **https://** for local URLs unless you terminate TLS yourself.
- If you see **“port already in use”**, run **`PORT=3001 npm start`** and open **http://127.0.0.1:3001/** (and **`ngrok http 3001`**).
- **ngrok free:** the first browser visit may show an ngrok warning page — click **Visit Site**. Tunnel must match the same port as the dashboard (e.g. **`ngrok http 3000`** while the app listens on **3000**).
