# 2040AT — Build & Deploy Doc

A joke 2048 clone on the AT Protocol. Scores are written as custom records into each player's existing Bluesky PDS. No backend, no database, no indexer — one static site on Vercel. Profile pages read directly from users' PDSes with public, unauthenticated calls.

**Special feature ("Dan mode"):** for exactly one hardcoded DID, any score above 2048 is silently replaced with a bad score and a sad auto-comment before it's written to his repo.

---

## 0. Architecture in one paragraph

The whole app is a Vite static site. Users log in with atproto OAuth (browser-only flow, no server). When a game ends, the app writes a `app.vercel.twentyfortyat.game` record into the logged-in user's repo via their PDS. Profile pages (`#/u/<handle>`) resolve handle → DID → PDS endpoint, then `listRecords` that user's games and compute aggregate stats client-side. Anyone can view any profile without logging in.

> **Why `twentyfortyat` and not `2040at`:** NSID segments can't start with a digit, so `app.vercel.2040at.*` is not a valid collection name. Nothing on the network validates domain ownership for a prototype anyway, so we just use a letter-leading spelling. Your Vercel URL can still be `2040at.vercel.app`.

---

## 1. Prerequisites

- Node 20+
- A Bluesky account (yours, for testing)
- A Vercel account (free tier)
- Nothing else. No Bluesky developer account, API key, or app registration exists or is needed.

---

## 2. Project setup

```bash
npm create vite@latest 2040at -- --template vanilla
cd 2040at
npm i @atproto/api @atproto/oauth-client-browser
```

File layout:

```
2040at/
  index.html
  public/
    client-metadata.json      # OAuth client identity (prod only)
  src/
    main.js                   # router: game view vs profile view
    game.js                   # 2048 board logic + game-over hook
    auth.js                   # OAuth client setup, session handling
    records.js                # postScore(), fetchGames(), resolve chain
    danmode.js                # the interceptor + 50 comments
    profile.js                # profile page rendering
  vercel.json                 # SPA rewrite (optional if using hash routing)
```

Use **hash routing** (`#/u/alice.bsky.social`) — zero Vercel config needed, no rewrites.

---

## 3. The record

Collection NSID: `app.vercel.twentyfortyat.game`

```json
{
  "$type": "app.vercel.twentyfortyat.game",
  "score": 11412,
  "highestTile": 1024,
  "moves": 803,
  "durationMs": 412000,
  "comment": "so close",
  "createdAt": "2026-07-29T18:00:00.000Z"
}
```

No formal lexicon publishing needed — PDSes store records for unknown collections without complaint. `comment` is optional, max ~300 chars enforced in the UI.

---

## 4. OAuth

### 4a. Local development (the easy loopback trick)

atproto OAuth has a special dev carve-out: on `http://127.0.0.1`, the client ID can be a synthetic `http://localhost` URL with the config embedded as query params — no hosted metadata file required.

```js
// src/auth.js
import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

const DEV = location.hostname === '127.0.0.1' || location.hostname === 'localhost';

const SCOPE = 'atproto transition:generic';

export const oauthClient = await BrowserOAuthClient.load({
  handleResolver: 'https://bsky.social',
  clientId: DEV
    ? `http://localhost?redirect_uri=${encodeURIComponent('http://127.0.0.1:5173/')}&scope=${encodeURIComponent(SCOPE)}`
    : 'https://2040at.vercel.app/client-metadata.json',
});
```

Run `npm run dev` and open **http://127.0.0.1:5173** (use the IP literally — `localhost` in the address bar can trip redirect matching; keep them consistent with whatever you put in `redirect_uri`).

Login + session restore:

```js
// call once at startup
export async function initAuth() {
  const result = await oauthClient.init(); // handles the redirect callback + restores sessions
  return result?.session ?? null;
}

