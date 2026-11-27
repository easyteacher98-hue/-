/*
 * 1인용 스도쿠 – 게임 엔진 (공용, UMD)
 * - 4×4(저학년) · 6×6(중학년) · 9×9(고학년)
 * - 해답이 하나뿐인 퍼즐을 매번 새로 만들어 줍니다. (무작위 + 유일 해답 검사)
 * - 메모(작은 숫자), 힌트, 오답 표시를 지원합니다.
 * - 서버·브라우저가 같은 규칙 코드를 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sudoku = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIZES = [4, 6, 9];
  const BOX = { 4: { h: 2, w: 2 }, 6: { h: 2, w: 3 }, 9: { h: 3, w: 3 } };
  const REMOVE_TARGET = { 4: 9, 6: 20, 9: 45 };
  const SCORE_BASE = { 4: 600, 6: 1200, 9: 2400 };

  function makeRng(seed) {
    let s = (Number(seed) || 1) >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    const rand = rng || Math.random;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function emptyGrid(size) {
    const grid = [];
    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) row.push(0);
      grid.push(row);
    }
    return grid;
  }

  function cloneGrid(grid) {
    return grid.map(function (row) { return row.slice(); });
  }

  function boxIndex(size, x, y) {
    const box = BOX[size];
    return Math.floor(y / box.h) * (size / box.w) + Math.floor(x / box.w);
  }

  function candidates(grid, size, x, y) {
    const used = {};
    for (let i = 0; i < size; i++) {
      if (grid[y][i]) used[grid[y][i]] = true;
      if (grid[i][x]) used[grid[i][x]] = true;
    }
    const box = BOX[size];
    const bx = Math.floor(x / box.w) * box.w;
    const by = Math.floor(y / box.h) * box.h;
    for (let yy = by; yy < by + box.h; yy++) {
      for (let xx = bx; xx < bx + box.w; xx++) {
        if (grid[yy][xx]) used[grid[yy][xx]] = true;
      }
    }
    const out = [];
    for (let v = 1; v <= size; v++) if (!used[v]) out.push(v);
    return out;
  }

  function findBestEmpty(grid, size) {
    let best = null;
    let bestCount = Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid[y][x]) continue;
        const list = candidates(grid, size, x, y);
        if (list.length < bestCount) {
          bestCount = list.length;
          best = { x: x, y: y, list: list };
          if (bestCount <= 1) return best;
        }
      }
    }
    return best;
  }

  /** 해의 개수를 limit 까지만 셉니다. (유일 해답 검사용) */
  function countSolutions(grid, size, limit, rng) {
    const cap = limit || 2;
    let found = 0;
    const work = cloneGrid(grid);

    function search() {
      if (found >= cap) return;
      const empty = findBestEmpty(work, size);
      if (!empty) {
        found += 1;
        return;
      }
      const list = rng ? shuffle(empty.list.slice(), rng) : empty.list;
      for (let i = 0; i < list.length; i++) {
        work[empty.y][empty.x] = list[i];
        search();
        work[empty.y][empty.x] = 0;
        if (found >= cap) return;
      }
    }
    search();
    return found;
  }

  function solve(grid, size) {
    const work = cloneGrid(grid);
    function search() {
      const empty = findBestEmpty(work, size);
      if (!empty) return true;
      for (let i = 0; i < empty.list.length; i++) {
        work[empty.y][empty.x] = empty.list[i];
        if (search()) return true;
        work[empty.y][empty.x] = 0;
      }
      return false;
    }
    return search() ? work : null;
  }

  function generateSolution(size, rng) {
    const grid = emptyGrid(size);
    const rand = rng || Math.random;
    function fill() {
      const empty = findBestEmpty(grid, size);
      if (!empty) return true;
      const list = shuffle(empty.list.slice(), rand);
      for (let i = 0; i < list.length; i++) {
        grid[empty.y][empty.x] = list[i];
        if (fill()) return true;
        grid[empty.y][empty.x] = 0;
      }
      return false;
    }
    fill();
    return grid;
  }

  /** 해답이 하나뿐인 퍼즐을 만듭니다. */
  function generatePuzzle(size, options) {
    const opts = options || {};
    const rng = makeRng(opts.seed || Math.floor(Math.random() * 1e9));
    let solution = generateSolution(size, rng);
    let guard = 0;
    while (!solution && guard < 5) {
      solution = generateSolution(size, rng);
      guard += 1;
    }
    if (!solution) throw new Error('스도쿠 해답을 만들 수 없습니다.');
    const puzzle = cloneGrid(solution);
    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) cells.push({ x: x, y: y });
    }
    shuffle(cells, rng);
    const target = Math.min(opts.blank || REMOVE_TARGET[size] || 20, Math.max(0, size * size - 4));
    let removed = 0;
    for (let i = 0; i < cells.length && removed < target; i++) {
      const cell = cells[i];
      const backup = puzzle[cell.y][cell.x];
      puzzle[cell.y][cell.x] = 0;
      if (countSolutions(puzzle, size, 2) === 1) {
        removed += 1;
      } else {
        puzzle[cell.y][cell.x] = backup;
      }
    }
    return { size: size, puzzle: puzzle, solution: solution, blanks: removed };
  }

  /** 같은 줄·같은 박스에서 겹치는 칸을 찾습니다. */
  function conflicts(grid, size) {
    const marks = {};
    function mark(x, y) { marks[x + ',' + y] = true; }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = grid[y][x];
        if (!v) continue;
        for (let i = 0; i < size; i++) {
          if (i !== x && grid[y][i] === v) { mark(x, y); mark(i, y); }
          if (i !== y && grid[i][x] === v) { mark(x, y); mark(x, i); }
        }
      }
    }
    const box = BOX[size];
    for (let by = 0; by < size; by += box.h) {
      for (let bx = 0; bx < size; bx += box.w) {
        for (let y = by; y < by + box.h; y++) {
          for (let x = bx; x < bx + box.w; x++) {
            const v = grid[y][x];
            if (!v) continue;
            for (let yy = by; yy < by + box.h; yy++) {
              for (let xx = bx; xx < bx + box.w; xx++) {
                if ((xx !== x || yy !== y) && grid[yy][xx] === v) { mark(x, y); mark(xx, yy); }
              }
            }
          }
        }
      }
    }
    return Object.keys(marks).map(function (key) {
      const parts = key.split(',');
      return { x: Number(parts[0]), y: Number(parts[1]) };
    });
  }

  function scoreFor(size, seconds, hintsUsed, mistakes) {
    const base = SCORE_BASE[size] || 600;
    const value = base - Math.round(seconds || 0) - (hintsUsed || 0) * 60 - (mistakes || 0) * 15;
    return Math.max(10, Math.round(value));
  }

  function Game(size, options) {
    const opts = options || {};
    this.size = SIZES.indexOf(Number(size)) !== -1 ? Number(size) : 4;
    const made = generatePuzzle(this.size, opts);
    this.puzzle = made.puzzle;
    this.solution = made.solution;
    this.grid = cloneGrid(made.puzzle);
    this.blanks = made.blanks;
    this.notes = emptyGrid(this.size).map(function (row) {
      return row.map(function () { return []; });
    });
    this.hintsUsed = 0;
    this.mistakes = 0;
    this.status = 'playing';
    this.startedAt = Date.now();
    this.finishedAt = null;
  }

  Game.prototype.set = function (x, y, value) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.size || y >= this.size) {
      return { ok: false, reason: 'bad_cell' };
    }
    if (this.puzzle[y][x]) return { ok: false, reason: 'fixed' };
    const v = Number(value) || 0;
    if (v < 0 || v > this.size) return { ok: false, reason: 'bad_value' };
    this.grid[y][x] = v;
    if (v) this.notes[y][x] = [];
    if (v && v !== this.solution[y][x]) this.mistakes += 1;
    if (this.isComplete()) {
      this.status = 'finished';
      this.finishedAt = Date.now();
      return { ok: true, complete: true };
    }
    return { ok: true };
  };

  Game.prototype.clear = function (x, y) {
    if (this.puzzle[y][x]) return { ok: false, reason: 'fixed' };
    this.grid[y][x] = 0;
    return { ok: true };
  };

  Game.prototype.toggleNote = function (x, y, value) {
    if (this.puzzle[y][x]) return { ok: false, reason: 'fixed' };
    if (this.grid[y][x]) return { ok: false, reason: 'filled' };
    const v = Number(value);
    if (!Number.isInteger(v) || v < 1 || v > this.size) return { ok: false, reason: 'bad_value' };
    const list = this.notes[y][x];
    const idx = list.indexOf(v);
    if (idx === -1) list.push(v);
    else list.splice(idx, 1);
    list.sort(function (a, b) { return a - b; });
    return { ok: true };
  };

  Game.prototype.hint = function () {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const empties = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.grid[y][x] !== this.solution[y][x]) empties.push({ x: x, y: y });
      }
    }
    if (!empties.length) return { ok: false, reason: 'no_hint' };
    const pick = empties[Math.floor(Math.random() * empties.length)];
    this.grid[pick.y][pick.x] = this.solution[pick.y][pick.x];
    this.notes[pick.y][pick.x] = [];
    this.hintsUsed += 1;
    if (this.isComplete()) {
      this.status = 'finished';
      this.finishedAt = Date.now();
      return { ok: true, complete: true, cell: pick };
    }
    return { ok: true, cell: pick };
  };

  Game.prototype.isComplete = function () {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.grid[y][x] !== this.solution[y][x]) return false;
      }
    }
    return true;
  };

  Game.prototype.elapsedSeconds = function () {
    const end = this.finishedAt || Date.now();
    return Math.max(0, Math.round((end - this.startedAt) / 1000));
  };

  Game.prototype.score = function () {
    return scoreFor(this.size, this.elapsedSeconds(), this.hintsUsed, this.mistakes);
  };

  Game.prototype.stateFor = function () {
    return {
      size: this.size,
      puzzle: this.puzzle,
      grid: this.grid,
      notes: this.notes,
      blanks: this.blanks,
      status: this.status,
      hintsUsed: this.hintsUsed,
      mistakes: this.mistakes,
      seconds: this.elapsedSeconds(),
      score: this.score(),
      conflicts: conflicts(this.grid, this.size)
    };
  };

  return {
    SIZES: SIZES,
    BOX: BOX,
    REMOVE_TARGET: REMOVE_TARGET,
    SCORE_BASE: SCORE_BASE,
    makeRng: makeRng,
    emptyGrid: emptyGrid,
    cloneGrid: cloneGrid,
    candidates: candidates,
    countSolutions: countSolutions,
    solve: solve,
    generateSolution: generateSolution,
    generatePuzzle: generatePuzzle,
    conflicts: conflicts,
    scoreFor: scoreFor,
    boxIndex: boxIndex,
    Game: Game
  };
});
