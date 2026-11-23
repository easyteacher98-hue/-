'use strict';

/*
 * 2차 확장 게임 엔진 테스트
 * 숫자 타일 러미 · 도둑잡기 · 전통 장기 · 컬러 숫자 카드 · 선 긋기 땅따먹기 · 1인용 스도쿠
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const Rummi = require('../public/rummi-engine.js');
const OldMaid = require('../public/oldmaid-engine.js');
const Janggi = require('../public/janggi-engine.js');
const OneCard = require('../public/onecard-engine.js');
const Dots = require('../public/dots-engine.js');
const Sudoku = require('../public/sudoku-engine.js');

/* ---------------- 숫자 타일 러미 ---------------- */

function rummiGame(seed, points) {
  return new Rummi.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나', isBot: true }
  ], { seed: seed || 3, options: { initialPoints: points || 30 } });
}

test('타일 러미: 덱은 1~13 × 4색 + 조커 2장 = 54장이다', function () {
  const deck = Rummi.makeDeck();
  assert.equal(deck.length, 54);
  assert.equal(deck.filter(function (t) { return t.joker; }).length, 2);
  const colors = {};
  deck.forEach(function (t) { if (t.color) colors[t.color] = (colors[t.color] || 0) + 1; });
  assert.deepEqual(colors, { red: 13, blue: 13, yellow: 13, green: 13 });
});

test('타일 러미: 세트 규칙 (같은 숫자 다른 색 · 같은 색 연속 · 조커 1장)', function () {
  const r3 = { color: 'red', value: 3 };
  const b3 = { color: 'blue', value: 3 };
  const y3 = { color: 'yellow', value: 3 };
  const g3 = { color: 'green', value: 3 };
  assert.equal(Rummi.validateSet([r3, b3, y3]).ok, true);
  assert.equal(Rummi.validateSet([r3, b3, y3, g3]).ok, true);
  assert.equal(Rummi.validateSet([r3, r3, b3]).ok, false, '같은 색은 세트가 아님');
  assert.equal(Rummi.validateSet([r3, { color: 'red', value: 4 }, { color: 'red', value: 5 }]).ok, true);
  assert.equal(Rummi.validateSet([r3, { color: 'red', value: 5 }, { color: 'red', value: 7 }]).ok, false, '런은 이어져야 함');
  assert.equal(Rummi.validateSet([r3, { color: 'red', value: 4 }, { joker: true, value: 0 }]).ok, true);
  assert.equal(Rummi.validateSet([{ joker: true, value: 0 }, { joker: true, value: 0 }, r3]).ok, false, '조커는 한 세트에 1장');
  assert.equal(Rummi.validateSet([r3, b3]).ok, false, '2장은 세트가 아님');
});

test('타일 러미: 처음 등록은 낸 타일 합이 기준 점수 이상이어야 한다', function () {
  const game = rummiGame(5, 30);
  const player = game.players[0];
  // 손패를 직접 정해 규칙을 확인합니다.
  player.hand = [
    { id: 'red3', color: 'red', value: 3 },
    { id: 'blue3', color: 'blue', value: 3 },
    { id: 'yellow3', color: 'yellow', value: 3 },
    { id: 'green9', color: 'green', value: 9 }
  ];
  game.deck = [];
  const low = game.play('a', { melds: [{ tileIds: ['red3', 'blue3', 'yellow3'] }] });
  assert.equal(low.ok, false);
  assert.equal(low.reason, 'need_initial');
  assert.equal(player.hand.length, 4, '실패하면 손패가 그대로여야 한다');

  player.hand.push({ id: 'green10', color: 'green', value: 10 }, { id: 'green11', color: 'green', value: 11 });
  const ok = game.play('a', {
    melds: [
      { tileIds: ['red3', 'blue3', 'yellow3'] },
      { tileIds: ['green9', 'green10', 'green11'] }
    ]
  });
  assert.equal(ok.ok, true);
  assert.equal(player.hand.length, 0, '가진 타일을 모두 냈으니 우승');
  assert.equal(player.melded, true);
  assert.equal(game.table.length, 2);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'a');
});

