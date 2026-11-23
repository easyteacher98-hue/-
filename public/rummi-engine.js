/*
 * 숫자 타일 러미 – 게임 엔진 (공용, UMD)
 * - 1~13 × 4색(빨강·파랑·노랑·초록) + 조커 2장 = 54장
 * - 같은 숫자 다른 색 3~4장(세트) / 같은 색 연속 숫자 3장 이상(런)을 테이블에 내놓습니다.
 * - 처음 등록은 한 차례에 낸 타일 합이 기준 점수(기본 30점, 수업용 15점) 이상이어야 합니다.
 * - 내 패를 먼저 다 내면 승리! (룰미큐브와 비슷하지만 이름·규칙을 새로 만든 자체 게임입니다)
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rummi = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;
  const COLORS = ['red', 'blue', 'yellow', 'green'];
  const COLOR_NAMES = { red: '빨강', blue: '파랑', yellow: '노랑', green: '초록' };
  const JOKER_POINTS = 10;
  const INITIAL_POINTS = 30;
  const EASY_INITIAL_POINTS = 15;
  const BOT_NAMES = ['타일봇 하나', '타일봇 둘리', '타일봇 세모'];

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

  /** 54장 덱: 1~13 × 4색 + 조커 2장 */
  function makeDeck() {
    const deck = [];
    COLORS.forEach(function (color) {
      for (let value = 1; value <= 13; value++) {
        deck.push({ id: color.charAt(0) + value, color: color, value: value, joker: false });
      }
    });
    deck.push({ id: 'j1', color: null, value: 0, joker: true });
    deck.push({ id: 'j2', color: null, value: 0, joker: true });
    return deck;
  }

  function tilePoints(tile) {
    return tile && tile.joker ? JOKER_POINTS : (tile ? tile.value : 0);
  }

  function pointsOf(tiles) {
    return (tiles || []).reduce(function (sum, tile) { return sum + tilePoints(tile); }, 0);
  }

  /**
   * 세트 하나가 규칙에 맞는지 검사합니다.
   *  - 같은 숫자 세트: 3~4장, 숫자가 같고 색이 모두 달라야 합니다.
   *  - 런: 3장 이상, 같은 색이고 숫자가 겹치지 않으며, 가장 큰 수와 작은 수의 차이가 (장수-1) 이하여야 합니다.
   *  - 조커는 한 세트에 1장까지, 어떤 빈자리든 대신할 수 있습니다.
   */
  function validateSet(tiles) {
    if (!Array.isArray(tiles) || tiles.length < 3) return { ok: false, reason: 'bad_size' };
    const jokers = tiles.filter(function (t) { return t && t.joker; });
    if (jokers.length > 1) return { ok: false, reason: 'too_many_jokers' };
    const real = tiles.filter(function (t) { return t && !t.joker; });
    if (!real.length) return { ok: false, reason: 'bad_set' };

    const sameValue = real.every(function (t) { return t.value === real[0].value; });
    if (sameValue) {
      if (tiles.length > 4) return { ok: false, reason: 'bad_size' };
      const colors = {};
      for (let i = 0; i < real.length; i++) {
        if (colors[real[i].color]) return { ok: false, reason: 'dup_color' };
        colors[real[i].color] = true;
      }
      return { ok: true, type: 'group', points: pointsOf(tiles) };
    }

    const color = real[0].color;
    if (!real.every(function (t) { return t.color === color; })) return { ok: false, reason: 'mixed' };
    const values = real.map(function (t) { return t.value; }).sort(function (a, b) { return a - b; });
    for (let i = 1; i < values.length; i++) {
      if (values[i] === values[i - 1]) return { ok: false, reason: 'dup_value' };
    }
    if (values[0] < 1 || values[values.length - 1] > 13) return { ok: false, reason: 'out_of_range' };
    const span = values[values.length - 1] - values[0] + 1;
    if (span > tiles.length) return { ok: false, reason: 'gap' };
    return { ok: true, type: 'run', points: pointsOf(tiles) };
  }

  /** 세트를 보기 좋은 순서로 정리합니다. (런은 숫자 순, 조커는 빈자리에) */
  function arrange(tiles) {
    const list = (tiles || []).slice();
    const real = list.filter(function (t) { return !t.joker; });
    if (!real.length) return list;
    const group = real.every(function (t) { return t.value === real[0].value; });
    if (group) {
      return real.sort(function (a, b) { return COLORS.indexOf(a.color) - COLORS.indexOf(b.color); })
        .concat(list.filter(function (t) { return t.joker; }));
    }
    const sorted = real.sort(function (a, b) { return a.value - b.value; });
    const jokers = list.filter(function (t) { return t.joker; });
    if (!jokers.length) return sorted;
    // 빈자리(연속이 끊긴 곳)에 조커를 넣고, 빈자리가 없으면 뒤에 붙입니다.
    const out = [sorted[0]];
    const spare = jokers.slice();
    for (let i = 1; i < sorted.length; i++) {
      while (spare.length && sorted[i].value - out[out.length - 1].value > 1) {
        out.push(spare.shift());
      }
      out.push(sorted[i]);
    }
    while (spare.length) out.push(spare.shift());
    return out;
  }

  function sameTileIds(a, b) {
    if (a.length !== b.length) return false;
    const set = {};
    a.forEach(function (id) { set[id] = true; });
    return b.every(function (id) { return set[id]; });
  }

  function Game(players, options) {
    const opts = options || {};
    const extra = opts.options || {};
    const requested = Number(extra.initialPoints || opts.initialPoints);
    this.initialPoints = requested === EASY_INITIAL_POINTS ? EASY_INITIAL_POINTS : INITIAL_POINTS;
    this.rng = makeRng(opts.seed || Math.floor(Math.random() * 1e9));
    this.players = (players || []).slice(0, MAX_PLAYERS).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        hand: [],
        melded: false,
        finished: false
      };
    });
    this.deck = makeDeck();
    shuffle(this.deck, this.rng);
    // 54장을 나눠 줍니다. (4명일 때는 손패를 10장으로 줄여 더미를 남깁니다)
    const handSize = this.players.length <= 2 ? 14 : this.players.length === 3 ? 12 : 10;
    const self = this;
    this.players.forEach(function (p) {
      for (let i = 0; i < handSize; i++) p.hand.push(self.deck.pop());
      p.hand = arrange(p.hand);
    });
    this.table = [];
    this.setSeq = 0;
    this.turn = 0;
    this.status = 'playing';
    this.finishReason = null;
    this.winnerId = null;
    this.passes = 0;
    this.moves = 0;
    this.seq = 0;
    this.log = [];
    this.startedAt = Date.now();
    const first = this.players[0];
    this.pushLog('🔢 숫자 타일 러미를 시작합니다. ' + (first ? first.name : '') + '부터! 처음 등록은 ' + this.initialPoints + '점 이상이어야 합니다.');
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

  Game.prototype.activePlayers = function () {
    return this.players.filter(function (p) { return !p.finished; });
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

  Game.prototype.finish = function (reason, winnerId) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'done';
    if (winnerId !== undefined) this.winnerId = winnerId || null;
    this.finishedAt = Date.now();
  };

  Game.prototype.finishGame = function (reason) {
    this.finish(reason || 'closed_by_host', null);
  };

  Game.prototype.takeFromHand = function (player, tileIds) {
    const taken = [];
    const missing = [];
    const pool = player.hand.slice();
    (tileIds || []).forEach(function (id) {
      const idx = pool.findIndex(function (t) { return t.id === id; });
      if (idx === -1) { missing.push(id); return; }
      taken.push(pool[idx]);
      pool.splice(idx, 1);
    });
    return { taken: taken, missing: missing, rest: pool };
  };

  /**
   * 타일 내기: payload = { melds: [{ tileIds: [] }], adds: [{ setId, tileIds: [] }] }
   * 한 차례에 여러 세트를 함께 낼 수 있고, 처음 등록 점수는 그 차례에 낸 합으로 봅니다.
   */
  Game.prototype.play = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    const data = payload || {};
    const melds = Array.isArray(data.melds) ? data.melds : [];
    const adds = Array.isArray(data.adds) ? data.adds : [];
    if (!melds.length && !adds.length) return { ok: false, reason: 'empty_play' };

    // 손에서 낼 타일을 모두 모읍니다. (세트마다 겹쳐 쓰면 안 됩니다)
    const wanted = [];
    melds.forEach(function (m) { (m.tileIds || []).forEach(function (id) { wanted.push(id); }); });
    adds.forEach(function (a) { (a.tileIds || []).forEach(function (id) { wanted.push(id); }); });
    if (!wanted.length) return { ok: false, reason: 'empty_play' };
    if (new Set(wanted).size !== wanted.length) return { ok: false, reason: 'dup_tile' };

    const picked = this.takeFromHand(player, wanted);
    if (picked.missing.length) return { ok: false, reason: 'no_tile' };

    // 테이블 세트에 더하기 (조커가 든 세트에는 더할 수 없습니다)
    const table = this.table.map(function (set) {
      return { id: set.id, tiles: set.tiles.slice(), type: set.type };
    });
    let overflow = 0;
    for (let i = 0; i < adds.length; i++) {
      const add = adds[i];
      const target = table.find(function (set) { return set.id === add.setId; });
      if (!target) return { ok: false, reason: 'set_not_found' };
      if (target.tiles.some(function (t) { return t.joker; })) return { ok: false, reason: 'joker_set' };
      const grabbed = this.takeFromHand({ hand: picked.taken }, add.tileIds || []);
      if (grabbed.missing.length) return { ok: false, reason: 'no_tile' };
      const combined = target.tiles.concat(grabbed.taken);
      const check = validateSet(combined);
      if (!check.ok) return { ok: false, reason: 'bad_set' };
      target.tiles = arrange(combined);
      target.type = check.type;
      overflow += grabbed.taken.length;
    }

    // 새 세트 만들기
    const created = [];
    for (let i = 0; i < melds.length; i++) {
      const ids = melds[i].tileIds || [];
      if (!ids.length) continue;
      const grabbed = this.takeFromHand({ hand: picked.taken }, ids);
      if (grabbed.missing.length) return { ok: false, reason: 'no_tile' };
      const check = validateSet(grabbed.taken);
      if (!check.ok) return { ok: false, reason: 'bad_set' };
      created.push({ tiles: arrange(grabbed.taken), type: check.type });
      overflow += grabbed.taken.length;
    }
    if (!overflow) return { ok: false, reason: 'empty_play' };

    // 처음 등록 점수 확인 (새로 낸 타일 + 더한 타일의 합)
    const gained = pointsOf(picked.taken);
    if (!player.melded && gained < this.initialPoints) {
      return { ok: false, reason: 'need_initial', points: gained, need: this.initialPoints };
    }

    // 여기서부터 실제 반영
    this.table = table;
    created.forEach(function (set) {
      this.setSeq += 1;
      this.table.push({ id: 's' + this.setSeq, tiles: set.tiles, type: set.type });
    }, this);
    player.hand = arrange(picked.rest);
    player.melded = true;
    this.moves += 1;
    this.passes = 0;

    const touched = [];
    created.forEach(function (set) { touched.push(set.tiles.map(tileText).join(' ')); });
    adds.forEach(function (add) {
      const target = table.find(function (set) { return set.id === add.setId; });
      if (target) touched.push(target.tiles.map(tileText).join(' '));
    });
    this.pushLog(player.name + '님이 ' + picked.taken.length + '장을 냈습니다. (' + gained + '점) ' +
      (touched.length ? touched.join(' · ') : ''));

    if (!player.hand.length) {
      player.finished = true;
      this.finish('empty_hand', player.id);
      this.pushLog('🎉 ' + player.name + '님이 타일을 모두 냈습니다! 우승!');
      return { ok: true, win: true };
    }
    this.nextTurn();
    return { ok: true, points: gained };
  };

  /** 한 장 뽑기 (덱이 비었으면 그냥 차례를 넘깁니다) */
  Game.prototype.draw = function (playerId) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };

    let drew = null;
    if (this.deck.length) {
      drew = this.deck.pop();
      player.hand = arrange(player.hand.concat([drew]));
      this.passes = 0;
      this.pushLog(player.name + '님이 타일 1장을 뽑았습니다. (남은 더미 ' + this.deck.length + '장)');
    } else {
      this.passes += 1;
      this.pushLog(player.name + '님이 낼 타일이 없어 차례를 넘깁니다.');
      if (this.passes >= this.activePlayers().length) {
        this.finish('deck_out', null);
        this.pushLog('🏁 더미가 비었습니다. 남은 타일 점수가 가장 낮은 사람이 우승!');
        return { ok: true, deckOut: true };
      }
    }
    this.nextTurn();
    return { ok: true, drew: drew ? drew.id : null };
  };

  function tileText(tile) {
    if (!tile) return '';
    if (tile.joker) return '⭐조커';
    return COLOR_NAMES[tile.color] + ' ' + tile.value;
  }

  Game.prototype.ranking = function () {
    const self = this;
    const rows = this.players.map(function (p) {
      const left = pointsOf(p.hand);
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        isBot: p.isBot,
        seat: p.seat,
        score: self.finishReason === 'deck_out' ? -left : (self.winnerId === p.id ? 1 : 0),
        remaining: left,
        tiles: p.hand.length,
        result: self.finishReason === 'deck_out'
          ? '남은 타일 ' + left + '점'
          : (self.winnerId === p.id ? '승리 🎉' : '남은 타일 ' + left + '점')
      };
    });
    if (this.finishReason === 'deck_out') {
      rows.sort(function (a, b) {
        if (a.remaining !== b.remaining) return a.remaining - b.remaining;
        return a.seat - b.seat;
      });
    } else {
      rows.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (a.remaining !== b.remaining) return a.remaining - b.remaining;
        return a.seat - b.seat;
      });
    }
    rows.forEach(function (row, i) {
      if (i > 0 && rows[i - 1].remaining === row.remaining && row.score === rows[i - 1].score) row.rank = rows[i - 1].rank;
      else row.rank = i + 1;
    });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    const me = viewerId ? this.playerById(viewerId) : null;
    const current = this.currentPlayer();
    return {
      gameId: 'rummi',
      status: this.status,
      finishReason: this.finishReason,
      turnPlayerId: this.status === 'playing' && current ? current.id : null,
      youId: viewerId || null,
      hand: me ? me.hand.slice() : [],
      handCounts: this.players.reduce(function (map, p) { map[p.id] = p.hand.length; return map; }, {}),
      table: this.table.map(function (set) {
        return { id: set.id, type: set.type, tiles: set.tiles.slice(), points: pointsOf(set.tiles) };
      }),
      deckCount: this.deck.length,
      initialPoints: this.initialPoints,
      youMelded: me ? me.melded : false,
      youCanPlay: me ? !!(me.melded || pointsOf(me.hand) >= this.initialPoints) : false,
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
          melded: p.melded,
          finished: p.finished,
          isTurn: self.status === 'playing' && current && current.id === p.id
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  /** 손패에서 만들 수 있는 세트 후보를 모두 찾습니다. (조커는 1장까지 사용) */
  function findSets(hand) {
    const out = [];
    const jokers = hand.filter(function (t) { return t.joker; });
    const real = hand.filter(function (t) { return !t.joker; });

    // 같은 숫자 세트
    const byValue = {};
    real.forEach(function (t) {
      (byValue[t.value] = byValue[t.value] || []).push(t);
    });
    Object.keys(byValue).forEach(function (key) {
      const list = byValue[key];
      if (list.length >= 3) {
        out.push({ tiles: list.slice(0, 4), type: 'group' });
      } else if (list.length === 2 && jokers.length) {
        out.push({ tiles: list.concat([jokers[0]]), type: 'group' });
      }
    });

    // 같은 색 연속 숫자(런)
    COLORS.forEach(function (color) {
      const values = real.filter(function (t) { return t.color === color; })
        .sort(function (a, b) { return a.value - b.value; });
      for (let i = 0; i < values.length; i++) {
        const run = [values[i]];
        for (let k = i + 1; k < values.length; k++) {
          if (values[k].value === run[run.length - 1].value + 1) run.push(values[k]);
          else break;
        }
        if (run.length >= 3) out.push({ tiles: run.slice(0, 13), type: 'run' });
        else if (run.length === 2 && jokers.length) out.push({ tiles: run.concat([jokers[0]]), type: 'run' });
      }
    });
    // 점수·장수 순으로 정렬
    return out.sort(function (a, b) {
      if (b.tiles.length !== a.tiles.length) return b.tiles.length - a.tiles.length;
      return pointsOf(b.tiles) - pointsOf(a.tiles);
    });
  }

  function botAction(game, player) {
    const options = [];
    const sets = findSets(player.hand);
    if (!player.melded) {
      // 처음 등록: 기준 점수를 넘는 조합 찾기 (많이 내는 쪽 우선)
      let chosen = [];
      let sum = 0;
      const used = {};
      sets.forEach(function (set) {
        if (sum >= game.initialPoints) return;
        if (set.tiles.some(function (t) { return used[t.id]; })) return;
        chosen.push(set);
        set.tiles.forEach(function (t) { used[t.id] = true; });
        sum += pointsOf(set.tiles);
      });
      if (sum >= game.initialPoints && chosen.length) {
        options.push({ action: 'play', payload: { melds: chosen.map(function (set) { return { tileIds: set.tiles.map(function (t) { return t.id; }) }; }), adds: [] } });
      }
    } else {
      const usedIds = {};
      const melds = [];
      sets.forEach(function (set) {
        if (set.tiles.some(function (t) { return usedIds[t.id]; })) return;
        set.tiles.forEach(function (t) { usedIds[t.id] = true; });
        melds.push({ tileIds: set.tiles.map(function (t) { return t.id; }) });
      });
      // 테이블 세트에 낱장으로 더하기
      const adds = [];
      game.table.forEach(function (set) {
        if (set.tiles.some(function (t) { return t.joker; })) return;
        for (let i = 0; i < player.hand.length; i++) {
          const tile = player.hand[i];
          if (tile.joker || usedIds[tile.id]) continue;
          if (set.tiles.length >= 13) continue;
          if (validateSet(set.tiles.concat([tile])).ok) {
            adds.push({ setId: set.id, tileIds: [tile.id] });
            usedIds[tile.id] = true;
            break;
          }
        }
      });
      if (melds.length || adds.length) options.push({ action: 'play', payload: { melds: melds, adds: adds } });
    }
    if (!options.length) return { action: 'draw', payload: {} };
    const pick = options[0];
    return pick;
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
    COLORS: COLORS,
    COLOR_NAMES: COLOR_NAMES,
    INITIAL_POINTS: INITIAL_POINTS,
    EASY_INITIAL_POINTS: EASY_INITIAL_POINTS,
    BOT_NAMES: BOT_NAMES,
    makeDeck: makeDeck,
    makeRng: makeRng,
    shuffle: shuffle,
    arrange: arrange,
    pointsOf: pointsOf,
    validateSet: validateSet,
    findSets: findSets,
    sameTileIds: sameTileIds,
    tileText: tileText,
    Game: Game,
    BotDriver: BotDriver,
    botAction: botAction
  };
});
