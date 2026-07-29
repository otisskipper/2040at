// Single source of truth for the production origin.
//
// If the Vercel URL ever changes, set VITE_SITE_URL at build time (or edit the
// fallback below) — client-metadata.json is generated from this value at build,
// so the client_id / client_uri / redirect_uris can never drift apart.
export const SITE_URL = (
  typeof __SITE_URL__ !== 'undefined' ? __SITE_URL__ : 'https://2040at.vercel.app'
).replace(/\/$/, '');

export const COLLECTION = 'app.vercel.twentyfortyat.game';

/**
 * The bare minimum this app can function on.
 *
 * `atproto` is mandatory for any session and grants identity (the DID) only.
 * The repo permission is scoped to our single collection and to the two actions
 * we actually perform: createRecord when posting a score, and deleteRecord /
 * applyWrites when clearing them. No `update`, no blob upload, no rpc.
 *
 * This replaces `transition:generic`, which is the deprecated legacy scope and
 * grants write access to *every* record type in the user's repo plus blob
 * uploads and preferences — wildly more than a score-poster needs.
 *
 * Derived from COLLECTION so the two can never drift apart. The same string is
 * baked into client-metadata.json at build time; authorization servers reject
 * any scope the client metadata doesn't declare.
 */
export const SCOPE = `atproto repo:${COLLECTION}?action=create&action=delete`;

export const APP_VIEW = 'https://public.api.bsky.app';

export const MAX_COMMENT = 300;