test('타일 러미: 테이블 세트에 이어 붙이기, 조커 세트에는 못 붙인다', function () {
  const game = rummiGame(7, 15);
  const player = game.players[0];
  player.melded = true;
  game.table = [{ id: 's1', tiles: [
    { id: 'red3', color: 'red', value: 3 },
    { id: 'red4', color: 'red', value: 4 },
    { id: 'red5', color: 'red', value: 5 }
  ], type: 'run' }];
  player.hand = [{ id: 'red6', color: 'red', value: 6 }];
  const add = game.play('a', { adds: [{ setId: 's1', tileIds: ['red6'] }] });
  assert.equal(add.ok, true);
  assert.equal(game.table[0].tiles.length, 4);
  assert.equal(game.status, 'finished', '마지막 타일을 붙였으니 우승');
  assert.equal(game.winnerId, 'a');
});

test('타일 러미: 낼 타일이 없으면 더미에서 1장 뽑고 차례가 넘어간다', function () {
  const game = rummiGame(9, 15);
  const before = game.players[0].hand.length;
  const deckBefore = game.deck.length;
  const result = game.draw('a');
  assert.equal(result.ok, true);
  assert.equal(game.players[0].hand.length, before + 1);
  assert.equal(game.deck.length, deckBefore - 1);
  assert.equal(game.currentPlayer().id, 'b');
  assert.equal(game.draw('a').reason, 'not_your_turn');
});

test('타일 러미: 봇끼리 끝까지 두고 순위가 정해진다', function () {
  const game = new Rummi.Game([
    { id: 'a', name: '봇1', isBot: true },
    { id: 'b', name: '봇2', isBot: true }
  ], { seed: 2, options: { initialPoints: 15 } });
  const driver = new Rummi.BotDriver(game);
  let guard = 0;
  while (game.status === 'playing' && guard < 600) {
    guard += 1;
    const action = driver.tick();
    if (!action) break;
    const result = action.action === 'play'
      ? game.play(action.playerId, action.payload)
      : game.draw(action.playerId);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(game.status, 'finished');
  assert.ok(guard < 600);
  const ranking = game.ranking();
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].rank, 1);
});

test('타일 러미: stateFor는 내 패만 보여 주고 남의 패는 장수만 알려 준다', function () {
  const game = rummiGame(11);
  const state = game.stateFor('a');
  assert.equal(state.hand.length, 14);
  assert.equal(state.handCounts.a, 14);
  assert.equal(state.handCounts.b, 14);
  assert.ok(state.table);
  assert.equal(state.initialPoints, 30);
  assert.equal(Object.prototype.hasOwnProperty.call(state, 'deck'), false);
});

/* ---------------- 도둑잡기 ---------------- */

test('도둑잡기: 25장(동물 12쌍 + 도둑 1장)을 모두 나눠 주고 짝은 자동으로 버린다', function () {
  const deck = OldMaid.makeDeck();
  assert.equal(deck.length, 25);
  assert.equal(deck.filter(function (c) { return c.thief; }).length, 1);
  const game = new OldMaid.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나' },
    { id: 'c', name: '다' }
  ], { seed: 4 });
  const total = game.players.reduce(function (sum, p) { return sum + p.hand.length; }, 0);
  assert.equal(total + game.players.reduce(function (s, p) { return s + p.discarded * 2; }, 0), 25);
  game.players.forEach(function (p) {
    const pairs = {};
    p.hand.forEach(function (card) {
      if (card.thief) return;
      pairs[card.pair] = (pairs[card.pair] || 0) + 1;
    });
    Object.keys(pairs).forEach(function (key) {
      assert.equal(pairs[key], 1, '시작할 때 짝이 남아 있으면 안 됨');
    });
  });
});

