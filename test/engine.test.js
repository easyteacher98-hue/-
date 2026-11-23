'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const HG = require('../public/engine.js');

/* ---------------- 덱 구성 ---------------- */

test('덱은 56장이고 과일/개수 구성이 규칙과 같다', function () {
  const deck = HG.createDeck();
  assert.equal(deck.length, 56);

  const expected = {
    strawberry: { 1: 5, 2: 3, 3: 3, 4: 2, 5: 1 },
    banana: { 1: 5, 2: 3, 3: 3, 4: 2, 5: 1 },
    lime: { 1: 5, 2: 3, 3: 3, 4: 2, 5: 1 },
    plum: { 1: 5, 2: 3, 3: 3, 4: 2, 5: 1 }
  };

  for (const fruit of HG.FRUIT_IDS) {
    for (let count = 1; count <= 5; count++) {
      const found = deck.filter(function (c) { return c.fruit === fruit && c.count === count; }).length;
      assert.equal(found, expected[fruit][count], fruit + ' ' + count + '개 카드');
    }
  }

  // 카드 id는 모두 고유
  const ids = new Set(deck.map(function (c) { return c.id; }));
  assert.equal(ids.size, 56);
});

test('2~5명 모두 카드가 남김없이 똑같이 분배된다', function () {
  for (let n = 2; n <= 5; n++) {
    const players = [];
    for (let i = 0; i < n; i++) players.push({ id: 'p' + i, name: 'P' + i });
    const game = new HG.Game(players, { rng: HG.createRng(7 + n) });

    let total = 0;
    const sizes = game.players.map(function (p) { return p.deck.length; });
    sizes.forEach(function (s) { total += s; });
    assert.equal(total, 56, n + '명일 때 총 카드');
    const diff = Math.max.apply(null, sizes) - Math.min.apply(null, sizes);
    assert.ok(diff <= 1, n + '명일 때 최대/최소 차이는 1장 이하');
    assert.equal(game.players[0].deck.length >= game.players[n - 1].deck.length, true);
  }
});

/* ---------------- 턴과 뒤집기 ---------------- */

test('자기 차례에만 카드를 뒤집을 수 있고, 뒤집으면 다음 사람으로 넘어간다', function () {
  const game = new HG.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나' },
    { id: 'c', name: '다' }
  ], { rng: HG.createRng(11) });

  const first = game.currentPlayerId();
  const other = game.players.filter(function (p) { return p.id !== first; })[0];

  const rejected = game.flip(other.id, 1000);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'not_your_turn');

  const before = game.playerById(first).deck.length;
  const ok = game.flip(first, 1000);
  assert.equal(ok.ok, true);
  assert.equal(game.playerById(first).deck.length, before - 1);
  assert.equal(game.playerById(first).pile.length, 1);
  assert.notEqual(game.currentPlayerId(), first);
  assert.equal(game.totalCards(), 56);
});

test('탈락한 플레이어는 카드를 뒤집을 수 없다', function () {
  const game = new HG.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나' }
  ], { rng: HG.createRng(3) });

  game.players[0].deck = [];
  game.players[0].pile = [];
  game.recomputeEliminations();
  assert.equal(game.playerById('a').eliminated, true);

  const result = game.flip('a', 1000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'eliminated');
});

/* ---------------- 종 판정 ---------------- */

function tableGame() {
  const game = new HG.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나' },
    { id: 'c', name: '다' }
  ], { rng: HG.createRng(21) });
  // 공개 카드만 손으로 세팅한다 (총 카드 수가 56장이 되도록 덱에서 3장을 덜어냄)
  game.players[0].pile = [{ id: 'x1', fruit: 'lime', count: 3 }];
  game.players[1].pile = [{ id: 'x2', fruit: 'lime', count: 2 }];
  game.players[2].pile = [{ id: 'x3', fruit: 'plum', count: 4 }];
  game.players.forEach(function (p) { p.deck.pop(); });
  return game;
}

test('과일 합계가 정확히 5개면 종이 정답이 되고 테이블 카드를 모두 가져간다', function () {
  const game = tableGame();
  const counts = game.fruitCounts();
  assert.equal(counts.lime, 5);
  assert.equal(counts.plum, 4);
  assert.deepEqual(game.bellFruits(), ['lime']);

  const deckBefore = game.playerById('b').deck.length;
  const result = game.ring('b', 5000);
  assert.equal(result.ok, true);
  assert.equal(result.correct, true);
  assert.equal(result.collected, 3);

  assert.equal(game.tableCardCount(), 0);
  assert.equal(game.playerById('b').deck.length, deckBefore + 3);
  assert.equal(game.totalCards(), 56);
  assert.equal(game.log.some(function (e) { return e.type === 'bell-correct'; }), true);
});

