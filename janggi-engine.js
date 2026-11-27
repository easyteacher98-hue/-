/*
 * 전통 장기 – 게임 엔진 (공용, UMD)
 * - 9×10 장기판, 궁성(3×3)과 대각선, 초(아래, 선공) vs 한(위)
 * - 차·포(다리 하나를 넘어 이동/잡기)·마(날일)·상(밭전)·사·졸/병·궁의 이동 규칙
 * - 궁을 잡거나 상대가 둘 곳이 없으면(외통수) 승리
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Janggi = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 9;
  const HEIGHT = 10;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 2;
  const BOT_NAMES = ['장기봇 초롱', '장기봇 한결'];
  const DEFAULT_MAX_MOVES = 400;

  const TYPE_NAME = {
    general: '궁',
    chariot: '차',
    cannon: '포',
    horse: '마',
    elephant: '상',
    guard: '사',
    soldier: '졸'
  };

  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ALL8 = ORTHO.concat(DIAG);

  // 마(날일자): 목적지와, 막히는 첫 칸
  const HORSE_STEPS = [
    { dx: 2, dy: 1, bx: 1, by: 0 }, { dx: 2, dy: -1, bx: 1, by: 0 },
    { dx: -2, dy: 1, bx: -1, by: 0 }, { dx: -2, dy: -1, bx: -1, by: 0 },
    { dx: 1, dy: 2, bx: 0, by: 1 }, { dx: -1, dy: 2, bx: 0, by: 1 },
    { dx: 1, dy: -2, bx: 0, by: -1 }, { dx: -1, dy: -2, bx: 0, by: -1 }
  ];

  // 상(밭전자): 목적지와, 막히는 첫 칸
  const ELEPHANT_STEPS = [
    { dx: 3, dy: 2, bx: 1, by: 0 }, { dx: 3, dy: -2, bx: 1, by: 0 },
    { dx: -3, dy: 2, bx: -1, by: 0 }, { dx: -3, dy: -2, bx: -1, by: 0 },
    { dx: 2, dy: 3, bx: 0, by: 1 }, { dx: -2, dy: 3, bx: 0, by: 1 },
    { dx: 2, dy: -3, bx: 0, by: -1 }, { dx: -2, dy: -3, bx: 0, by: -1 }
  ];

  const START_ROW = ['chariot', 'horse', 'elephant', 'guard', null, 'guard', 'elephant', 'horse', 'chariot'];

  function inBoard(x, y) {
    return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
  }

  function otherSide(side) {
    return side === 'cho' ? 'han' : 'cho';
  }

  function palaceOf(side) {
    return side === 'cho' ? { x0: 3, x1: 5, y0: 7, y1: 9 } : { x0: 3, x1: 5, y0: 0, y1: 2 };
  }

  function inPalace(side, x, y) {
    const p = palaceOf(side);
    return x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1;
  }

  function pieceChar(piece) {
    if (!piece) return '';
    if (piece.type === 'soldier') return piece.side === 'cho' ? '병' : '졸';
    return TYPE_NAME[piece.type] || '';
  }

  function emptyBoard() {
    const board = [];
    for (let y = 0; y < HEIGHT; y++) {
      const row = [];
      for (let x = 0; x < WIDTH; x++) row.push(null);
      board.push(row);
    }
    return board;
  }

  function cloneBoard(board) {
    return board.map(function (row) {
      return row.map(function (cell) { return cell ? { side: cell.side, type: cell.type } : null; });
    });
  }

  function createBoard() {
    const board = emptyBoard();
    function put(x, y, side, type) { board[y][x] = { side: side, type: type }; }
    // 한(위)
    START_ROW.forEach(function (type, x) { if (type) put(x, 0, 'han', type); });
    put(4, 1, 'han', 'general');
    put(1, 2, 'han', 'cannon');
    put(7, 2, 'han', 'cannon');
    [0, 2, 4, 6, 8].forEach(function (x) { put(x, 3, 'han', 'soldier'); });
    // 초(아래)
    START_ROW.forEach(function (type, x) { if (type) put(x, 9, 'cho', type); });
    put(4, 8, 'cho', 'general');
    put(1, 7, 'cho', 'cannon');
    put(7, 7, 'cho', 'cannon');
    [0, 2, 4, 6, 8].forEach(function (x) { put(x, 6, 'cho', 'soldier'); });
    return board;
  }

  /** 그 자리의 기물이 갈 수 있는 곳 (아군 기물이 있는 곳은 제외, 궁 안전은 따지지 않음) */
  function pseudoMoves(board, x, y) {
    const piece = board[y] && board[y][x];
    if (!piece) return [];
    const out = [];
    const side = piece.side;
    function target(nx, ny) {
      if (!inBoard(nx, ny)) return null;
      const dest = board[ny][nx];
      if (dest && dest.side === side) return null;
      return { x: nx, y: ny, capture: !!dest };
    }
    function push(nx, ny) {
      const cell = target(nx, ny);
      if (cell) out.push(cell);
      return cell && !cell.capture; // 빈 칸이면 계속 갈 수 있음
    }

    if (piece.type === 'chariot') {
      ORTHO.forEach(function (d) {
        let nx = x + d[0];
        let ny = y + d[1];
        while (push(nx, ny)) {
          nx += d[0];
          ny += d[1];
        }
      });
      return out;
    }

    if (piece.type === 'cannon') {
      ORTHO.forEach(function (d) {
        let nx = x + d[0];
        let ny = y + d[1];
        // 다리(넘을 기물) 찾기 — 포는 다리가 될 수 없습니다.
        while (inBoard(nx, ny) && !board[ny][nx]) {
          nx += d[0];
          ny += d[1];
        }
        if (!inBoard(nx, ny)) return;
        const screen = board[ny][nx];
        if (screen.type === 'cannon') return;
        nx += d[0];
        ny += d[1];
        while (inBoard(nx, ny)) {
          const dest = board[ny][nx];
          if (!dest) {
            out.push({ x: nx, y: ny, capture: false });
          } else {
            if (dest.side !== side && dest.type !== 'cannon') out.push({ x: nx, y: ny, capture: true });
            return;
          }
          nx += d[0];
          ny += d[1];
        }
      });
      return out;
    }

    if (piece.type === 'horse') {
      HORSE_STEPS.forEach(function (step) {
        const bx = x + step.bx;
        const by = y + step.by;
        if (!inBoard(bx, by) || board[by][bx]) return;
        const cell = target(x + step.dx, y + step.dy);
        if (cell) out.push(cell);
      });
      return out;
    }

    if (piece.type === 'elephant') {
      ELEPHANT_STEPS.forEach(function (step) {
        const bx = x + step.bx;
        const by = y + step.by;
        if (!inBoard(bx, by) || board[by][bx]) return;
        const cell = target(x + step.dx, y + step.dy);
        if (cell) out.push(cell);
      });
      return out;
    }

    if (piece.type === 'guard') {
      ALL8.forEach(function (d) {
        const nx = x + d[0];
        const ny = y + d[1];
        if (!inPalace(side, nx, ny)) return;
        const cell = target(nx, ny);
        if (cell) out.push(cell);
      });
      return out;
    }

    if (piece.type === 'general') {
      ALL8.forEach(function (d) {
        const nx = x + d[0];
        const ny = y + d[1];
        if (!inPalace(side, nx, ny)) return;
        const cell = target(nx, ny);
        if (cell) out.push(cell);
      });
      return out;
    }

    if (piece.type === 'soldier') {
      const forward = side === 'cho' ? -1 : 1;
      [[0, forward], [1, 0], [-1, 0]].forEach(function (d) {
        const cell = target(x + d[0], y + d[1]);
        if (cell) out.push(cell);
      });
      return out;
    }

    return out;
  }

  function findGeneral(board, side) {
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const piece = board[y][x];
        if (piece && piece.side === side && piece.type === 'general') return { x: x, y: y };
      }
    }
    return null;
  }

  /** bySide 쪽 기물이 그 자리를 공격할 수 있는가 */
  function isAttacked(board, x, y, bySide) {
    for (let sy = 0; sy < HEIGHT; sy++) {
      for (let sx = 0; sx < WIDTH; sx++) {
        const piece = board[sy][sx];
        if (!piece || piece.side !== bySide) continue;
        const moves = pseudoMoves(board, sx, sy);
        for (let i = 0; i < moves.length; i++) {
          if (moves[i].x === x && moves[i].y === y) return true;
        }
      }
    }
    return false;
  }

  /** 두 궁이 같은 세로줄에서 마주 보는가 (한나라 장기에서 금지) */
  function generalsFacing(board) {
    const cho = findGeneral(board, 'cho');
    const han = findGeneral(board, 'han');
    if (!cho || !han || cho.x !== han.x) return false;
    const from = Math.min(cho.y, han.y) + 1;
    const to = Math.max(cho.y, han.y);
    for (let y = from; y < to; y++) {
      if (board[y][cho.x]) return false;
    }
    return true;
  }

  /** 이 수를 두면 내 궁이 위험해지는가 */
  function leavesGeneralSafe(board, fromX, fromY, toX, toY) {
    const piece = board[fromY][fromX];
    if (!piece) return false;
    const work = cloneBoard(board);
    work[toY][toX] = work[fromY][fromX];
    work[fromY][fromX] = null;
    const general = findGeneral(work, piece.side);
    if (!general) return false;
    if (isAttacked(work, general.x, general.y, otherSide(piece.side))) return false;
    if (generalsFacing(work)) return false;
    return true;
  }

  function legalMovesAt(board, x, y) {
    const piece = board[y] && board[y][x];
    if (!piece) return [];
    return pseudoMoves(board, x, y).filter(function (move) {
      return leavesGeneralSafe(board, x, y, move.x, move.y);
    });
  }

  /** 한쪽이 둘 수 있는 모든 수 */
  function allLegalMoves(board, side) {
    const out = [];
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const piece = board[y][x];
        if (!piece || piece.side !== side) continue;
        const moves = legalMovesAt(board, x, y);
        moves.forEach(function (move) {
          out.push({ from: { x: x, y: y }, to: { x: move.x, y: move.y }, capture: move.capture, type: piece.type });
        });
      }
    }
    return out;
  }

  const VALUES = { general: 10000, chariot: 130, cannon: 70, horse: 50, elephant: 45, guard: 20, soldier: 20 };

  function material(board) {
    let cho = 0;
    let han = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const piece = board[y][x];
        if (!piece) continue;
        let value = VALUES[piece.type] || 0;
        if (piece.type === 'soldier') {
          value += piece.side === 'cho' ? (9 - y) * 1.5 : y * 1.5;
        }
        if (piece.side === 'cho') cho += value;
        else han += value;
      }
    }
    return cho - han;
  }

  function Game(players, options) {
    const opts = options || {};
    this.players = (players || []).slice(0, 2).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        side: i === 0 ? 'cho' : 'han',
        captured: []
      };
    });
    this.board = createBoard();
    this.turn = 0;
    this.status = 'playing';
    this.finishReason = null;
    this.winnerId = null;
    this.moves = [];
    this.lastMove = null;
    this.maxMoves = Number(opts.options && opts.options.maxMoves) || DEFAULT_MAX_MOVES;
    this.seq = 0;
    this.log = [];
    this.startedAt = Date.now();
    this.pushLog('♟️ 장기를 시작합니다. 초(아래) ' + (this.players[0] ? this.players[0].name : '') + '님이 먼저 둡니다.');
  }

  Game.prototype.pushLog = function (text) {
    this.seq += 1;
    this.log.push({ seq: this.seq, text: text });
    if (this.log.length > 60) this.log.shift();
  };

  Game.prototype.playerById = function (id) {
    return this.players.find(function (p) { return p.id === id; }) || null;
  };

  Game.prototype.sideOf = function (playerId) {
    const p = this.playerById(playerId);
    return p ? p.side : null;
  };

  Game.prototype.currentPlayer = function () {
    return this.players[this.turn] || null;
  };

  Game.prototype.finish = function (reason, winnerId) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'done';
    this.winnerId = winnerId === undefined ? null : winnerId;
    this.finishedAt = Date.now();
  };

  Game.prototype.finishGame = function (reason) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'closed_by_host';
    this.finishedAt = Date.now();
  };

  Game.prototype.move = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    const data = payload || {};
    const from = data.from || {};
    const to = data.to || {};
    const fx = Number(from.x);
    const fy = Number(from.y);
    const tx = Number(to.x);
    const ty = Number(to.y);
    if (![fx, fy, tx, ty].every(Number.isInteger) || !inBoard(fx, fy) || !inBoard(tx, ty)) {
      return { ok: false, reason: 'bad_cell' };
    }
    const piece = this.board[fy][fx];
    if (!piece) return { ok: false, reason: 'empty_cell' };
    if (piece.side !== player.side) return { ok: false, reason: 'not_your_piece' };
    const legal = legalMovesAt(this.board, fx, fy);
    const found = legal.find(function (m) { return m.x === tx && m.y === ty; });
    if (!found) return { ok: false, reason: 'illegal_move' };

    const captured = this.board[ty][tx];
    this.board[ty][tx] = piece;
    this.board[fy][fx] = null;
    this.moves.push({ from: { x: fx, y: fy }, to: { x: tx, y: ty }, side: piece.side, type: piece.type, capture: !!captured });
    this.lastMove = { from: { x: fx, y: fy }, to: { x: tx, y: ty }, side: piece.side, type: piece.type, capture: !!captured };
    if (captured) player.captured.push(captured.type);

    const fromName = String.fromCharCode(65 + fx) + (HEIGHT - fy);
    const toName = String.fromCharCode(65 + tx) + (HEIGHT - ty);
    this.pushLog(player.name + '님 ' + pieceChar(piece) + ' ' + fromName + '→' + toName +
      (captured ? ' (' + pieceChar(captured) + ' 잡음)' : ''));

    if (captured && captured.type === 'general') {
      this.finish('capture_general', playerId);
      this.pushLog('🏆 ' + player.name + '님이 상대 궁을 잡았습니다! 승리!');
      return { ok: true, win: true };
    }

    const opponent = this.players[1 - this.turn];
    this.turn = 1 - this.turn;
    const enemyMoves = allLegalMoves(this.board, opponent.side);
    if (!enemyMoves.length) {
      this.finish('no_moves', playerId);
      const inCheck = isAttacked(this.board, (findGeneral(this.board, opponent.side) || { x: 0, y: 0 }).x,
        (findGeneral(this.board, opponent.side) || { x: 0, y: 0 }).y, player.side);
      this.pushLog('🏆 ' + player.name + '님이 ' + (inCheck ? '외통수' : '상대가 둘 곳이 없어') + ' 승리했습니다!');
      return { ok: true, win: true };
    }
    const enemyGeneral = findGeneral(this.board, opponent.side);
    if (enemyGeneral && isAttacked(this.board, enemyGeneral.x, enemyGeneral.y, player.side)) {
      this.pushLog('⚠️ 장군! ' + opponent.name + '님의 궁이 공격받고 있습니다.');
    }
    if (this.moves.length >= this.maxMoves) {
      this.finish('move_limit', this.materialWinner());
      this.pushLog('🏁 수 제한(' + this.maxMoves + '수)에 이르러 남은 기물 점수로 승부를 냈습니다.');
      return { ok: true, win: !!this.winnerId };
    }
    return { ok: true };
  };

  Game.prototype.materialWinner = function () {
    const diff = material(this.board);
    if (Math.abs(diff) < 1) return null;
    const cho = this.players.find(function (p) { return p.side === 'cho'; });
    const han = this.players.find(function (p) { return p.side === 'han'; });
    return diff > 0 ? (cho ? cho.id : null) : (han ? han.id : null);
  };

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
        side: p.side,
        score: won ? 1 : 0,
        result: self.status !== 'finished' ? '진행 중'
          : self.winnerId === null ? '무승부'
            : won ? '승리 🎉' : '패배'
      };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.seat - b.seat;
    });
    rows.forEach(function (row, i) {
      if (self.winnerId === null) row.rank = 1;
      else row.rank = i + 1;
    });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    const current = this.currentPlayer();
    const me = viewerId ? this.playerById(viewerId) : null;
    const myTurn = !!(me && current && current.id === me.id && this.status === 'playing');
    return {
      gameId: 'janggi',
      width: WIDTH,
      height: HEIGHT,
      status: this.status,
      finishReason: this.finishReason,
      turnPlayerId: this.status === 'playing' && current ? current.id : null,
      youId: viewerId || null,
      youSide: me ? me.side : null,
      board: this.board.map(function (row) {
        return row.map(function (cell) {
          return cell ? { side: cell.side, type: cell.type, char: pieceChar(cell) } : null;
        });
      }),
      legalMoves: myTurn ? allLegalMoves(this.board, me.side) : [],
      lastMove: this.lastMove,
      moveCount: this.moves.length,
      winnerId: this.winnerId,
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          side: p.side,
          captured: p.captured.slice(),
          isTurn: self.status === 'playing' && current && current.id === p.id
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  /**
   * 2수 앞(내 수 + 상대 최선의 응수)을 보는 간단한 탐색.
   * 기물 점수 + 기동성으로 판을 평가합니다.
   */
  function evaluate(board, mySide) {
    const diff = material(board);
    const value = mySide === 'cho' ? diff : -diff;
    return value;
  }

  function orderedMoves(board, side) {
    const moves = allLegalMoves(board, side);
    moves.sort(function (a, b) {
      const av = a.capture ? (VALUES[a.type] || 0) : 0;
      const bv = b.capture ? (VALUES[b.type] || 0) : 0;
      return bv - av;
    });
    return moves;
  }

  function applyMove(board, move) {
    const next = cloneBoard(board);
    next[move.to.y][move.to.x] = next[move.from.y][move.from.x];
    next[move.from.y][move.from.x] = null;
    return next;
  }

  function botChoose(game) {
    const me = game.currentPlayer();
    if (!me) return null;
    const myMoves = orderedMoves(game.board, me.side).slice(0, 40);
    if (!myMoves.length) return null;
    const enemy = otherSide(me.side);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < myMoves.length; i++) {
      const move = myMoves[i];
      const target = game.board[move.to.y][move.to.x];
      if (target && target.type === 'general') return move;
      const next = applyMove(game.board, move);
      let score = evaluate(next, me.side);
      if (move.capture && target) score += (VALUES[target.type] || 0) * 0.6;
      // 상대 응수 중 가장 아픈 수를 빼 줍니다.
      const replies = orderedMoves(next, enemy).slice(0, 10);
      let worst = 0;
      for (let k = 0; k < replies.length; k++) {
        const reply = replies[k];
        const victim = next[reply.to.y][reply.to.x];
        let loss = 0;
        if (victim) loss = (VALUES[victim.type] || 0) * 0.8;
        const after = applyMove(next, reply);
        loss += (evaluate(next, me.side) - evaluate(after, me.side)) * 0.2;
        if (loss > worst) worst = loss;
      }
      score -= worst;
      score += Math.random() * 8;
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }

  function botAction(game) {
    const player = game.currentPlayer();
    if (!player) return null;
    if (game.status !== 'playing') return null;
    const move = botChoose(game);
    if (!move) return null;
    return { playerId: player.id, action: 'move', payload: { from: move.from, to: move.to } };
  }

  function BotDriver(game) {
    this.game = game;
  }

  BotDriver.prototype.tick = function () {
    const game = this.game;
    if (!game || game.status !== 'playing') return null;
    const player = game.currentPlayer();
    if (!player || !player.isBot) return null;
    return botAction(game);
  };

  return {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    BOT_NAMES: BOT_NAMES,
    TYPE_NAME: TYPE_NAME,
    VALUES: VALUES,
    createBoard: createBoard,
    cloneBoard: cloneBoard,
    inBoard: inBoard,
    inPalace: inPalace,
    pieceChar: pieceChar,
    pseudoMoves: pseudoMoves,
    legalMovesAt: legalMovesAt,
    allLegalMoves: allLegalMoves,
    isAttacked: isAttacked,
    generalsFacing: generalsFacing,
    findGeneral: findGeneral,
    material: material,
    Game: Game,
    BotDriver: BotDriver,
    botAction: botAction,
    botChoose: botChoose
  };
});