test('도둑잡기: 앞사람 패에서 뽑아 짝이 맞으면 버리고, 손패가 비면 1등', function () {
  const game = new OldMaid.Game([{ id: 'a', name: '가' }, { id: 'b', name: '나' }], { seed: 6 });
  const me = game.players[0];
  const prev = game.prevOf(me);
  assert.ok(prev);
  assert.notEqual(prev.id, me.id);
  // 앞사람 손패를 짝이 되도록 맞춰 둡니다.
  prev.hand = [
    { id: 'x1', emoji: '🐶', pair: 'p1', thief: false },
    { id: 'x2', emoji: '🐱', pair: 'p2', thief: false }
  ];
  me.hand = [
    { id: 'y1', emoji: '🐶', pair: 'p1', thief: false },
    { id: 'thief', emoji: '🃏', pair: null, thief: true }
  ];
  const result = game.draw(me.id, { index: 0 });
  assert.equal(result.ok, true);
  assert.equal(result.paired, true);
  assert.equal(me.hand.length, 1, '도둑 카드만 남음');
  assert.equal(prev.hand.length, 1);
});

test('도둑잡기: 마지막까지 도둑 카드를 든 사람이 꼴찌, 나머지는 순위대로', function () {
  const game = new OldMaid.Game([
    { id: 'a', name: '가', isBot: true },
    { id: 'b', name: '나', isBot: true },
    { id: 'c', name: '다', isBot: true }
  ], { seed: 12 });
  const driver = new OldMaid.BotDriver(game);
  let guard = 0;
  while (game.status === 'playing' && guard < 400) {
    guard += 1;
    const action = driver.tick();
    if (!action) break;
    const result = game.draw(action.playerId, action.payload);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(game.status, 'finished');
  const ranking = game.ranking();
  assert.equal(ranking.length, 3);
  assert.equal(ranking[0].rank, 1);
  assert.equal(ranking[2].rank, 3);
  const thiefHolder = game.players.find(function (p) { return p.id === game.thiefHolderId; });
  assert.ok(thiefHolder, '도둑 카드를 든 사람이 있어야 함');
  assert.equal(thiefHolder.hand.filter(function (c) { return c.thief; }).length, 1);
});

/* ---------------- 전통 장기 ---------------- */

test('장기: 9×10 판에 차·마·상·사·포·졸·궁이 규칙대로 놓인다', function () {
  const board = Janggi.createBoard();
  assert.equal(board.length, 10);
  assert.equal(board[0].length, 9);
  assert.deepEqual(board[0].map(function (p) { return p ? p.type : null; }),
    ['chariot', 'horse', 'elephant', 'guard', null, 'guard', 'elephant', 'horse', 'chariot']);
  assert.equal(board[0][3].type, 'guard');
  assert.equal(board[1][4].type, 'general');
  assert.equal(board[1][4].side, 'han');
  assert.equal(board[9][3].type, 'guard');
  assert.equal(board[9][4], null);
  assert.equal(board[8][4].type, 'general');
  assert.equal(board[8][4].side, 'cho');
  assert.equal(Janggi.pieceChar(board[6][0]), '병');
  assert.equal(Janggi.pieceChar(board[3][0]), '졸');
});

test('장기: 마는 첫 칸이 막히면 못 가고, 상은 밭전자로 간다', function () {
  const board = Janggi.createBoard();
  // 초 마(1,9): 위(1,8)가 비어 있어 (0,7)·(2,7)로 갈 수 있습니다.
  const horse = Janggi.pseudoMoves(board, 1, 9).map(function (m) { return m.x + ',' + m.y; });
  assert.ok(horse.indexOf('0,7') !== -1);
  assert.ok(horse.indexOf('2,7') !== -1);
  assert.ok(horse.indexOf('3,8') === -1, '마는 날일자만');
  // 길을 막으면 못 갑니다.
  const blocked = Janggi.cloneBoard(board);
  blocked[8][1] = { side: 'cho', type: 'soldier' };
  const noHorse = Janggi.pseudoMoves(blocked, 1, 9).map(function (m) { return m.x + ',' + m.y; });
  assert.equal(noHorse.indexOf('0,7'), -1);

  // 상은 밭전자(2칸 대각선)로 갑니다. 길을 열어 확인합니다.
  const open = Janggi.cloneBoard(board);
  open[6][4] = null;
  open[6][0] = null;
  const elephant = Janggi.pseudoMoves(open, 2, 9).map(function (m) { return m.x + ',' + m.y; });
  assert.ok(elephant.indexOf('4,6') !== -1, '상은 밭전자');
  open[8][2] = { side: 'cho', type: 'soldier' }; // 첫 칸을 막으면
  assert.equal(Janggi.pseudoMoves(open, 2, 9).indexOf('4,6'), -1);
});

test('장기: 포는 다리 하나를 넘어야만 움직이고, 포끼리는 잡지 못한다', function () {
  const board = Janggi.createBoard();
  // 초 포(1,7)는 처음에 다리가 없어 움직일 곳이 없습니다.
  assert.equal(Janggi.pseudoMoves(board, 1, 7).length, 0);
  const work = Janggi.cloneBoard(board);
  work[6][1] = null;
  work[4][1] = { side: 'cho', type: 'soldier' }; // 다리
  const moves = Janggi.pseudoMoves(work, 1, 7).map(function (m) { return m.x + ',' + m.y; });
  assert.ok(moves.indexOf('1,3') !== -1, '다리를 넘어 빈칸으로');
  assert.equal(moves.indexOf('1,2'), -1, '두 번째 기물(포)은 잡지 못함');
  assert.equal(moves.indexOf('1,5'), -1, '다리 앞 칸으로는 못 감');

  const cannonScreen = Janggi.cloneBoard(board);
  cannonScreen[6][1] = null;
  cannonScreen[5][1] = { side: 'han', type: 'cannon' }; // 다리가 포 → 못 넘음
  assert.equal(Janggi.pseudoMoves(cannonScreen, 1, 7).length, 0);
});

test('장기: 졸·병은 앞과 옆으로만, 궁은 궁성 안에서만 움직인다', function () {
  const board = Janggi.createBoard();
  const soldier = Janggi.pseudoMoves(board, 0, 6).map(function (m) { return m.x + ',' + m.y; });
  assert.ok(soldier.indexOf('0,5') !== -1, '초 병은 위로');
  assert.equal(soldier.indexOf('0,7'), -1, '뒤로는 못 감');

  const work = Janggi.cloneBoard(board);
  work[8][4] = null;
  work[8][5] = { side: 'cho', type: 'general' };
  const general = Janggi.pseudoMoves(work, 5, 8).map(function (m) { return m.x + ',' + m.y; });
  assert.equal(general.indexOf('6,8'), -1, '궁성 밖으로는 못 나감');
  assert.ok(general.indexOf('4,8') !== -1);
});

test('장기: 내 궁이 공격받는 자리로는 둘 수 없고, 궁을 잡으면 승리한다', function () {
  const game = new Janggi.Game([{ id: 'a', name: '초' }, { id: 'b', name: '한' }], {});
  // 초 차가 한 궁을 바로 잡을 수 있는 자리를 만듭니다.
  game.board = Janggi.createBoard();
  game.board[3][4] = null;
  game.board[2][4] = { side: 'cho', type: 'chariot' };
  game.board[1][4] = { side: 'han', type: 'general' };
  const result = game.move('a', { from: { x: 4, y: 2 }, to: { x: 4, y: 1 } });
  assert.equal(result.ok, true);
  assert.equal(result.win, true);
  assert.equal(game.status, 'finished');
  assert.equal(game.finishReason, 'capture_general');
  assert.equal(game.winnerId, 'a');

  const safe = new Janggi.Game([{ id: 'a', name: '초' }, { id: 'b', name: '한' }], {});
  safe.board = Janggi.createBoard();
  // 한 차가 초 궁을 노리고 있을 때, 초 궁이 그 줄로 나가면 안 됩니다.
  safe.board[3][4] = null;
  safe.board[2][4] = { side: 'han', type: 'chariot' };
  safe.board[8][4] = { side: 'cho', type: 'general' };
  safe.board[7][4] = null;
  safe.board[6][4] = null; // 병이 길을 막지 않게
  const legal = Janggi.allLegalMoves(safe.board, 'cho').filter(function (m) { return m.from.x === 4 && m.from.y === 8 && m.to.x === 4; });
  assert.equal(legal.length, 0, '차가 지키는 세로줄로는 못 감');
});

test('장기: 봇끼리 두면 승부가 나고 순위가 정해진다', function () {
  const game = new Janggi.Game([
    { id: 'a', name: '초봇', isBot: true },
    { id: 'b', name: '한봇', isBot: true }
  ], {});
  const driver = new Janggi.BotDriver(game);
  let guard = 0;
  while (game.status === 'playing' && guard < 430) {
    guard += 1;
    const action = driver.tick();
    if (!action) break;
    const result = game.move(action.playerId, action.payload);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(game.status, 'finished');
  const ranking = game.ranking();
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].rank, 1);
});

