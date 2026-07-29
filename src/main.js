import './style.css';
import { initAuth } from './session.js';
import { renderHeader } from './shell.js';
import { renderGame } from './gameview.js';
import { renderProfile } from './profile.js';
import { openDataPanel } from './datapanel.js';
import { el, clear } from './ui.js';

const app = document.getElementById('app');

let current = null;

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [, section, param] = hash.split('/');
  if (section === 'u' && param) return { name: 'profile', param: decodeURIComponent(param) };
  return { name: 'game' };
}

function mount(route) {
  current?._cleanup?.();
  current = route.name === 'profile' ? renderProfile(route.param) : renderGame();

  const main = document.getElementById('main-slot');
  clear(main).append(current);

  if (route.name === 'game') document.title = '2040AT — 2048 on the AT Protocol';
  window.scrollTo(0, 0);
}

function renderFooter() {
  return el('footer', { class: 'footer' }, [
    el('p', { class: 'footer__line' }, [
      'Scores live in each player’s own repo as ',
      el('code', { text: 'app.vercel.twentyfortyat.game' }),
      ' records. No backend, no database, no indexer.',
    ]),
    el('button', {
      class: 'linkbtn',
      type: 'button',
      text: 'Your data',
      onclick: () => openDataPanel(),
    }),
  ]);
}

async function boot() {
  clear(app).append(
    renderHeader(),
    el('div', { id: 'main-slot' }),
    renderFooter()
  );

  // Restores a stored session and completes the OAuth redirect if we're
  // returning from a PDS. It may rewrite location.hash, so route after.
  await initAuth();

  mount(parseRoute());
  window.addEventListener('hashchange', () => mount(parseRoute()));
}

boot().catch((err) => {
  console.error(err);
  clear(app).append(
    el('div', { class: 'fatal' }, [
      el('h1', { text: 'It broke' }),
      el('pre', { text: String(err?.message || err) }),
    ])
  );
});
