'use strict';

function applyProviderTheme(provider) {
  const root = document.documentElement;
  root.style.setProperty('--primary', provider.theme.primary);
  root.style.setProperty('--primary-dark', provider.theme.primaryDark);
  document.title = provider.brandName + ' Portal';
}

function renderProviderPicker(currentId) {
  const select = document.getElementById('providerSelect');
  if (!select) return;

  select.innerHTML = '';
  Object.values(window.PORTAL_PROVIDERS).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.brandName;
    if (p.id === currentId) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    const next = select.value;
    if (next === currentId) return;
    window.localStorage.setItem('portal_provider', next);
    const params = new URLSearchParams(window.location.search);
    params.set('provider', next);
    window.location.search = params.toString();
  });
}

function renderProviderBody(provider) {
  document.getElementById('brandName').textContent = provider.brandName;
  document.getElementById('heroTitle').textContent = provider.hero.title;
  document.getElementById('heroDescription').textContent = provider.hero.description;
  document.getElementById('infoTitle').textContent = provider.infoCard.title;
  document.getElementById('infoBody').textContent = provider.infoCard.body;
}

function updateAuthUi(state) {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userStatus = document.getElementById('userStatus');
  const loading = document.getElementById('authLoading');

  const fetching = state.authFetching;
  const signedIn = state.signedIn || state.chatAuthenticated;

  loginBtn.style.display = signedIn || fetching ? 'none' : 'inline-block';
  logoutBtn.style.display = signedIn && !fetching ? 'inline-block' : 'none';
  loading.style.display = fetching ? 'inline-block' : 'none';

  userStatus.textContent = state.statusText || (signedIn ? 'Authenticated' : 'Not signed in');
  userStatus.classList.toggle('logged-in', !!signedIn);
  userStatus.classList.toggle('error', !!state.error);
}

document.addEventListener('DOMContentLoaded', () => {
  const provider = window.PortalAuth.getProvider();
  window.localStorage.setItem('portal_provider', provider.id);

  applyProviderTheme(provider);
  renderProviderPicker(provider.id);
  renderProviderBody(provider);

  window.__updateAuthUi = updateAuthUi;
  const auth = window.__portalAuthController;

  document.getElementById('loginBtn').addEventListener('click', () => auth.signIn());
  document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

  if (window.localStorage.getItem('portal_auth_fetching') === 'true') {
    updateAuthUi({ authFetching: true, statusText: 'Completing sign-in…' });
  } else {
    auth.emitState({ statusText: 'Not signed in' });
  }
});