/* ---------------- 컬러 숫자 카드 ---------------- */

test('컬러 숫자 카드: 52장 덱과 손패 7장, 바닥은 숫자 카드로 시작한다', function () {
  assert.equal(OneCard.makeDeck().length, 52);
  const game = new OneCard.Game([
    { id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }
  ], { seed: 8 });
  game.players.forEach(function (p) { assert.equal(p.hand.length, 7); });
  assert.equal(game.top.type, 'number');
  assert.equal(game.deck.length, 52 - 21 - 1);
});

test('컬러 숫자 카드: 같은 색·같은 숫자·같은 특수 카드만 낼 수 있다', function () {
  const top = { color: 'red', type: 'number', value: 5 };
  assert.equal(OneCard.canPlay({ color: 'red', type: 'number', value: 9 }, top, 'red'), true);
  assert.equal(OneCard.canPlay({ color: 'blue', type: 'number', value: 5 }, top, 'red'), true);
  assert.equal(OneCard.canPlay({ color: 'blue', type: 'number', value: 6 }, top, 'red'), false);
  assert.equal(OneCard.canPlay({ color: 'red', type: 'skip' }, top, 'red'), true);
  assert.equal(OneCard.canPlay({ color: null, type: 'wild' }, top, 'red'), true);
  const skipTop = { color: 'red', type: 'skip' };
  assert.equal(OneCard.canPlay({ color: 'blue', type: 'skip' }, skipTop, 'red'), true, '같은 특수 카드');
});

