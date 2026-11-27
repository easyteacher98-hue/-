/*
 * 도둑잡기 – 게임 엔진 (공용, UMD)
 * - 귀여운 동물 짝 12쌍(24장) + 도둑 카드 1장 = 25장
 * - 시작할 때 같은 그림 짝은 자동으로 버립니다.
 * - 자기 차례에 앞사람(왼쪽 친구)의 패에서 1장을 뽑아, 짝이 맞으면 버립니다.
 * - 손패를 먼저 다 털어낸 사람이 1등, 마지막까지 도둑 카드를 들고 있는 사람이 꼴찌!
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OldMaid = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 5;
  const BOT_NAMES = ['도둑봇 몽이', '도둑봇 콩이', '도둑봇 보리', '도둑봇 두리'];
  const PAIR_EMOJI = ['🐶', '🐱', '🐰', '🐼', '🦊', '🐷', '🐸', '🐵', '🐯', '🐨', '🦁', '🐮'];
  const THIEF_EMOJI = '🃏';

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

  /** 25장: 동물 짝 12쌍 + 도둑 1장 */
  function makeDeck() {
    const deck = [];
    PAIR_EMOJI.forEach(function (emoji, index) {
      deck.push({ id: 'a' + index + '-1', emoji: emoji, pair: 'p' + index, thief: false });
      deck.push({ id: 'a' + index + '-2', emoji: emoji, pair: 'p' + index, thief: false });
    });
    deck.push({ id: 'thief', emoji: THIEF_EMOJI, pair: null, thief: true });
    return deck;
  }

  function Game(players, options) {
    const opts = options || {};
    this.rng = makeRng(opts.seed || Math.floor(Math.random() * 1e9));
    this.players = (players || []).slice(0, MAX_PLAYERS).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        hand: [],
        finished: false,
        rank: null,
        discarded: 0
      };
    });
    const deck = shuffle(makeDeck(), this.rng);
    let idx = 0;
    while (idx < deck.length) {
      this.players[idx % this.players.length].hand.push(deck[idx]);
      idx += 1;
    }
    this.finishedOrder = [];
    const self = this;
    this.players.forEach(function (p) {
      self.autoDiscard(p, true);
    });
    this.turn = 0;
    this.status = 'playing';
    this.finishReason = null;
    this.winnerId = null;
    this.thiefId = 'thief';
    this.thiefHolderId = null;
    this.lastDraw = null;
    this.moves = 0;
    this.seq = 0;
    this.log = [];
    this.startedAt = Date.now();
    this.pushLog('🃏 도둑잡기를 시작합니다. 짝이 맞은 카드는 자동으로 버렸어요. 도둑 카드를 피해 손패를 먼저 털어내세요!');
    // 시작하자마자 손패가 빈 사람(짝만 받은 경우)은 바로 1등입니다.
    this.players.forEach(function (p) {
      if (!p.hand.length) self.finishPlayer(p);
    });
    const alive = this.players.filter(function (p) { return !p.finished; });
    if (alive.length <= 1) {
      if (alive.length === 1) alive[0].rank = this.players.length;
      this.finish('last_with_thief', this.finishedOrder[0] || null);
    }
    const first = this.currentPlayer();
    if (first && this.status === 'playing') this.pushLog(first.name + '님부터 앞사람 패에서 카드를 뽑습니다.');
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

  /** 같은 그림 짝을 버립니다. (버린 쌍 수를 돌려줍니다) */
  Game.prototype.autoDiscard = function (player, silent) {
    const counts = {};
    player.hand.forEach(function (card) {
      if (card.thief) return;
      counts[card.pair] = (counts[card.pair] || 0) + 1;
    });
    const keep = player.hand.filter(function (card) {
      if (card.thief) return true;
      return (counts[card.pair] || 0) % 2 === 1;
    });
    const pairs = Math.round((player.hand.length - keep.length) / 2);
    player.hand = keep;
    player.discarded += pairs;
    if (pairs && !silent) this.pushLog(player.name + '님이 짝 ' + pairs + '쌍을 버렸습니다.');
    return pairs;
  };

  /** 앞사람(왼쪽 친구): 이번 차례 사람의 바로 앞 자리, 없으면 다음 사람 */
  Game.prototype.prevOf = function (player) {
    const n = this.players.length;
    const start = this.players.indexOf(player);
    for (let step = 1; step <= n; step++) {
      const candidate = this.players[(start - step + n * 2) % n];
      if (candidate && !candidate.finished && candidate.id !== player.id) return candidate;
    }
    return null;
  };

  Game.prototype.nextTurn = function () {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.turn + step) % n;
      if (!this.players[idx].finished) {
        this.turn = idx;
        return;
      }
    }
    this.turn = (this.turn + 1) % n;
  };

  Game.prototype.finishPlayer = function (player) {
    if (player.finished) return;
    player.finished = true;
    this.finishedOrder.push(player.id);
    player.rank = this.finishedOrder.length;
    this.pushLog('🎉 ' + player.name + '님이 손패를 모두 털었습니다! (' + player.rank + '등)');
  };

  Game.prototype.finish = function (reason, winnerId) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'done';
    this.winnerId = winnerId === undefined ? (this.finishedOrder[0] || null) : winnerId;
    const holder = this.players.find(function (p) {
      return p.hand.some(function (c) { return c.thief; });
    });
    this.thiefHolderId = holder ? holder.id : null;
    this.finishedAt = Date.now();
  };

  Game.prototype.finishGame = function (reason) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'closed_by_host';
    this.finishedAt = Date.now();
  };

  /** 카드 뽑기: payload = { index } (앞사람 패에서 몇 번째 카드) */
  Game.prototype.draw = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    const prev = this.prevOf(player);
    if (!prev) return { ok: false, reason: 'no_target' };
    if (!prev.hand.length) return { ok: false, reason: 'empty_hand' };

    const data = payload || {};
    let index = Number(data.index);
    if (!Number.isInteger(index) || index < 0 || index >= prev.hand.length) {
      index = Math.floor(this.rng() * prev.hand.length);
    }
    const card = prev.hand.splice(index, 1)[0];
    player.hand.push(card);
    this.moves += 1;

    let paired = false;
    if (!card.thief) {
      const match = player.hand.find(function (c) { return c.id !== card.id && c.pair === card.pair; });
      if (match) {
        player.hand = player.hand.filter(function (c) { return c.id !== card.id && c.id !== match.id; });
        player.discarded += 1;
        paired = true;
      }
    }
    this.lastDraw = {
      fromId: prev.id,
      toId: player.id,
      cardId: card.id,
      emoji: card.emoji,
      thief: card.thief,
      paired: paired
    };
    this.pushLog(player.name + '님이 ' + prev.name + '님에게서 ' +
      (card.thief ? '도둑 카드 🃏' : card.emoji) + (paired ? '를 뽑아 짝을 맞춰 버렸습니다!' : '를 뽑았습니다.'));

    // 앞사람이 카드를 다 넘겨줬으면 앞사람도 손패를 턴 것입니다.
    if (!prev.hand.length) this.finishPlayer(prev);
    if (!player.hand.length) this.finishPlayer(player);

    const remaining = this.players.filter(function (p) { return !p.finished; });
    if (remaining.length <= 1) {
      const loser = remaining[0] || null;
      if (loser) {
        loser.rank = this.players.length;
        this.pushLog('😢 ' + loser.name + '님이 도둑 카드를 들고 있어 꼴찌가 되었습니다.');
        this.finish('last_with_thief', this.finishedOrder[0] || null);
      } else {
        this.finish('all_clear', this.finishedOrder[0] || null);
      }
      return { ok: true, card: card.emoji, paired: paired, finished: true };
    }

    this.nextTurn();
    return { ok: true, card: card.emoji, paired: paired };
  };

  Game.prototype.ranking = function () {
    const self = this;
    const rows = this.players.map(function (p) {
      const holdsThief = p.hand.some(function (c) { return c.thief; });
      let result;
      if (holdsThief && self.status === 'finished') result = '도둑 카드 · 꼴찌';
      else if (p.rank) result = p.rank + '등 · 손패 털기 성공';
      else result = '남은 카드 ' + p.hand.length + '장';
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        isBot: p.isBot,
        seat: p.seat,
        score: p.rank ? self.players.length - p.rank + 1 : 0,
        rank: p.rank || (self.status === 'finished' ? self.players.length : null),
        result: result,
        holdsThief: holdsThief,
        left: p.hand.length
      };
    });
    rows.sort(function (a, b) {
      if (a.rank !== b.rank) return (a.rank || 99) - (b.rank || 99);
      return a.seat - b.seat;
    });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    const me = viewerId ? this.playerById(viewerId) : null;
    const current = this.currentPlayer();
    const target = me && current && current.id === me.id ? this.prevOf(me) : null;
    return {
      gameId: 'oldmaid',
      status: this.status,
      finishReason: this.finishReason,
      turnPlayerId: this.status === 'playing' && current ? current.id : null,
      youId: viewerId || null,
      hand: me ? me.hand.map(function (c) {
        return { id: c.id, emoji: c.emoji, thief: !!c.thief, pair: c.pair };
      }) : [],
      targetId: target ? target.id : null,
      targetCount: target ? target.hand.length : 0,
      thiefHolderId: this.status === 'finished' ? this.thiefHolderId : null,
      lastDraw: this.lastDraw,
      winnerId: this.winnerId,
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          count: p.hand.length,
          finished: p.finished,
          rank: p.rank,
          isTurn: self.status === 'playing' && current && current.id === p.id,
          isYou: p.id === viewerId
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  function botAction(game, player) {
    const prev = game.prevOf(player);
    if (!prev || !prev.hand.length) return { action: 'draw', payload: { index: 0 } };
    // 도둑 카드를 피할 수는 없으니, 무작위로 한 장 뽑습니다.
    const index = Math.floor(Math.random() * prev.hand.length);
    return { action: 'draw', payload: { index: index } };
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
    BOT_NAMES: BOT_NAMES,
    PAIR_EMOJI: PAIR_EMOJI,
    THIEF_EMOJI: THIEF_EMOJI,
    makeDeck: makeDeck,
    makeRng: makeRng,
    shuffle: shuffle,
    Game: Game,
    BotDriver: BotDriver,
    botAction: botAction
  };
});
