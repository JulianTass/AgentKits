# Healthcare Auth Portal

Multi-provider login portal with **Okta PKCE** sign-in and **Genesys authenticated web messaging**. Each provider is a branded iteration (hero copy, theme, Okta app, Genesys deployment) defined in `public/js/providers.js`.

## Why the sample code failed

Genesys authenticated web messaging uses the **OAuth authorization code** flow, not implicit / ID-token passthrough. The `AuthProvider.getAuthCode` handler must return:

| Field | Purpose |
|-------|---------|
| `authCode` | The `code` query param Okta returns after login |
| `redirectUri` | Must match Okta **Sign-in redirect URI** exactly (no `?code=`) |
| `nonce` | From Okta transaction storage |
| `codeVerifier` | Required for PKCE — from Okta transaction storage |

Do **not** pass `idToken`. Genesys exchanges the authorization code server-side. If you call `oktaAuth.handleLoginRedirect()`, the code is consumed before Messenger can use it.

This portal follows the [Genesys Okta integration blueprint](https://github.com/GenesysCloudBlueprints/messenger-authentication-okta-integration-blueprint).

## Run locally

```bash
cd Healthcare-Auth-Portal
npm install
npm start
```

Open **http://127.0.0.1:3080/** (or set `PORT`).

## Okta setup

1. In your Okta application, add **Sign-in redirect URIs** for every URL you use, for example:
   - `http://127.0.0.1:3080/`
   - `http://127.0.0.1:3080/?provider=acme`
   - `http://127.0.0.1:3080/?provider=summit`
2. Grant type: **Authorization Code** with **PKCE** (SPA app).
3. The `redirectUri` sent to Genesys must match the URI Okta redirected to (this app strips `code` / `state` but keeps `?provider=`).

## Genesys setup

In Admin → Messenger deployments, enable **Authentication** and configure the same Okta issuer, client ID, and redirect URI.

## Add another healthcare provider

Edit `public/js/providers.js` and add a new key:

```javascript
myClinic: {
  id: 'myClinic',
  brandName: 'My Clinic',
  hero: { title: '...', description: '...' },
  infoCard: { title: '...', body: '...' },
  okta: { domain, clientId, authServer, scopes, pkce, maxAge },
  genesys: { environment, deploymentId },
  theme: { primary, primaryDark },
}
```

Switch providers via the header dropdown or `?provider=myClinic`. Changing provider reloads the page and bootstraps a different Genesys deployment.

## Flow

1. User clicks **Log In** → Okta redirect (PKCE).
2. Okta returns to this page with `?code=...`.
3. Page captures `code`, `nonce`, and `codeVerifier` before Messenger runs.
4. User opens chat → Messenger calls `getAuthCode` → Genesys exchanges the code.
5. `Auth.authenticated` fires → chat launcher is shown.