test('컬러 숫자 카드: 점프·+2·방향전환과 색 바꾸기가 순서에 반영된다', function () {
  const game = new OneCard.Game([
    { id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }
  ], { seed: 10 });
  const filler = { id: 'g9', color: 'green', type: 'number', value: 9 };
  game.players[0].hand = [
    { id: 'rskip', color: 'red', type: 'skip', value: 0 },
    { id: 'rd2', color: 'red', type: 'draw2', value: 0 },
    { id: 'rrev', color: 'red', type: 'reverse', value: 0 },
    { id: 'wild1', color: null, type: 'wild', value: 0 },
    filler
  ];
  game.top = { id: 'r1', color: 'red', type: 'number', value: 1 };
  game.activeColor = 'red';
  const skip = game.play('a', { cardId: 'rskip' });
  assert.equal(skip.ok, true);
  assert.equal(game.currentPlayer().id, 'c', '점프: 다음 사람을 건너뜀');

  game.turn = 0;
  game.players[0].hand = [{ id: 'rd2', color: 'red', type: 'draw2', value: 0 }, { id: 'g8', color: 'green', type: 'number', value: 8 }];
  game.top = { id: 'r2', color: 'red', type: 'number', value: 2 };
  game.activeColor = 'red';
  const bBefore = game.players[1].hand.length;
  const draw2 = game.play('a', { cardId: 'rd2' });
  assert.equal(draw2.ok, true);
  assert.equal(game.players[1].hand.length, bBefore + 2, '+2 공격으로 두 장을 뽑음');
  assert.equal(game.currentPlayer().id, 'c', '+2를 맞은 사람은 건너뜀');

  game.turn = 0;
  game.direction = 1;
  game.players[0].hand = [{ id: 'rrev', color: 'red', type: 'reverse', value: 0 }, { id: 'g7', color: 'green', type: 'number', value: 7 }];
  game.top = { id: 'r3', color: 'red', type: 'number', value: 3 };
  game.activeColor = 'red';
  const rev = game.play('a', { cardId: 'rrev' });
  assert.equal(rev.ok, true);
  assert.equal(game.direction, -1);
  assert.equal(game.currentPlayer().id, 'c', '3명에서 방향이 바뀌면 반대쪽 사람 차례');

  game.turn = 1;
  game.direction = 1;
  game.players[1].hand = [{ id: 'wild1', color: null, type: 'wild', value: 0 }, { id: 'b1', color: 'blue', type: 'number', value: 1 }];
  game.top = { id: 'r4', color: 'red', type: 'number', value: 4 };
  game.activeColor = 'red';
  const needColor = game.play('b', { cardId: 'wild1' });
  assert.equal(needColor.reason, 'need_color');
  const wild = game.play('b', { cardId: 'wild1', color: 'blue' });
  assert.equal(wild.ok, true);
  assert.equal(game.activeColor, 'blue');
  assert.equal(game.currentPlayer().id, 'c');

  // 마지막 카드를 내면 우승
  game.turn = 0;
  game.players[0].hand = [{ id: 'b2', color: 'blue', type: 'number', value: 2 }];
  game.top = { id: 'b5', color: 'blue', type: 'number', value: 5 };
  game.activeColor = 'blue';
  const win = game.play('a', { cardId: 'b2' });
  assert.equal(win.ok, true);
  assert.equal(win.win, true);
  assert.equal(game.status, 'finished');
});

