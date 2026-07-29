// "Clear all data" — two very different things, kept apart on purpose.
//
//   clearLocalData()  wipes this browser only. Nothing leaves the machine.
//   deleteAllGames()  deletes records from your own repo. Irreversible.

import { COLLECTION } from './config.js';
import { clearSession, getAgent, isAuthError, loadedAuth, logout } from './session.js';
import { fetchAllGames } from './records.js';

// The OAuth client's own storage, from @atproto/oauth-client-browser.
const OAUTH_LS_PREFIX = '@@atproto/oauth-client-browser';
const OAUTH_DB = '@atproto-oauth-client';

function deleteDatabase(name) {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.deleteDatabase(name);
    } catch {
      return resolve(false);
    }
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    // Another tab still holds the database open. The delete stays queued and
    // completes when that tab closes; don't hang the UI waiting for it.
    req.onblocked = () => resolve(false);
  });
}

/**
 * Reset this browser to a cold state: best score, session, and the OAuth
 * client's keys and tokens. Revokes the session at the PDS first when possible.
 */
export async function clearLocalData() {
  try {
    await logout(); // best-effort token revocation
  } catch (err) {
    console.warn('[data] sign out failed, clearing locally anyway', err);
  }
  clearSession();

  // Close the IndexedDB connection this tab is holding, or the delete blocks.
  await loadedAuth()?.disposeClient?.();

  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('2040at.') || key.startsWith(OAUTH_LS_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
  sessionStorage.removeItem('2040at.pending');

  const dbCleared = await deleteDatabase(OAUTH_DB);
  return { dbCleared };
}

/** How many games are in the signed-in user's repo. */
export async function countMyGames() {
  const agent = await getAgent();
  if (!agent) throw new Error('Not signed in');
  const games = await fetchAllGames(agent.did);
  return games.length;
}

/**
 * Delete every game record from the signed-in user's own repo. Only ever
 * touches `agent.did` — there is no way to write to anyone else's repo.
 */
export async function deleteAllGames(onProgress) {
  const agent = await getAgent();
  if (!agent) throw new Error('Not signed in');
  const did = agent.did;

  const games = await fetchAllGames(did);
  const rkeys = games.map((g) => g.uri.split('/').pop()).filter(Boolean);
  if (!rkeys.length) return 0;

  let deleted = 0;
  const report = () => onProgress?.(deleted, rkeys.length);

  // applyWrites batches up to 200 deletes per request; fall back to one-by-one
  // if a PDS doesn't take it.
  const CHUNK = 200;
  let useBatch = true;

  for (let i = 0; i < rkeys.length; i += CHUNK) {
    const chunk = rkeys.slice(i, i + CHUNK);

    if (useBatch) {
      try {
        await agent.com.atproto.repo.applyWrites({
          repo: did,
          writes: chunk.map((rkey) => ({
            $type: 'com.atproto.repo.applyWrites#delete',
            collection: COLLECTION,
            rkey,
          })),
        });
        deleted += chunk.length;
        report();
        continue;
      } catch (err) {
        // Always fall back rather than interpreting this failure. A batch
        // rejected on scope grounds looks like an auth error, and treating it
        // as one would sign the user out mid-delete. If the session really is
        // dead, the per-record path below says so properly.
        console.warn('[data] applyWrites failed, falling back to deleteRecord', err);
        useBatch = false;
      }
    }

    for (const rkey of chunk) {
      try {
        await agent.com.atproto.repo.deleteRecord({ repo: did, collection: COLLECTION, rkey });
      } catch (err) {
        if (isAuthError(err)) {
          clearSession();
          throw new Error('Your session expired. Sign in again to delete these.');
        }
        throw err;
      }
      deleted++;
      report();
    }
  }

  return deleted;
}
