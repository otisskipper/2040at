// Single source of truth for the production origin.
//
// If the Vercel URL ever changes, set VITE_SITE_URL at build time (or edit the
// fallback below) — client-metadata.json is generated from this value at build,
// so the client_id / client_uri / redirect_uris can never drift apart.
export const SITE_URL = (
  typeof __SITE_URL__ !== 'undefined' ? __SITE_URL__ : 'https://2040at.vercel.app'
).replace(/\/$/, '');

export const COLLECTION = 'app.vercel.twentyfortyat.game';

export const SCOPE = 'atproto transition:generic';

export const APP_VIEW = 'https://public.api.bsky.app';

export const MAX_COMMENT = 300;
