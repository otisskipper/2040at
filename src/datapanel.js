// The "Your data" modal: local reset on top, repo deletion below, never mixed.

import { el, clear, num, toast } from './ui.js';
import { getSession, onAuthChange } from './session.js';
import { clearLocalData, countMyGames, deleteAllGames } from './data.js';

let panel = null;

function localSection() {
  const button = el('button', { class: 'btn btn--ghost', type: 'button', text: 'Clear local data' });
  let armed = false;

  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.textContent = 'Confirm — clear this browser';
      button.classList.add('btn--danger');
      setTimeout(() => {
        if (!armed) return;
        armed = false;
        button.textContent = 'Clear local data';
        button.classList.remove('btn--danger');
      }, 5000);
      return;
    }
    button.disabled = true;
    button.textContent = 'Clearing…';
    try {
      await clearLocalData();
      // Reload so every bit of in-memory state goes with it.
      location.replace(location.pathname);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not clear local data', 'error');
      button.disabled = false;
      button.textContent = 'Clear local data';
    }
  });

  return el('section', { class: 'panel__section' }, [
    el('h3', { class: 'panel__heading', text: 'On this device' }),
    el('p', { class: 'panel__body' }, [
      'Your best score, your sign-in session, and the OAuth client’s stored keys and tokens. ',
      'Signs you out and resets this browser to a cold state. ',
      el('b', { text: 'Nothing on the network changes' }),
      ' — your posted games stay in your repo.',
    ]),
    button,
  ]);
}

function repoSection() {
  const wrap = el('section', { class: 'panel__section panel__section--danger' });

  function paint(session) {
    clear(wrap).append(
      el('h3', { class: 'panel__heading', text: 'In your repo' }),
      el('p', { class: 'panel__body' }, [
        'Deletes every ',
        el('code', { text: 'app.vercel.twentyfortyat.game' }),
        ' record from your own repo. This is ',
        el('b', { text: 'permanent' }),
        ' — the records leave your PDS and the network. Only ever your repo; there is no way to touch anyone else’s.',
      ])
    );

    if (!session) {
      wrap.append(el('p', { class: 'panel__note', text: 'Sign in to manage your posted games.' }));
      return;
    }

    const status = el('p', { class: 'panel__note', text: 'Counting your games…' });
    const button = el('button', {
      class: 'btn btn--danger',
      type: 'button',
      text: 'Delete my games',
      disabled: true,
    });
    wrap.append(status, button);

    let total = null;
    let armed = false;

    countMyGames()
      .then((n) => {
        total = n;
        status.textContent = n
          ? `${num(n)} game${n === 1 ? '' : 's'} in your repo.`
          : 'No games in your repo yet.';
        button.disabled = n === 0;
      })
      .catch((err) => {
        status.textContent = err.message || 'Could not read your repo.';
      });

    button.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        button.textContent = `Confirm — permanently delete ${num(total)}`;
        setTimeout(() => {
          if (!armed) return;
          armed = false;
          button.textContent = 'Delete my games';
        }, 5000);
        return;
      }
      button.disabled = true;
      try {
        const deleted = await deleteAllGames((done, all) => {
          button.textContent = `Deleting ${num(done)}/${num(all)}…`;
        });
        status.textContent = 'No games in your repo yet.';
        button.textContent = 'Delete my games';
        armed = false;
        toast(`Deleted ${num(deleted)} game${deleted === 1 ? '' : 's'}`);
      } catch (err) {
        console.error(err);
        toast(err.message || 'Could not delete games', 'error');
        button.disabled = false;
        button.textContent = 'Delete my games';
        armed = false;
      }
    });
  }

  paint(getSession());
  wrap._off = onAuthChange(paint);
  return wrap;
}

export function openDataPanel() {
  if (panel) closeDataPanel();

  const repo = repoSection();
  const card = el('div', { class: 'modal__card modal__card--wide' }, [
    el('h2', { class: 'panel__title', text: 'Your data' }),
    localSection(),
    repo,
    el('button', { class: 'btn btn--ghost', type: 'button', text: 'Close', onclick: closeDataPanel }),
  ]);

  panel = el('div', { class: 'modal' }, [
    el('div', { class: 'modal__scrim', onclick: closeDataPanel }),
    card,
  ]);
  panel._off = () => repo._off?.();

  document.body.append(panel);
  document.addEventListener('keydown', onEsc);
}

function onEsc(e) {
  if (e.key === 'Escape') closeDataPanel();
}

export function closeDataPanel() {
  if (!panel) return;
  document.removeEventListener('keydown', onEsc);
  panel._off?.();
  panel.remove();
  panel = null;
}
