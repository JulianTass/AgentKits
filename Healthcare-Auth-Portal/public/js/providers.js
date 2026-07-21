'use strict';

/**
 * Healthcare provider portal configurations.
 * Add a new entry here to spin up another branded portal iteration.
 * Each provider needs its own Okta app redirect URI and Genesys deployment.
 */
window.PORTAL_PROVIDERS = {
  acme: {
    id: 'acme',
    brandName: 'Acme Support',
    hero: {
      title: 'Welcome to Acme Support',
      description:
        'Sign in to start an authenticated chat session with our support team.',
    },
    infoCard: {
      title: 'Okta + Genesys authenticated messaging',
      body:
        'Login uses Okta PKCE. The authorization code is handed to Genesys Web Messaging via the AuthProvider plugin. Genesys exchanges the code for tokens — do not pass the ID token directly.',
    },
    okta: {
      domain: 'https://integrator-3289699.okta.com',
      clientId: '0oa14bhl9ck5pJ4iH698',
      authServer: '/oauth2/default',
      scopes: ['openid', 'profile', 'email'],
      pkce: true,
      maxAge: 7200,
    },
    genesys: {
      environment: 'prod-apse2',
      deploymentId: '898f74d7-6cf4-4c5d-9b64-191fcdcb8147',
    },
    theme: {
      primary: '#2b6cb0',
      primaryDark: '#1a4e8a',
    },
  },

  summit: {
    id: 'summit',
    brandName: 'Health Summit 2026',
    hero: {
      title: 'Health Summit 2026 Support',
      description:
        'Sign in to chat with our summit concierge about sessions, bookings, and venue information.',
    },
    infoCard: {
      title: 'Summit attendee support',
      body:
        'Authenticated chat connects your Okta identity to Genesys Web Messaging so agents can see your attendee context.',
    },
    okta: {
      domain: 'https://integrator-3289699.okta.com',
      clientId: '0oa14bhl9ck5pJ4iH698',
      authServer: '/oauth2/default',
      scopes: ['openid', 'profile', 'email'],
      pkce: true,
      maxAge: 7200,
    },
    genesys: {
      environment: 'prod-apse2',
      deploymentId: '898f74d7-6cf4-4c5d-9b64-191fcdcb8147',
    },
    theme: {
      primary: '#0d9488',
      primaryDark: '#0f766e',
    },
  },
};

window.PORTAL_DEFAULT_PROVIDER = 'acme';