export async function login(handle) {
  await oauthClient.signIn(handle, { scope: 'atproto transition:generic' });
  // ^ this navigates away to the PDS's auth page; you never reach the next line
}
```

### 4b. Production client metadata

`public/client-metadata.json` (its own URL is the client ID):

```json
{
  "client_id": "https://2040at.vercel.app/client-metadata.json",
  "client_name": "2040AT",
  "client_uri": "https://2040at.vercel.app",
  "redirect_uris": ["https://2040at.vercel.app/"],
  "scope": "atproto transition:generic",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "application_type": "web",
  "dpop_bound_access_tokens": true
}
```

If your Vercel project ends up at a different URL, update all three URLs here — they must match exactly.

---

## 5. The game

Any minimal 2048 implementation works; the only integration requirement is that `game.js` calls one function when a game ends:

```js
// game.js — at game over
onGameOver({ score, highestTile, moves, durationMs });
```

Options, laziest first:

1. Vibe-code a ~150-line vanilla implementation (4x4 grid, arrow keys + touch swipe, merge logic). It's the classic beginner exercise; keep board state as a flat 16-array.
2. Port the original open-source 2048 (MIT-licensed) and wire its game-over path to `onGameOver`.

The post-score modal appears at game over: shows the score, an optional comment input, and a "Post to your profile" button (only if logged in; otherwise show a login prompt).

---

## 6. Posting scores — with the Dan interceptor

```js
// src/records.js
import { Agent } from '@atproto/api';
import { maybeDanify } from './danmode.js';

export const COLLECTION = 'app.vercel.twentyfortyat.game';

export async function postScore(session, { score, highestTile, moves, durationMs, comment }) {
  const agent = new Agent(session);

  // ---- the whole joke happens on this line ----
  const final = maybeDanify(agent.did, { score, highestTile, moves, durationMs, comment });

  await agent.com.atproto.repo.createRecord({
    repo: agent.did,
    collection: COLLECTION,
    record: {
      $type: COLLECTION,
      ...final,
      createdAt: new Date().toISOString(),
    },
  });
}
```

```js
// src/danmode.js

// Resolve Dan's handle to his DID once (DIDs are stable; handles can change):
//   https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<dan's handle>
// then paste the did:plc:... here.
const DAN_DIDS = new Set([
  'did:plc:PASTE_DANS_DID_HERE',
]);

const THRESHOLD = 2048;

export function maybeDanify(did, game) {
  if (!DAN_DIDS.has(did)) return game;
  if (game.score <= THRESHOLD) return game;

  const fakeScore = 4 + Math.floor(Math.random() * 380);      // pathetic
  const fakeTile = [16, 32, 64][Math.floor(Math.random() * 3)]; // extra pathetic
  return {
    ...game,
    score: fakeScore,
    highestTile: fakeTile,
    comment: DAN_COMMENTS[Math.floor(Math.random() * DAN_COMMENTS.length)],
  };
}

export const DAN_COMMENTS = [
  'Oh drat',
  'Better luck next time',
  'So close, yet so far',
  'The tiles just weren\u2019t cooperating today',
  'I blame the keyboard',
  'Rough one out there',
  'Not my finest hour',
  'The 4s kept spawning in the worst spots',
  'Whiffed it',
  'Practice makes perfect, they say',
  'Back to the drawing board',
  'That one stung',
  'I peaked at 32 and it was all downhill',
  'Merging is harder than it looks',
  'A humbling experience',
  'The board had other plans',
  'I choked',
  'Skill issue, honestly',
  'My cat walked on the keyboard, I swear',
  'Warming up. Definitely just warming up',
  'The RNG has a personal vendetta against me',
  'Tough scene',
  'Should have gone left',
  'Should have gone right',
  'I panicked',
  'Numbers are hard',
  'Tomorrow is a new day',
  'Well, that happened',
  'This game is rigged (it is not, I am just bad)',
  'Cornered myself again',
  'A tragedy in sixteen tiles',
  'I refuse to elaborate',
  'Ran out of board',
  'Truly a performance for the ages',
  'They can\u2019t all be winners',
  'Deleting this game (I will not)',
  'My decentralized identity, my centralized shame',
  'That was a warm-up lap',
  'Somewhere, a 2 is laughing at me',
  'It counts as cardio, right?',
  'I have brought dishonor to my repo',
  'Filed under: character development',
  'The protocol worked perfectly. I did not',
  'At least the record federated',
  'New personal worst, proud of the consistency',
  'I meant to do that',
  'Two steps forward, sixteen tiles back',
  'Ok, one more game',
  'Ok, one more game (again)',
  'Ok, one more game (final) (for real this time)',
];
```

Notes on the bit:

- Keying on **DID** (not handle) means it survives him changing his handle.
- It's all client-side and the site is public, so he can find it in about 45 seconds by opening devtools — which is arguably the correct lifespan for this joke. He can also `createRecord` a real score with curl, but he built the thing, so that's his prerogative.
- Everyone else's scores post untouched.

---

## 7. Profile page

Route: `#/u/<handle>`. Three public calls, no auth:

