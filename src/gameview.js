// Home screen: the board, the score boxes, and the post-score modal.

import { Game, SIZE } from './game.js';
import { el, clear, num, formatDuration, toast } from './ui.js';
import { getSession, login, onAuthChange } from './session.js';
import { postScore } from './records.js';
import { MAX_COMMENT } from './config.js';

const MOVE_MS = 110;

function tileClass(value) {
  return `tile tile--${value <= 2048 ? value : 'super'}`;
}

function createBoard() {
  const cells = el('div', { class: 'board__cells' });
  for (let i = 0; i < SIZE * SIZE; i++) cells.append(el('div', { class: 'board__cell' }));

  const tileLayer = el('div', { class: 'board__tiles' });
  const overlay = el('div', { class: 'board__overlay', hidden: true });
  const board = el('div', { class: 'board' }, [cells, tileLayer, overlay]);

  const nodes = new Map(); // tile id -> element

  // Inline transform rather than custom properties: transitions on a property
  // whose value comes from a var() are unreliable across browsers.
  function place(node, r, c) {
    node.style.transform = `translate(calc(${c} * var(--step)), calc(${r} * var(--step)))`;
  }

  function makeTile(tile) {
    return el('div', { class: tileClass(tile.value) }, [
      el('div', { class: 'tile__inner', text: String(tile.value) }),
    ]);
  }

  function render(state) {
    // Tiles consumed by a merge slide into the target cell, then get removed.
    for (const ghost of state.ghosts) {
      const node = nodes.get(ghost.id);
      if (!node) continue;
      nodes.delete(ghost.id);
      node.classList.add('tile--ghost');
      place(node, ghost.to.r, ghost.to.c);
      setTimeout(() => node.remove(), MOVE_MS + 40);
    }

    const alive = new Set();
    for (const tile of state.tiles) {
      alive.add(tile.id);
      let node = nodes.get(tile.id);
      if (!node) {
        node = makeTile(tile);
        nodes.set(tile.id, node);
        place(node, tile.prev?.r ?? tile.r, tile.prev?.c ?? tile.c);
        if (tile.isNew) node.classList.add('tile--new');
        if (tile.merged) node.classList.add('tile--merged');
        tileLayer.append(node);
        // Force layout so the initial position sticks before the transition.
        void node.offsetWidth;
      } else {
        const inner = node.firstChild;
        node.className = tileClass(tile.value);
        inner.textContent = String(tile.value);
      }
      place(node, tile.r, tile.c);
    }

    for (const [id, node] of nodes) {
      if (!alive.has(id)) {
        nodes.delete(id);
        node.remove();
      }
    }
  }

  function reset() {
    for (const node of nodes.values()) node.remove();
    nodes.clear();
  }

  function setOverlay(content) {
    if (!content) {
      overlay.hidden = true;
      clear(overlay);
      return;
    }
    clear(overlay).append(content);
    overlay.hidden = false;
  }

  return { board, render, reset, setOverlay };
}

function createPostModal(onPosted) {
  const scoreLine = el('div', { class: 'modal__score' });
  const statsLine = el('div', { class: 'modal__stats' });
  const comment = el('textarea', {
    class: 'modal__comment',
    rows: '2',
    maxlength: String(MAX_COMMENT),
    placeholder: 'Say something (optional)',
  });
  const counter = el('div', { class: 'modal__counter', text: `0/${MAX_COMMENT}` });
  const actions = el('div', { class: 'modal__actions' });
  const card = el('div', { class: 'modal__card' }, [
    el('h2', { class: 'modal__title', text: 'Game over' }),
    scoreLine,
    statsLine,
    el('div', { class: 'modal__field' }, [comment, counter]),
    actions,
  ]);
  const modal = el('div', { class: 'modal', hidden: true }, [
    el('div', { class: 'modal__scrim', onclick: () => hide() }),
    card,
  ]);

  comment.addEventListener('input', () => {
    counter.textContent = `${comment.value.length}/${MAX_COMMENT}`;
  });
  modal.addEventListener('keydown', (e) => e.stopPropagation());

  let result = null;
  let offAuth = null;

  function hide() {
    modal.hidden = true;
    offAuth?.();
    offAuth = null;
  }

  function paintActions() {
    clear(actions);
    const session = getSession();

    if (!session) {
      const input = el('input', {
        class: 'modal__handle',
        type: 'text',
        placeholder: 'you.bsky.social',
        spellcheck: 'false',
        autocomplete: 'username',
      });
      const go = el('button', { class: 'btn', type: 'submit', text: 'Sign in to post' });
      const form = el('form', {
        class: 'modal__login',
        onsubmit: async (e) => {
          e.preventDefault();
          go.disabled = true;
          go.textContent = 'Redirecting…';
          try {
            sessionStorage.setItem('2040at.pending', JSON.stringify({ ...result, comment: comment.value }));
            await login(input.value);
          } catch (err) {
            sessionStorage.removeItem('2040at.pending');
            toast(err.message || 'Sign in failed', 'error');
            go.disabled = false;
            go.textContent = 'Sign in to post';
          }
        },
      }, [input, go]);
      actions.append(
        el('p', { class: 'modal__hint', text: 'Sign in with Bluesky to write this score into your own repo.' }),
        form,
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'No thanks', onclick: hide })
      );
      return;
    }

    const post = el('button', { class: 'btn', type: 'button', text: 'Post to your profile' });
    post.addEventListener('click', async () => {
      post.disabled = true;
      post.textContent = 'Writing record…';
      try {
        await postScore({ ...result, comment: comment.value });
        toast('Score written to your repo');
        hide();
        onPosted?.();
      } catch (err) {
        console.error(err);
        toast(err.message || 'Could not post score', 'error');
        post.disabled = false;
        post.textContent = 'Post to your profile';
      }
    });

    actions.append(post, el('button', { class: 'btn btn--ghost', type: 'button', text: 'Skip', onclick: hide }));
  }

  function show(gameResult, { comment: prefill } = {}) {
    result = gameResult;
    scoreLine.textContent = num(gameResult.score);
    clear(statsLine).append(
      el('span', { text: `best tile ${num(gameResult.highestTile)}` }),
      el('span', { text: `${num(gameResult.moves)} moves` }),
      el('span', { text: formatDuration(gameResult.durationMs) })
    );
    if (prefill != null) comment.value = prefill;
    counter.textContent = `${comment.value.length}/${MAX_COMMENT}`;
    paintActions();
    offAuth?.();
    offAuth = onAuthChange(() => paintActions());
    modal.hidden = false;
    setTimeout(() => comment.focus(), 40);
  }

  return { modal, show, hide };
}

