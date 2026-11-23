'use strict';

/*
 * 부루마블 규칙 엔진 테스트
 * - 보드 구성, 매입/건설/통행료, 더블·무인도, 황금열쇠, 파산, 라운드 제한을 확인합니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const BM = require('../public/bluemarble-engine.js');

/** 주사위 눈(1~6)을 순서대로 돌려주는 rng */
function diceRng(faces) {
  let i = 0;
  return function () {
    const v = faces[Math.min(i, faces.length - 1)];
    i += 1;
    return (v - 1) / 6 + 0.01;
  };
}

/** 임의의 0~1 값을 순서대로 돌려주는 rng (주사위·카드 혼합용) */
function rawRng(values) {
  let i = 0;
  return function () {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
}

function dieFace(v) {
  return (v - 1) / 6 + 0.01;
}

function cardFrac(index) {
  return (index + 0.5) / BM.GOLDEN_CARDS.length;
}

function makeGame(count, rng, options) {
  const players = [];
  for (let i = 0; i < (count || 2); i++) {
    players.push({ id: 'p' + i, name: (i + 1) + '번', number: i + 1, isBot: false });
  }
  return new BM.Game(players, Object.assign({ rng: rng }, options || {}));
}

/* ---------------- 보드 ---------------- */

test('보드는 28칸이고 도시 15 · 황금열쇠 4 · 세금 3 · 보너스 2 · 코너 4로 구성된다', function () {
  assert.equal(BM.BOARD.length, 28);
  assert.equal(BM.BOARD_SIZE, 28);
  const count = {};
  BM.BOARD.forEach(function (tile) { count[tile.type] = (count[tile.type] || 0) + 1; });

  assert.equal(count[BM.TILE_TYPES.CITY], 15);
  assert.equal(count[BM.TILE_TYPES.GOLDEN], 4);
  assert.equal(count[BM.TILE_TYPES.TAX], 3);
  assert.equal(count[BM.TILE_TYPES.BONUS], 2);
  assert.equal(count[BM.TILE_TYPES.START], 1);
  assert.equal(count[BM.TILE_TYPES.ISLAND], 1);
  assert.equal(count[BM.TILE_TYPES.TRAVEL], 1);
  assert.equal(count[BM.TILE_TYPES.PARK], 1);

  // 코너 위치: 출발(0) · 무인도(7) · 전국일주(14) · 무료주차(21)
  assert.equal(BM.BOARD[0].type, BM.TILE_TYPES.START);
  assert.equal(BM.BOARD[7].type, BM.TILE_TYPES.ISLAND);
  assert.equal(BM.BOARD[14].type, BM.TILE_TYPES.TRAVEL);
  assert.equal(BM.BOARD[21].type, BM.TILE_TYPES.PARK);
  assert.equal(BM.ISLAND_INDEX, 7);

  // 도시마다 이름·가격·건설비·통행료(4단계)가 있고 통행료는 단계가 오를수록 비싸다
  const cities = BM.BOARD.filter(function (t) { return t.type === BM.TILE_TYPES.CITY; });
  const names = new Set();
  cities.forEach(function (city) {
    assert.ok(city.name && city.name.length <= 4, '도시 이름');
    assert.ok(city.price >= 100000, '가격');
    assert.equal(city.buildCost, Math.round(city.price * 0.6 / 10000) * 10000);
    assert.equal(city.tolls.length, 4);
    for (let i = 1; i < city.tolls.length; i++) assert.ok(city.tolls[i] > city.tolls[i - 1], city.name + ' 통행료 증가');
    assert.ok(city.color, '지역 색');
    names.add(city.name);
  });
  assert.equal(names.size, cities.length, '도시 이름은 겹치지 않는다');
});

test('황금열쇠 카드는 12장이고 서로 다른 id를 가진다', function () {
  assert.equal(BM.GOLDEN_CARDS.length, 12);
  const ids = new Set(BM.GOLDEN_CARDS.map(function (c) { return c.id; }));
  assert.equal(ids.size, 12);
  BM.GOLDEN_CARDS.forEach(function (card) {
    assert.ok(card.title && card.text, card.id + ' 내용');
    assert.ok(card.tone === 'good' || card.tone === 'bad');
  });
});

/* ---------------- 시작 상태 ---------------- */

test('2~4명이 시작 자금 120만원과 출발지에서 시작한다', function () {
  for (let n = 2; n <= 4; n++) {
    const game = makeGame(n, diceRng([1, 1]));
    assert.equal(game.status, 'playing');
    assert.equal(game.phase, 'roll');
    assert.equal(game.round, 1);
    assert.equal(game.maxRounds, 15);
    assert.equal(game.players.length, n);
    game.players.forEach(function (p, i) {
      assert.equal(p.pos, 0);
      assert.equal(p.cash, 1200000);
      assert.equal(p.bankrupt, false);
      assert.equal(p.eliminated, false);
      assert.equal(p.seat, i);
    });
    assert.equal(game.currentPlayerId(), 'p0');
    assert.ok(game.log.length >= 2);
  }
  assert.throws(function () { makeGame(1, diceRng([1, 1])); }, /최소/);
  assert.throws(function () { makeGame(5, diceRng([1, 1])); }, /최대/);
});

/* ---------------- 주사위 · 이동 ---------------- */

test('주사위 두 개의 합만큼 이동하고 출발지를 지나면 월급 20만원을 받는다', function () {
  const game = makeGame(2, diceRng([1, 2]));
  game.players[0].pos = 26;
  const result = game.roll('p0');
  assert.equal(result.ok, true);
  assert.deepEqual(result.dice, [1, 2]);
  assert.equal(result.sum, 3);
  assert.equal(game.players[0].pos, 1); // 26 + 3 = 29 → 1번 (서울)
  assert.equal(result.passedStart, true);
  assert.equal(game.players[0].cash, 1200000 + BM.SALARY);
  assert.equal(game.phase, 'decide'); // 서울 매입 기회
  game.skip('p0');
  assert.equal(game.currentPlayerId(), 'p1');
});

test('더블이 나오면 같은 사람이 한 번 더 굴리고, 세 번 연속 더블이면 무인도로 간다', function () {
  const game = makeGame(2, diceRng([4, 4, 1, 2]));

  const first = game.roll('p0');
  assert.equal(first.double, true);
  assert.equal(game.currentPlayerId(), 'p0', '더블이면 차례가 넘어가지 않는다');
  assert.equal(game.players[0].pos, 8);
  assert.equal(game.pending.kind, 'buy', '8번은 도시(대전) — 매입 대기');
  game.skip('p0');
  assert.equal(game.phase, 'roll', '매입을 건너뛰면 더블 한 번 더');

  const second = game.roll('p0');
  assert.equal(second.double, false);
  assert.equal(game.currentPlayerId(), 'p1');
  assert.equal(game.players[0].pos, 11);

  // 3연속 더블
  const g2 = makeGame(2, diceRng([1, 1, 2, 2, 3, 3, 1, 1]));
  g2.roll('p0'); // 2칸 → 부산(도시) 매입 대기
  if (g2.phase === 'decide') g2.skip('p0');
  g2.roll('p0'); // 4칸 더 → 6번 인천 (매입 대기)
  if (g2.phase === 'decide') g2.skip('p0');
  const third = g2.roll('p0'); // 세 번째 더블 → 무인도
  assert.equal(third.sentToIsland, true);
  assert.equal(g2.players[0].pos, BM.ISLAND_INDEX);
  assert.equal(g2.players[0].island, true);
  assert.equal(g2.currentPlayerId(), 'p1');
});

/* ---------------- 매입 · 건설 · 통행료 ---------------- */

test('도시 칸에 멈추면 값을 내고 매입할 수 있고, 다시 멈추면 별장·빌딩·호텔을 짓는다', function () {
  const game = makeGame(2, diceRng([1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3]));
  game.roll('p0'); // 0 → 4 (대구, 25만원)
  assert.equal(game.phase, 'decide');
  assert.equal(game.pending.kind, 'buy');
  assert.equal(game.pending.tile, 4);
  assert.equal(game.pending.price, 250000);

  const bought = game.buy('p0');
  assert.equal(bought.ok, true);
  assert.equal(game.owner[4], 'p0');
  assert.equal(game.level[4], 0);
  assert.equal(game.players[0].cash, 1200000 - 250000);
  assert.equal(game.currentPlayerId(), 'p1');
  assert.equal(game.totalAsset(game.players[0]), 1200000);

  // p0 차례로 되돌려 같은 칸에 다시 멈춘다 → 건설 기회
  game.turn = 0;
  game.players[0].pos = 0;
  game.phase = 'roll';
  game.roll('p0');
  assert.equal(game.phase, 'decide');
  assert.equal(game.pending.kind, 'build');
  assert.equal(game.pending.cost, 150000);
  const built = game.build('p0');
  assert.equal(built.ok, true);
  assert.equal(game.level[4], 1);
  assert.equal(game.players[0].cash, 1200000 - 250000 - 150000);

  // 같은 자리에서 한 번 더: 다음 단계(빌딩)
  game.turn = 0;
  game.players[0].pos = 0;
  game.phase = 'roll';
  game.roll('p0');
  game.build('p0');
  assert.equal(game.level[4], 2);

  game.turn = 0;
  game.players[0].pos = 0;
  game.phase = 'roll';
  game.roll('p0');
  game.build('p0');
  assert.equal(game.level[4], 3);

  // 호텔까지 지은 뒤에는 더 지을 수 없다
  game.turn = 0;
  game.players[0].pos = 0;
  game.phase = 'roll';
  game.roll('p0');
  assert.equal(game.phase, 'roll');
  assert.equal(game.pending, null);
});

test('다른 사람 도시에 멈추면 건물 단계에 맞는 통행료를 주인에게 낸다', function () {
  const game = makeGame(2, diceRng([1, 3, 1, 3, 1, 3]));
  // p0가 대구를 사고 별장까지
  game.roll('p0');
  game.buy('p0');
  game.turn = 0;
  game.players[0].pos = 0;
  game.phase = 'roll';
  game.roll('p0');
  game.build('p0');

  const ownerCash = game.players[0].cash;
  const visitorCash = game.players[1].cash;
  const toll = BM.BOARD[4].tolls[1];

  game.turn = 1;
  game.players[1].pos = 0;
  game.phase = 'roll';
  const result = game.roll('p1');
  assert.equal(result.ok, true);
  assert.equal(game.players[1].cash, visitorCash - toll);
  assert.equal(game.players[0].cash, ownerCash + toll);
  assert.equal(game.owner[4], 'p0');
});

test('매입·건설을 건너뛸 수 있고, 돈이 모자라면 매입 기회가 생기지 않는다', function () {
  const game = makeGame(2, diceRng([1, 3, 1, 3]));
  game.roll('p0');
  assert.equal(game.phase, 'decide');
  const skipped = game.skip('p0');
  assert.equal(skipped.ok, true);
  assert.equal(game.owner[4], null);
  assert.equal(game.phase, 'roll');
  assert.equal(game.currentPlayerId(), 'p1');

  const poor = makeGame(2, diceRng([1, 3]));
  poor.players[0].cash = 10000;
  poor.roll('p0');
  assert.equal(poor.phase, 'roll');
  assert.equal(poor.pending, null);
});

/* ---------------- 무인도 ---------------- */

test('무인도에서는 더블로 탈출하거나 3번 실패하면 보석금을 내고 나온다', function () {
  // 더블 탈출
  const escape = makeGame(2, diceRng([2, 2]));
  escape.players[0].island = true;
  escape.players[0].pos = BM.ISLAND_INDEX;
  const r1 = escape.roll('p0');
  assert.equal(r1.escaped, true);
  assert.equal(escape.players[0].island, false);
  assert.equal(escape.players[0].pos, 11);
  assert.equal(escape.currentPlayerId(), 'p1');

  // 3번 실패 → 보석금
  const stuck = makeGame(2, diceRng([1, 2, 1, 2, 1, 2]));
  stuck.players[0].island = true;
  stuck.players[0].pos = BM.ISLAND_INDEX;
  const cash = stuck.players[0].cash;
  stuck.roll('p0');
  assert.equal(stuck.players[0].island, true);
  stuck.turn = 0;
  stuck.roll('p0');
  assert.equal(stuck.players[0].island, true);
  stuck.turn = 0;
  stuck.roll('p0');
  assert.equal(stuck.players[0].island, false);
  assert.equal(stuck.players[0].cash, cash - BM.ISLAND_BAIL);
});

test('무인도에서 보석금을 먼저 내고 주사위를 굴릴 수 있다', function () {
  const game = makeGame(2, diceRng([1, 2]));
  game.players[0].island = true;
  game.players[0].pos = BM.ISLAND_INDEX;
  const cash = game.players[0].cash;
  const bail = game.payBail('p0');
  assert.equal(bail.ok, true);
  assert.equal(game.players[0].cash, cash - BM.ISLAND_BAIL);
  assert.equal(game.players[0].island, false);
  const roll = game.roll('p0');
  assert.equal(roll.ok, true);
  assert.equal(game.players[0].pos, 10);
});

test('무인도 탈출권이 있으면 무인도로 보내지 않고 그대로 지나간다', function () {
  const game = makeGame(2, diceRng([1, 1]));
  game.players[0].freeBail = 1;
  const sent = game.sendToIsland(game.players[0]);
  assert.equal(sent, false);
  assert.equal(game.players[0].island, false);
  assert.equal(game.players[0].freeBail, 0);
});

/* ---------------- 보너스 · 세금 · 황금열쇠 ---------------- */

test('보너스 칸은 15만원, 세금 칸은 12만원, 무료주차는 10만원을 정산한다', function () {
  const bonus = makeGame(2, diceRng([2, 2]));
  bonus.players[0].pos = 5;
  const before = bonus.players[0].cash;
  bonus.roll('p0'); // 5 → 9 보너스
  assert.equal(bonus.players[0].cash, before + BM.BONUS_AMOUNT);

  const tax = makeGame(2, diceRng([1, 2]));
  tax.players[0].pos = 2;
  const taxBefore = tax.players[0].cash;
  tax.roll('p0'); // 2 → 5 세금
  assert.equal(tax.players[0].cash, taxBefore - BM.TAX_AMOUNT);

  const park = makeGame(2, diceRng([1, 1]));
  park.players[0].pos = 19;
  const parkBefore = park.players[0].cash;
  park.roll('p0'); // 19 → 21 무료주차
  assert.equal(park.players[0].cash, parkBefore + BM.PARK_AMOUNT);
});

test('황금열쇠 칸에서 카드를 뽑아 효과가 적용되고 lastCard에 남는다', function () {
  const goStartIndex = BM.GOLDEN_CARDS.findIndex(function (c) { return c.id === 'go_start'; });
  const game = makeGame(2, rawRng([dieFace(1), dieFace(2), cardFrac(goStartIndex)]));
  game.roll('p0'); // 0 → 3 황금열쇠
  assert.equal(game.lastCard.id, 'go_start');
  assert.equal(game.players[0].pos, 0);
  assert.equal(game.players[0].cash, 1200000 + BM.SALARY);
  assert.equal(game.lastRoll.to, 0);
  assert.ok(game.log.some(function (e) { return e.type === 'card'; }));
});

test('황금열쇠 은행 이자·복권은 돈을 주고, 병원비·기부는 돈을 낸다', function () {
  const cases = [
    { id: 'bank_interest', delta: 100000 },
    { id: 'lottery', delta: 250000 },
    { id: 'hospital', delta: -60000 },
    { id: 'donation', delta: -80000 }
  ];
  cases.forEach(function (item) {
    const index = BM.GOLDEN_CARDS.findIndex(function (c) { return c.id === item.id; });
    const game = makeGame(2, rawRng([dieFace(1), dieFace(2), cardFrac(index)]));
    const before = game.players[0].cash;
    game.roll('p0');
    assert.equal(game.lastCard.id, item.id);
    assert.equal(game.players[0].cash, before + item.delta, item.id);
  });
});

test('황금열쇠 생일 축하는 다른 사람에게 4만원씩 받는다', function () {
  const index = BM.GOLDEN_CARDS.findIndex(function (c) { return c.id === 'birthday'; });
  const game = makeGame(3, rawRng([dieFace(1), dieFace(2), cardFrac(index)]));
  game.roll('p0');
  assert.equal(game.players[0].cash, 1200000 + 80000);
  assert.equal(game.players[1].cash, 1160000);
  assert.equal(game.players[2].cash, 1160000);
});

/* ---------------- 파산 · 종료 ---------------- */

test('통행료를 낼 수 없으면 파산하고 땅은 채권자에게 넘어간다', function () {
  const game = makeGame(2, diceRng([1, 3, 1, 3]));
  game.roll('p0');
  game.buy('p0');            // 대구 매입
  game.level[4] = 3;         // 호텔
  game.players[1].cash = 10000;
  game.players[1].pos = 0;
  game.turn = 1;
  game.phase = 'roll';
  const ownerCash = game.players[0].cash;

  game.roll('p1');
  assert.equal(game.players[1].bankrupt, true);
  assert.equal(game.players[1].cash, 0);
  assert.equal(game.players[0].cash, ownerCash + 10000);
  assert.equal(game.status, 'finished');
  assert.equal(game.finishReason, 'last_player');
  assert.equal(game.winnerId, 'p0');
});

test('라운드 제한에 도달하면 총자산 순위로 게임이 끝난다', function () {
  const game = makeGame(2, null, { maxRounds: 2, rng: BM.createRng(42) });
  let guard = 0;
  while (game.status === 'playing' && guard < 200) {
    guard += 1;
    const p = game.currentPlayer();
    if (game.phase === 'decide') game.skip(p.id);
    else if (game.phase === 'roll') game.roll(p.id);
    else break;
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.finishReason, 'round_limit');
  const ranking = game.ranking();
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].rank, 1);
  assert.equal(ranking[1].rank, 2);
  assert.ok(ranking[0].totalAsset >= ranking[1].totalAsset);
  assert.ok(game.log.some(function (e) { return e.type === 'finish'; }));
});

