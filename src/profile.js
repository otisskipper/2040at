// #/u/<handle-or-did> — reads a player's games straight from their PDS.

import { el, clear, num, timeAgo, formatDuration } from './ui.js';
import { aggregate, fetchAllGames, fetchProfile, getPds, resolveHandle } from './records.js';
import { COLLECTION } from './config.js';

function statBox(label, value) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__value', text: value }),
    el('div', { class: 'stat__label', text: label }),
  ]);
}

function tileChip(value) {
  return el('span', {
    class: `chip chip--${value <= 2048 ? value : 'super'}`,
    text: num(value),
  });
}

function gameRow(record) {
  const g = record.value;
  const rkey = record.uri.split('/').pop();
  return el('li', { class: 'gamerow' }, [
    el('div', { class: 'gamerow__score' }, [
      el('span', { class: 'gamerow__points', text: num(g.score) }),
      tileChip(g.highestTile || 0),
    ]),
    el('div', { class: 'gamerow__body' }, [
      g.comment ? el('p', { class: 'gamerow__comment', text: g.comment }) : null,
      el('div', { class: 'gamerow__meta' }, [
        el('span', { text: timeAgo(g.createdAt) }),
        el('span', { text: `${num(g.moves || 0)} moves` }),
        el('span', { text: formatDuration(g.durationMs) }),
        el('span', { class: 'gamerow__rkey', title: record.uri, text: rkey }),
      ]),
    ]),
  ]);
}

export function renderProfile(handleParam) {
  const body = el('div', { class: 'profile__body' }, [
    el('p', { class: 'muted', text: 'Resolving identity…' }),
  ]);

  const head = el('div', { class: 'profile__head' });
  const view = el('main', { class: 'view view--profile' }, [
    el('a', { class: 'backlink', href: '#/', text: '← Back to the board' }),
    head,
    body,
  ]);

  let cancelled = false;
  view._cleanup = () => {
    cancelled = true;
  };

  (async () => {
    let did;
    try {
      did = await resolveHandle(handleParam);
    } catch {
      if (cancelled) return;
      clear(head);
      clear(body).append(
        el('div', { class: 'empty' }, [
          el('h2', { text: 'No such account' }),
          el('p', { class: 'muted', text: `Could not resolve “${handleParam}”.` }),
        ])
      );
      return;
    }
    if (cancelled) return;

    // Identity + PDS + records in parallel; the profile is decoration, the
    // records are the point.
    const profilePromise = fetchProfile(did).catch(() => null);
    const gamesPromise = getPds(did).then((pds) => fetchAllGames(did, { pds }));

    const profile = await profilePromise;
    if (cancelled) return;

    const handle = profile?.handle || (handleParam.startsWith('did:') ? did : handleParam);
    document.title = `${profile?.displayName || handle} — 2040AT`;

    clear(head).append(
      profile?.avatar
        ? el('img', { class: 'profile__avatar', src: profile.avatar, alt: '' })
        : el('div', { class: 'profile__avatar profile__avatar--blank' }),
      el('div', { class: 'profile__ident' }, [
        el('h1', { class: 'profile__name', text: profile?.displayName || handle }),
        el('a', {
          class: 'profile__handle',
          href: `https://bsky.app/profile/${handle}`,
          target: '_blank',
          rel: 'noreferrer',
          text: `@${handle}`,
        }),
        el('div', { class: 'profile__did', text: did }),
      ])
    );

    clear(body).append(el('p', { class: 'muted', text: 'Reading records from their PDS…' }));

    let games;
    try {
      games = await gamesPromise;
    } catch (err) {
      if (cancelled) return;
      clear(body).append(
        el('div', { class: 'empty' }, [
          el('h2', { text: 'Could not read their repo' }),
          el('p', { class: 'muted', text: err.message }),
        ])
      );
      return;
    }
    if (cancelled) return;

    if (!games.length) {
      clear(body).append(
        el('div', { class: 'empty' }, [
          el('h2', { text: 'No games yet' }),
          el('p', { class: 'muted', text: `Nothing in ${COLLECTION} for this repo.` }),
          el('p', {
            class: 'muted',
            text: 'Only they can put a score here — records are written into their own repo, by them.',
          }),
          el('a', { class: 'btn', href: '#/', text: 'Play your own game' }),
        ])
      );
      return;
    }

    const stats = aggregate(games);
    const list = el('ul', { class: 'gamelist' });
    for (const g of games) list.append(gameRow(g));

    clear(body).append(
      el('div', { class: 'stats' }, [
        statBox('Games', num(stats.games)),
        statBox('Best', num(stats.best)),
        statBox('Average', num(stats.avg)),
        statBox('Best tile', num(stats.bestTile)),
        statBox('Moves', num(stats.totalMoves)),
        statBox('Time played', formatDuration(stats.totalMs)),
      ]),
      el('h2', { class: 'section__title', text: `Games (${num(games.length)})` }),
      list
    );
  })();

  return view;
}