test('컬러 숫자 카드: 낼 카드가 없으면 1장 뽑고, 봇끼리 끝까지 둔다', function () {
  const game = new OneCard.Game([
    { id: 'a', name: '봇1', isBot: true },
    { id: 'b', name: '봇2', isBot: true },
    { id: 'c', name: '봇3', isBot: true }
  ], { seed: 14 });
  const driver = new OneCard.BotDriver(game);
  let guard = 0;
  while (game.status === 'playing' && guard < 800) {
    guard += 1;
    const action = driver.tick();
    if (!action) break;
    const result = action.action === 'play'
      ? game.play(action.playerId, action.payload)
      : game.draw(action.playerId);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(game.status, 'finished');
  const ranking = game.ranking();
  assert.equal(ranking[0].rank, 1);
  assert.equal(ranking[0].left, 0);
});

/* ---------------- 선 긋기 땅따먹기 ---------------- */

test('선 긋기: 5×5 점 보드는 선 40개와 칸 16개로 이루어진다', function () {
  const game = new Dots.Game([{ id: 'a', name: '가' }, { id: 'b', name: '나' }], {});
  assert.equal(game.availableLines().length, 40);
  assert.equal(game.totalBoxes, 16);
  assert.equal(game.hLines.length, 5);
  assert.equal(game.hLines[0].length, 4);
  assert.equal(game.vLines.length, 4);
  assert.equal(game.vLines[0].length, 5);
});

test('선 긋기: 네 번째 선을 그으면 땅을 먹고 한 번 더, 아니면 차례가 넘어간다', function () {
  const game = new Dots.Game([{ id: 'a', name: '가' }, { id: 'b', name: '나' }], {});
  assert.equal(game.line('a', { type: 'h', x: 0, y: 0 }).again, false);
  assert.equal(game.currentPlayer().id, 'b');
  assert.equal(game.line('b', { type: 'h', x: 0, y: 1 }).again, false);
  assert.equal(game.line('a', { type: 'v', x: 0, y: 0 }).again, false);
  const close = game.line('b', { type: 'v', x: 1, y: 0 });
  assert.equal(close.ok, true);
  assert.equal(close.claimed, 1);
  assert.equal(close.again, true);
  assert.equal(game.currentPlayer().id, 'b', '땅을 먹으면 한 번 더');
  assert.equal(game.boxes[0][0], 'b');
  assert.equal(game.players[1].score, 1);
  assert.equal(game.line('b', { type: 'h', x: 0, y: 0 }).reason, 'taken');
});

test('선 긋기: 16칸을 다 나누면 끝나고 가장 많은 땅이 우승', function () {
  const game = new Dots.Game([
    { id: 'a', name: '봇1', isBot: true },
    { id: 'b', name: '봇2', isBot: true },
    { id: 'c', name: '봇3', isBot: true }
  ], {});
  const driver = new Dots.BotDriver(game);
  let guard = 0;
  while (game.status === 'playing' && guard < 200) {
    guard += 1;
    const action = driver.tick();
    if (!action) break;
    const result = game.line(action.playerId, action.payload);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.claimed, 16);
  assert.equal(game.moves, 40);
  const ranking = game.ranking();
  const total = ranking.reduce(function (sum, row) { return sum + row.score; }, 0);
  assert.equal(total, 16);
  assert.equal(ranking[0].rank, 1);
});

/* ---------------- 1인용 스도쿠 ---------------- */

test('스도쿠: 4×4 · 6×6 · 9×9 모두 해답이 하나뿐인 퍼즐을 만든다', function () {
  [4, 6, 9].forEach(function (size) {
    const made = Sudoku.generatePuzzle(size, { seed: size * 13 });
    assert.equal(made.size, size);
    assert.equal(Sudoku.countSolutions(made.puzzle, size, 2), 1, size + '×' + size + ' 유일 해답');
    const solved = Sudoku.solve(made.puzzle, size);
    assert.deepEqual(solved, made.solution);
    assert.ok(made.blanks > 0);
  });
});

test('스도쿠: 같은 줄·상자의 중복을 찾아낸다', function () {
  const grid = Sudoku.emptyGrid(4);
  grid[0][0] = 1;
  grid[0][2] = 1;
  grid[1][1] = 1;
  const marks = Sudoku.conflicts(grid, 4).map(function (c) { return c.x + ',' + c.y; });
  assert.ok(marks.indexOf('0,0') !== -1);
  assert.ok(marks.indexOf('2,0') !== -1);
  assert.ok(marks.indexOf('1,1') !== -1);
});

test('스도쿠: 숫자 넣기·메모·힌트·완성 판정과 점수', function () {
  const game = new Sudoku.Game(4, { seed: 21 });
  const state = game.stateFor();
  assert.equal(state.puzzle.length, 4);
  let empty = null;
  for (let y = 0; y < 4 && !empty; y++) {
    for (let x = 0; x < 4; x++) {
      if (!state.puzzle[y][x]) { empty = { x: x, y: y }; break; }
    }
  }
  assert.ok(empty);
  assert.equal(game.set(empty.x, empty.y, game.solution[empty.y][empty.x]).ok, true);
  const fixed = game.puzzle.flat().findIndex(function (v) { return v; });
  assert.ok(fixed >= 0);
  const fx = fixed % 4;
  const fy = Math.floor(fixed / 4);
  assert.equal(game.set(fx, fy, 1).reason, 'fixed', '처음부터 주어진 숫자는 바꿀 수 없음');

  // 메모 넣기
  const note = game.stateFor().grid;
  let noteCell = null;
  for (let y = 0; y < 4 && !noteCell; y++) {
    for (let x = 0; x < 4; x++) {
      if (!note[y][x] && !game.puzzle[y][x]) { noteCell = { x: x, y: y }; break; }
    }
  }
  assert.ok(noteCell);
  assert.equal(game.toggleNote(noteCell.x, noteCell.y, 2).ok, true);
  assert.deepEqual(game.stateFor().notes[noteCell.y][noteCell.x], [2]);

  const hintsBefore = game.hintsUsed;
  const hint = game.hint();
  assert.equal(hint.ok, true);
  assert.equal(game.hintsUsed, hintsBefore + 1);

  // 나머지를 모두 채우면 완성
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (game.grid[y][x] !== game.solution[y][x]) game.set(x, y, game.solution[y][x]);
    }
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.isComplete(), true);
  const score = game.score();
  assert.ok(score >= 10 && score <= Sudoku.SCORE_BASE[4]);
  assert.ok(Sudoku.scoreFor(9, 300, 0, 0) > Sudoku.scoreFor(4, 300, 0, 0), '어려운 판이 더 높은 점수');
  assert.ok(Sudoku.scoreFor(4, 60, 1, 2) < Sudoku.scoreFor(4, 60, 0, 0), '힌트·오답은 점수를 깎음');
});
