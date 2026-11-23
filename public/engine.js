/*
 * 과일 딩동 게임 엔진 (공용)
 * - Node.js(require)와 브라우저(window.HalliGalli) 양쪽에서 동작하는 UMD 모듈입니다.
 * - 서버(멀티플레이 방)와 브라우저(AI 봇 대전)가 같은 규칙 코드를 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HalliGalli = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FRUITS = [
    { id: 'strawberry', name: '딸기', color: '#e33a63', light: '#ffe1ea' },
    { id: 'banana', name: '바나나', color: '#f0b429', light: '#fff2c9' },
    { id: 'lime', name: '라임', color: '#5aa93a', light: '#dcf3c9' },
    { id: 'plum', name: '자두', color: '#8656b8', light: '#ecdcfa' }
  ];
  const FRUIT_IDS = FRUITS.map(function (f) { return f.id; });
  const FRUIT_BY_ID = {};
  FRUITS.forEach(function (f) { FRUIT_BY_ID[f.id] = f; });

  // 과일별 카드: 1개 5장, 2개 3장, 3개 3장, 4개 2장, 5개 1장 => 과일당 14장, 총 56장
  const COPIES_BY_COUNT = { 1: 5, 2: 3, 3: 3, 4: 2, 5: 1 };
  const COUNT_STEPS = [1, 2, 3, 4, 5];
  const DECK_SIZE = 56;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 5;
  const BELL_TOTAL = 5;

  function fruitName(id) {
    return FRUIT_BY_ID[id] ? FRUIT_BY_ID[id].name : id;
  }

  /** 56장 덱 생성 */
  function createDeck() {
    const deck = [];
    let seq = 0;
    for (const fruit of FRUIT_IDS) {
      for (const count of COUNT_STEPS) {
        const copies = COPIES_BY_COUNT[count];
        for (let i = 0; i < copies; i++) {
          deck.push({ id: 'c' + (seq++), fruit: fruit, count: count });
        }
      }
    }
    return deck;
  }

  /** 시드 기반 난수 (테스트 재현용) */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRng(seed) {
    if (seed === undefined || seed === null) return Math.random;
    return mulberry32(seed);
  }

  function shuffle(list, rng) {
    const random = rng || Math.random;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function randRange(rng, range) {
    return Math.round(range[0] + rng() * (range[1] - range[0]));
  }

  function clampName(name, fallback) {
    const clean = String(name === undefined || name === null ? '' : name).replace(/\s+/g, ' ').trim();
    return (clean || fallback).slice(0, 12);
  }

  /**
   * 게임 한 판.
   * players: [{ id, name, isBot }]
   * options: { rng, endWhenTwo }
   */
  class Game {
    constructor(players, options) {
      const opts = options || {};
      if (!Array.isArray(players) || players.length < MIN_PLAYERS) {
        throw new Error('과일 딩동는 최소 ' + MIN_PLAYERS + '명이 필요합니다.');
      }
      if (players.length > MAX_PLAYERS) {
        throw new Error('과일 딩동는 최대 ' + MAX_PLAYERS + '명까지 참여할 수 있습니다.');
      }
      this.rng = opts.rng || Math.random;
      this.endWhenTwo = !!opts.endWhenTwo;
      this.players = players.map(function (p, i) {
        return {
          id: String(p.id),
          name: clampName(p.name, '플레이어' + (i + 1)),
          number: (p.number === undefined || p.number === null || p.number === '') ? null : Number(p.number),
          isBot: !!p.isBot,
          seat: i,
          deck: [],       // index 0 = 맨 위
          pile: [],       // 마지막 원소 = 맨 위(공개 카드)
          eliminated: false,
          bells: { correct: 0, wrong: 0 }
        };
      });
      const ids = new Set(this.players.map(function (p) { return p.id; }));
      if (ids.size !== this.players.length) throw new Error('플레이어 id가 중복되었습니다.');

      this.status = 'playing'; // playing | finished
      this.turn = 0;
      this.winnerId = null;
      this.finishReason = null;
      this.log = [];
      this.logSeq = 0;
      this.bellLockUntil = 0;
      this.lastBell = null;
      this.bells = { correct: 0, wrong: 0 };
      this.outOrder = []; // 탈락 순서 (먼저 탈락한 사람이 앞)
      this.startedAt = null;

      this.deal();
      this.pushLog('start', '게임 시작! ' + this.players.length + '명, 카드 ' + DECK_SIZE + '장');
      this.pushLog('start', this.players[0].name + '님부터 시작합니다.');
    }

    /* ---------- 카드 분배 ---------- */
    deal() {
      const deck = shuffle(createDeck(), this.rng);
      const n = this.players.length;
      const base = Math.floor(deck.length / n);
      const extra = deck.length % n;
      let cursor = 0;
      for (let i = 0; i < n; i++) {
        const count = base + (i < extra ? 1 : 0);
        this.players[i].deck = deck.slice(cursor, cursor + count);
        cursor += count;
      }
      this.startedAt = Date.now();
    }

    /* ---------- 조회 ---------- */
    playerById(id) {
      for (const p of this.players) if (p.id === id) return p;
      return null;
    }

    alivePlayers() {
      return this.players.filter(function (p) { return !p.eliminated; });
    }

    currentPlayerId() {
      const p = this.players[this.turn];
      return p ? p.id : null;
    }

    topCard(player) {
      return player.pile.length ? player.pile[player.pile.length - 1] : null;
    }

    /** 살아있는 플레이어들의 맨 위 공개 카드에 있는 과일별 개수 합 */
    fruitCounts() {
      const counts = {};
      for (const id of FRUIT_IDS) counts[id] = 0;
      for (const p of this.players) {
        if (p.eliminated) continue;
        const top = this.topCard(p);
        if (top) counts[top.fruit] += top.count;
      }
      return counts;
    }

    /** 정확히 5개가 된 과일 목록 */
    bellFruits() {
      const counts = this.fruitCounts();
      return FRUIT_IDS.filter(function (id) { return counts[id] === BELL_TOTAL; });
    }

    tableCardCount() {
      let total = 0;
      for (const p of this.players) total += p.pile.length;
      return total;
    }

    totalCards() {
      let total = 0;
      for (const p of this.players) total += p.deck.length + p.pile.length;
      return total;
    }

    /** 테이블(공개 카드 배치) 서명 – 봇 반응 타이밍 계산용 */
    tableSignature() {
      const parts = this.players.map(function (p) {
        if (p.eliminated) return p.id + ':X';
        const top = p.pile.length ? p.pile[p.pile.length - 1] : null;
        return p.id + ':' + (top ? top.id : '-');
      });
      return parts.join('|') + '#' + this.turn + '#' + this.status;
    }

    /* ---------- 로그 ---------- */
    pushLog(type, text) {
      this.logSeq += 1;
      const entry = { id: this.logSeq, type: type, text: text, at: Date.now() };
      this.log.push(entry);
      if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
      return entry;
    }

    /* ---------- 카드 뒤집기 ---------- */
    flip(playerId, now) {
      const timestamp = typeof now === 'number' ? now : Date.now();
      if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
      const player = this.playerById(playerId);
      if (!player) return { ok: false, reason: 'unknown_player' };
      if (player.eliminated) return { ok: false, reason: 'eliminated' };
      if (this.currentPlayerId() !== player.id) return { ok: false, reason: 'not_your_turn' };
      if (!player.deck.length) return { ok: false, reason: 'empty_deck' };

      const card = player.deck.shift();
      player.pile.push(card);
      this.pushLog('flip', player.name + '님이 ' + fruitName(card.fruit) + ' ' + card.count + '개를 공개');

      const fruits = this.bellFruits();
      const counts = this.fruitCounts();

      this.advanceTurn();

      return {
        ok: true,
        card: card,
        bellFruits: fruits,
        counts: counts,
        timestamp: timestamp
      };
    }

    /* ---------- 종 치기 ---------- */
    ring(playerId, now) {
      const timestamp = typeof now === 'number' ? now : Date.now();
      if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
      const player = this.playerById(playerId);
      if (!player) return { ok: false, reason: 'unknown_player' };
      if (player.eliminated) return { ok: false, reason: 'eliminated' };
      if (timestamp < this.bellLockUntil) return { ok: false, reason: 'bell_locked' };

      const fruits = this.bellFruits();
      const counts = this.fruitCounts();

      if (fruits.length > 0) {
        // 정답: 테이블의 모든 공개 카드를 가져간다.
        const collected = [];
        for (const p of this.players) {
          if (p.pile.length) {
            for (const c of p.pile) collected.push(c);
            p.pile = [];
          }
        }
        shuffle(collected, this.rng);
        for (const c of collected) player.deck.push(c);

        this.bells.correct += 1;
        player.bells.correct += 1;
        this.bellLockUntil = timestamp + 600;
        this.lastBell = {
          playerId: player.id,
          playerName: player.name,
          correct: true,
          fruit: fruits[0],
          fruits: fruits,
          cards: collected.length,
          at: timestamp
        };
        this.pushLog(
          'bell-correct',
          player.name + '님 종! ' + fruits.map(fruitName).join(', ') + ' 합계 5개 정답 — 카드 ' +
            collected.length + '장 획득'
        );

        this.recomputeEliminations();
        this.checkGameOver();
        return { ok: true, correct: true, collected: collected.length, fruits: fruits, counts: counts };
      }

      // 오답: 다른 살아있는 플레이어 모두에게 내 덱에서 1장씩 지급
      const others = this.players.filter(function (p) {
        return !p.eliminated && p.id !== player.id;
      });
      let given = 0;
      for (const other of others) {
        let card = null;
        if (player.deck.length) card = player.deck.shift();
        else if (player.pile.length) card = player.pile.shift();
        if (card) {
          other.deck.push(card);
          given += 1;
        }
      }
      this.bells.wrong += 1;
      player.bells.wrong += 1;
      this.bellLockUntil = timestamp + 450;
      this.lastBell = {
        playerId: player.id,
        playerName: player.name,
        correct: false,
        fruit: null,
        fruits: [],
        cards: given,
        at: timestamp
      };
      this.pushLog(
        'bell-wrong',
        player.name + '님 종! 하지만 5개가 아니어서 다른 플레이어에게 카드 ' + given + '장 지급'
      );

      this.recomputeEliminations();
      this.ensureValidTurn();
      this.checkGameOver();
      return { ok: true, correct: false, penalty: given, counts: counts };
    }

    /* ---------- 탈락/턴/종료 ---------- */
    recomputeEliminations() {
      for (const p of this.players) {
        const out = p.deck.length === 0 && p.pile.length === 0;
        if (out && !p.eliminated) {
          p.eliminated = true;
          if (this.outOrder.indexOf(p.id) === -1) this.outOrder.push(p.id);
          this.pushLog('eliminate', p.name + '님 카드가 모두 떨어져 탈락!');
        }
      }
    }

    ensureValidTurn() {
      const current = this.players[this.turn];
      if (current && !current.eliminated && current.deck.length > 0) return true;
      return this.advanceTurn();
    }

    /** 다음 카드가 있는 플레이어로 턴 이동. 아무도 낼 카드가 없으면 게임 종료 */
    advanceTurn() {
      const n = this.players.length;
      for (let step = 1; step <= n; step++) {
        const idx = (this.turn + step) % n;
        const p = this.players[idx];
        if (!p.eliminated && p.deck.length > 0) {
          this.turn = idx;
          return true;
        }
      }
      if (this.status === 'playing') this.finishGame('no_cards');
      return false;
    }

    checkGameOver() {
      if (this.status !== 'playing') return false;
      const alive = this.alivePlayers();
      if (this.endWhenTwo ? alive.length <= 2 : alive.length <= 1) {
        this.finishGame(this.endWhenTwo ? 'last_two' : (alive.length === 1 ? 'last_player' : 'no_cards'));
        return true;
      }
      return false;
    }

    finishGame(reason) {
      if (this.status === 'finished') return;
      this.status = 'finished';
      this.finishReason = reason;
      const alive = this.alivePlayers();
      const pool = alive.length ? alive : this.players;
      let best = null;
      for (const p of pool) {
        const size = p.deck.length + p.pile.length;
        if (!best || size > best.size) best = { player: p, size: size };
      }
      this.winnerId = best ? best.player.id : null;
      if (best) {
        this.pushLog(
          'finish',
          '게임 종료! 우승: ' + best.player.name + '님 (카드 ' + best.size + '장)'
        );
      } else {
        this.pushLog('finish', '게임 종료');
      }
    }

    /**
     * 최종 순위: 1등(우승) → 늦게 탈락한 순 → 남은 카드 수
     * 결과 팝업에 그대로 쓰는 형태로 돌려줍니다.
     */
    ranking() {
      const self = this;
      const cards = function (p) { return p.deck.length + p.pile.length; };
      const outIndex = function (p) { return self.outOrder.indexOf(p.id); };
      const sorted = this.players.slice().sort(function (a, b) {
        if (a.id === self.winnerId) return -1;
        if (b.id === self.winnerId) return 1;
        const ao = outIndex(a);
        const bo = outIndex(b);
        if (ao >= 0 && bo >= 0) return bo - ao;
        if (ao >= 0) return 1;
        if (bo >= 0) return -1;
        return cards(b) - cards(a);
      });
      return sorted.map(function (p, i) {
        return {
          rank: i + 1,
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          cards: cards(p),
          eliminated: p.eliminated,
          outOrder: outIndex(p) >= 0 ? outIndex(p) + 1 : null,
          bells: { correct: p.bells.correct, wrong: p.bells.wrong }
        };
      });
    }

    /* ---------- 직렬화 ---------- */
    stateFor(viewerId) {
      const self = this;
      const currentId = this.currentPlayerId();
      return {
        status: this.status,
        turn: currentId,
        players: this.players.map(function (p) {
          const top = self.topCard(p);
          return {
            id: p.id,
            name: p.name,
            number: p.number === undefined ? null : p.number,
            seat: p.seat,
            isBot: p.isBot,
            deckCount: p.deck.length,
            pileCount: p.pile.length,
            totalCards: p.deck.length + p.pile.length,
            top: top,
            eliminated: p.eliminated,
            bells: { correct: p.bells.correct, wrong: p.bells.wrong },
            isTurn: p.id === currentId,
            isSelf: p.id === viewerId
          };
        }),
        ranking: this.ranking(),
        fruits: FRUITS,
        counts: this.fruitCounts(),
        tableCount: this.tableCardCount(),
        bellFruits: this.bellFruits(),
        log: this.log.slice(-40),
        lastBell: this.lastBell,
        winnerId: this.winnerId,
        winner: this.winnerId ? (this.playerById(this.winnerId) || {}).name || null : null,
        finishReason: this.finishReason,
        endWhenTwo: this.endWhenTwo,
        bells: this.bells,
        bellLocked: Date.now() < this.bellLockUntil,
        totalCards: this.totalCards(),
        outOrder: this.outOrder.slice(),
        startedAt: this.startedAt
      };
    }
  }

  /* ---------- 봇 ---------- */
  const BOT_PROFILES = {
    easy: { label: '쉬움', reaction: [600, 1250], accuracy: 0.68, falseRing: 0.06, flipDelay: [900, 1500] },
    normal: { label: '보통', reaction: [430, 900], accuracy: 0.84, falseRing: 0.035, flipDelay: [750, 1200] },
    hard: { label: '어려움', reaction: [280, 620], accuracy: 0.94, falseRing: 0.012, flipDelay: [600, 1000] }
  };
  const BOT_NAMES = ['과일왕', '딸기소녀', '바나나맨', '라임박사', '자두군', '종치기장인'];

  /**
   * 봇 행동 결정기.
   * tick(now) -> { playerId, action: 'ring'|'flip' } | null
   * 게임 상태가 바뀌면(테이블 서명 변화) 반응 타이밍을 새로 잡습니다.
   */
  class BotDriver {
    constructor(game, options) {
      const opts = options || {};
      this.game = game;
      this.level = BOT_PROFILES[opts.level] ? opts.level : 'normal';
      this.rng = opts.rng || Math.random;
      this.state = new Map();
    }

    profile() {
      return BOT_PROFILES[this.level];
    }

    reset() {
      this.state.clear();
    }

    tick(now) {
      const game = this.game;
      if (!game || game.status !== 'playing') return null;
      const timestamp = typeof now === 'number' ? now : Date.now();
      const sig = game.tableSignature();
      const bellFruits = game.bellFruits();
      const counts = bellFruits.length ? null : game.fruitCounts();
      const profile = this.profile();
      const self = this;

      const runtime = function (player) {
        let rt = self.state.get(player.id);
        if (!rt) {
          rt = { sig: null, ringAt: null, flipAt: null };
          self.state.set(player.id, rt);
        }
        if (rt.sig !== sig) {
          rt.sig = sig;
          rt.ringAt = null;
          rt.flipAt = null;
          if (bellFruits.length) {
            if (self.rng() < profile.accuracy) rt.ringAt = timestamp + randRange(self.rng, profile.reaction);
          } else {
            const near = counts && FRUIT_IDS.some(function (f) {
              return counts[f] === BELL_TOTAL - 1 || counts[f] === BELL_TOTAL + 1;
            });
            if (near && self.rng() < profile.falseRing) {
              rt.ringAt = timestamp + randRange(self.rng, profile.reaction) + 300;
            }
          }
        }
        return rt;
      };

      // 1) 종 치기(정답/오답) 우선
      for (const p of game.players) {
        if (!p.isBot || p.eliminated) continue;
        const rt = runtime(p);
        if (rt.ringAt !== null && timestamp >= rt.ringAt) return { playerId: p.id, action: 'ring' };
      }

      // 2) 내 차례면 카드 뒤집기
      const currentId = game.currentPlayerId();
      for (const p of game.players) {
        if (!p.isBot || p.eliminated) continue;
        if (p.id !== currentId || !p.deck.length) continue;
        const rt = runtime(p);
        if (rt.ringAt !== null) continue;
        if (rt.flipAt === null) rt.flipAt = timestamp + randRange(this.rng, profile.flipDelay);
        if (timestamp >= rt.flipAt) return { playerId: p.id, action: 'flip' };
      }
      return null;
    }
  }

  return {
    FRUITS: FRUITS,
    FRUIT_IDS: FRUIT_IDS,
    FRUIT_BY_ID: FRUIT_BY_ID,
    COPIES_BY_COUNT: COPIES_BY_COUNT,
    DECK_SIZE: DECK_SIZE,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    BELL_TOTAL: BELL_TOTAL,
    BOT_PROFILES: BOT_PROFILES,
    BOT_NAMES: BOT_NAMES,
    fruitName: fruitName,
    createDeck: createDeck,
    createRng: createRng,
    shuffle: shuffle,
    Game: Game,
    BotDriver: BotDriver
  };
});
