/*
 * 오목 – 게임 엔진 (공용, UMD)
 * - 15x15 오목판 · 1:1 대결 · 5목 승리 판정 · 흑 금수(6목·4-4·3-3) · 마지막 수 표시
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gomoku = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIZE = 15;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 2;
  const EMPTY = 0;

  const DIRS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  const BOT_NAMES = ['오목봇 돌이', '오목봇 바둑', '오목봇 알까기'];

  function createBoard() {
    const board = [];
    for (let y = 0; y < SIZE; y++) {
      const row = [];
      for (let x = 0; x < SIZE; x++) row.push(EMPTY);
      board.push(row);
    }
    return board;
  }

  function inRange(x, y) {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  function cloneBoard(board) {
    return board.map(function (row) { return row.slice(); });
  }

  /** (x,y) 방향으로 놓인 같은 돌의 최대 길이와 양 끝이 열려 있는지 */
  function runInfo(board, x, y, dx, dy, stone) {
    let count = 1;
    let bx = x - dx;
    let by = y - dy;
    while (inRange(bx, by) && board[by][bx] === stone) {
      count += 1;
      bx -= dx;
      by -= dy;
    }
    const openBefore = inRange(bx, by) && board[by][bx] === EMPTY;
    let fx = x + dx;
    let fy = y + dy;
    while (inRange(fx, fy) && board[fy][fx] === stone) {
      count += 1;
      fx += dx;
      fy += dy;
    }
    const openAfter = inRange(fx, fy) && board[fy][fx] === EMPTY;
    return {
      count: count,
      open: (openBefore ? 1 : 0) + (openAfter ? 1 : 0),
      before: { x: bx, y: by, open: openBefore },
      after: { x: fx, y: fy, open: openAfter }
    };
  }

  function winningLine(board, x, y, stone) {
    for (let d = 0; d < DIRS.length; d++) {
      const dx = DIRS[d][0];
      const dy = DIRS[d][1];
      const info = runInfo(board, x, y, dx, dy, stone);
      if (info.count >= 5) {
        const cells = [];
        const startX = info.before.x + dx;
        const startY = info.before.y + dy;
        for (let i = 0; i < info.count; i++) {
          cells.push({ x: startX + i * dx, y: startY + i * dy });
        }
        return { dir: d, cells: cells, count: info.count };
      }
    }
    return null;
  }

  /** 이 수를 두면 그 방향에서 정확히 5가 되는 빈칸 목록 (한 수 5 위협) */
  function completionPoints(board, x, y, stone, dx, dy) {
    const points = [];
    for (let step = -4; step <= 4; step++) {
      if (step === 0) continue;
      const cx = x + dx * step;
      const cy = y + dy * step;
      if (!inRange(cx, cy)) continue;
      if (board[cy][cx] !== EMPTY) continue;
      board[cy][cx] = stone;
      const info = runInfo(board, x, y, dx, dy, stone);
      board[cy][cx] = EMPTY;
      if (info.count === 5) points.push({ x: cx, y: cy });
    }
    return points;
  }

  /** 그 방향에서 '열린 4'를 만드는지 (양 끝이 모두 비어 있고 정확히 4개) */
  function makesOpenFour(board, x, y, stone, dx, dy) {
    const info = runInfo(board, x, y, dx, dy, stone);
    return info.count === 4 && info.open === 2;
  }

  /**
   * 흑 금수 판정 (렌주 규칙을 초등용으로 단순화)
   *  - 6목 이상(장목) : 금수
   *  - 4-4 (두 방향 이상에서 5를 만들 수 있음) : 금수
   *  - 3-3 (두 방향 이상에서 열린 4를 만들 수 있음) : 금수
   *  - 정확히 5목이 되는 수는 언제나 허용(승리)
   */
  function isForbidden(board, x, y, stone) {
    if (!inRange(x, y) || board[y][x] !== EMPTY) return false;
    const work = cloneBoard(board);
    work[y][x] = stone;

    // 5목 완성(승리)은 금수가 아닙니다. 단, 6목 이상은 금수입니다.
    let overline = false;
    let exactFive = false;
    for (let d = 0; d < DIRS.length; d++) {
      const info = runInfo(work, x, y, DIRS[d][0], DIRS[d][1], stone);
      if (info.count >= 6) overline = true;
      else if (info.count === 5) exactFive = true;
    }
    if (overline) return true;
    if (exactFive) return false;

    let fourDirs = 0;
    let threeDirs = 0;
    for (let d = 0; d < DIRS.length; d++) {
      const dx = DIRS[d][0];
      const dy = DIRS[d][1];
      if (completionPoints(work, x, y, stone, dx, dy).length > 0) {
        fourDirs += 1;
        continue;
      }
      // 열린 3 : 이 방향의 빈칸에 한 수 더 두면 '열린 4'가 되는 곳이 있는가
      let openThree = false;
      for (let step = -3; step <= 3 && !openThree; step++) {
        if (step === 0) continue;
        const cx = x + dx * step;
        const cy = y + dy * step;
        if (!inRange(cx, cy) || work[cy][cx] !== EMPTY) continue;
        work[cy][cx] = stone;
        if (makesOpenFour(work, cx, cy, stone, dx, dy)) openThree = true;
        work[cy][cx] = EMPTY;
      }
      if (openThree) threeDirs += 1;
    }
    if (fourDirs >= 2) return true;
    if (threeDirs >= 2) return true;
    return false;
  }

  function Game(players, options) {
    const opts = options || {};
    this.size = SIZE;
    this.players = (players || []).slice(0, 2).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        stone: i + 1
      };
    });
    this.board = createBoard();
    this.moves = [];
    this.turn = 0;
    this.status = 'playing';
    this.finishReason = null;
    this.winnerId = null;
    this.winLine = null;
    this.forbidden = opts.forbidden !== false;
    this.lastMove = null;
    this.seq = 0;
    this.log = [];
    const first = this.players[0];
    this.pushLog('⚫ 오목을 시작합니다. 흑 ' + (first ? first.name : '') + '부터 둡니다.');
  }

  Game.prototype.pushLog = function (text) {
    this.seq += 1;
    this.log.push({ seq: this.seq, text: text });
    if (this.log.length > 40) this.log.shift();
  };

  Game.prototype.playerById = function (id) {
    return this.players.find(function (p) { return p.id === id; }) || null;
  };

  Game.prototype.currentPlayer = function () {
    return this.players[this.turn] || null;
  };

  Game.prototype.stoneOf = function (playerId) {
    const p = this.playerById(playerId);
    return p ? p.stone : 0;
  };

  Game.prototype.play = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    const data = payload || {};
    const x = Number(data.x);
    const y = Number(data.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inRange(x, y)) return { ok: false, reason: 'bad_cell' };
    if (this.board[y][x] !== EMPTY) return { ok: false, reason: 'occupied' };

    if (this.forbidden && player.stone === 1 && isForbidden(this.board, x, y, 1)) {
      return { ok: false, reason: 'forbidden' };
    }

    this.board[y][x] = player.stone;
    const move = { x: x, y: y, playerId: playerId, stone: player.stone, seq: this.moves.length + 1 };
    this.moves.push(move);
    this.lastMove = move;
    this.pushLog(player.name + ' ' + (player.stone === 1 ? '흑' : '백') + ' → ' + columnName(x) + (y + 1));

    const line = winningLine(this.board, x, y, player.stone);
    if (line) {
      this.status = 'finished';
      this.finishReason = 'five';
      this.winnerId = playerId;
      this.winLine = line.cells;
      this.pushLog('🎉 ' + player.name + '님이 ' + line.count + '목을 완성했습니다!');
      return { ok: true, win: true };
    }
    if (this.moves.length >= SIZE * SIZE) {
      this.status = 'finished';
      this.finishReason = 'draw';
      this.pushLog('🤝 판이 가득 찼습니다. 무승부입니다.');
      return { ok: true, draw: true };
    }
    this.turn = 1 - this.turn;
    return { ok: true };
  };

  Game.prototype.finish = function (reason) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'done';
  };

  Game.prototype.finishGame = function (reason) {
    this.finish(reason || 'closed_by_host');
  };

  function columnName(x) {
    return String.fromCharCode(65 + x);
  }

  Game.prototype.ranking = function () {
    const self = this;
    const rows = this.players.map(function (p) {
      const won = self.winnerId === p.id;
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        isBot: p.isBot,
        seat: p.seat,
        score: won ? 1 : 0,
        result: self.finishReason === 'draw' ? '무승부' : won ? '승리' : '패배'
      };
    });
    if (this.finishReason === 'draw') {
      rows.forEach(function (r) { r.rank = 1; });
      return rows;
    }
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.seat - b.seat;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    return {
      gameId: 'gomoku',
      size: SIZE,
      status: this.status,
      finishReason: this.finishReason,
      turnPlayerId: this.status === 'playing' && this.currentPlayer() ? this.currentPlayer().id : null,
      board: this.board,
      moves: this.moves.length,
      lastMove: this.lastMove,
      winLine: this.winLine,
      winnerId: this.winnerId,
      forbidden: this.forbidden,
      youId: viewerId || null,
      youStone: viewerId ? this.stoneOf(viewerId) : 0,
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          stone: p.stone,
          isTurn: self.status === 'playing' && self.currentPlayer() && self.currentPlayer().id === p.id
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-8)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  function patternScore(board, x, y, stone) {
    let score = 0;
    for (let d = 0; d < DIRS.length; d++) {
      const info = runInfo(board, x, y, DIRS[d][0], DIRS[d][1], stone);
      if (info.count >= 5) score += 1000000;
      else if (info.count === 4) score += info.open === 2 ? 120000 : info.open === 1 ? 12000 : 0;
      else if (info.count === 3) score += info.open === 2 ? 2200 : info.open === 1 ? 260 : 0;
      else if (info.count === 2) score += info.open === 2 ? 120 : info.open === 1 ? 18 : 0;
      else if (info.count === 1) score += info.open === 2 ? 6 : 1;
    }
    return score;
  }

  function candidates(board) {
    const list = [];
    const near = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (board[y][x] !== EMPTY) continue;
        let close = false;
        for (let dy = -2; dy <= 2 && !close; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inRange(nx, ny)) continue;
            if (board[ny][nx] !== EMPTY) { close = true; break; }
          }
        }
        if (close) near.push({ x: x, y: y });
      }
    }
    if (!near.length) return [{ x: 7, y: 7 }];
    return near;
  }

  function botMove(game, player) {
    const board = game.board;
    const me = player.stone;
    const opp = me === 1 ? 2 : 1;
    const list = candidates(board);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const cell = list[i];
      // 흑이면 금수인 자리는 피합니다.
      if (game.forbidden && me === 1 && isForbidden(board, cell.x, cell.y, 1)) continue;
      const work = cloneBoard(board);
      work[cell.y][cell.x] = me;
      const attack = patternScore(work, cell.x, cell.y, me);
      work[cell.y][cell.x] = opp;
      const defense = patternScore(work, cell.x, cell.y, opp);
      work[cell.y][cell.x] = EMPTY;
      const center = 7 - (Math.abs(cell.x - 7) + Math.abs(cell.y - 7)) * 0.8;
      const score = attack * 1.08 + defense * 1.0 + center + Math.random() * 3;
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    if (!best) {
      for (let i = 0; i < list.length; i++) {
        if (!(game.forbidden && me === 1 && isForbidden(board, list[i].x, list[i].y, 1))) {
          best = list[i];
          break;
        }
      }
    }
    if (!best) best = { x: 7, y: 7 };
    return { playerId: player.id, action: 'play', payload: { x: best.x, y: best.y } };
  }

  function BotDriver(game) {
    this.game = game;
  }

  BotDriver.prototype.tick = function () {
    const game = this.game;
    if (!game || game.status !== 'playing') return null;
    const player = game.currentPlayer();
    if (!player || !player.isBot) return null;
    return botMove(game, player);
  };

  return {
    SIZE: SIZE,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    EMPTY: EMPTY,
    BOT_NAMES: BOT_NAMES,
    createBoard: createBoard,
    cloneBoard: cloneBoard,
    inRange: inRange,
    runInfo: runInfo,
    winningLine: winningLine,
    isForbidden: isForbidden,
    columnName: columnName,
    Game: Game,
    BotDriver: BotDriver,
    botMove: botMove
  };
});