export function renderGame() {
  const scoreValue = el('div', { class: 'score__value', text: '0' });
  const bestValue = el('div', { class: 'score__value', text: '0' });
  const movesValue = el('div', { class: 'score__value', text: '0' });

  const { board, render, reset, setOverlay } = createBoard();

  const game = new Game({
    onChange: (state) => {
      render(state);
      scoreValue.textContent = num(state.score);
      bestValue.textContent = num(state.best);
      movesValue.textContent = num(state.moves);
      if (state.over) showOverlay('Game over', 'Try again');
      else if (state.won) showOverlay('2048!', 'Keep going', () => game.continuePlaying());
      else setOverlay(null);
    },
    onGameOver: (result) => {
      setTimeout(() => modalApi.show(result), 260);
    },
  });

  const modalApi = createPostModal();

  function showOverlay(title, buttonLabel, action) {
    setOverlay(
      el('div', { class: 'board__overlay-inner' }, [
        el('div', { class: 'board__overlay-title', text: title }),
        el('button', {
          class: 'btn',
          type: 'button',
          text: buttonLabel,
          onclick: () => {
            if (action) action();
            else newGame();
          },
        }),
      ])
    );
  }

  function newGame() {
    reset();
    setOverlay(null);
    modalApi.hide();
    game.restart();
  }

  // --- input ---------------------------------------------------------------

  const KEYS = {
    ArrowUp: 'up',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    w: 'up',
    d: 'right',
    s: 'down',
    a: 'left',
    k: 'up',
    l: 'right',
    j: 'down',
    h: 'left',
  };

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    if (target && /input|textarea|select/i.test(target.tagName)) return;
    const dir = KEYS[e.key] || KEYS[e.key?.toLowerCase?.()];
    if (!dir) return;
    e.preventDefault();
    game.move(dir);
  }

  let touchStart = null;
  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    game.move(
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    );
  }

  window.addEventListener('keydown', onKey);
  board.addEventListener('touchstart', onTouchStart, { passive: true });
  board.addEventListener('touchend', onTouchEnd, { passive: true });
  board.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // --- layout --------------------------------------------------------------

  const view = el('main', { class: 'view view--game' }, [
    el('section', { class: 'hero' }, [
      el('h1', { class: 'hero__title', text: '2040AT' }),
      el('p', { class: 'hero__sub' }, [
        'Join the tiles, get to ',
        el('b', { text: '2048' }),
        '. Your scores are written into ',
        el('b', { text: 'your own' }),
        ' Bluesky repo — no database here, just records on the AT Protocol.',
      ]),
    ]),
    el('div', { class: 'scorebar' }, [
      el('div', { class: 'score' }, [el('div', { class: 'score__label', text: 'Score' }), scoreValue]),
      el('div', { class: 'score' }, [el('div', { class: 'score__label', text: 'Best' }), bestValue]),
      el('div', { class: 'score' }, [el('div', { class: 'score__label', text: 'Moves' }), movesValue]),
      el('button', { class: 'btn btn--new', type: 'button', text: 'New game', onclick: newGame }),
    ]),
    board,
    el('p', { class: 'howto', text: 'Arrow keys, WASD, or swipe. Game over ends with a post-to-your-repo prompt.' }),
    modalApi.modal,
  ]);

  game.emit();

  // A score stashed before an OAuth redirect gets offered again on return.
  const pending = sessionStorage.getItem('2040at.pending');
  if (pending && getSession()) {
    sessionStorage.removeItem('2040at.pending');
    try {
      const saved = JSON.parse(pending);
      setTimeout(() => modalApi.show(saved, { comment: saved.comment || '' }), 300);
    } catch {
      /* ignore */
    }
  } else if (pending) {
    sessionStorage.removeItem('2040at.pending');
  }

  view._cleanup = () => {
    window.removeEventListener('keydown', onKey);
  };

  return view;
}
