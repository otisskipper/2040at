// Light session facade. Everything in the UI imports this; the heavy atproto
// OAuth client (~900 kB) is only pulled in when there's an actual session to
// restore or a login to start. Anonymous visitors and profile links never pay
// for it.

const FLAG = '2040at.session';

let session = null;
let agentPromise = null;
const listeners = new Set();

export function getSession() {
  return session;
}

export function getDid() {
  return session?.did ?? null;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called by auth.js only. */
export function _setSession(next) {
  session = next ?? null;
  agentPromise = null;
  if (session?.did) localStorage.setItem(FLAG, session.did);
  else localStorage.removeItem(FLAG);
  for (const fn of listeners) fn(session);
}

/**
 * Did this failure mean the session is gone? The SDK's TokenRevoked/Refresh/
 * Invalid errors are plain Error subclasses whose class names don't survive
 * minification, so match on status and message instead.
 */
export function isAuthError(err) {
  if (!err) return false;
  if (err.status === 401 || err.status === 403) return true;
  return /token|session|revoked|expired|invalid_grant|unauthorized|not signed in/i.test(
    String(err.message || '')
  );
}

/** Drop the local session without trying to reach the PDS. */
export function clearSession() {
  _setSession(null);
}

export async function getAgent() {
  if (!session) return null;
  if (!agentPromise) {
    agentPromise = import('@atproto/api').then(({ Agent }) => new Agent(session));
  }
  return agentPromise;
}

const CALLBACK_PARAM = /(^|[?&])(code|state|error|iss)=/;

/**
 * The OAuth client uses responseMode 'fragment' by default, so the callback
 * params come back in the URL hash — the same place our router lives. Our own
 * routes always start with "/" ("#/u/alice"); an OAuth fragment response never
 * does. Query mode is checked too, in case the default ever changes.
 */
export function hasOAuthCallback() {
  if (CALLBACK_PARAM.test(location.search)) return true;
  const hash = location.hash.slice(1);
  return !hash.startsWith('/') && CALLBACK_PARAM.test(hash);
}

let authModule = null;

async function loadAuth() {
  if (!authModule) authModule = await import('./auth.js');
  return authModule;
}

/** The auth module if it has already been loaded, else null. Never loads it. */
export function loadedAuth() {
  return authModule;
}

export async function initAuth() {
  if (!hasOAuthCallback() && !localStorage.getItem(FLAG)) return null;
  const mod = await loadAuth();
  return mod.initAuth();
}

export async function login(handleOrDid) {
  const mod = await loadAuth();
  return mod.login(handleOrDid);
}

export async function logout() {
  const current = session;
  if (!current) return;
  try {
    await current.signOut(); // revokes the token at the PDS
  } catch (err) {
    console.warn('[auth] sign out failed', err);
  }
  _setSession(null);
}
