/*
 * 컬러 숫자 카드 – 게임 엔진 (공용, UMD)
 * - 4색 × 1~9 + 특수 카드(점프·방향전환·+2 공격)를 색마다 1장씩 + 색 바꾸기 4장 = 52장
 * - 같은 색이거나 같은 숫자(또는 같은 특수 카드)를 내고, 낼 카드가 없으면 1장 뽑습니다.
 * - 손패를 먼저 0장으로 만든 사람이 승리! (원카드와 비슷하지만 이름·그림·규칙을 새로 만든 자체 게임입니다)
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OneCard = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 5;
  const HAND_SIZE = 7;
  const COLORS = ['red', 'blue', 'yellow', 'green'];
  const COLOR_NAMES = { red: '빨강', blue: '파랑', yellow: '노랑', green: '초록' };
  const TYPE_NAMES = { number: '숫자', skip: '점프', reverse: '방향전환', draw2: '+2 공격', wild: '색 바꾸기', draw4: '무지개 +4' };
  const BOT_NAMES = ['카드봇 별이', '카드봇 솔이', '카드봇 보라', '카드봇 초코'];

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

  function makeDeck() {
    const deck = [];
    COLORS.forEach(function (color) {
      for (let value = 1; value <= 9; value++) {
        deck.push({ id: color.charAt(0) + value, color: color, type: 'number', value: value });
      }
      deck.push({ id: color.charAt(0) + 'skip', color: color, type: 'skip', value: 0 });
      deck.push({ id: color.charAt(0) + 'rev', color: color, type: 'reverse', value: 0 });
      deck.push({ id: color.charAt(0) + 'd2', color: color, type: 'draw2', value: 0 });
    });
    for (let i = 0; i < 4; i++) {
      deck.push({ id: 'wild' + (i + 1), color: null, type: 'wild', value: 0 });
    }
    for (let i = 0; i < 4; i++) {
      deck.push({ id: 'd4' + (i + 1), color: null, type: 'draw4', value: 0 });
    }
    return deck;
  }

  function cardName(card) {
    if (!card) return '';
    if (card.type === 'number') return COLOR_NAMES[card.color] + ' ' + card.value;
    if (card.type === 'wild') return '색 바꾸기';
    if (card.type === 'draw4') return '무지개 +4';
    return COLOR_NAMES[card.color] + ' ' + TYPE_NAMES[card.type];
  }

  function isWildType(card) {
    return !!card && (card.type === 'wild' || card.type === 'draw4');
  }

  function canPlay(card, top, activeColor) {
    if (!card) return false;
    if (isWildType(card)) return true;
    if (card.color === activeColor) return true;
    if (!top) return true;
    if (card.type === 'number' && top.type === 'number') return card.value === top.value;
    if (card.type !== 'number' && top.type === card.type) return true;
    return false;
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
        hand: []
      };
    });
    this.deck = shuffle(makeDeck(), this.rng);
    const self = this;
    this.players.forEach(function (p) {
      for (let i = 0; i < HAND_SIZE; i++) p.hand.push(self.deck.pop());
    });
    // 처음 뒤집는 카드는 숫자 카드가 나올 때까지 아래로 넣습니다.
    let first = this.deck.pop();
    let guard = 0;
    while (first && first.type !== 'number' && guard < 60) {
      this.deck.unshift(first);
      first = this.deck.pop();
      guard += 1;
    }
    this.discard = first ? [first] : [];
    this.top = first || null;
    this.activeColor = first ? first.color : COLORS[0];
    this.direction = 1;
    this.turn = 0;
    this.status = 'playing';
    this.finishReason = null;
    this.winnerId = null;
    this.pendingDraw = { playerId: null, count: 0 };
    this.called = {};   // 원카드! 를 외친 사람
    this.moves = 0;
    this.seq = 0;
    this.log = [];
    this.startedAt = Date.now();
    this.pushLog('🎨 컬러 숫자 카드를 시작합니다. 같은 색이나 같은 숫자를 내세요!');
    this.pushLog('바닥 카드: ' + cardName(this.top) + ' · ' + this.players[0].name + '님부터!');
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

  Game.prototype.nextIndex = function (fromIndex, step) {
    const n = this.players.length;
    return ((fromIndex + step * this.direction) % n + n) % n;
  };

  Game.prototype.advance = function (skipCount) {
    let idx = this.turn;
    const steps = (skipCount || 0) + 1;
    for (let i = 0; i < steps; i++) idx = this.nextIndex(idx, 1);
    this.turn = idx;
  };

  Game.prototype.reshuffle = function () {
    if (this.deck.length) return;
    if (this.discard.length <= 1) return;
    const top = this.discard.pop();
    this.deck = shuffle(this.discard.map(function (card) {
      return isWildType(card) ? { id: card.id, color: null, type: card.type, value: 0 } : card;
    }), this.rng);
    this.discard = [top];
    this.pushLog('더미가 비어 버린 카드를 다시 섞었습니다.');
  };

  Game.prototype.drawCard = function (player) {
    this.reshuffle();
    if (!this.deck.length) return null;
    const card = this.deck.pop();
    if (card) player.hand.push(card);
    if (card && player.hand.length > 1) this.called[player.id] = false;
    return card;
  };

  /**
   * '원카드!' 외치기
   * - 카드가 1장 남을 때(또는 2장일 때 미리) 외칠 수 있습니다.
   * - 외치지 않고 1장이 되면 카드 2장을 받습니다. (우노의 재미를 살린 자체 규칙)
   */
  Game.prototype.say = function (playerId) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    if (player.hand.length > 2) return { ok: false, reason: 'too_many_cards' };
    if (this.called[playerId]) return { ok: true, already: true };
    this.called[playerId] = true;
    this.pushLog('📣 ' + player.name + '님: “원카드!”');
    return { ok: true };
  };

  Game.prototype.play = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    const data = payload || {};
    const cardId = String(data.cardId || '');
    const index = player.hand.findIndex(function (c) { return c.id === cardId; });
    if (index === -1) return { ok: false, reason: 'no_card' };
    const card = player.hand[index];
    if (!canPlay(card, this.top, this.activeColor)) return { ok: false, reason: 'cannot_play' };
    let chosenColor = null;
    if (isWildType(card)) {
      chosenColor = String(data.color || '');
      if (COLORS.indexOf(chosenColor) === -1) return { ok: false, reason: 'need_color' };
    }

    player.hand.splice(index, 1);
    this.discard.push(card);
    this.top = card;
    this.moves += 1;
    if (isWildType(card)) {
      this.activeColor = chosenColor;
      this.pushLog(player.name + '님이 ' + cardName(card) + ' 카드를 내고 ' + COLOR_NAMES[chosenColor] + '을 골랐습니다.');
    } else {
      this.activeColor = card.color;
      this.pushLog(player.name + '님이 ' + cardName(card) + ' 카드를 냈습니다.');
    }

    // 원카드! 확인 — 1장이 되었는데 외치지 않았으면 2장을 더 받습니다.
    let saidOne = false;
    if (player.hand.length === 1) {
      if (this.called[playerId] || data.sayOne) {
        saidOne = true;
        this.called[playerId] = true;
        this.pushLog('📣 ' + player.name + '님: “원카드!” — 마지막 1장!');
      } else {
        let extra = 0;
        for (let i = 0; i < 2; i++) {
          if (this.drawCard(player)) extra += 1;
        }
        this.pushLog('😮 ' + player.name + '님이 원카드! 를 외치지 않아 카드 ' + extra + '장을 더 받았습니다.');
      }
    }
    if (player.hand.length > 1) this.called[playerId] = false;

    if (!player.hand.length) {
      this.status = 'finished';
      this.finishReason = 'empty_hand';
      this.winnerId = player.id;
      this.finishedAt = Date.now();
      this.pushLog('🎉 ' + player.name + '님이 손패를 모두 냈습니다! 우승!');
      return { ok: true, win: true };
    }

    if (card.type === 'draw4') {
      const victim = this.players[this.nextIndex(this.turn, 1)];
      let drawn = 0;
      for (let i = 0; i < 4; i++) {
        if (this.drawCard(victim)) drawn += 1;
      }
      this.pushLog((victim ? victim.name : '') + '님이 ' + drawn + '장을 뽑고 건너뜁니다. (무지개 +4)');
      this.advance(1);
      return { ok: true, victimId: victim ? victim.id : null, drawn: drawn, saidOne: saidOne };
    }

    if (card.type === 'skip') {
      const skipped = this.players[this.nextIndex(this.turn, 1)];
      this.pushLog((skipped ? skipped.name : '') + '님은 이번 차례를 건너뜁니다. (점프)');
      this.advance(1);
      return { ok: true, skipped: skipped ? skipped.id : null };
    }
    if (card.type === 'reverse') {
      if (this.players.length === 2) {
        this.pushLog('방향을 바꾸었습니다. (2명일 때는 점프처럼 한 번 더!)');
        return { ok: true, reversed: true };
      }
      this.direction *= -1;
      this.pushLog('방향이 바뀌었습니다. (' + (this.direction === 1 ? '시계 방향' : '반시계 방향') + ')');
      this.advance(0);
      return { ok: true, reversed: true };
    }
    if (card.type === 'draw2') {
      const victim = this.players[this.nextIndex(this.turn, 1)];
      let drawn = 0;
      for (let i = 0; i < 2; i++) {
        if (this.drawCard(victim)) drawn += 1;
      }
      this.pushLog((victim ? victim.name : '') + '님이 ' + drawn + '장을 뽑고 건너뜁니다. (+2 공격)');
      this.advance(1);
      return { ok: true, victimId: victim ? victim.id : null, drawn: drawn };
    }
    this.advance(0);
    return { ok: true };
  };

  Game.prototype.draw = function (playerId) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    const card = this.drawCard(player);
    this.moves += 1;
    this.pushLog(player.name + '님이 카드 1장을 뽑았습니다.' + (card ? ' (남은 더미 ' + this.deck.length + '장)' : ''));
    this.advance(0);
    return { ok: true, drew: card ? { id: card.id } : null };
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
        score: self.winnerId === p.id ? 1000 - p.hand.length : -p.hand.length,
        left: p.hand.length,
        result: self.winnerId === p.id ? '승리 🎉' : '남은 카드 ' + p.hand.length + '장'
      };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.seat - b.seat;
    });
    let rank = 1;
    rows.forEach(function (row, i) {
      if (i > 0 && rows[i - 1].left === row.left && rows[i - 1].score === row.score) row.rank = rows[i - 1].rank;
      else row.rank = i + 1;
    });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    const me = viewerId ? this.playerById(viewerId) : null;
    const current = this.currentPlayer();
    return {
      gameId: 'onecard',
      status: this.status,
      finishReason: this.finishReason,
      turnPlayerId: this.status === 'playing' && current ? current.id : null,
      youId: viewerId || null,
      hand: me ? me.hand.map(function (c) {
        return { id: c.id, color: c.color, type: c.type, value: c.value };
      }) : [],
      top: this.top ? { id: this.top.id, color: this.top.color, type: this.top.type, value: this.top.value } : null,
      activeColor: this.activeColor,
      direction: this.direction,
      deckCount: this.deck.length,
      discardCount: this.discard.length,
      youPlayable: me ? me.hand.filter(function (c) { return canPlay(c, self.top, self.activeColor); }).map(function (c) { return c.id; }) : [],
      youCalled: me ? !!this.called[me.id] : false,
      youCanSay: me ? !!(this.status === 'playing' && current && current.id === me.id && me.hand.length <= 2 && !this.called[me.id]) : false,
      winnerId: this.winnerId,
      moves: this.moves,
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          count: p.hand.length,
          isTurn: self.status === 'playing' && current && current.id === p.id
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  function botAction(game, player) {
    // 카드가 2장이면 먼저 '원카드!' 를 외칩니다. (우노식 재미)
    if (player.hand.length <= 2 && !game.called[player.id]) return { action: 'say', payload: {} };
    const playable = player.hand.filter(function (c) { return canPlay(c, game.top, game.activeColor); });
    if (!playable.length) return { action: 'draw', payload: {} };
    // 다음 사람이 카드가 적으면 공격 카드를 먼저 냅니다.
    const nextIdx = game.nextIndex(game.turn, 1);
    const nextPlayer = game.players[nextIdx];
    const nextFew = nextPlayer && nextPlayer.hand.length <= 2;
    let card = playable[0];
    if (nextFew) {
      const attack = playable.find(function (c) { return c.type === 'draw2'; }) ||
        playable.find(function (c) { return c.type === 'skip'; });
      if (attack) card = attack;
    } else {
      const numbers = playable.filter(function (c) { return c.type === 'number'; });
      if (numbers.length) card = numbers[0];
    }
    // 색 바꾸기·+4 카드는 손에 가장 많은 색으로
    if (isWildType(card)) {
      const counts = {};
      player.hand.forEach(function (c) {
        if (c.color) counts[c.color] = (counts[c.color] || 0) + 1;
      });
      let bestColor = COLORS[0];
      let bestCount = -1;
      COLORS.forEach(function (color) {
        const n = counts[color] || 0;
        if (n > bestCount) { bestCount = n; bestColor = color; }
      });
      return { action: 'play', payload: { cardId: card.id, color: bestColor } };
    }
    return { action: 'play', payload: { cardId: card.id } };
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
    HAND_SIZE: HAND_SIZE,
    COLORS: COLORS,
    COLOR_NAMES: COLOR_NAMES,
    TYPE_NAMES: TYPE_NAMES,
    BOT_NAMES: BOT_NAMES,
    makeDeck: makeDeck,
    cardName: cardName,
    canPlay: canPlay,
    isWildType: isWildType,
    Game: Game,
    BotDriver: BotDriver,
    botAction: botAction
  };
});
