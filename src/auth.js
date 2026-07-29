// Heavy half of auth: the actual atproto OAuth browser client. Loaded lazily
// via session.js — never import this module directly from UI code.

import { BrowserOAuthClient } from '@atproto/oauth-client-browser';
import { SCOPE, SITE_URL } from './config.js';
import { _setSession } from './session.js';

const DEV =
  location.hostname === '127.0.0.1' ||
  location.hostname === 'localhost' ||
  location.hostname === '[::1]';

// On loopback, atproto OAuth lets the client ID be a synthetic `http://localhost`
// URL with the config inlined as query params — no hosted metadata file needed.
const CLIENT_ID = DEV
  ? `http://localhost?redirect_uri=${encodeURIComponent(
      `${location.origin}/`
    )}&scope=${encodeURIComponent(SCOPE)}`
  : `${SITE_URL}/client-metadata.json`;

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    // Note: BrowserOAuthClient is not an EventTarget in this version — there is
    // no 'deleted' event to subscribe to. Session loss is detected reactively,
    // when a call fails; see isAuthError() in session.js.
    clientPromise = BrowserOAuthClient.load({
      clientId: CLIENT_ID,
      handleResolver: 'https://bsky.social',
    });
  }
  return clientPromise;
}

/** Completes the OAuth redirect callback and restores any stored session. */
export async function initAuth() {
  const client = await getClient();

  let result;
  try {
    result = await client.init();
  } catch (err) {
    console.warn('[auth] init failed', err);
    // A failed callback leaves the code params behind (in the hash, since
    // responseMode is 'fragment'). Strip them so a reload isn't a replay.
    history.replaceState(null, '', location.pathname);
    _setSession(null);
    return null;
  }

  _setSession(result?.session ?? null);

  // We came back from the PDS: restore whatever route the user was on.
  if (result?.state) {
    const target = result.state.startsWith('#') ? result.state : `#${result.state}`;
    if (target !== location.hash) location.hash = target;
  }

  return result?.session ?? null;
}

/**
 * Close the client's IndexedDB connection. Without this, deleting the database
 * fires `onblocked` and hangs until every tab lets go.
 */
export async function disposeClient() {
  if (!clientPromise) return;
  const pending = clientPromise;
  clientPromise = null;
  try {
    (await pending).dispose();
  } catch (err) {
    console.warn('[auth] dispose failed', err);
  }
}

export async function login(handleOrDid) {
  const client = await getClient();
  const identifier = String(handleOrDid || '')
    .trim()
    .replace(/^@/, '');
  if (!identifier) throw new Error('Enter your handle first');
  // Navigates away to the user's PDS; execution stops here.
  await client.signIn(identifier, {
    scope: SCOPE,
    state: location.hash || '#/',
  });
}
