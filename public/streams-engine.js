/*
 * 숫자 줄세우기 – 게임 엔진 (공용)
 * - Node.js(require)와 브라우저(window.Streams) 양쪽에서 동작하는 UMD 모듈입니다.
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 *
 * 규칙 (초등 수업용으로 다듬은 '줄세우기' 게임)
 *   - 1~30 숫자 타일 30장을 섞어 한 장씩 공개합니다.
 *   - 같은 숫자를 모두가 동시에, 자기 20칸 트랙의 빈칸에 놓습니다.
 *   - 트랙은 왼쪽에서 오른쪽으로 반드시 커져야 합니다. (작은 수는 왼쪽, 큰 수는 오른쪽)
 *   - 놓을 수 있는 칸이 없으면 그 숫자는 버리고 이번 판을 쉽니다.
 *   - 30장을 다 쓰거나 20칸이 다 차면 끝나고, '끊기지 않고 이어진 가장 긴 구간'이 점수입니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Streams = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRACK = 20;
  const TILE_MIN = 1;
  const TILE_MAX = 30;
  const MIN_PLAYERS = 1;
  const MAX_PLAYERS = 4;

  function createRng(seed) {
    let s = (seed === undefined || seed === null ? Date.now() : seed) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
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

  /** 트랙에서 끊기지 않고 이어진 가장 긴 구간의 길이 */
  function longestRun(track) {
    let best = 0;
    let cur = 0;
    for (let i = 0; i < track.length; i++) {
      if (track[i] === null || track[i] === undefined) {
        cur = 0;
      } else {
        cur += 1;
        if (cur > best) best = cur;
      }
    }
    return best;
  }

  function filledCount(track) {
    let n = 0;
    for (let i = 0; i < track.length; i++) if (track[i] !== null && track[i] !== undefined) n += 1;
    return n;
  }

  /** 이 칸에 value 를 놓아도 왼쪽은 모두 작고 오른쪽은 모두 커지는지 */
  function canPlaceAt(track, slot, value) {
    if (slot < 0 || slot >= track.length) return false;
    if (track[slot] !== null && track[slot] !== undefined) return false;
    for (let i = slot - 1; i >= 0; i--) {
      const v = track[i];
      if (v === null || v === undefined) continue;
      if (v >= value) return false;
    }
    for (let i = slot + 1; i < track.length; i++) {
      const v = track[i];
      if (v === null || v === undefined) continue;
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

  function Game(players, options) {
    const opts = options || {};
    this.rng = typeof opts.rng === 'function' ? opts.rng : createRng(opts.seed);
    this.trackSize = TRACK;
    this.tileMax = TILE_MAX;
    this.players = (players || []).slice(0, MAX_PLAYERS).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        track: new Array(TRACK).fill(null),
        discarded: 0,
        score: 0,
        filled: 0,
        lastSlot: null
      };
    });
    this.deck = shuffled(range(TILE_MIN, TILE_MAX), this.rng);
    this.round = 0;
    this.value = null;
    this.waiting = [];
    this.status = 'playing';
    this.finishReason = null;
    this.seq = 0;
    this.lastMove = null;
    this.log = [];
    this.pushLog('🎯 숫자 줄세우기를 시작합니다. 같은 숫자를 모두 함께 놓습니다. (작은 수 → 왼쪽)');
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
    let guard = 0;
    while (this.status === 'playing' && guard < 60) {
      guard += 1;
      if (!this.deck.length) return this.finish('deck_empty');
      const everyoneFull = this.players.every(function (p) { return p.filled >= TRACK; });
      if (everyoneFull) return this.finish('board_full');

      this.value = this.deck.pop();
      this.round += 1;
      this.waiting = [];
      const value = this.value;
      const self = this;
      this.players.forEach(function (player) {
        if (filledCount(player.track) >= TRACK) return;
        player.lastSlot = null;
        if (!validSlots(player.track, value).length) {
          player.discarded += 1;
          self.pushLog('···' + player.name + '님은 ' + value + '을(를) 놓을 칸이 없어 이번 판을 쉽니다.');
          return;
        }
        self.waiting.push(player.id);
      });
      if (this.waiting.length) {
        this.pushLog('🎲 ' + this.round + '번째 숫자: ' + value + ' — 놓을 칸을 골라 주세요.');
        return;
      }
      this.pushLog('🎲 ' + this.round + '번째 숫자: ' + value + ' — 아무도 놓을 칸이 없어 넘어갑니다.');
    }
    if (this.status === 'playing') this.finish('done');
  };

  Game.prototype.advanceIfReady = function () {
    if (this.status !== 'playing') return;
    if (this.waiting.length) return;
    const allFull = this.players.every(function (p) { return p.filled >= TRACK; });
    if (allFull) return this.finish('board_full');
    if (!this.deck.length) return this.finish('deck_empty');
    this.nextRound();
  };

  /** 지금 공개된 숫자를 슬롯에 놓습니다. */
  Game.prototype.place = function (playerId, slot) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const index = Number(slot);
    if (this.waiting.indexOf(playerId) === -1) {
      return { ok: false, reason: this.value === null ? 'no_tile' : 'already_done' };
    }
    if (!Number.isInteger(index) || index < 0 || index >= TRACK) return { ok: false, reason: 'bad_slot' };
    if (!canPlaceAt(player.track, index, this.value)) return { ok: false, reason: 'bad_slot' };

    player.track[index] = this.value;
    player.lastSlot = index;
    player.filled = filledCount(player.track);
    player.score = longestRun(player.track);
    this.lastMove = { seq: this.seq + 1, playerId: playerId, value: this.value, slot: index };
    this.pushLog(player.name + '님이 ' + this.value + '을(를) ' + (index + 1) + '번째 칸에 놓았습니다. (이어진 구간 ' + player.score + ')');
    this.waiting = this.waiting.filter(function (id) { return id !== playerId; });
    if (player.filled >= TRACK) this.pushLog('🎉 ' + player.name + '님의 트랙 20칸이 모두 찼습니다!');
    this.advanceIfReady();
    return { ok: true };
  };

  /** 놓을 칸이 없어 이번 판을 쉽니다. (화면에서는 자동 처리되지만 버튼도 지원) */
  Game.prototype.skip = function (playerId) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    if (this.waiting.indexOf(playerId) === -1) return { ok: false, reason: 'already_done' };
    const player = this.playerById(playerId);
    if (player && validSlots(player.track, this.value).length) return { ok: false, reason: 'must_place' };
    this.waiting = this.waiting.filter(function (id) { return id !== playerId; });
    this.advanceIfReady();
    return { ok: true };
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
        discarded: p.discarded,
        longest: p.score
      };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.filled !== a.filled) return b.filled - a.filled;
      if (a.discarded !== b.discarded) return a.discarded - b.discarded;
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
    return {
      gameId: 'streams',
      status: this.status,
      finishReason: this.finishReason,
      trackSize: TRACK,
      tileMax: TILE_MAX,
      round: this.round,
      value: this.value,
      waiting: this.waiting.slice(),
      remaining: this.deck.length,
      youCanPlace: !!(viewerId && this.waiting.indexOf(viewerId) !== -1),
      youSlots: viewerId ? validSlots((this.playerById(viewerId) || { track: [] }).track || [], this.value) : [],
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
          discarded: p.discarded,
          done: p.filled >= TRACK,
          isYou: p.id === viewerId,
          acted: p.lastSlot !== null || self.value === null || validSlots(p.track, self.value).length === 0
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-8)
    };
  };

  /**
   * 봇: '이 숫자는 이쯤에 놓는다'는 기준(숫자 위치에 비례한 칸)에 가장 가까운 빈칸을 고릅니다.
   * 앞으로 나올 숫자를 위해 빈 공간을 고르게 남기는 방법입니다.
   */
  function botChoice(game, player) {
    if (game.status !== 'playing' || game.value === null || !player) return null;
    const slots = validSlots(player.track, game.value);
    if (!slots.length) return null;
    const target = (game.value / (TILE_MAX + 1)) * (TRACK - 1);
    let best = null;
    let bestScore = -1e9;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      let score = -Math.abs(slot - target) * 10;
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
    if (slot === null) return { playerId: player.id, action: 'skip', payload: null };
    return { playerId: player.id, action: 'place', payload: { slot: slot } };
  };

  return {
    TRACK: TRACK,
    TILE_MIN: TILE_MIN,
    TILE_MAX: TILE_MAX,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    createRng: createRng,
    shuffled: shuffled,
    longestRun: longestRun,
    filledCount: filledCount,
    canPlaceAt: canPlaceAt,
    validSlots: validSlots,
    Game: Game,
    BotDriver: BotDriver
  };
});
