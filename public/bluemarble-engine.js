/*
 * 전국여행 마블 (모두의마블 스타일) 게임 엔진 (공용)
 * - Node.js(require)와 브라우저(window.BlueMarble) 양쪽에서 동작하는 UMD 모듈입니다.
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 * - 서버가 주사위를 굴리고 판정하므로, 화면(3D)은 결과만 연출합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BlueMarble = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- 기본 규칙 값 ---------------- */

  const BOARD_SIZE = 28;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;

  const START_CASH = 1200000;   // 시작 자금 120만원
  const SALARY = 200000;        // 출발지 지나갈 때 월급 20만원
  const ISLAND_BAIL = 150000;   // 무인도 보석금 15만원
  const TAX_AMOUNT = 120000;    // 세금 12만원
  const BONUS_AMOUNT = 150000;  // 보너스 15만원
  const PARK_AMOUNT = 100000;   // 무료주차 10만원
  const MAX_ROUNDS = 15;

  const BUILD_NAMES = ['땅', '별장', '빌딩', '호텔'];
  const TOLL_RATE = [0.10, 0.25, 0.50, 0.90];
  const BUILD_RATE = 0.60;

  const TILE_TYPES = {
    START: 'start',
    CITY: 'city',
    GOLDEN: 'golden',
    TAX: 'tax',
    BONUS: 'bonus',
    ISLAND: 'island',
    TRAVEL: 'travel',
    PARK: 'park'
  };

  const REGION_COLORS = {
    수도권: '#5B8DEF',
    강원: '#4FB083',
    충청: '#E7A93B',
    경상: '#EF8AA8',
    전라: '#9B7FE0',
    제주: '#2FB3B0'
  };

  const CORNER_COLORS = {
    start: '#f4775c',
    island: '#7fb6c9',
    travel: '#9b7fe0',
    park: '#4fb083'
  };

  function roundTo(value, unit) {
    return Math.round(value / unit) * unit;
  }

  function formatMoney(value) {
    const n = Math.round(Number(value) || 0);
    const sign = n < 0 ? '-' : '';
    const digits = String(Math.abs(n));
    let out = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
      out += digits[i];
    }
    return sign + '₩' + out;
  }

  /** 만원 단위로 짧게 (칸 라벨용) */
  function shortMoney(value) {
    const n = Math.round(Number(value) || 0);
    if (n >= 10000 && n % 10000 === 0) return (n / 10000) + '만';
    return formatMoney(n);
  }

  function cityTile(name, region, price) {
    return {
      type: TILE_TYPES.CITY,
      name: name,
      region: region,
      color: REGION_COLORS[region],
      price: price,
      buildCost: roundTo(price * BUILD_RATE, 10000),
      tolls: TOLL_RATE.map(function (rate) { return roundTo(price * rate, 1000); })
    };
  }

  /* ---------------- 보드 (28칸 · 출발 → 시계 방향) ---------------- */

  const BOARD = [
    { type: TILE_TYPES.START, name: '출발', desc: '지나가면 월급 ' + shortMoney(SALARY), color: CORNER_COLORS.start },
    cityTile('서울', '수도권', 350000),
    cityTile('부산', '경상', 300000),
    { type: TILE_TYPES.GOLDEN, name: '황금열쇠', color: '#E7A93B' },
    cityTile('대구', '경상', 250000),
    { type: TILE_TYPES.TAX, name: '세금', desc: shortMoney(TAX_AMOUNT) + ' 납부', color: '#c98d6b' },
    cityTile('인천', '수도권', 280000),
    { type: TILE_TYPES.ISLAND, name: '무인도', desc: '더블 또는 보석금으로 탈출', color: CORNER_COLORS.island },
    cityTile('대전', '충청', 200000),
    { type: TILE_TYPES.BONUS, name: '보너스', desc: '+' + shortMoney(BONUS_AMOUNT), color: '#dfa62f' },
    cityTile('광주', '전라', 220000),
    { type: TILE_TYPES.GOLDEN, name: '황금열쇠', color: '#E7A93B' },
    cityTile('울산', '경상', 240000),
    { type: TILE_TYPES.TAX, name: '세금', desc: shortMoney(TAX_AMOUNT) + ' 납부', color: '#c98d6b' },
    { type: TILE_TYPES.TRAVEL, name: '전국일주', desc: '황금열쇠 1장', color: CORNER_COLORS.travel },
    cityTile('제주', '제주', 320000),
    cityTile('춘천', '강원', 180000),
    { type: TILE_TYPES.GOLDEN, name: '황금열쇠', color: '#E7A93B' },
    cityTile('경주', '경상', 230000),
    { type: TILE_TYPES.BONUS, name: '보너스', desc: '+' + shortMoney(BONUS_AMOUNT), color: '#dfa62f' },
    cityTile('전주', '전라', 210000),
    { type: TILE_TYPES.PARK, name: '무료주차', desc: '+' + shortMoney(PARK_AMOUNT), color: CORNER_COLORS.park },
    cityTile('수원', '수도권', 260000),
    { type: TILE_TYPES.TAX, name: '세금', desc: shortMoney(TAX_AMOUNT) + ' 납부', color: '#c98d6b' },
    cityTile('포항', '경상', 250000),
    { type: TILE_TYPES.GOLDEN, name: '황금열쇠', color: '#E7A93B' },
    cityTile('여수', '전라', 270000),
    cityTile('강릉', '강원', 220000)
  ];

  BOARD.forEach(function (tile, idx) {
    tile.idx = idx;
    if (tile.type === TILE_TYPES.CITY) tile.cityId = 'c' + idx;
    else tile.cityId = null;
  });

  const ISLAND_INDEX = BOARD.findIndex(function (t) { return t.type === TILE_TYPES.ISLAND; });

  /* ---------------- 황금열쇠 카드 ---------------- */

  const GOLDEN_CARDS = [
    { id: 'bank_interest', title: '은행 이자', text: '은행에서 이자 10만원을 받습니다.', tone: 'good' },
    { id: 'hospital', title: '병원비', text: '병원비로 6만원을 냅니다.', tone: 'bad' },
    { id: 'birthday', title: '생일 축하', text: '다른 플레이어 모두에게 4만원씩 축하금을 받습니다.', tone: 'good' },
    { id: 'donation', title: '기부', text: '이웃 돕기 기부금 8만원을 냅니다.', tone: 'bad' },
    { id: 'lottery', title: '복권 당첨', text: '복권에 당첨되어 25만원을 받습니다.', tone: 'good' },
    { id: 'tax_audit', title: '세무 조사', text: '세무 조사로 12만원을 냅니다.', tone: 'bad' },
    { id: 'go_start', title: '출발지로', text: '출발지로 이동하고 월급 20만원을 받습니다.', tone: 'good' },
    { id: 'island_trip', title: '무인도행', text: '무인도로 이동합니다. (보석금 또는 더블로 탈출)', tone: 'bad' },
    { id: 'escape_pass', title: '무인도 탈출권', text: '무인도 탈출권을 1장 받습니다. 다음 무인도에서 바로 탈출!', tone: 'good' },
    { id: 'travel_back', title: '길을 잃음', text: '뒤로 3칸 돌아갑니다.', tone: 'bad' },
    { id: 'city_fund', title: '도시 지원금', text: '내가 가진 도시마다 5만원씩 지원금을 받습니다.', tone: 'good' },
    { id: 'repair_fee', title: '건물 수리', text: '내 건물마다 3만원씩 수리비를 냅니다.', tone: 'bad' }
  ];

  const CARD_BY_ID = {};
  GOLDEN_CARDS.forEach(function (c) { CARD_BY_ID[c.id] = c; });

  /* ---------------- 도우미 ---------------- */

  function clampName(name, fallback) {
    const clean = String(name === undefined || name === null ? '' : name).replace(/\s+/g, ' ').trim();
    return (clean || fallback).slice(0, 12);
  }

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

  /* ---------------- 게임 한 판 ---------------- */

  class Game {
    /**
     * players: [{ id, name, number, isBot }]
     * options: { rng, maxRounds, startingCash }
     */
    constructor(players, options) {
      const opts = options || {};
      if (!Array.isArray(players) || players.length < MIN_PLAYERS) {
        throw new Error('전국여행 마블은 최소 ' + MIN_PLAYERS + '명이 필요합니다.');
      }
      if (players.length > MAX_PLAYERS) {
        throw new Error('전국여행 마블은 최대 ' + MAX_PLAYERS + '명까지 참여할 수 있습니다.');
      }
      this.rng = opts.rng || Math.random;
      const rounds = Number(opts.maxRounds);
      this.maxRounds = Number.isInteger(rounds) && rounds >= 3 && rounds <= 60 ? rounds : MAX_ROUNDS;
      const startCash = Number(opts.startingCash);
      this.startingCash = Number.isFinite(startCash) && startCash > 0 ? startCash : START_CASH;

      const self = this;
      this.players = players.map(function (p, i) {
        return {
          id: String(p.id),
          name: clampName(p.name, '플레이어' + (i + 1)),
          number: (p.number === undefined || p.number === null || p.number === '') ? null : Number(p.number),
          isBot: !!p.isBot,
          seat: i,
          pos: 0,
          cash: self.startingCash,
          bankrupt: false,
          eliminated: false,
          island: false,
          islandTurns: 0,
          freeBail: 0
        };
      });
      const ids = new Set(this.players.map(function (p) { return p.id; }));
      if (ids.size !== this.players.length) throw new Error('플레이어 id가 중복되었습니다.');

      this.owner = new Array(BOARD_SIZE).fill(null);
      this.level = new Array(BOARD_SIZE).fill(0);

      this.status = 'playing';   // playing | finished
      this.phase = 'roll';       // roll | decide | over
      this.turn = 0;
      this.round = 1;
      this.turnInRound = 0;
      this.turnCount = 0;
      this.doublesInTurn = 0;
      this.extraRoll = false;
      this.pending = null;
      this.rollSeq = 0;
      this.cardSeq = 0;
      this.lastRoll = null;
      this.lastCard = null;
      this.winnerId = null;
      this.finishReason = null;
      this.startedAt = Date.now();
      this.log = [];
      this.logSeq = 0;

      this.pushLog('start', '게임 시작! ' + this.players.length + '명 · ' + this.maxRounds + '라운드 · 시작 자금 ' + formatMoney(this.startingCash));
      this.pushLog('start', this.players[0].name + '님부터 주사위를 굴립니다.');
    }

    /* ---------- 조회 ---------- */

    rollDie() {
      return 1 + Math.floor(this.rng() * 6);
    }

    playerById(id) {
      for (const p of this.players) if (p.id === String(id)) return p;
      return null;
    }

    currentPlayer() {
      return this.players[this.turn] || null;
    }

    currentPlayerId() {
      const p = this.currentPlayer();
      return p ? p.id : null;
    }

    alive() {
      return this.players.filter(function (p) { return !p.bankrupt; });
    }

    propertiesOf(playerId) {
      const out = [];
      for (let i = 0; i < BOARD_SIZE; i++) if (this.owner[i] === playerId) out.push(i);
      return out;
    }

    totalAsset(player) {
      let sum = Math.max(0, player.cash);
      for (let i = 0; i < BOARD_SIZE; i++) {
        if (this.owner[i] !== player.id) continue;
        sum += BOARD[i].price + BOARD[i].buildCost * this.level[i];
      }
      return sum;
    }

    pushLog(type, text) {
      this.logSeq += 1;
      const entry = { id: this.logSeq, type: type, text: text, at: Date.now() };
      this.log.push(entry);
      if (this.log.length > 260) this.log.splice(0, this.log.length - 260);
      return entry;
    }

    /* ---------- 턴 진행 ---------- */

    _afterRoll(player, result) {
      if (this.status !== 'playing') return;
      if (this.phase === 'decide') return;          // 매입/건설 결정을 기다립니다.
      if (this.extraRoll && !player.island) {
        this.extraRoll = false;
        this.phase = 'roll';                        // 더블 → 한 번 더
        return;
      }
      this.endTurn();
    }

    _finishDecision(player) {
      this.pending = null;
      if (this.status !== 'playing') return;
      if (this.phase === 'decide') this.phase = 'roll';
      if (this.extraRoll && !player.island) {
        this.extraRoll = false;
        this.phase = 'roll';
        return;
      }
      this.endTurn();
    }

    endTurn() {
      if (this.status !== 'playing') return;
      this.pending = null;
      this.phase = 'roll';
      this.extraRoll = false;
      this.doublesInTurn = 0;
      this.turnCount += 1;

      this.turnInRound += 1;
      const aliveCount = this.alive().length;
      if (this.turnInRound >= aliveCount) {
        this.turnInRound = 0;
        this.round += 1;
        if (this.round > this.maxRounds) {
          this.finishGame('round_limit');
          return;
        }
      }

      if (this.alive().length <= 1) {
        this.finishGame(this.alive().length === 1 ? 'last_player' : 'all_bankrupt');
        return;
      }

      for (let step = 1; step <= this.players.length; step++) {
        const idx = (this.turn + step) % this.players.length;
        if (!this.players[idx].bankrupt) {
          this.turn = idx;
          return;
        }
      }
      this.finishGame('all_bankrupt');
    }

    /* ---------- 주사위 ---------- */

    roll(playerId, now) {
      if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
      const p = this.playerById(playerId);
      if (!p) return { ok: false, reason: 'unknown_player' };
      if (p.bankrupt) return { ok: false, reason: 'bankrupt' };
      if (this.currentPlayerId() !== p.id) return { ok: false, reason: 'not_your_turn' };
      if (this.phase === 'decide') return { ok: false, reason: 'decide_first' };
      if (this.phase !== 'roll') return { ok: false, reason: 'wrong_phase' };

      const a = this.rollDie();
      const b = this.rollDie();
      const sum = a + b;
      const double = a === b;
      const seq = ++this.rollSeq;
      const roll = {
        seq: seq,
        a: a,
        b: b,
        sum: sum,
        double: double,
        playerId: p.id,
        byName: p.name,
        at: typeof now === 'number' ? now : Date.now(),
        from: p.pos,
        to: p.pos
      };
      this.lastRoll = roll;

      const result = {
        ok: true,
        playerId: p.id,
        dice: [a, b],
        sum: sum,
        double: double,
        rollSeq: seq,
        from: p.pos,
        to: p.pos,
        extraRoll: false,
        passedStart: false,
        salary: 0
      };

      this.pushLog('dice', p.name + '님 주사위 ' + a + ' + ' + b + ' = ' + sum + (double ? ' (더블!)' : ''));

      if (p.island) {
        if (double) {
          p.island = false;
          p.islandTurns = 0;
          this.pushLog('island', p.name + '님이 더블로 무인도를 탈출했습니다!');
          result.escaped = true;
          this.moveAndResolve(p, sum, result);
          this.extraRoll = false;
        } else {
          p.islandTurns += 1;
          this.pushLog('island', p.name + '님 무인도 탈출 실패 (' + p.islandTurns + '/3)');
          if (p.islandTurns >= 3) {
            this.pushLog('island', p.name + '님은 보석금 ' + formatMoney(ISLAND_BAIL) + '을 내고 무인도를 떠납니다.');
            this.pay(p, ISLAND_BAIL, null, '보석금');
            p.island = false;
            p.islandTurns = 0;
            result.paidBail = true;
            result.bankrupt = p.bankrupt;
          }
          result.to = p.pos;
          roll.to = p.pos;
          this._afterRoll(p, result);
          return result;
        }
      } else if (double) {
        this.doublesInTurn += 1;
        if (this.doublesInTurn >= 3) {
          this.pushLog('dice', p.name + '님 3연속 더블! 무인도로 이동합니다.');
          this.sendToIsland(p);
          this.doublesInTurn = 0;
          result.sentToIsland = true;
          result.to = p.pos;
          roll.to = p.pos;
          this._afterRoll(p, result);
          return result;
        }
        this.moveAndResolve(p, sum, result);
        this.extraRoll = true;
      } else {
        this.doublesInTurn = 0;
        this.moveAndResolve(p, sum, result);
        this.extraRoll = false;
      }

      result.to = p.pos;
      result.pending = this.pending;
      roll.to = p.pos;
      this._afterRoll(p, result);
      return result;
    }

    /* ---------- 이동 · 칸 처리 ---------- */

    moveAndResolve(player, steps, result) {
      const from = player.pos;
      const raw = from + steps;
      const passed = raw >= BOARD_SIZE;
      player.pos = raw % BOARD_SIZE;
      if (passed) {
        player.cash += SALARY;
        if (result) {
          result.passedStart = true;
          result.salary = SALARY;
        }
        this.pushLog('salary', player.name + '님이 출발지를 지나 월급 ' + formatMoney(SALARY) + '을 받았습니다.');
      }
      if (result) result.to = player.pos;
      this.resolveLanding(player);
    }

    resolveLanding(player) {
      const idx = player.pos;
      const tile = BOARD[idx];
      if (!tile) return;
      this.pushLog('tile', player.name + '님 → ' + idx + '번 칸 「' + tile.name + '」');

      if (tile.type === TILE_TYPES.CITY) {
        const ownerId = this.owner[idx];
        if (!ownerId) {
          if (player.cash >= tile.price) {
            this.phase = 'decide';
            this.pending = {
              kind: 'buy',
              tile: idx,
              price: tile.price,
              name: tile.name,
              playerId: player.id,
              playerName: player.name
            };
            this.pushLog('offer', player.name + '님 「' + tile.name + '」을(를) ' + formatMoney(tile.price) + '에 살 수 있습니다.');
          } else {
            this.pushLog('pass', player.name + '님은 돈이 부족해 「' + tile.name + '」을(를) 살 수 없습니다.');
          }
          return;
        }
        if (ownerId === player.id) {
          const lv = this.level[idx];
          if (lv < 3 && player.cash >= tile.buildCost) {
            this.phase = 'decide';
            this.pending = {
              kind: 'build',
              tile: idx,
              cost: tile.buildCost,
              level: lv,
              next: lv + 1,
              name: tile.name,
              playerId: player.id,
              playerName: player.name
            };
            this.pushLog('offer', player.name + '님 「' + tile.name + '」을(를) ' + BUILD_NAMES[lv + 1] + '(으)로 올릴 수 있습니다. (' + formatMoney(tile.buildCost) + ')');
          } else if (lv >= 3) {
            this.pushLog('stay', player.name + '님 내 땅 「' + tile.name + '」 호텔에서 쉽니다.');
          } else {
            this.pushLog('pass', player.name + '님은 돈이 부족해 「' + tile.name + '」 건설을 못 합니다.');
          }
          return;
        }
        const owner = this.playerById(ownerId);
        if (!owner || owner.bankrupt) {
          this.owner[idx] = null;
          this.level[idx] = 0;
          this.pushLog('pass', '주인이 없는 「' + tile.name + '」이(가) 되어 매입할 수 있습니다.');
          return;
        }
        const toll = tile.tolls[this.level[idx]];
        this.pushLog('toll', player.name + '님이 ' + owner.name + '님의 「' + tile.name + '」(' + BUILD_NAMES[this.level[idx]] + ') 통행료 ' + formatMoney(toll) + '을 냅니다.');
        this.pay(player, toll, owner, tile.name + ' 통행료');
        return;
      }

      if (tile.type === TILE_TYPES.GOLDEN) {
        this.drawGoldenKey(player, 'golden');
        return;
      }
      if (tile.type === TILE_TYPES.TRAVEL) {
        this.pushLog('travel', player.name + '님 전국일주 칸! 황금열쇠를 1장 뽑습니다.');
        this.drawGoldenKey(player, 'travel');
        return;
      }
      if (tile.type === TILE_TYPES.TAX) {
        this.pushLog('tax', player.name + '님이 세금 ' + formatMoney(TAX_AMOUNT) + '을 냅니다.');
        this.pay(player, TAX_AMOUNT, null, '세금');
        return;
      }
      if (tile.type === TILE_TYPES.BONUS) {
        player.cash += BONUS_AMOUNT;
        this.pushLog('bonus', player.name + '님 보너스 ' + formatMoney(BONUS_AMOUNT) + '을 받았습니다!');
        return;
      }
      if (tile.type === TILE_TYPES.PARK) {
        player.cash += PARK_AMOUNT;
        this.pushLog('bonus', player.name + '님 무료주차! ' + formatMoney(PARK_AMOUNT) + '을 받았습니다.');
        return;
      }
      if (tile.type === TILE_TYPES.ISLAND) {
        this.sendToIsland(player);
        return;
      }
      if (tile.type === TILE_TYPES.START) {
        this.pushLog('start', player.name + '님이 출발지에 도착했습니다.');
      }
    }

    /* ---------- 돈 · 파산 ---------- */

    pay(payer, amount, to, label) {
      const sum = Math.max(0, Math.round(Number(amount) || 0));
      if (!sum) return true;
      if (payer.bankrupt) return false;
      if (payer.cash >= sum) {
        payer.cash -= sum;
        if (to && to !== payer) to.cash += sum;
        this.pushLog('pay', payer.name + ' ' + formatMoney(sum) + ' → ' + (to && to !== payer ? to.name : '은행') + ' (' + label + ')');
        return true;
      }

      // 가진 돈을 모두 내고 파산합니다. 땅은 받는 사람(없으면 은행)에게 넘어갑니다.
      const paid = payer.cash;
      payer.cash = 0;
      if (to && to !== payer) to.cash += paid;
      this.pushLog('bankrupt', payer.name + '님이 ' + formatMoney(sum) + '을(를) 낼 수 없어 파산했습니다. (낸 돈 ' + formatMoney(paid) + ')');
      this.bankrupt(payer, to);
      return false;
    }

    bankrupt(player, to) {
      if (player.bankrupt) return;
      player.bankrupt = true;
      player.eliminated = true;
      player.island = false;
      player.islandTurns = 0;
      player.freeBail = 0;
      const names = [];
      for (let i = 0; i < BOARD_SIZE; i++) {
        if (this.owner[i] !== player.id) continue;
        names.push(BOARD[i].name);
        if (to && !to.bankrupt) {
          this.owner[i] = to.id;
        } else {
          this.owner[i] = null;
          this.level[i] = 0;
        }
      }
      if (names.length) {
        this.pushLog('bankrupt', (to && !to.bankrupt ? to.name + '님이 ' : '은행이 ') + names.join(', ') + '을(를) 가져갑니다.');
      }
      if (this.alive().length <= 1) {
        this.finishGame(this.alive().length === 1 ? 'last_player' : 'all_bankrupt');
      }
      // 차례를 넘기는 일은 이 파산을 일으킨 동작(주사위 · 카드)이 끝난 뒤에 합니다.
    }

    /* ---------- 무인도 ---------- */

    sendToIsland(player) {
      if (player.freeBail > 0) {
        player.freeBail -= 1;
        this.pushLog('island', player.name + '님이 무인도 탈출권을 사용해 그대로 지나갑니다. (남은 탈출권 ' + player.freeBail + '장)');
        return false;
      }
      player.pos = ISLAND_INDEX;
      player.island = true;
      player.islandTurns = 0;
      this.doublesInTurn = 0;
      this.pushLog('island', player.name + '님이 무인도에 갇혔습니다. (더블 또는 보석금 ' + formatMoney(ISLAND_BAIL) + ')');
      return true;
    }

    payBail(playerId) {
      if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
      const p = this.playerById(playerId);
      if (!p) return { ok: false, reason: 'unknown_player' };
      if (p.bankrupt) return { ok: false, reason: 'bankrupt' };
      if (this.currentPlayerId() !== p.id) return { ok: false, reason: 'not_your_turn' };
      if (!p.island) return { ok: false, reason: 'not_on_island' };
      if (this.phase !== 'roll') return { ok: false, reason: 'wrong_phase' };
      if (p.cash < ISLAND_BAIL) return { ok: false, reason: 'not_enough_cash' };

      p.cash -= ISLAND_BAIL;
      p.island = false;
      p.islandTurns = 0;
      this.pushLog('island', p.name + '님이 보석금 ' + formatMoney(ISLAND_BAIL) + '을 내고 무인도에서 나왔습니다.');
      return { ok: true, paid: ISLAND_BAIL };
    }

    /* ---------- 황금열쇠 ---------- */

    drawGoldenKey(player, source) {
      const card = GOLDEN_CARDS[Math.floor(this.rng() * GOLDEN_CARDS.length)];
      this.cardSeq += 1;
      this.lastCard = {
        seq: this.cardSeq,
        id: card.id,
        title: card.title,
        text: card.text,
        tone: card.tone,
        playerId: player.id,
        playerName: player.name,
        source: source || 'golden',
        at: Date.now()
      };
      this.pushLog('card', player.name + '님 황금열쇠 「' + card.title + '」 — ' + card.text);
      this.applyCard(card, player);
      if (this.lastRoll && this.lastRoll.playerId === player.id) this.lastRoll.to = player.pos;
      return card;
    }

    applyCard(card, player) {
      switch (card.id) {
        case 'bank_interest':
          player.cash += 100000;
          break;
        case 'hospital':
          this.pay(player, 60000, null, '병원비');
          break;
        case 'birthday': {
          const others = this.players.filter(function (p) { return !p.bankrupt && p.id !== player.id; });
          let total = 0;
          for (const other of others) {
            if (other.cash >= 40000) {
              other.cash -= 40000;
              player.cash += 40000;
              total += 40000;
            } else {
              this.pay(other, 40000, player, '축하금');
              total += 40000;
            }
          }
          this.pushLog('card', '축하금 ' + formatMoney(total) + '을 받았습니다.');
          break;
        }
        case 'donation':
          this.pay(player, 80000, null, '기부금');
          break;
        case 'lottery':
          player.cash += 250000;
          break;
        case 'tax_audit':
          this.pay(player, 120000, null, '세무 조사');
          break;
        case 'go_start':
          player.pos = 0;
          player.cash += SALARY;
          this.pushLog('card', player.name + '님이 출발지로 이동해 월급 ' + formatMoney(SALARY) + '을 받았습니다.');
          break;
        case 'island_trip':
          this.sendToIsland(player);
          break;
        case 'escape_pass':
          player.freeBail += 1;
          break;
        case 'travel_back':
          player.pos = (player.pos - 3 + BOARD_SIZE) % BOARD_SIZE;
          break;
        case 'city_fund': {
          const count = this.propertiesOf(player.id).length;
          const gain = Math.max(1, count) * 50000;
          player.cash += gain;
          this.pushLog('card', '도시 ' + count + '곳 지원금 ' + formatMoney(gain) + '을 받았습니다.');
          break;
        }
        case 'repair_fee': {
          let levels = 0;
          for (let i = 0; i < BOARD_SIZE; i++) {
            if (this.owner[i] === player.id) levels += this.level[i];
          }
          this.pay(player, Math.max(1, levels) * 30000, null, '건물 수리');
          break;
        }
        default:
          break;
      }
    }

    /* ---------- 매입 · 건설 ---------- */

    buy(playerId) {
      if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
      const p = this.playerById(playerId);
      if (!p) return { ok: false, reason: 'unknown_player' };
      if (this.currentPlayerId() !== p.id) return { ok: false, reason: 'not_your_turn' };
      if (this.phase !== 'decide' || !this.pending || this.pending.kind !== 'buy') {
        return { ok: false, reason: 'nothing_to_buy' };
      }
      const tileIdx = this.pending.tile;
      const price = this.pending.price;
      const name = this.pending.name;
      if (this.owner[tileIdx]) return { ok: false, reason: 'already_owned' };
      if (p.cash < price) return { ok: false, reason: 'not_enough_cash' };

      p.cash -= price;
      this.owner[tileIdx] = p.id;
      this.level[tileIdx] = 0;
      this.pushLog('buy', p.name + '님이 「' + name + '」을(를) ' + formatMoney(price) + '에 매입했습니다.');
      this._finishDecision(p);
      return { ok: true, tile: tileIdx, price: price };
    }

    build(playerId) {
      if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
      const p = this.playerById(playerId);
      if (!p) return { ok: false, reason: 'unknown_player' };
      if (this.currentPlayerId() !== p.id) return { ok: false, reason: 'not_your_turn' };
      if (this.phase !== 'decide' || !this.pending || this.pending.kind !== 'build') {
        return { ok: false, reason: 'nothing_to_build' };
      }
      const tileIdx = this.pending.tile;
      const cost = this.pending.cost;
      const name = this.pending.name;
      if (this.owner[tileIdx] !== p.id) return { ok: false, reason: 'not_owner' };
      if (this.level[tileIdx] >= 3) return { ok: false, reason: 'max_level' };
      if (p.cash < cost) return { ok: false, reason: 'not_enough_cash' };

      p.cash -= cost;
      this.level[tileIdx] += 1;
      this.pushLog('build', p.name + '님이 「' + name + '」에 ' + BUILD_NAMES[this.level[tileIdx]] + '을(를) 지었습니다. (' + formatMoney(cost) + ')');
      this._finishDecision(p);
      return { ok: true, tile: tileIdx, level: this.level[tileIdx], cost: cost };
    }

    skip(playerId) {
      if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
      const p = this.playerById(playerId);
      if (!p) return { ok: false, reason: 'unknown_player' };
      if (this.currentPlayerId() !== p.id) return { ok: false, reason: 'not_your_turn' };
      if (this.phase !== 'decide' || !this.pending) return { ok: false, reason: 'nothing_to_skip' };
      const kind = this.pending.kind;
      const name = this.pending.name;
      this.pushLog('pass', p.name + '님이 「' + name + '」 ' + (kind === 'buy' ? '매입을' : '건설을') + ' 건너뛰었습니다.');
      this._finishDecision(p);
      return { ok: true };
    }

    /* ---------- 종료 · 순위 ---------- */

    finishGame(reason) {
      if (this.status === 'finished') return;
      this.status = 'finished';
      this.phase = 'over';
      this.pending = null;
      this.finishReason = reason || 'finished';
      const ranked = this.rankList();
      this.winnerId = ranked.length ? ranked[0].id : null;
      const winner = this.winnerId ? this.playerById(this.winnerId) : null;
      if (winner) {
        this.pushLog('finish', '게임 종료! 우승: ' + winner.name + '님 (총자산 ' + formatMoney(this.totalAsset(winner)) + ')');
      } else {
        this.pushLog('finish', '게임 종료');
      }
    }

    rankList() {
      const self = this;
      const rows = this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          bankrupt: p.bankrupt,
          eliminated: p.bankrupt,
          cash: p.cash,
          assets: self.totalAsset(p) - p.cash,
          totalAsset: self.totalAsset(p),
          properties: self.propertiesOf(p.id).length
        };
      });
      rows.sort(function (a, b) {
        if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
        if (b.totalAsset !== a.totalAsset) return b.totalAsset - a.totalAsset;
        return a.seat - b.seat;
      });
      return rows.map(function (row, i) { return Object.assign({ rank: i + 1 }, row); });
    }

    ranking() {
      return this.rankList();
    }

    /* ---------- 직렬화 ---------- */

    stateFor(viewerId) {
      const self = this;
      const currentId = this.currentPlayerId();
      return {
        status: this.status,
        phase: this.phase,
        turn: currentId,
        round: Math.min(this.round, this.maxRounds),
        maxRounds: this.maxRounds,
        turnCount: this.turnCount,
        players: this.players.map(function (p) {
          return {
            id: p.id,
            name: p.name,
            number: p.number,
            seat: p.seat,
            isBot: p.isBot,
            cash: p.cash,
            pos: p.pos,
            bankrupt: p.bankrupt,
            eliminated: p.bankrupt,
            island: p.island,
            islandTurns: p.islandTurns,
            freeBail: p.freeBail,
            properties: self.propertiesOf(p.id).length,
            totalAsset: self.totalAsset(p),
            isTurn: p.id === currentId && self.status === 'playing',
            isSelf: p.id === viewerId
          };
        }),
        owner: this.owner.slice(),
        level: this.level.slice(),
        pending: this.pending ? Object.assign({}, this.pending) : null,
        lastRoll: this.lastRoll ? Object.assign({}, this.lastRoll) : null,
        lastCard: this.lastCard ? Object.assign({}, this.lastCard) : null,
        log: this.log.slice(-60),
        ranking: this.ranking(),
        winnerId: this.winnerId,
        winner: this.winnerId ? (this.playerById(this.winnerId) || {}).name || null : null,
        finishReason: this.finishReason,
        startedAt: this.startedAt,
        islandIndex: ISLAND_INDEX,
        startCash: this.startingCash
      };
    }
  }

  /* ---------------- AI 봇 ---------------- */

  const BOT_PROFILES = {
    easy: { label: '쉬움', delay: [900, 1500], buyRatio: 1.9, buildReserve: 300000 },
    normal: { label: '보통', delay: [600, 1100], buyRatio: 1.5, buildReserve: 220000 },
    hard: { label: '어려움', delay: [380, 800], buyRatio: 1.2, buildReserve: 150000 }
  };

  const BOT_NAMES = ['주사위왕', '건물부자', '도시탐험가', '호텔사장', '별장지기', '마블여행자'];

  /**
   * 봇 행동 결정기.
   * tick(now) -> { playerId, action: 'roll'|'buy'|'build'|'skip'|'payBail' } | null
   */
  class BotDriver {
    constructor(game, options) {
      const opts = options || {};
      this.game = game;
      this.level = BOT_PROFILES[opts.level] ? opts.level : 'normal';
      this.rng = opts.rng || Math.random;
      this.sig = null;
      this.nextAt = 0;
    }

    profile() {
      return BOT_PROFILES[this.level];
    }

    signature() {
      const g = this.game;
      return [
        g.status,
        g.turn,
        g.phase,
        g.pending ? g.pending.kind : '-',
        g.pending ? g.pending.tile : '-',
        g.round,
        g.turnCount,
        g.lastRoll ? g.lastRoll.seq : 0,
        g.lastCard ? g.lastCard.seq : 0
      ].join('|');
    }

    tick(now) {
      const g = this.game;
      if (!g || g.status !== 'playing') return null;
      const t = typeof now === 'number' ? now : Date.now();
      const p = g.players[g.turn];
      if (!p || !p.isBot || p.bankrupt) return null;

      const sig = this.signature();
      if (sig !== this.sig) {
        this.sig = sig;
        const prof = this.profile();
        this.nextAt = t + Math.round(prof.delay[0] + this.rng() * (prof.delay[1] - prof.delay[0]));
        return null;
      }
      if (t < this.nextAt) return null;

      if (g.phase === 'decide' && g.pending) {
        const prof = this.profile();
        if (g.pending.kind === 'buy') {
          const price = g.pending.price;
          const keep = 100000;
          if (p.cash >= price + keep && (p.cash >= price * prof.buyRatio || g.propertiesOf(p.id).length === 0)) {
            return { playerId: p.id, action: 'buy' };
          }
          return { playerId: p.id, action: 'skip' };
        }
        if (g.pending.kind === 'build') {
          const cost = g.pending.cost;
          if (p.cash >= cost + prof.buildReserve) return { playerId: p.id, action: 'build' };
          return { playerId: p.id, action: 'skip' };
        }
        return { playerId: p.id, action: 'skip' };
      }

      if (g.phase === 'roll') {
        if (p.island && p.cash >= ISLAND_BAIL + 150000 && p.islandTurns >= 1 && this.rng() < 0.65) {
          return { playerId: p.id, action: 'payBail' };
        }
        return { playerId: p.id, action: 'roll' };
      }
      return null;
    }
  }

  return {
    BOARD_SIZE: BOARD_SIZE,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    MAX_ROUNDS: MAX_ROUNDS,
    START_CASH: START_CASH,
    SALARY: SALARY,
    ISLAND_BAIL: ISLAND_BAIL,
    TAX_AMOUNT: TAX_AMOUNT,
    BONUS_AMOUNT: BONUS_AMOUNT,
    PARK_AMOUNT: PARK_AMOUNT,
    BUILD_NAMES: BUILD_NAMES,
    TOLL_RATE: TOLL_RATE,
    TILE_TYPES: TILE_TYPES,
    REGION_COLORS: REGION_COLORS,
    CORNER_COLORS: CORNER_COLORS,
    BOARD: BOARD,
    ISLAND_INDEX: ISLAND_INDEX,
    GOLDEN_CARDS: GOLDEN_CARDS,
    CARD_BY_ID: CARD_BY_ID,
    BOT_PROFILES: BOT_PROFILES,
    BOT_NAMES: BOT_NAMES,
    formatMoney: formatMoney,
    shortMoney: shortMoney,
    createRng: createRng,
    Game: Game,
    BotDriver: BotDriver
  };
});
