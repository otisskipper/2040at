// 2048 board logic. No DOM in here — the view subscribes to onChange and the
// app subscribes to onGameOver.

export const SIZE = 4;
export const WIN_TILE = 2048;

const VECTORS = {
  up: { r: -1, c: 0 },
  right: { r: 0, c: 1 },
  down: { r: 1, c: 0 },
  left: { r: 0, c: -1 },
};

const BEST_KEY = '2040at.best';

let nextId = 1;

function readBest() {
  const raw = Number(localStorage.getItem(BEST_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export class Game {
  constructor({ onChange = () => {}, onGameOver = () => {} } = {}) {
    this.onChange = onChange;
    this.onGameOver = onGameOver;
    this.best = readBest();
    this.restart();
  }

  restart() {
    this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    this.score = 0;
    this.moves = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.ghosts = [];
    this.addRandomTile();
    this.addRandomTile();
    this.emit();
  }

  // --- board helpers -------------------------------------------------------

  cellsAvailable() {
    const out = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (!this.grid[r][c]) out.push({ r, c });
    return out;
  }

  addRandomTile() {
    const free = this.cellsAvailable();
    if (!free.length) return;
    const { r, c } = free[Math.floor(Math.random() * free.length)];
    this.grid[r][c] = {
      id: nextId++,
      value: Math.random() < 0.9 ? 2 : 4,
      r,
      c,
      prev: null,
      isNew: true,
      merged: false,
    };
  }

  eachTile(fn) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (this.grid[r][c]) fn(this.grid[r][c], r, c);
  }

  highestTile() {
    let max = 0;
    this.eachTile((t) => {
      if (t.value > max) max = t.value;
    });
    return max;
  }

  withinBounds({ r, c }) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  findFarthest(pos, vector) {
    let previous;
    let cell = pos;
    do {
      previous = cell;
      cell = { r: previous.r + vector.r, c: previous.c + vector.c };
    } while (this.withinBounds(cell) && !this.grid[cell.r][cell.c]);
    return { farthest: previous, next: this.withinBounds(cell) ? cell : null };
  }

  movesAvailable() {
    if (this.cellsAvailable().length) return true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = this.grid[r][c];
        if (!tile) continue;
        for (const v of Object.values(VECTORS)) {
          const other = this.grid[r + v.r]?.[c + v.c];
          if (other && other.value === tile.value) return true;
        }
      }
    }
    return false;
  }

  // --- the move ------------------------------------------------------------

  move(direction) {
    if (this.over) return false;
    const vector = VECTORS[direction];
    if (!vector) return false;

    const order = { rows: [0, 1, 2, 3], cols: [0, 1, 2, 3] };
    if (vector.r === 1) order.rows = [3, 2, 1, 0];
    if (vector.c === 1) order.cols = [3, 2, 1, 0];

    this.ghosts = [];
    this.eachTile((t) => {
      t.prev = { r: t.r, c: t.c };
      t.isNew = false;
      t.merged = false;
      t.lockedThisMove = false;
    });

    let moved = false;

    for (const r of order.rows) {
      for (const c of order.cols) {
        const tile = this.grid[r][c];
        if (!tile) continue;

        const { farthest, next } = this.findFarthest({ r, c }, vector);
        const target = next ? this.grid[next.r][next.c] : null;

        if (target && target.value === tile.value && !target.lockedThisMove) {
          // Merge: both source tiles slide into `next` and are replaced.
          const merged = {
            id: nextId++,
            value: tile.value * 2,
            r: next.r,
            c: next.c,
            prev: null,
            isNew: false,
            merged: true,
            lockedThisMove: true,
          };
          this.ghosts.push(
            { id: tile.id, value: tile.value, to: { r: next.r, c: next.c } },
            { id: target.id, value: target.value, to: { r: next.r, c: next.c } }
          );
          this.grid[r][c] = null;
          this.grid[next.r][next.c] = merged;
          this.score += merged.value;
          if (merged.value >= WIN_TILE) this.won = true;
          moved = true;
        } else if (farthest.r !== r || farthest.c !== c) {
          this.grid[r][c] = null;
          tile.r = farthest.r;
          tile.c = farthest.c;
          this.grid[farthest.r][farthest.c] = tile;
          moved = true;
        }
      }
    }

    if (!moved) return false;

    this.moves += 1;
    this.addRandomTile();

    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(BEST_KEY, String(this.best));
    }

    if (!this.movesAvailable()) {
      this.over = true;
      this.endedAt = Date.now();
    }

    this.emit();

    if (this.over) this.onGameOver(this.result());
    return true;
  }

  // --- output --------------------------------------------------------------

  result() {
    return {
      score: this.score,
      highestTile: this.highestTile(),
      moves: this.moves,
      durationMs: Math.max(0, (this.endedAt || Date.now()) - this.startedAt),
    };
  }

  snapshot() {
    const tiles = [];
    this.eachTile((t) => tiles.push(t));
    return {
      tiles,
      ghosts: this.ghosts,
      score: this.score,
      best: this.best,
      moves: this.moves,
      over: this.over,
      won: this.won && !this.keepPlaying,
    };
  }

  emit() {
    this.onChange(this.snapshot());
  }

  continuePlaying() {
    this.keepPlaying = true;
    this.emit();
  }
}