test('합계가 5가 아닌데 종을 치면 다른 플레이어 모두에게 카드 1장씩 준다', function () {
  const game = tableGame();
  game.players[2].pile = [{ id: 'x3', fruit: 'plum', count: 1 }]; // 라임 5, 자두 1 → 자두는 오답
  const ringer = game.playerById('c');
  const deckBefore = ringer.deck.length;
  const otherBefore = [game.playerById('a').deck.length, game.playerById('b').deck.length];

  // 라임이 5개이므로 이 상태에서는 정답이 된다 → 5개가 아닌 상태를 만들기 위해 라임을 4로 바꾼다
  game.players[0].pile = [{ id: 'x1', fruit: 'lime', count: 2 }];
  assert.equal(game.bellFruits().length, 0);

  const result = game.ring('c', 7000);
  assert.equal(result.ok, true);
  assert.equal(result.correct, false);
  assert.equal(result.penalty, 2);

  assert.equal(ringer.deck.length, deckBefore - 2);
  assert.equal(game.playerById('a').deck.length, otherBefore[0] + 1);
  assert.equal(game.playerById('b').deck.length, otherBefore[1] + 1);
  assert.equal(game.totalCards(), 56);
  assert.equal(game.log.some(function (e) { return e.type === 'bell-wrong'; }), true);
});

test('종을 친 직후에는 잠깐 다시 칠 수 없다 (연타 방지)', function () {
  const game = tableGame();
  assert.equal(game.ring('a', 1000).ok, true);
  const again = game.ring('b', 1100);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'bell_locked');

  // 잠금 시간이 지나면 다시 가능
  const later = game.ring('b', 3000);
  assert.equal(later.ok, true);
});

test('탈락한 플레이어의 카드는 합계에서 빠진다', function () {
  const game = tableGame();
  game.players[1].deck = [];
  game.players[1].pile = [];
  game.recomputeEliminations();
  assert.equal(game.playerById('b').eliminated, true);
  const counts = game.fruitCounts();
  assert.equal(counts.lime, 3);
  assert.equal(counts.plum, 4);
});

/* ---------------- 탈락과 승리 ---------------- */

test('카드가 모두 떨어지면 탈락하고, 마지막 한 명이 남으면 게임이 끝난다', function () {
  const game = new HG.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나' }
  ], { rng: HG.createRng(33) });

  game.players[1].deck = [];
  game.players[1].pile = [];
  game.recomputeEliminations();
  game.checkGameOver();

  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'a');
  assert.equal(game.playerById(game.winnerId).name, '가');
});

test('2명 남았을 때 종료 옵션을 켜면 두 명이 남는 순간 게임이 끝난다', function () {
  const game = new HG.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나' },
    { id: 'c', name: '다' }
  ], { rng: HG.createRng(44), endWhenTwo: true });

  game.players[2].deck = [];
  game.players[2].pile = [];
  game.recomputeEliminations();
  game.checkGameOver();

  assert.equal(game.status, 'finished');
  assert.equal(game.finishReason, 'last_two');
  assert.ok(['a', 'b'].indexOf(game.winnerId) !== -1);
});

/* ---------------- 상태 직렬화 ---------------- */

test('상태 직렬화에는 남은 카드 수와 맨 위 카드만 담기고 덱 내용은 숨는다', function () {
  const game = tableGame();
  const state = game.stateFor('a');
  const p = state.players[0];
  assert.equal(p.deckCount > 0, true);
  assert.equal(p.deck, undefined);
  assert.equal(p.top.fruit, 'lime');
  assert.equal(state.counts.lime, 5);
  assert.deepEqual(state.bellFruits, ['lime']);
  assert.equal(state.players.find(function (x) { return x.id === 'a'; }).isSelf, true);
  assert.equal(state.tableCount, 3);
});

/* ---------------- 봇 ---------------- */

test('봇 4명이 규칙을 지키며 게임을 끝까지 진행한다', function () {
  const rng = HG.createRng(20261123);
  const players = [0, 1, 2, 3].map(function (i) {
    return { id: 'bot' + i, name: HG.BOT_NAMES[i], isBot: true };
  });
  const game = new HG.Game(players, { rng: rng });
  const driver = new HG.BotDriver(game, { level: 'normal', rng: rng });

  let now = 0;
  let steps = 0;
  while (game.status === 'playing' && steps < 120000) {
    now += 60;
    steps += 1;
    const action = driver.tick(now);
    if (!action) continue;
    if (action.action === 'ring') game.ring(action.playerId, now);
    else game.flip(action.playerId, now);
    assert.equal(game.totalCards(), 56, '카드는 항상 56장을 유지해야 한다');
  }

  assert.equal(game.status, 'finished', '봇 게임이 끝나야 한다');
  assert.ok(game.winnerId, '우승자가 있어야 한다');
  assert.ok(game.log.length > 10);
});

test('봇 5명(어려움)도 끝까지 진행되고 승자가 정해진다', function () {
  const rng = HG.createRng(999);
  const players = [0, 1, 2, 3, 4].map(function (i) {
    return { id: 'b' + i, name: '봇' + i, isBot: true };
  });
  const game = new HG.Game(players, { rng: rng });
  const driver = new HG.BotDriver(game, { level: 'hard', rng: rng });

  let now = 0;
  for (let i = 0; i < 150000 && game.status === 'playing'; i++) {
    now += 50;
    const action = driver.tick(now);
    if (!action) continue;
    if (action.action === 'ring') game.ring(action.playerId, now);
    else game.flip(action.playerId, now);
  }
  assert.equal(game.status, 'finished');
  assert.ok(game.winnerId);
});

test('인원이 2명 미만이거나 6명 이상이면 게임을 만들 수 없다', function () {
  assert.throws(function () { new HG.Game([{ id: 'a', name: '가' }]); });
  const six = [0, 1, 2, 3, 4, 5].map(function (i) { return { id: 'p' + i, name: 'P' + i }; });
  assert.throws(function () { new HG.Game(six); });
});
