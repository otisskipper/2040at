import { APP_VIEW, COLLECTION, MAX_COMMENT } from './config.js';
import { maybeDanify } from './danmode.js';
import { clearSession, getAgent, isAuthError } from './session.js';

export { COLLECTION };

async function getJson(url, label) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) {
    let detail = '';
    try {
      const body = await r.json();
      detail = body.message || body.error || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `${label} failed (${r.status})`);
  }
  return r.json();
}

/** Write a game record into the logged-in user's own repo. */
export async function postScore({ score, highestTile, moves, durationMs, comment }) {
  const agent = await getAgent();
  if (!agent) throw new Error('Not signed in');

  const clean = (comment || '').trim().slice(0, MAX_COMMENT);

  // ---- the whole joke happens on this line ----
  const final = maybeDanify(agent.did, {
    score,
    highestTile,
    moves,
    durationMs,
    ...(clean ? { comment: clean } : {}),
  });

  let res;
  try {
    res = await agent.com.atproto.repo.createRecord({
      repo: agent.did,
      collection: COLLECTION,
      record: {
        $type: COLLECTION,
        ...final,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    if (isAuthError(err)) {
      // Session died out from under us — drop it so the UI offers sign-in again.
      clearSession();
      throw new Error('Your session expired. Sign in again to post this score.');
    }
    throw err;
  }

  return res.data; // { uri, cid }
}

/** handle (or DID) -> DID */
export async function resolveHandle(handleOrDid) {
  const value = String(handleOrDid || '').trim().replace(/^@/, '');
  if (value.startsWith('did:')) return value;
  const data = await getJson(
    `${APP_VIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(value)}`,
    'Handle lookup'
  );
  return data.did;
}

/** DID -> that user's PDS endpoint. */
export async function getPds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    doc = await getJson(`https://plc.directory/${encodeURIComponent(did)}`, 'DID lookup');
  } else if (did.startsWith('did:web:')) {
    const host = decodeURIComponent(did.slice('did:web:'.length)).replace(/:/g, '/');
    doc = await getJson(`https://${host}/.well-known/did.json`, 'DID lookup');
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }
  const svc = (doc.service || []).find(
    (s) => s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`
  );
  if (!svc?.serviceEndpoint) throw new Error('No PDS found for this account');
  return String(svc.serviceEndpoint).replace(/\/$/, '');
}

/**
 * Every game record in a repo, newest first. Paginated; capped so one absurd
 * repo can't hang the page.
 */
export async function fetchAllGames(did, { pds, maxPages = 20 } = {}) {
  const endpoint = pds || (await getPds(did));
  const games = [];
  let cursor;
  let pages = 0;

  do {
    const url = new URL(`${endpoint}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', COLLECTION);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    let page;
    try {
      page = await getJson(url, 'Reading games');
    } catch (err) {
      // An empty collection 400s on some PDS implementations. Treat as "no games".
      if (!games.length && /could not|not found|invalid/i.test(err.message)) return [];
      throw err;
    }

    games.push(...(page.records || []));
    cursor = page.cursor;
  } while (cursor && ++pages < maxPages);

  return games.filter((g) => typeof g?.value?.score === 'number');
}

export async function fetchProfile(didOrHandle) {
  return getJson(
    `${APP_VIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(didOrHandle)}`,
    'Profile lookup'
  );
}

export async function searchActors(q, limit = 8) {
  if (!q.trim()) return [];
  const data = await getJson(
    `${APP_VIEW}/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(
      q.trim()
    )}&limit=${limit}`,
    'Search'
  );
  return data.actors || [];
}

export function aggregate(games) {
  const scores = games.map((g) => g.value.score || 0);
  return {
    games: games.length,
    best: scores.length ? Math.max(...scores) : 0,
    avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    bestTile: games.length ? Math.max(0, ...games.map((g) => g.value.highestTile || 0)) : 0,
    totalMoves: games.reduce((a, g) => a + (g.value.moves || 0), 0),
    totalMs: games.reduce((a, g) => a + (g.value.durationMs || 0), 0),
  };
}
