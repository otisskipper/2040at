# 2040AT

A joke 2048 clone on the AT Protocol. Scores are written as custom records into each
player's own Bluesky PDS. No backend, no database, no indexer — one static site.
Profile pages read straight from users' PDSes with public, unauthenticated calls.

Record collection: `app.vercel.twentyfortyat.game`
(NSID segments can't start with a digit, hence `twentyfortyat` and not `2040at`.)

## Run it

```bash
pnpm install
pnpm dev
```

Then open **http://127.0.0.1:5173** — the IP literally. atproto OAuth requires
loopback IP redirect URIs; the SDK will bounce you off `localhost` automatically,
but going straight to the IP avoids a redirect.

No API key, no app registration, no Bluesky developer account. On loopback the OAuth
client ID is a synthetic `http://localhost?redirect_uri=…` URL with the config inlined,
so there's nothing to host in dev.

## Layout

```
src/
  main.js       hash router (#/ = game, #/u/<handle> = profile)
  game.js       2048 logic, DOM-free, calls onGameOver({score, highestTile, moves, durationMs})
  gameview.js   board rendering + the post-score modal
  session.js    light session facade — lazily loads the heavy atproto SDK
  auth.js       the actual BrowserOAuthClient (code-split; only loaded when signing in)
  records.js    postScore(), fetchAllGames(), resolve chain, aggregates
  profile.js    profile page
  danmode.js    the interceptor
  shell.js      header, player search, auth control
  data.js       clearLocalData() and deleteAllGames()
  datapanel.js  the "Your data" modal
  config.js     SITE_URL, collection NSID, scope
```

## Clearing data

Footer → **Your data**. Two separate actions:

- **On this device** — best score, session, and the OAuth client's IndexedDB keys and
  tokens. Revokes the session at the PDS, then reloads. Nothing on the network changes.
- **In your repo** — deletes every game record from your own repo via `applyWrites`
  (batches of 200, falling back to `deleteRecord`). Permanent. Shows the count first and
  needs a second confirming click. Only ever writes to `agent.did`.

`/client-metadata.json` is **generated** by a plugin in `vite.config.js` from a single
`SITE_URL` value — emitted into `dist/` at build, served by middleware in dev — so
`client_id`, `client_uri`, and `redirect_uris` can't drift apart. There is no checked-in
copy to forget to update.

## Bundle

The entry chunk is ~24 kB (9 kB gzip). `@atproto/api` (~611 kB) and the OAuth client
(~260 kB) are dynamic imports — they load only when someone actually signs in or posts.
Anonymous visitors and profile links never download them.

## Deploy

Push to GitHub, import in Vercel, framework preset **Vite**. Defaults are correct
(`vite build` → `dist/`).

If the deployed URL is not `https://2040at.vercel.app`, set the env var
`VITE_SITE_URL=https://<your-url>` in the Vercel project — that's the only place the
URL lives. Alternatively `VERCEL_PROJECT_PRODUCTION_URL` is picked up automatically.

Post-deploy checklist:

1. Open `https://<your-url>/client-metadata.json` — it must return JSON with URLs that
   match the site exactly, not the SPA.
2. Sign in, play, post a score.
3. Verify the record landed:
   `https://<your-pds>/xrpc/com.atproto.repo.listRecords?repo=<your-did>&collection=app.vercel.twentyfortyat.game`
4. Don't rename the Vercel project after launch — it breaks the OAuth client URL.

## Notes

- Records are public and user-writable. Anyone can `createRecord` a fake score with
  curl. Honor system, by design.
- Sessions are restored/refreshed on load. If a post fails with an auth error, sign in
  again.
- `listRecords` is paginated and capped at 20 pages per profile.