test('순위는 파산자를 뒤로 보내고 총자산·현금을 담는다', function () {
  const game = makeGame(3, diceRng([1, 3, 1, 3]));
  game.roll('p0');
  game.buy('p0');
  const ranking = game.ranking();
  assert.equal(ranking.length, 3);
  assert.equal(ranking[0].id, 'p0');
  assert.equal(ranking[0].cash, 950000);
  assert.equal(ranking[0].assets, 250000);
  assert.equal(ranking[0].totalAsset, 1200000);
  assert.equal(ranking[0].properties, 1);
  assert.equal(typeof ranking[0].isBot, 'boolean');
  assert.equal(ranking[0].number, 1);
});

/* ---------------- 직렬화 ---------------- */

test('stateFor는 화면에 필요한 보드 소유·건물·주사위·차례 정보를 담는다', function () {
  const game = makeGame(2, diceRng([1, 3, 1, 3]));
  game.roll('p0');
  game.buy('p0');
  const state = game.stateFor('p0');

  assert.equal(state.status, 'playing');
  assert.equal(state.round, 1);
  assert.equal(state.maxRounds, 15);
  assert.equal(state.turn, 'p1');
  assert.equal(state.players.length, 2);
  assert.equal(state.players[0].isSelf, true);
  assert.equal(state.players[0].number, 1);
  assert.equal(state.players[0].cash, 950000);
  assert.equal(state.owner[4], 'p0');
  assert.equal(state.level[4], 0);
  assert.equal(state.lastRoll.sum, 4);
  assert.equal(state.lastRoll.a + state.lastRoll.b, 4);
  assert.equal(state.islandIndex, 7);
  assert.ok(Array.isArray(state.log) && state.log.length > 0);
  assert.equal(typeof state.log[0].text, 'string');
  assert.equal(state.ranking.length, 2);

  // 서버가 쓰는 필드도 함께 있다
  assert.equal(typeof state.players[0].eliminated, 'boolean');
  assert.equal(typeof state.players[0].isTurn, 'boolean');
  assert.equal(game.playerById('p0').isBot, false);
  assert.equal(typeof game.finishGame, 'function');
});

test('봇 드라이버는 주사위·매입·건설을 스스로 결정한다', function () {
  const players = [
    { id: 'me', name: '1번', number: 1, isBot: false },
    { id: 'bot1', name: '주사위왕', number: null, isBot: true }
  ];
  const game = new BM.Game(players, { rng: BM.createRng(7) });
  const driver = new BM.BotDriver(game, { level: 'normal', rng: BM.createRng(3) });

  // 봇 차례까지 사람이 굴리고, 결정이 나오면 건너뛴다.
  let guard = 0;
  while (game.currentPlayerId() !== 'bot1' && guard < 20) {
    guard += 1;
    if (game.phase === 'decide') game.skip(game.currentPlayerId());
    else game.roll(game.currentPlayerId(), Date.now());
  }

  let action = null;
  let now = Date.now();
  for (let i = 0; i < 40 && !action; i++) {
    now += 250;
    action = driver.tick(now);
  }
  assert.ok(action, '봇이 행동을 결정해야 한다');
  assert.equal(action.playerId, 'bot1');
  assert.ok(['roll', 'buy', 'build', 'skip', 'payBail'].indexOf(action.action) !== -1);
});
