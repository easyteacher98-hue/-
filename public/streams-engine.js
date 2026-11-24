/*
 * 숫자 줄세우기 – 게임 엔진 (공용)
 * - Node.js(require)와 브라우저(window.Streams) 양쪽에서 동작하는 UMD 모듈입니다.
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 *
 * 규칙 (초등 수업용으로 다듬은 '줄세우기' 게임)
 *   - 1~30 숫자 타일 + 만능 조커(★) 2장을 섞어, 그중 20장을 한 장씩 공개합니다.
 *   - 20번의 차례 동안 모두가 동시에, 자기 20칸 트랙의 빈칸에 한 장씩 놓습니다.
 *   - 트랙은 왼쪽에서 오른쪽으로 커지는 것이 이상적입니다. (작은 수는 왼쪽, 큰 수는 오른쪽)
 *   - 조커(★)는 어떤 숫자 사이에도 들어가고, 앞뒤 숫자가 이어지도록 만들어 줍니다.
 *   - 오름차순에 맞는 칸이 없어도 반드시 빈칸 하나에 놓아야 합니다. (그 자리에서 줄이 끊깁니다)
 *   - 20칸을 모두 채우면 끝나고, '왼쪽에서 오른쪽으로 커지며 끊기지 않고 이어진 가장 긴 구간'이 점수입니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Streams = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRACK = 20;          // 트랙 칸 수 = 한 판에 공개하는 타일 수
  const ROUNDS = 20;         // 20칸을 다 채울 때까지 진행
  const TILE_MIN = 1;
  const TILE_MAX = 30;
  const JOKER_COUNT = 2;     // 만능 타일 ★
  const JOKER = '★';
  const MIN_PLAYERS = 1;
  const MAX_PLAYERS = 4;

  function createRng(seed) {
    let s = (seed === undefined || seed === null ? Date.now() : seed) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function isJoker(value) {
    return value === JOKER;
  }

  function isFilled(value) {
    return value !== null && value !== undefined;
  }

  function displayValue(value) {
    return isJoker(value) ? JOKER + ' 조커' : String(value);
  }

  /**
   * 조사 선택: 숫자/한글 마지막 글자에 받침이 있으면 withBatchim('을'), 없으면 withoutBatchim('를').
   * (10 → 십 → 을, 2 → 이 → 를 처럼 숫자도 소리대로 고릅니다)
   */
  const DIGIT_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
  function josa(value, withBatchim, withoutBatchim) {
    const text = String(value === undefined || value === null ? '' : value);
    if (!text) return withoutBatchim;
    const last = text.charAt(text.length - 1);
    if (last >= '0' && last <= '9') return DIGIT_BATCHIM[last] ? withBatchim : withoutBatchim;
    const code = last.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return withoutBatchim;
    return ((code - 0xac00) % 28) ? withBatchim : withoutBatchim;
  }

  function shuffled(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function range(min, max) {
    const out = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
  }

  /** 왼쪽 값 → 오른쪽 값이 오름차순으로 이어지는지 (조커는 어디에나 끼어 이어 줍니다) */
  function keepsOrder(left, right) {
    if (isJoker(left) || isJoker(right)) return true;
    if (typeof left !== 'number' || typeof right !== 'number') return false;
    return left < right;
  }

  /**
   * 트랙에서 '왼쪽에서 오른쪽으로 커지며 끊기지 않고 이어진 가장 긴 구간'의 길이.
   * 강제로 놓아 순서가 끊긴 자리에서 구간이 새로 시작됩니다. (조커는 끊지 않습니다)
   */
  function longestRun(track) {
    let best = 0;
    let cur = 0;
    let prevFilled = false;
    let prevValue = null;
    for (let i = 0; i < track.length; i++) {
      const v = track[i];
      if (!isFilled(v)) {
        cur = 0;
        prevFilled = false;
        prevValue = null;
        continue;
      }
      cur = (prevFilled && keepsOrder(prevValue, v)) ? cur + 1 : 1;
      prevFilled = true;
      prevValue = v;
      if (cur > best) best = cur;
    }
    return best;
  }

  function filledCount(track) {
    let n = 0;
    for (let i = 0; i < track.length; i++) if (isFilled(track[i])) n += 1;
    return n;
  }

  /** 이 칸에 value 를 놓아도 왼쪽은 모두 작고 오른쪽은 모두 커지는지 (조커 칸은 통과) */
  function canPlaceAt(track, slot, value) {
    if (slot < 0 || slot >= track.length) return false;
    if (isFilled(track[slot])) return false;
    if (isJoker(value)) return true;
    for (let i = slot - 1; i >= 0; i--) {
      const v = track[i];
      if (!isFilled(v)) continue;
      if (isJoker(v)) continue;
      if (v >= value) return false;
    }
    for (let i = slot + 1; i < track.length; i++) {
      const v = track[i];
      if (!isFilled(v)) continue;
      if (isJoker(v)) continue;
      if (v <= value) return false;
    }
    return true;
  }

  function validSlots(track, value) {
    const out = [];
    for (let i = 0; i < track.length; i++) {
      if (canPlaceAt(track, i, value)) out.push(i);
    }
    return out;
  }

  /** 빈칸 목록 (오름차순에 맞는 칸이 없을 때 강제로 놓을 수 있는 칸) */
  function emptySlots(track) {
    const out = [];
    for (let i = 0; i < track.length; i++) if (!isFilled(track[i])) out.push(i);
    return out;
  }

  function makePool() {
    const pool = range(TILE_MIN, TILE_MAX);
    for (let i = 0; i < JOKER_COUNT; i++) pool.push(JOKER);
    return pool;
  }

  function Game(players, options) {
    const opts = options || {};
    this.rng = typeof opts.rng === 'function' ? opts.rng : createRng(opts.seed);
    this.trackSize = TRACK;
    this.tileMax = TILE_MAX;
    this.roundsTotal = ROUNDS;
    this.players = (players || []).slice(0, MAX_PLAYERS).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        track: new Array(TRACK).fill(null),
        score: 0,
        filled: 0,
        lastSlot: null,
        forcedTurns: 0
      };
    });
    // 1~30 숫자 + ★ 2장을 섞어 그중 20장만 사용합니다. (한 판 = 20차례)
    this.deck = shuffled(makePool(), this.rng).slice(0, ROUNDS);
    this.round = 0;
    this.value = null;
    this.waiting = [];
    this.forced = {};
    this.status = 'playing';
    this.finishReason = null;
    this.seq = 0;
    this.lastMove = null;
    this.log = [];
    this.pushLog('🎯 숫자 줄세우기를 시작합니다. 20칸을 다 채울 때까지 모두 함께 놓습니다. (작은 수 → 왼쪽)');
    this.nextRound();
  }

  Game.prototype.playerById = function (id) {
    return this.players.find(function (p) { return p.id === id; }) || null;
  };

  Game.prototype.pushLog = function (text) {
    this.seq += 1;
    this.log.push({ seq: this.seq, text: text });
    if (this.log.length > 40) this.log.shift();
  };

  Game.prototype.nextRound = function () {
    if (this.status !== 'playing') return;
    if (!this.deck.length) return this.finish('rounds_done');
    const everyoneFull = this.players.every(function (p) { return p.filled >= TRACK; });
    if (everyoneFull) return this.finish('board_full');

    this.value = this.deck.pop();
    this.round += 1;
    this.waiting = [];
    this.forced = {};
    const value = this.value;
    const self = this;
    this.players.forEach(function (player) {
      if (filledCount(player.track) >= TRACK) return;
      player.lastSlot = null;
      // 오름차순에 맞는 칸이 없으면 빈칸 아무 곳에나 강제로 놓습니다.
      if (!validSlots(player.track, value).length) self.forced[player.id] = true;
      self.waiting.push(player.id);
    });
    this.pushLog('🎲 ' + this.round + '번째 타일: ' + displayValue(value) +
      (isJoker(value) ? ' — 조커는 어디에나 놓을 수 있어요!' : ' — 놓을 칸을 골라 주세요.'));
  };

  Game.prototype.advanceIfReady = function () {
    if (this.status !== 'playing') return;
    if (this.waiting.length) return;
    const allFull = this.players.every(function (p) { return p.filled >= TRACK; });
    if (allFull) return this.finish('board_full');
    if (this.round >= ROUNDS || !this.deck.length) return this.finish('rounds_done');
    this.nextRound();
  };

  /** 지금 공개된 타일을 슬롯에 놓습니다. (오름차순 칸이 없으면 빈칸 아무 곳이나) */
  Game.prototype.place = function (playerId, slot) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const index = Number(slot);
    if (this.waiting.indexOf(playerId) === -1) {
      return { ok: false, reason: this.value === null ? 'no_tile' : 'already_done' };
    }
    if (!Number.isInteger(index) || index < 0 || index >= TRACK) return { ok: false, reason: 'bad_slot' };
    if (isFilled(player.track[index])) return { ok: false, reason: 'bad_slot' };

    const options = validSlots(player.track, this.value);
    const ordered = options.indexOf(index) !== -1;
    // 반드시 놓아야 합니다. 오름차순에 맞는 칸이 있을 때는 그 칸에만 놓을 수 있습니다.
    if (!ordered && options.length) return { ok: false, reason: 'bad_slot' };

    player.track[index] = this.value;
    player.lastSlot = index;
    player.filled = filledCount(player.track);
    player.score = longestRun(player.track);
    if (!ordered) player.forcedTurns += 1;
    this.lastMove = { seq: this.seq + 1, playerId: playerId, value: this.value, slot: index, forced: !ordered };
    this.pushLog(player.name + '님이 ' + displayValue(this.value) + josa(isJoker(this.value) ? '조커' : this.value, '을', '를') +
      ' ' + (index + 1) + '번째 칸에 놓았습니다. (이어진 구간 ' + player.score + ')' +
      (ordered ? '' : ' ⚠️ 오름차순이 끊겼어요.'));
    this.waiting = this.waiting.filter(function (id) { return id !== playerId; });
    if (player.filled >= TRACK) this.pushLog('🎉 ' + player.name + '님의 트랙 20칸이 모두 찼습니다!');
    this.advanceIfReady();
    return { ok: true, forced: !ordered, score: player.score };
  };

  /** 이제는 건너뛰기가 없습니다. (빈칸이 있으면 반드시 놓아야 합니다) */
  Game.prototype.skip = function (playerId) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    return { ok: false, reason: 'must_place' };
  };

  Game.prototype.finish = function (reason) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'done';
    this.waiting = [];
    this.players.forEach(function (p) {
      p.filled = filledCount(p.track);
      p.score = longestRun(p.track);
    });
    const best = this.ranking()[0];
    if (best) this.pushLog('🏆 ' + best.name + '님이 가장 긴 구간 ' + (best.score || 0) + '칸으로 우승했습니다!');
  };

  /** 서버의 방장 '게임 종료'에서 사용 */
  Game.prototype.finishGame = function (reason) {
    this.finish(reason || 'closed_by_host');
  };

  Game.prototype.ranking = function () {
    const rows = this.players.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        isBot: p.isBot,
        seat: p.seat,
        score: p.score,
        filled: p.filled,
        forcedTurns: p.forcedTurns,
        longest: p.score
      };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.filled !== a.filled) return b.filled - a.filled;
      if (a.forcedTurns !== b.forcedTurns) return a.forcedTurns - b.forcedTurns;
      return a.seat - b.seat;
    });
    rows.forEach(function (row, i) { row.rank = i + 1; });
    return rows;
  };

  Game.prototype.winnerId = function () {
    const top = this.ranking()[0];
    return top ? top.id : null;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    const viewer = viewerId ? this.playerById(viewerId) : null;
    const viewerOptions = viewer ? validSlots(viewer.track, this.value) : [];
    return {
      gameId: 'streams',
      status: this.status,
      finishReason: this.finishReason,
      trackSize: TRACK,
      tileMax: TILE_MAX,
      roundsTotal: ROUNDS,
      round: this.round,
      value: this.value,
      joker: isJoker(this.value),
      waiting: this.waiting.slice(),
      remaining: this.deck.length,
      youCanPlace: !!(viewerId && this.waiting.indexOf(viewerId) !== -1),
      youSlots: viewer ? (viewerOptions.length ? viewerOptions : emptySlots(viewer.track)) : [],
      youForced: !!(viewer && this.waiting.indexOf(viewerId) !== -1 && viewerOptions.length === 0),
      lastMove: this.lastMove,
      youId: viewerId || null,
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          track: p.track.slice(),
          score: p.score,
          filled: p.filled,
          forcedTurns: p.forcedTurns,
          done: p.filled >= TRACK,
          isYou: p.id === viewerId,
          acted: p.lastSlot !== null
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /**
   * 봇: '이 숫자는 이쯤에 놓는다'는 기준(숫자 위치에 비례한 칸)에 가장 가까운 칸을 고릅니다.
   * 앞으로 나올 숫자를 위해 빈 공간을 고르게 남기는 방법입니다.
   * 오름차순에 맞는 칸이 없으면 빈칸 중 가장 어울리는 곳에 강제로 놓습니다.
   */
  function botChoice(game, player) {
    if (game.status !== 'playing' || game.value === null || !player) return null;
    let slots = validSlots(player.track, game.value);
    if (!slots.length) slots = emptySlots(player.track);
    if (!slots.length) return null;
    const target = (Number(game.value) / (TILE_MAX + 1)) * (TRACK - 1);
    const want = isJoker(game.value) ? (TRACK - 1) / 2 : target;
    let best = null;
    let bestScore = -1e9;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      let score = -Math.abs(slot - want) * 10;
      if (player.track[slot - 1] !== null && player.track[slot - 1] !== undefined) score += 3;
      if (player.track[slot + 1] !== null && player.track[slot + 1] !== undefined) score += 3;
      score += game.rng() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = slot;
      }
    }
    return best;
  }

  function BotDriver(game, options) {
    this.game = game;
    this.level = (options && options.level) || 'normal';
  }

  BotDriver.prototype.tick = function () {
    const game = this.game;
    if (!game || game.status !== 'playing') return null;
    const pending = game.waiting
      .map(function (id) { return game.playerById(id); })
      .filter(function (p) { return p && p.isBot; });
    if (!pending.length) return null;
    const player = pending[0];
    const slot = botChoice(game, player);
    if (slot === null) return null;
    return { playerId: player.id, action: 'place', payload: { slot: slot } };
  };

  return {
    TRACK: TRACK,
    ROUNDS: ROUNDS,
    TILE_MIN: TILE_MIN,
    TILE_MAX: TILE_MAX,
    JOKER: JOKER,
    JOKER_COUNT: JOKER_COUNT,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    createRng: createRng,
    josa: josa,
    isJoker: isJoker,
    isFilled: isFilled,
    displayValue: displayValue,
    shuffled: shuffled,
    longestRun: longestRun,
    filledCount: filledCount,
    canPlaceAt: canPlaceAt,
    validSlots: validSlots,
    emptySlots: emptySlots,
    makePool: makePool,
    Game: Game,
    BotDriver: BotDriver
  };
});
