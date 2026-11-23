/*
 * 전통 윷놀이 – 게임 엔진 (공용, UMD)
 * - 윷가락 4개(도·개·걸·윷·모·빽도) · 말 2~4개 · 업기 · 잡기 · 지름길 · 2~4명
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 *
 * 윷판(29개 자리)
 *   바깥 둘레 0~19 (0 = 출발/도착, 5·10·15 = 모서리)
 *   가운데 20, 지름길 21~28 (0↔10 대각선, 5↔15 대각선)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Yut = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;
  const BOT_NAMES = ['윷봇 도개걸', '윷봇 모', '윷봇 윷'];

  const PATHS = {
    outer: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0],
    d5: [5, 25, 26, 20, 27, 28, 15, 16, 17, 18, 19, 0],
    d10: [10, 24, 23, 20, 22, 21, 0]
  };

  const NODE_LABELS = {
    0: '출발', 5: '모서리', 10: '모서리', 15: '모서리', 20: '가운데'
  };

  const NODE_POS = (function () {
    const out = {};
    // 바깥 둘레 (5x5 격자, 모서리는 0·5·10·15)
    const grid = [
      [0, 5], [1, 5], [2, 5], [3, 5], [4, 5],
      [5, 5], [5, 4], [5, 3], [5, 2], [5, 1],
      [5, 0], [4, 0], [3, 0], [2, 0], [1, 0],
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4]
    ];
    for (let i = 0; i < grid.length; i++) out[i] = { x: grid[i][0], y: grid[i][1] };
    out[20] = { x: 2.5, y: 2.5 };
    out[21] = { x: 0.83, y: 4.17 };
    out[22] = { x: 1.67, y: 3.33 };
    out[23] = { x: 3.33, y: 1.67 };
    out[24] = { x: 4.17, y: 0.83 };
    out[25] = { x: 4.17, y: 4.17 };
    out[26] = { x: 3.33, y: 3.33 };
    out[27] = { x: 1.67, y: 1.67 };
    out[28] = { x: 0.83, y: 0.83 };
    return out;
  })();

  function createRng(seed) {
    let s = (seed === undefined || seed === null ? Date.now() : seed) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function rollSticks(rng) {
    const sticks = [];
    for (let i = 0; i < 4; i++) sticks.push(rng() < 0.5); // true = 배(뒤집힘)
    const backs = sticks.filter(Boolean).length;
    let name;
    let steps;
    if (backs === 1 && sticks[0]) { name = '빽도'; steps = -1; }
    else if (backs === 0) { name = '모'; steps = 5; }
    else if (backs === 1) { name = '도'; steps = 1; }
    else if (backs === 2) { name = '개'; steps = 2; }
    else if (backs === 3) { name = '걸'; steps = 3; }
    else { name = '윷'; steps = 4; }
    return { sticks: sticks, backs: backs, name: name, steps: steps, bonus: steps === 4 || steps === 5 };
  }

  function nodeAt(pos) {
    if (!pos) return null;
    return PATHS[pos.path][pos.idx];
  }

  /** pos 에서 steps 만큼 이동했을 때의 결과 */
  function advance(pos, steps) {
    const start = pos || { path: 'outer', idx: 0 };
    if (steps > 0) {
      const path = start.path;
      const idx = start.idx + steps;
      const last = PATHS[path].length - 1;
      if (idx >= last) return { finished: true };
      let nextPath = path;
      let nextIdx = idx;
      const node = PATHS[path][idx];
      if (path === 'outer') {
        if (node === 5) { nextPath = 'd5'; nextIdx = 0; }
        else if (node === 10) { nextPath = 'd10'; nextIdx = 0; }
      }
      return {
        pos: { path: nextPath, idx: nextIdx },
        node: PATHS[nextPath][nextIdx],
        shortcut: nextPath !== path
      };
    }
    if (steps === 0) return { pos: start, node: nodeAt(start), shortcut: false };
    // 빽도
    const idx = start.idx - 1;
    if (idx === 0 && start.path === 'outer') return { toStart: true };
    if (idx < 0) {
      const branchNode = PATHS[start.path][0];
      const outerIdx = PATHS.outer.indexOf(branchNode);
      const backIdx = outerIdx - 1;
      if (backIdx <= 0) return { toStart: true };
      return { pos: { path: 'outer', idx: backIdx }, node: PATHS.outer[backIdx], shortcut: false };
    }
    return { pos: { path: start.path, idx: idx }, node: PATHS[start.path][idx], shortcut: false };
  }

  function Game(players, options) {
    const opts = options || {};
    this.rng = typeof opts.rng === 'function' ? opts.rng : createRng(opts.seed);
    const pieceCount = Math.max(2, Math.min(4, Number(opts.pieces) || 2));
    this.pieceCount = pieceCount;
    this.players = (players || []).slice(0, MAX_PLAYERS).map(function (p, i) {
      const pieces = [];
      for (let k = 0; k < pieceCount; k++) {
        pieces.push({ id: 'y' + i + '-' + k, owner: p.id, pos: null, finished: false });
      }
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        pieces: pieces
      };
    });
    this.turn = 0;
    this.phase = 'throw';
    this.throwInfo = null;
    this.lastMove = null;
    this.status = 'playing';
    this.finishReason = null;
    this.winnerId = null;
    this.seq = 0;
    this.log = [];
    const first = this.currentPlayer();
    this.pushLog('🪵 윷놀이를 시작합니다. 말 ' + pieceCount + '개 · ' + (first ? first.name : '') + '님부터 던집니다.');
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

  Game.prototype.piecesOf = function (playerId) {
    const p = this.playerById(playerId);
    return p ? p.pieces : [];
  };

  /** 같은 자리에 있는 말 묶음 (업기) */
  Game.prototype.groupAt = function (player, pos) {
    return player.pieces.filter(function (piece) {
      if (piece.finished) return false;
      if (!pos) return !piece.pos;
      if (!piece.pos) return false;
      return piece.pos.path === pos.path && piece.pos.idx === pos.idx;
    });
  };

  Game.prototype.movableGroups = function (player) {
    const groups = [];
    const seen = {};
    player.pieces.forEach(function (piece) {
      if (piece.finished) return;
      const key = piece.pos ? piece.pos.path + ':' + piece.pos.idx : 'wait';
      if (seen[key]) return;
      seen[key] = true;
      groups.push({ key: key, pos: piece.pos ? { path: piece.pos.path, idx: piece.pos.idx } : null, pieces: [] });
    });
    groups.forEach(function (group) {
      group.pieces = player.pieces.filter(function (piece) {
        if (piece.finished) return false;
        if (!group.pos) return !piece.pos;
        return !!piece.pos && piece.pos.path === group.pos.path && piece.pos.idx === group.pos.idx;
      });
    });
    return groups;
  };

  Game.prototype.throwYut = function (playerId) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    if (this.phase !== 'throw') return { ok: false, reason: 'wrong_phase' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };

    const roll = rollSticks(this.rng);
    this.seq += 1;
    this.throwInfo = {
      seq: this.seq,
      playerId: playerId,
      name: roll.name,
      steps: roll.steps,
      sticks: roll.sticks.slice(),
      bonus: roll.bonus
    };
    this.pushLog(player.name + '님 윷가락: ' + roll.name + (roll.steps > 0 ? ' (' + roll.steps + '칸)' : ' (한 칸 뒤로)'));

    const groups = this.movableGroups(player);
    const anyLegal = groups.some(function (group) {
      return !(group.pos === null && roll.steps < 0);
    });
    if (!anyLegal) {
      this.pushLog('움직일 말이 없어 차례를 넘깁니다.');
      this.throwInfo = null;
      return this.endTurn(false);
    }
    this.phase = 'move';
    return { ok: true };
  };

  Game.prototype.move = function (playerId, pieceId) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    if (this.phase !== 'move') return { ok: false, reason: 'wrong_phase' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    if (!this.throwInfo) return { ok: false, reason: 'throw_first' };

    const picked = player.pieces.find(function (p) { return p.id === pieceId && !p.finished; });
    if (!picked) return { ok: false, reason: 'unknown_piece' };
    const steps = this.throwInfo.steps;
    if (!picked.pos && steps < 0) return { ok: false, reason: 'cannot_go_back' };

    // 출발점(대기)에 있는 말은 한 번에 한 개씩 나갑니다. 보드 위의 말만 업어서 함께 움직입니다.
    const group = picked.pos ? this.groupAt(player, picked.pos) : [picked];
    const result = advance(picked.pos, steps);
    const moving = group.length ? group : [picked];

    if (result.finished) {
      moving.forEach(function (piece) { piece.pos = null; piece.finished = true; });
      this.lastMove = { seq: this.seq + 1, playerId: playerId, pieceId: pieceId, finished: true, node: null, count: moving.length };
      this.pushLog(player.name + '님 말 ' + moving.length + '개가 완주했습니다! 🎉');
    } else if (result.toStart) {
      moving.forEach(function (piece) { piece.pos = null; });
      this.lastMove = { seq: this.seq + 1, playerId: playerId, pieceId: pieceId, toStart: true, node: 0, count: moving.length };
      this.pushLog(player.name + '님 말이 빽도로 출발점에 돌아갔습니다.');
    } else {
      moving.forEach(function (piece) { piece.pos = { path: result.pos.path, idx: result.pos.idx }; });
      this.lastMove = { seq: this.seq + 1, playerId: playerId, pieceId: pieceId, node: result.node, count: moving.length };
      this.pushLog(player.name + '님 말이 ' + result.node + '번 자리로 이동했습니다.' + (result.shortcut ? ' (지름길!)' : ''));
    }

    // 잡기: 도착한 자리에 있는 상대 말은 출발점으로 돌아갑니다.
    let captured = 0;
    if (!result.finished && !result.toStart) {
      const node = result.node;
      this.players.forEach(function (other) {
        if (other.id === player.id) return;
        other.pieces.forEach(function (piece) {
          if (piece.finished || !piece.pos) return;
          if (nodeAt(piece.pos) === node) {
            piece.pos = null;
            captured += 1;
          }
        });
      });
      if (captured) this.pushLog('💥 ' + player.name + '님이 상대 말 ' + captured + '개를 잡았습니다!');
    }

    // 업기: 같은 자리에 모인 내 말은 한 묶음으로 움직입니다.
    if (!result.finished && !result.toStart) {
      const merged = this.groupAt(player, { path: result.pos.path, idx: result.pos.idx });
      if (merged.length > 1) this.pushLog('🤝 ' + player.name + '님 말 ' + merged.length + '개가 업혔습니다.');
    }

    const finishedCount = player.pieces.filter(function (p) { return p.finished; }).length;
    if (finishedCount >= player.pieces.length) {
      this.winnerId = player.id;
      this.status = 'finished';
      this.finishReason = 'all_finished';
      this.pushLog('🏆 ' + player.name + '님이 말을 모두 완주해 우승했습니다!');
      this.phase = 'finished';
      this.throwInfo = null;
      return { ok: true, win: true };
    }

    const bonus = this.throwInfo.bonus || captured > 0;
    this.throwInfo = null;
    return this.endTurn(bonus);
  };

  Game.prototype.endTurn = function (bonus) {
    if (this.status !== 'playing') return { ok: true };
    if (bonus) {
      this.phase = 'throw';
      const player = this.currentPlayer();
      this.pushLog((player ? player.name : '') + '님 한 번 더!');
      return { ok: true, extra: true };
    }
    this.turn += 1;
    if (this.turn >= this.players.length) this.turn = 0;
    this.phase = 'throw';
    return { ok: true };
  };

  Game.prototype.finish = function (reason) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'done';
    this.phase = 'finished';
  };

  Game.prototype.finishGame = function (reason) {
    this.finish(reason || 'closed_by_host');
  };

  Game.prototype.progress = function (player) {
    let total = 0;
    player.pieces.forEach(function (piece) {
      if (piece.finished) total += 100;
      else if (piece.pos) total += piece.pos.idx;
    });
    return total;
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
        score: p.pieces.filter(function (piece) { return piece.finished; }).length,
        progress: self.progress(p),
        result: p.pieces.every(function (piece) { return piece.finished; }) ? '완주' : ''
      };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.progress !== a.progress) return b.progress - a.progress;
      return a.seat - b.seat;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    return {
      gameId: 'yut',
      status: this.status,
      finishReason: this.finishReason,
      phase: this.phase,
      turnPlayerId: this.status === 'playing' && this.currentPlayer() ? this.currentPlayer().id : null,
      throwInfo: this.throwInfo,
      lastMove: this.lastMove,
      pieceCount: this.pieceCount,
      winnerId: this.winnerId,
      youId: viewerId || null,
      nodePos: NODE_POS,
      paths: PATHS,
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          finishedCount: p.pieces.filter(function (piece) { return piece.finished; }).length,
          pieces: p.pieces.map(function (piece) {
            return {
              id: piece.id,
              node: piece.pos ? nodeAt(piece.pos) : null,
              path: piece.pos ? piece.pos.path : null,
              idx: piece.pos ? piece.pos.idx : null,
              waiting: !piece.pos && !piece.finished,
              finished: piece.finished
            };
          }),
          isTurn: self.status === 'playing' && self.currentPlayer() && self.currentPlayer().id === p.id
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  function pickMove(game, player) {
    const steps = game.throwInfo ? game.throwInfo.steps : 1;
    const groups = game.movableGroups(player);
    let best = null;
    let bestScore = -Infinity;
    groups.forEach(function (group) {
      if (!group.pos && steps < 0) return;
      const result = advance(group.pos, steps);
      let score = 0;
      if (result.finished) score += 5000;
      if (result.toStart) score -= 60;
      if (result.pos) {
        score += result.pos.idx * 2;
        const node = result.node;
        // 상대 말을 잡는 자리인지
        game.players.forEach(function (other) {
          if (other.id === player.id) return;
          other.pieces.forEach(function (piece) {
            if (piece.finished || !piece.pos) return;
            if (nodeAt(piece.pos) === node) score += 1200;
          });
        });
        // 내 말과 업을 수 있는 자리
        player.pieces.forEach(function (piece) {
          if (piece.finished || !piece.pos) return;
          if (nodeAt(piece.pos) === node) score += 80;
        });
        if (result.shortcut) score += 150;
        if (node === 5 || node === 10 || node === 15 || node === 20) score += 20;
      }
      if (!group.pos) score += 40; // 새 말 꺼내기
      score += game.rng() * 12;
      if (score > bestScore) {
        bestScore = score;
        best = group.pieces[0];
      }
    });
    if (!best) return null;
    return { playerId: player.id, action: 'move', payload: { pieceId: best.id } };
  }

  function BotDriver(game) {
    this.game = game;
  }

  BotDriver.prototype.tick = function () {
    const game = this.game;
    if (!game || game.status !== 'playing') return null;
    const player = game.currentPlayer();
    if (!player || !player.isBot) return null;
    if (game.phase === 'throw') return { playerId: player.id, action: 'throw' };
    if (game.phase === 'move') return pickMove(game, player);
    return null;
  };

  return {
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    BOT_NAMES: BOT_NAMES,
    PATHS: PATHS,
    NODE_POS: NODE_POS,
    NODE_LABELS: NODE_LABELS,
    createRng: createRng,
    rollSticks: rollSticks,
    advance: advance,
    nodeAt: nodeAt,
    Game: Game,
    BotDriver: BotDriver
  };
});
