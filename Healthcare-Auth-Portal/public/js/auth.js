'use strict';

/**
 * Okta + Genesys AuthProvider integration.
 *
 * Genesys authenticated web messaging uses the OAuth authorization *code* flow.
 * Messenger calls getAuthCode; we must return authCode + redirectUri + nonce (+ codeVerifier for PKCE).
 * Do NOT pass idToken — Genesys exchanges the code server-side.
 *
 * @see https://github.com/GenesysCloudBlueprints/messenger-authentication-okta-integration-blueprint
 */

function getSelectedProviderId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('provider');
  if (fromUrl && window.PORTAL_PROVIDERS[fromUrl]) return fromUrl;
  const stored = window.localStorage.getItem('portal_provider');
  if (stored && window.PORTAL_PROVIDERS[stored]) return stored;
  return window.PORTAL_DEFAULT_PROVIDER;
}

function getProvider() {
  const id = getSelectedProviderId();
  return window.PORTAL_PROVIDERS[id];
}

function buildRedirectUri() {
  const params = new URLSearchParams(window.location.search);
  params.delete('code');
  params.delete('state');
  params.delete('error');
  params.delete('error_description');
  const qs = params.toString();
  return window.location.origin + window.location.pathname + (qs ? '?' + qs : '');
}

function parseAuthCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('code')) return params.get('code');
  const query = window.location.search.substring(1);
  const fragment = query.split('code=')[1];
  return fragment ? fragment.split('&')[0] : '';
}

function readOktaTransaction() {
  try {
    const raw =
      window.sessionStorage.getItem('okta-transaction-storage') ||
      window.sessionStorage.getItem('okta-pkce-storage');
    if (!raw) return { nonce: '', codeVerifier: '' };
    const parsed = JSON.parse(raw);
    return {
      nonce: parsed.nonce || '',
      codeVerifier: parsed.codeVerifier || '',
    };
  } catch (err) {
    console.warn('Could not read Okta transaction storage:', err);
    return { nonce: '', codeVerifier: '' };
  }
}

function stripOauthParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('code') && !params.has('error')) return;
  params.delete('code');
  params.delete('state');
  params.delete('error');
  params.delete('error_description');
  const qs = params.toString();
  const clean = window.location.pathname + (qs ? '?' + qs : '');
  window.history.replaceState({}, document.title, clean);
}

function createOktaClient(provider, redirectUri) {
  const issuer = provider.okta.domain + provider.okta.authServer;
  return new OktaAuth({
    issuer,
    clientId: provider.okta.clientId,
    redirectUri,
    scopes: provider.okta.scopes,
    pkce: provider.okta.pkce !== false,
    responseType: 'code',
    maxAge: provider.okta.maxAge,
  });
}

function installGenesysLauncherGuard() {
  let authed = false;
  const hidden = new Set();

  function looksLikeGenesysNode(node) {
    if (!(node instanceof Element)) return false;
    const id = (node.id || '').toLowerCase();
    const cls = (node.className && node.className.toString()) || '';
    const clsLower = cls.toLowerCase();
    const tag = node.tagName.toLowerCase();
    return (
      id.includes('genesys') ||
      clsLower.includes('genesys') ||
      tag.includes('genesys') ||
      id.includes('purecloud') ||
      clsLower.includes('purecloud')
    );
  }

  function applyState() {
    hidden.forEach((node) => {
      if (!document.body.contains(node)) {
        hidden.delete(node);
        return;
      }
      node.style.setProperty('display', authed ? '' : 'none', authed ? '' : 'important');
      node.style.setProperty('visibility', authed ? '' : 'hidden', authed ? '' : 'important');
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (looksLikeGenesysNode(node)) hidden.add(node);
      });
    }
    applyState();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  return function setGenesysAuthed(value) {
    authed = !!value;
    applyState();
  };
}

function genesysCommand(name, ...args) {
  try {
    const result = Genesys('command', name, ...args);
    if (result && typeof result.then === 'function') {
      result.catch((err) => console.error(`Genesys command ${name} failed:`, err));
    }
  } catch (err) {
    console.error(`Genesys command ${name} threw:`, err);
  }
}

function bootstrapGenesys(provider) {
  const domain = window.GENESYS_JS_DOMAINS[provider.genesys.environment];
  if (!domain) {
    throw new Error('Unknown Genesys environment: ' + provider.genesys.environment);
  }
  const src = 'https://apps.' + domain + '/genesys-bootstrap/genesys.min.js';
  (function (g, e, n, es, ys) {
    g._genesysJs = e;
    g[e] =
      g[e] ||
      function () {
        (g[e].q = g[e].q || []).push(arguments);
      };
    g[e].t = 1 * new Date();
    g[e].c = es;
    ys = document.createElement('script');
    ys.async = 1;
    ys.src = n;
    ys.charset = 'utf-8';
    document.head.appendChild(ys);
  })(window, 'Genesys', src, {
    environment: provider.genesys.environment,
    deploymentId: provider.genesys.deploymentId,
    debug: true,
  });
}

