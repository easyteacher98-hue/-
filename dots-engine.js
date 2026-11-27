/*
 * 선 긋기 땅따먹기 – 게임 엔진 (공용, UMD)
 * - 5×5 점(4×4 칸) 보드에서 번갈아 선을 긋습니다.
 * - 사각형의 네 번째 선을 완성하면 그 칸이 내 땅이 되고, 한 번 더 그을 수 있습니다.
 * - 16칸을 모두 먹으면 끝! 가장 많은 땅을 가진 사람이 승리합니다.
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dots = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;
  const DOTS = 5;          // 한 변의 점 개수
  const BOXES = DOTS - 1;  // 4×4 칸
  const BOT_NAMES = ['선봇 콕이', '선봇 줄이', '선봇 모서리'];

  function emptyGrid(rows, cols) {
    const grid = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) row.push(null);
      grid.push(row);
    }
    return grid;
  }

  /** 이 선을 그으면 완성되는 칸 목록 */
  function boxesForLine(hLines, vLines, type, x, y) {
    const out = [];
    function complete(bx, by) {
      if (bx < 0 || bx >= BOXES || by < 0 || by >= BOXES) return false;
      return !!hLines[by][bx] && !!hLines[by + 1][bx] && !!vLines[by][bx] && !!vLines[by][bx + 1];
    }
    if (type === 'h') {
      if (complete(x, y - 1)) out.push({ x: x, y: y - 1 });
      if (complete(x, y)) out.push({ x: x, y: y });
    } else {
      if (complete(x - 1, y)) out.push({ x: x - 1, y: y });
      if (complete(x, y)) out.push({ x: x, y: y });
    }
    return out;
  }

  function Game(players, options) {
    const opts = options || {};
    this.players = (players || []).slice(0, MAX_PLAYERS).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        score: 0
      };
    });
    this.hLines = emptyGrid(DOTS, BOXES);   // hLines[y][x]: (x,y)-(x+1,y)
    this.vLines = emptyGrid(BOXES, DOTS);   // vLines[y][x]: (x,y)-(x,y+1)
    this.boxes = emptyGrid(BOXES, BOXES);   // boxes[y][x]: 차지한 사람 id
    this.turn = 0;
    this.status = 'playing';
    this.finishReason = null;
    this.winnerId = null;
    this.moves = 0;
    this.totalBoxes = BOXES * BOXES;
    this.claimed = 0;
    this.lastLine = null;
    this.lastClaimed = [];
    this.seq = 0;
    this.log = [];
    this.startedAt = Date.now();
    this.pushLog('✏️ 선 긋기 땅따먹기를 시작합니다. ' + this.players[0].name + '님부터 선을 그으세요!');
  }

  Game.prototype.pushLog = function (text) {
    this.seq += 1;
    this.log.push({ seq: this.seq, text: text });
    if (this.log.length > 60) this.log.shift();
  };

  Game.prototype.playerById = function (id) {
    return this.players.find(function (p) { return p.id === id; }) || null;
  };

  Game.prototype.currentPlayer = function () {
    return this.players[this.turn] || null;
  };

  Game.prototype.nextTurn = function () {
    this.turn = (this.turn + 1) % this.players.length;
  };

  Game.prototype.availableLines = function () {
    const out = [];
    for (let y = 0; y < DOTS; y++) {
      for (let x = 0; x < BOXES; x++) if (!this.hLines[y][x]) out.push({ type: 'h', x: x, y: y });
    }
    for (let y = 0; y < BOXES; y++) {
      for (let x = 0; x < DOTS; x++) if (!this.vLines[y][x]) out.push({ type: 'v', x: x, y: y });
    }
    return out;
  };

  /** payload = { type: 'h'|'v', x, y } */
  Game.prototype.line = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    const data = payload || {};
    const type = data.type === 'v' ? 'v' : data.type === 'h' ? 'h' : null;
    const x = Number(data.x);
    const y = Number(data.y);
    if (!type || !Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: 'bad_line' };
    if (type === 'h') {
      if (x < 0 || x >= BOXES || y < 0 || y >= DOTS) return { ok: false, reason: 'bad_line' };
      if (this.hLines[y][x]) return { ok: false, reason: 'taken' };
      this.hLines[y][x] = playerId;
    } else {
      if (x < 0 || x >= DOTS || y < 0 || y >= BOXES) return { ok: false, reason: 'bad_line' };
      if (this.vLines[y][x]) return { ok: false, reason: 'taken' };
      this.vLines[y][x] = playerId;
    }
    this.moves += 1;
    this.lastLine = { type: type, x: x, y: y, playerId: playerId };

    const done = boxesForLine(this.hLines, this.vLines, type, x, y);
    this.lastClaimed = done;
    done.forEach(function (box) {
      this.boxes[box.y][box.x] = playerId;
      this.claimed += 1;
    }, this);
    player.score += done.length;

    const where = type === 'h' ? '가로' : '세로';
    if (done.length) {
      this.pushLog(player.name + '님이 ' + where + ' 선을 그어 땅 ' + done.length + '칸을 차지했습니다! 한 번 더!');
    } else {
      this.pushLog(player.name + '님이 ' + where + ' 선을 그었습니다.');
    }

    if (this.claimed >= this.totalBoxes) {
      this.finishedAt = Date.now();
      this.status = 'finished';
      this.finishReason = 'all_boxes';
      const ranking = this.ranking();
      this.winnerId = ranking[0] ? ranking[0].id : null;
      const winners = ranking.filter(function (row) { return row.rank === 1; });
      this.pushLog('🏁 모든 땅을 나눴습니다. ' + winners.map(function (w) { return w.name; }).join(', ') + '님이 가장 많은 땅을 차지했습니다!');
      return { ok: true, claimed: done.length, finished: true };
    }
    // 땅을 먹었으면 한 번 더, 아니면 다음 사람
    if (!done.length) this.nextTurn();
    return { ok: true, claimed: done.length, again: done.length > 0 };
  };

  Game.prototype.finish = function (reason) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'done';
    const ranking = this.ranking();
    this.winnerId = ranking[0] ? ranking[0].id : null;
    this.finishedAt = Date.now();
  };

  Game.prototype.finishGame = function (reason) {
    this.finish(reason || 'closed_by_host');
  };

  Game.prototype.ranking = function () {
    const self = this;
    const rows = this.players.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        isBot: p.isBot,
        seat: p.seat,
        score: p.score,
        result: p.score + '칸'
      };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.seat - b.seat;
    });
    rows.forEach(function (row, i) {
      if (i > 0 && rows[i - 1].score === row.score) {
        row.rank = rows[i - 1].rank;
        row.result = row.score + '칸 (공동)';
      } else {
        row.rank = i + 1;
      }
    });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    const current = this.currentPlayer();
    return {
      gameId: 'dots',
      size: DOTS,
      boxCount: BOXES,
      status: this.status,
      finishReason: this.finishReason,
      turnPlayerId: this.status === 'playing' && current ? current.id : null,
      youId: viewerId || null,
      hLines: this.hLines,
      vLines: this.vLines,
      boxes: this.boxes,
      claimed: this.claimed,
      totalBoxes: this.totalBoxes,
      lastLine: this.lastLine,
      winnerId: this.winnerId,
      moves: this.moves,
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          score: p.score,
          isTurn: self.status === 'playing' && current && current.id === p.id
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  /** 이 선을 그으면 몇 칸을 먹는지 (지금 보드 기준) */
  function claimCount(game, type, x, y) {
    const h = game.hLines;
    const v = game.vLines;
    function complete(bx, by) {
      if (bx < 0 || bx >= BOXES || by < 0 || by >= BOXES) return false;
      return !!h[by][bx] && !!h[by + 1][bx] && !!v[by][bx] && !!v[by][bx + 1];
    }
    if (type === 'h') return (complete(x, y - 1) ? 1 : 0) + (complete(x, y) ? 1 : 0);
    return (complete(x - 1, y) ? 1 : 0) + (complete(x, y) ? 1 : 0);
  }

  /** 이 선을 그은 뒤 상대에게 3면이 완성된 칸을 얼마나 주는지 */
  function riskCount(game, type, x, y) {
    const h = game.hLines.map(function (row) { return row.slice(); });
    const v = game.vLines.map(function (row) { return row.slice(); });
    if (type === 'h') h[y][x] = 'x'; else v[y][x] = 'x';
    let risk = 0;
    for (let by = 0; by < BOXES; by++) {
      for (let bx = 0; bx < BOXES; bx++) {
        const sides = (h[by][bx] ? 1 : 0) + (h[by + 1][bx] ? 1 : 0) + (v[by][bx] ? 1 : 0) + (v[by][bx + 1] ? 1 : 0);
        if (sides === 3) risk += 1;
      }
    }
    return risk;
  }

  function botAction(game, player) {
    const lines = game.availableLines();
    if (!lines.length) return { action: 'line', payload: { type: 'h', x: 0, y: 0 } };
    let best = null;
    let bestScore = -Infinity;
    lines.forEach(function (line) {
      const claim = claimCount(game, line.type, line.x, line.y);
      const risk = riskCount(game, line.type, line.x, line.y);
      let score = claim * 100 - risk * 10 + Math.random() * 2;
      // 3면이 열린 칸을 만들지 않는 선을 더 좋아합니다.
      if (claim > 0) score += 50;
      if (score > bestScore) {
        bestScore = score;
        best = line;
      }
    });
    return { action: 'line', payload: { type: best.type, x: best.x, y: best.y } };
  }

  function BotDriver(game) {
    this.game = game;
  }

  BotDriver.prototype.tick = function () {
    const game = this.game;
    if (!game || game.status !== 'playing') return null;
    const player = game.currentPlayer();
    if (!player || !player.isBot) return null;
    const action = botAction(game, player);
    return { playerId: player.id, action: action.action, payload: action.payload };
  };

  return {
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    DOTS: DOTS,
    BOXES: BOXES,
    BOT_NAMES: BOT_NAMES,
    boxesForLine: boxesForLine,
    claimCount: claimCount,
    Game: Game,
    BotDriver: BotDriver,
    botAction: botAction
  };
});
