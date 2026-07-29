// Shared chrome: the header (logo, player search, auth control).

import { el, clear, toast, wordmark } from './ui.js';
import { getSession, login, logout, onAuthChange } from './session.js';
import { fetchProfile, searchActors } from './records.js';

function createSearch() {
  const input = el('input', {
    class: 'search__input',
    type: 'search',
    placeholder: 'Find a player…',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Find a player',
  });
  const results = el('div', { class: 'search__results', hidden: true });
  const wrap = el('div', { class: 'search' }, [input, results]);

  let timer;
  let seq = 0;

  function close() {
    results.hidden = true;
    clear(results);
  }

  function show(actors) {
    clear(results);
    if (!actors.length) {
      results.append(el('div', { class: 'search__empty', text: 'No one found' }));
    } else {
      for (const a of actors) {
        results.append(
          el('button', {
            class: 'search__hit',
            type: 'button',
            onclick: () => {
              input.value = '';
              close();
              location.hash = `#/u/${a.handle}`;
            },
          }, [
            a.avatar
              ? el('img', { class: 'search__avatar', src: a.avatar, alt: '' })
              : el('span', { class: 'search__avatar search__avatar--blank' }),
            el('span', { class: 'search__meta' }, [
              el('span', { class: 'search__name', text: a.displayName || a.handle }),
              el('span', { class: 'search__handle', text: `@${a.handle}` }),
            ]),
          ])
        );
      }
    }
    results.hidden = false;
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) return close();
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const actors = await searchActors(q);
        if (mine === seq) show(actors);
      } catch {
        if (mine === seq) close();
      }
    }, 180);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      close();
      input.blur();
    }
    if (e.key === 'Enter' && input.value.trim()) {
      const q = input.value.trim().replace(/^@/, '');
      input.value = '';
      close();
      location.hash = `#/u/${q}`;
    }
  });

  input.addEventListener('blur', () => setTimeout(close, 160));

  // Don't let arrow keys reach the board while typing.
  wrap.addEventListener('keydown', (e) => e.stopPropagation());

  return wrap;
}

function createAuthControl() {
  const slot = el('div', { class: 'auth' });

  function renderSignedOut() {
    const input = el('input', {
      class: 'auth__input',
      type: 'text',
      placeholder: 'you.bsky.social',
      autocomplete: 'username',
      spellcheck: 'false',
      'aria-label': 'Your Bluesky handle',
    });
    const button = el('button', { class: 'btn btn--sm', type: 'submit', text: 'Sign in' });

    const form = el('form', {
      class: 'auth__form',
      onsubmit: async (e) => {
        e.preventDefault();
        button.disabled = true;
        button.textContent = 'Redirecting…';
        try {
          await login(input.value);
        } catch (err) {
          toast(err.message || 'Sign in failed', 'error');
          button.disabled = false;
          button.textContent = 'Sign in';
        }
      },
    }, [input, button]);

    form.addEventListener('keydown', (e) => e.stopPropagation());
    clear(slot).append(form);
  }

  function renderSignedIn(session) {
    const avatar = el('span', { class: 'auth__avatar auth__avatar--blank' });
    const link = el('a', { class: 'auth__link', href: `#/u/${session.did}` }, [
      avatar,
      el('span', { text: 'My profile' }),
    ]);

    fetchProfile(session.did)
      .then((p) => {
        if (p.avatar) {
          const img = el('img', { class: 'auth__avatar', src: p.avatar, alt: '' });
          avatar.replaceWith(img);
        }
        if (p.handle) link.href = `#/u/${p.handle}`;
      })
      .catch(() => {});

    clear(slot).append(
      el('div', { class: 'auth__me' }, [
        link,
        el('button', {
          class: 'btn btn--ghost btn--sm',
          type: 'button',
          onclick: async () => {
            await logout();
            toast('Signed out');
          },
          text: 'Sign out',
        }),
      ])
    );
  }

  function paint(session) {
    if (session) renderSignedIn(session);
    else renderSignedOut();
  }

  paint(getSession());
  const off = onAuthChange(paint);
  slot._cleanup = off;
  return slot;
}

export function renderHeader() {
  const auth = createAuthControl();
  const header = el('header', { class: 'topbar' }, [
    el('a', { class: 'brand', href: '#/' }, wordmark()),
    el('div', { class: 'topbar__right' }, [createSearch(), auth]),
  ]);
  header._cleanup = () => auth._cleanup?.();
  return header;
}