function initPortalAuth(onStateChange) {
  const provider = getProvider();
  const redirectUri = buildRedirectUri();
  const authCode = parseAuthCodeFromUrl();
  const { nonce, codeVerifier } = readOktaTransaction();
  const oktaAuth = createOktaClient(provider, redirectUri);
  const setGenesysAuthed = installGenesysLauncherGuard();
  let chatAuthenticated = false;

  stripOauthParamsFromUrl();

  if (authCode) {
    window.localStorage.setItem('portal_auth_fetching', 'true');
  }

  function emitState(extra) {
    onStateChange({
      provider,
      chatAuthenticated,
      authFetching: window.localStorage.getItem('portal_auth_fetching') === 'true',
      hasAuthCode: !!authCode,
      redirectUri,
      ...extra,
    });
  }

  function showLauncher() {
    setGenesysAuthed(true);
    genesysCommand('Launcher.show');
  }

  function hideLauncher() {
    setGenesysAuthed(false);
    genesysCommand('Launcher.hide');
  }

  function renderSignedOut() {
    chatAuthenticated = false;
    window.localStorage.setItem('portal_auth_fetching', 'false');
    hideLauncher();
    emitState({ statusText: 'Not signed in' });
  }

  function renderSignedIn(label) {
    chatAuthenticated = true;
    window.localStorage.setItem('portal_auth_fetching', 'false');
    showLauncher();
    emitState({
      statusText: label || 'Authenticated — chat is available',
      signedIn: true,
    });
  }

  hideLauncher();

  Genesys('registerPlugin', 'AuthProvider', (AuthProvider) => {
    AuthProvider.registerCommand('getAuthCode', (e) => {
      const { forceUpdate } = e.data || {};

      if (forceUpdate || !authCode) {
        window.localStorage.setItem('portal_auth_fetching', 'true');
        emitState({ authFetching: true });
        oktaAuth.signInWithRedirect({ originalUri: window.location.href });
        e.resolve();
        return;
      }

      const payload = {
        authCode,
        redirectUri,
        nonce,
      };

      if (provider.okta.maxAge) payload.maxAge = provider.okta.maxAge;
      if (provider.okta.pkce !== false && codeVerifier) {
        payload.codeVerifier = codeVerifier;
      }

      console.log('[AuthProvider] Resolving getAuthCode with authorization code flow');
      e.resolve(payload);
    });

    AuthProvider.registerCommand('reAuthenticate', (e) => {
      window.localStorage.setItem('portal_auth_fetching', 'true');
      emitState({ authFetching: true });
      oktaAuth.signInWithRedirect({ originalUri: window.location.href });
      e.resolve();
    });

    AuthProvider.subscribe('Auth.ready', () => {
      const authed = AuthProvider.data('Auth.authenticated');
      console.log('[AuthProvider] Auth.ready — authenticated:', authed);
      if (authed) renderSignedIn();
      else if (!authCode) renderSignedOut();
      else emitState({ authFetching: true, statusText: 'Completing sign-in…' });
    });

    AuthProvider.subscribe('Auth.authenticated', (data) => {
      console.log('[AuthProvider] Auth.authenticated', data);
      renderSignedIn('Chat session authenticated');
    });

    AuthProvider.subscribe('Auth.error', (error) => {
      console.error('[AuthProvider] Auth.error', error);
      window.localStorage.setItem('portal_auth_fetching', 'false');
      emitState({
        authFetching: false,
        statusText: 'Authentication failed — try signing in again',
        error: error?.data?.message || 'Auth.error',
      });
    });

    AuthProvider.subscribe('Auth.authError', (error) => {
      console.error('[AuthProvider] Auth.authError', error);
      window.localStorage.setItem('portal_auth_fetching', 'false');
      renderSignedOut();
      emitState({
        statusText: 'Session expired — please sign in again',
        error: 'Auth.authError',
      });
    });

    AuthProvider.ready();

    // After Okta redirect the URL carries a one-time code. Messenger must exchange
    // it before the user opens chat — otherwise Auth.authenticated never fires
    // while the launcher stays hidden.
    if (authCode) {
      genesysCommand('Auth.authenticate');
    }
  });

  Genesys('subscribe', 'MessagingService.started', (event) => {
    console.log('MessagingService.started', event);
  });

  Genesys('subscribe', 'MessagingService.conversationStarted', (event) => {
    console.log('MessagingService.conversationStarted', event);
  });

  return {
    provider,
    oktaAuth,
    signIn() {
      window.localStorage.setItem('portal_auth_fetching', 'true');
      emitState({ authFetching: true, statusText: 'Redirecting to Okta…' });
      oktaAuth.signInWithRedirect({ originalUri: window.location.href });
    },
    signOut() {
      Genesys('command', 'Auth.logout')
        .catch(() => {})
        .finally(() => {
          oktaAuth.signOut({ closeSession: false });
          renderSignedOut();
        });
    },
    emitState,
  };
}

window.PortalAuth = {
  getSelectedProviderId,
  getProvider,
  bootstrapGenesys,
  initPortalAuth,
};