```js
// src/records.js (continued)

export async function resolveHandle(handle) {
  const r = await fetch(
    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!r.ok) throw new Error('handle not found');
  return (await r.json()).did;
}

export async function getPds(did) {
  // did:plc covers ~everyone; skip did:web for the prototype
  const doc = await (await fetch(`https://plc.directory/${did}`)).json();
  return doc.service.find((s) => s.id === '#atproto_pds').serviceEndpoint;
}

export async function fetchAllGames(did) {
  const pds = await getPds(did);
  const games = [];
  let cursor;
  do {
    const url = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', COLLECTION);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const page = await (await fetch(url)).json();
    games.push(...page.records);
    cursor = page.cursor;
  } while (cursor);
  return games; // newest first by default
}

export async function fetchProfile(did) {
  // display name + avatar, also public
  const r = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${did}`
  );
  return r.json();
}
```

Aggregates (computed client-side from the fetched array):

```js
export function aggregate(games) {
  const scores = games.map((g) => g.value.score);
  return {
    games: games.length,
    best: Math.max(0, ...scores),
    avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    bestTile: Math.max(0, ...games.map((g) => g.value.highestTile)),
    totalMoves: games.reduce((a, g) => a + (g.value.moves || 0), 0),
  };
}
```

Page layout: avatar + display name + handle at top, stat row (games / best / avg / best tile), then a scrollable list of games — score, tile, relative date, comment if present. Style it like the 2048 tile palette for maximum bit commitment.

**Search box:** on the home page, a typeahead using another public endpoint:

```js
const r = await fetch(
  `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=8`
);
const { actors } = await r.json(); // [{handle, displayName, avatar}, ...]
// clicking one navigates to `#/u/${handle}`
```

Someone who's never played just shows "No games yet."

---

## 8. Deploy to Vercel

```bash
npm i -g vercel   # or use the dashboard/git integration
vercel            # link project; name it 2040at
vercel --prod
```

Or: push to GitHub → import in Vercel dashboard → framework preset "Vite" → deploy. Defaults are correct (build `vite build`, output `dist/`).

Post-deploy checklist:

1. Confirm the final URL. If it's not exactly `https://2040at.vercel.app`, edit `client-metadata.json` (all three URLs) and the prod `clientId` in `auth.js`, redeploy.
2. Open `https://<your-url>/client-metadata.json` in a browser — must return the JSON, not the SPA.
3. Log in with your own account, play a game, post a score.
4. Verify the record landed: open
   `https://<your-pds>/xrpc/com.atproto.repo.listRecords?repo=<your-did>&collection=app.vercel.twentyfortyat.game`
   (or just load your own profile page).
5. Paste Dan's real DID into `danmode.js`, redeploy, wait.

---

## 9. Gotchas

- **OAuth redirect mismatch** is the #1 time sink: `client_id`, `redirect_uris`, and the URL you're actually on must agree exactly (scheme, host, trailing slash). Dev uses `127.0.0.1`, prod uses the vercel.app URL, and the two configs never mix.
- **Sessions expire.** `oauthClient.init()` restores/refreshes on load; if `postScore` throws an auth error, send the user back through `login()`.
- **listRecords is per-PDS public data** — no rate-limit headaches at prototype scale, but fetch pages lazily if someone racks up thousands of games.
- **Records are public and user-writable.** Anyone can curl in a fake score. This is the honor system you signed up for.
- **Don't rename the Vercel project after launch** — it breaks the OAuth client URL. (Old records keep working regardless; they're just strings in repos.)