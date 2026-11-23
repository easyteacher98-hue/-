'use strict';

/*
 * 새 게임 4종 엔진 테스트 (숫자 줄세우기 · 오목 · 라이어 추리게임 · 전통 윷놀이)
 * 서버와 브라우저가 함께 쓰는 규칙 엔진을 직접 검사합니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const Streams = require('../public/streams-engine.js');
const Gomoku = require('../public/gomoku-engine.js');
const Liar = require('../public/liar-engine.js');
const Yut = require('../public/yut-engine.js');

/* ---------------- 숫자 줄세우기 ---------------- */

test('숫자 줄세우기: 트랙은 왼쪽에서 오른쪽으로 커져야만 놓을 수 있다', function () {
  const track = new Array(20).fill(null);
  track[5] = 10;
  assert.equal(Streams.canPlaceAt(track, 3, 7), true, '왼쪽에는 작은 수');
  assert.equal(Streams.canPlaceAt(track, 8, 12), true, '오른쪽에는 큰 수');
  assert.equal(Streams.canPlaceAt(track, 8, 7), false, '오른쪽에 작은 수는 안 됨');
  assert.equal(Streams.canPlaceAt(track, 3, 12), false, '왼쪽에 큰 수는 안 됨');
  assert.equal(Streams.canPlaceAt(track, 5, 9), false, '이미 채워진 칸');
  assert.deepEqual(Streams.validSlots(track, 10), []);
});

test('숫자 줄세우기: 끊기지 않은 가장 긴 구간이 점수', function () {
  const track = new Array(20).fill(null);
  track[2] = 3;
  track[3] = 5;
  track[4] = 7;
  track[7] = 9;
  assert.equal(Streams.longestRun(track), 3);
  assert.equal(Streams.filledCount(track), 4);
});

test('숫자 줄세우기: 모두 같은 숫자를 동시에 놓고, 30장을 다 쓰면 끝난다', function () {
  const game = new Streams.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나', isBot: true }
  ], { seed: 11 });
  assert.equal(game.status, 'playing');
  assert.ok(game.value >= 1 && game.value <= 30);
  assert.equal(game.deck.length, 29);

  const firstValue = game.value;
  const a = game.playerById('a');
  const slots = Streams.validSlots(a.track, firstValue);
  assert.ok(slots.length > 0);
  assert.equal(game.place('nobody', slots[0]).reason, 'unknown_player', '모르는 사람은 놓을 수 없음');
  const result = game.place('a', slots[slots.length - 1]);
  assert.equal(result.ok, true);
  assert.equal(a.track[slots[slots.length - 1]], firstValue);

  let guard = 0;
  while (game.status === 'playing' && guard < 500) {
    guard += 1;
    const waiting = game.waiting.slice();
    if (!waiting.length) break;
    for (const id of waiting) {
      const player = game.playerById(id);
      const options = Streams.validSlots(player.track, game.value);
      if (!options.length) {
        game.skip(id);
      } else {
        const r = game.place(id, options[Math.floor(options.length / 2)]);
        assert.equal(r.ok, true);
      }
    }
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.round, 30);
  assert.equal(game.deck.length, 0);
  const ranking = game.ranking();
  assert.equal(ranking[0].rank, 1);
  assert.ok(ranking[0].score >= ranking[1].score);
  assert.ok(ranking[0].score <= 20);
});

/* ---------------- 오목 ---------------- */

function gomokuGame() {
  return new Gomoku.Game([{ id: 'black', name: '흑' }, { id: 'white', name: '백' }], {});
}

test('오목: 5개를 먼저 이으면 승리하고 마지막 수가 남는다', function () {
  const game = gomokuGame();
  for (let i = 0; i < 4; i++) {
    assert.equal(game.play('black', { x: 3 + i, y: 3 }).ok, true);
    assert.equal(game.play('white', { x: 3 + i, y: 4 }).ok, true);
  }
  const last = game.play('black', { x: 7, y: 3 });
  assert.equal(last.ok, true);
  assert.equal(last.win, true);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'black');
  assert.equal(game.winLine.length, 5);
  assert.deepEqual(game.lastMove, { x: 7, y: 3, playerId: 'black', stone: 1, seq: 9 });
  assert.equal(game.ranking()[0].id, 'black');
});

test('오목: 차례가 아니면 둘 수 없고, 이미 돌이 있으면 거절한다', function () {
  const game = gomokuGame();
  assert.equal(game.play('white', { x: 7, y: 7 }).reason, 'not_your_turn');
  assert.equal(game.play('black', { x: 7, y: 7 }).ok, true);
  assert.equal(game.play('white', { x: 7, y: 7 }).reason, 'occupied');
  assert.equal(game.play('white', { x: 99, y: 0 }).reason, 'bad_cell');
});

test('오목: 흑의 6목(장목)은 금수이고 백의 6목은 승리한다', function () {
  const board = Gomoku.createBoard();
  for (let x = 1; x <= 5; x++) board[7][x] = 1;
  assert.equal(Gomoku.isForbidden(board, 0, 7, 1), true);
  assert.equal(Gomoku.isForbidden(board, 6, 7, 1), true);

  const game = gomokuGame();
  // 백이 6목을 만들면 그대로 승리
  for (let x = 2; x <= 6; x++) game.board[8][x] = 2;
  assert.equal(game.play('black', { x: 0, y: 0 }).ok, true);
  const win = game.play('white', { x: 7, y: 8 });
  assert.equal(win.ok, true);
  assert.equal(win.win, true);
  assert.equal(game.winnerId, 'white');
});

test('오목: 흑의 3-3 은 금수로 막힌다', function () {
  const board = Gomoku.createBoard();
  board[7][5] = 1;
  board[7][6] = 1;
  board[5][7] = 1;
  board[6][7] = 1;
  assert.equal(Gomoku.isForbidden(board, 7, 7, 1), true);
});

test('오목 AI: 빈 판에서는 가운데 근처에 두고, 이길 자리가 있으면 이긴다', function () {
  const game = gomokuGame();
  const first = Gomoku.botMove(game, game.currentPlayer());
  assert.equal(first.action, 'play');
  assert.ok(Math.abs(first.payload.x - 7) <= 2 && Math.abs(first.payload.y - 7) <= 2);

  // 흑 4목 + 양 끝 열림 → 봇이 5목을 완성
  for (let x = 3; x <= 6; x++) game.board[7][x] = 1;
  game.turn = 0;
  const winMove = Gomoku.botMove(game, game.players[0]);
  assert.ok((winMove.payload.x === 2 || winMove.payload.x === 7) && winMove.payload.y === 7);
});

/* ---------------- 라이어 추리게임 ---------------- */

function liarGame(count, seed) {
  const players = [];
  for (let i = 0; i < count; i++) players.push({ id: 'p' + i, name: '학생' + i });
  return new Liar.Game(players, { seed: seed || 5 });
}

test('라이어: 시민에게는 제시어가 보이고 라이어에게는 숨겨진다', function () {
  const game = liarGame(4, 3);
  const liar = game.players.find(function (p) { return p.isLiar; });
  const citizen = game.players.find(function (p) { return !p.isLiar; });
  const liarView = game.stateFor(liar.id);
  const citizenView = game.stateFor(citizen.id);
  assert.equal(liarView.youAreLiar, true);
  assert.equal(liarView.secret, null);
  assert.equal(citizenView.youAreLiar, false);
  assert.equal(citizenView.secret, game.secret);
  assert.equal(citizenView.liarId, null, '끝나기 전에는 라이어를 알려 주지 않음');
  assert.ok(game.category.name.length > 0);
});

test('라이어: 힌트는 순서대로 한 번씩, 모두 말하면 투표로 넘어간다', function () {
  const game = liarGame(3, 9);
  const order = game.hintOrder.slice();
  assert.equal(game.hint(order[1], { text: '먼저 말하기' }).reason, 'not_your_turn');
  assert.equal(game.hint(order[0], { text: '  ' }).reason, 'empty_hint');
  assert.equal(game.hint(order[0], { text: '힌트 하나' }).ok, true);
  assert.equal(game.hint(order[0], { text: '또' }).reason, 'not_your_turn');
  assert.equal(game.hint(order[1], { text: '힌트 둘' }).ok, true);
  assert.equal(game.phase, 'hint');
  game.hint(order[2], { text: '힌트 셋' });
  assert.equal(game.phase, 'vote');
});

test('라이어: 라이어가 아닌 사람이 지목되면 라이어 승리', function () {
  const game = liarGame(3, 21);
  game.players.forEach(function (p) { p.hint = '힌트'; });
  game.phase = 'vote';
  const liar = game.players.find(function (p) { return p.isLiar; });
  const others = game.players.filter(function (p) { return !p.isLiar; });
  game.vote(others[0].id, { targetId: others[1].id });
  game.vote(others[1].id, { targetId: others[0].id });
  const last = game.vote(liar.id, { targetId: others[0].id });
  assert.equal(last.ok, true);
  assert.equal(game.status, 'finished');
  assert.deepEqual(game.winnerIds, [liar.id]);
});

test('라이어: 지목된 라이어가 제시어를 맞히면 라이어 승리, 틀리면 시민 승리', function () {
  const caught = liarGame(3, 33);
  caught.players.forEach(function (p) { p.hint = '힌트'; });
  caught.phase = 'vote';
  const liar = caught.players.find(function (p) { return p.isLiar; });
  const others = caught.players.filter(function (p) { return !p.isLiar; });
  caught.vote(others[0].id, { targetId: liar.id });
  caught.vote(others[1].id, { targetId: liar.id });
  caught.vote(liar.id, { targetId: others[0].id });
  assert.equal(caught.phase, 'guess');
  assert.ok(caught.guessOptions.indexOf(caught.secret) !== -1);
  assert.equal(caught.guessWord(others[0].id, { word: caught.secret }).reason, 'not_liar');
  caught.guessWord(liar.id, { word: caught.secret });
  assert.equal(caught.status, 'finished');
  assert.deepEqual(caught.winnerIds, [liar.id]);

  const wrong = liarGame(3, 34);
  wrong.players.forEach(function (p) { p.hint = '힌트'; });
  wrong.phase = 'vote';
  const liar2 = wrong.players.find(function (p) { return p.isLiar; });
  const others2 = wrong.players.filter(function (p) { return !p.isLiar; });
  wrong.vote(others2[0].id, { targetId: liar2.id });
  wrong.vote(others2[1].id, { targetId: liar2.id });
  wrong.vote(liar2.id, { targetId: others2[0].id });
  const bad = wrong.guessOptions.find(function (w) { return w !== wrong.secret; });
  wrong.guessWord(liar2.id, { word: bad });
  assert.equal(wrong.status, 'finished');
  assert.equal(wrong.winnerIds.length, 2);
  assert.ok(wrong.winnerIds.indexOf(liar2.id) === -1);
});

test('라이어 봇: 힌트·투표를 스스로 한다', function () {
  const game = new Liar.Game(
    [{ id: 'h', name: '사람' }, { id: 'b1', name: '봇1', isBot: true }, { id: 'b2', name: '봇2', isBot: true }],
    { seed: 4 }
  );
  const driver = new Liar.BotDriver(game);
  let guard = 0;
  while (game.status === 'playing' && guard < 40) {
    guard += 1;
    const action = driver.tick();
    if (!action) {
      // 사람 차례는 사람이 직접
      const current = game.phase === 'hint' ? game.currentHintPlayer() : game.pendingVoters()[0];
      if (!current) break;
      if (game.phase === 'hint') game.hint(current.id, { text: '사람 힌트' });
      else if (game.phase === 'vote') game.vote(current.id, { targetId: game.players.find(function (p) { return p.id !== current.id; }).id });
      continue;
    }
    const result = game.applyAction
      ? null
      : (action.action === 'hint' ? game.hint(action.playerId, action.payload)
        : action.action === 'vote' ? game.vote(action.playerId, action.payload)
          : game.guessWord(action.playerId, action.payload));
    assert.ok(result.ok, '봇 동작은 성공해야 한다: ' + action.action);
  }
  assert.equal(game.status, 'finished');
  assert.ok(game.winnerIds.length >= 1);
});

/* ---------------- 전통 윷놀이 ---------------- */

test('윷놀이: 윷가락 결과가 도·개·걸·윷·모·빽도로 바뀐다', function () {
  function rollWith(values) {
    let i = 0;
    return Yut.rollSticks(function () { return values[i++]; });
  }
  // 0.5 미만 = 배(뒤집힘)
  assert.equal(rollWith([0.9, 0.9, 0.9, 0.9]).name, '모');
  assert.equal(rollWith([0.1, 0.9, 0.9, 0.9]).name, '빽도');
  assert.equal(rollWith([0.9, 0.1, 0.9, 0.9]).name, '도');
  assert.equal(rollWith([0.9, 0.1, 0.1, 0.9]).name, '개');
  assert.equal(rollWith([0.9, 0.1, 0.1, 0.1]).name, '걸');
  assert.equal(rollWith([0.1, 0.1, 0.1, 0.1]).name, '윷');
  assert.equal(rollWith([0.1, 0.1, 0.1, 0.1]).bonus, true);
  assert.equal(rollWith([0.9, 0.1, 0.1, 0.9]).bonus, false);
});

test('윷놀이: 모서리에 멈추면 지름길, 끝을 지나면 완주, 빽도는 한 칸 뒤로', function () {
  const shortcut = Yut.advance({ path: 'outer', idx: 4 }, 1);
  assert.equal(shortcut.node, 5);
  assert.equal(shortcut.pos.path, 'd5');
  assert.equal(Yut.advance({ path: 'outer', idx: 19 }, 1).finished, true);
  assert.equal(Yut.advance({ path: 'outer', idx: 17 }, 3).finished, true);
  assert.deepEqual(Yut.advance({ path: 'd10', idx: 0 }, -1), { pos: { path: 'outer', idx: 9 }, node: 9, shortcut: false });
  assert.equal(Yut.advance({ path: 'outer', idx: 1 }, -1).toStart, true);
});

test('윷놀이: 상대 말을 잡으면 출발점으로 보내고 한 번 더 던진다', function () {
  const game = new Yut.Game([{ id: 'a', name: '가' }, { id: 'b', name: '나' }], { seed: 2, pieces: 2 });
  const a = game.players[0];
  const b = game.players[1];
  a.pieces[0].pos = { path: 'outer', idx: 3 };
  b.pieces[0].pos = { path: 'outer', idx: 5 };
  game.throwInfo = { seq: 9, playerId: 'a', name: '개', steps: 2, bonus: false };
  game.phase = 'move';
  const result = game.move('a', a.pieces[0].id);
  assert.equal(result.ok, true);
  assert.equal(result.extra, true, '잡았으니 한 번 더');
  assert.equal(b.pieces[0].pos, null);
  assert.equal(Yut.nodeAt(a.pieces[0].pos), 5);
  assert.equal(game.currentPlayer().id, 'a');
  assert.equal(game.phase, 'throw');
});

test('윷놀이: 내 말이 모이면 업고 함께 움직인다', function () {
  const game = new Yut.Game([{ id: 'a', name: '가' }, { id: 'b', name: '나' }], { seed: 3, pieces: 2 });
  const a = game.players[0];
  a.pieces[0].pos = { path: 'outer', idx: 2 };
  a.pieces[1].pos = { path: 'outer', idx: 4 };
  game.throwInfo = { seq: 5, playerId: 'a', name: '개', steps: 2, bonus: false };
  game.phase = 'move';
  const result = game.move('a', a.pieces[0].id);
  assert.equal(result.ok, true);
  assert.equal(Yut.nodeAt(a.pieces[0].pos), Yut.nodeAt(a.pieces[1].pos));
  assert.equal(a.pieces.length, 2);
});

test('윷놀이: 출발점의 말은 한 번에 한 개씩 나간다', function () {
  const game = new Yut.Game([{ id: 'a', name: '가' }, { id: 'b', name: '나' }], { seed: 5, pieces: 3 });
  const a = game.players[0];
  game.throwInfo = { seq: 2, playerId: 'a', name: '개', steps: 2, bonus: false };
  game.phase = 'move';
  game.turn = 0;
  const result = game.move('a', a.pieces[0].id);
  assert.equal(result.ok, true);
  assert.equal(a.pieces.filter(function (piece) { return piece.pos; }).length, 1, '한 개만 보드에 나간다');
  assert.equal(a.pieces.filter(function (piece) { return !piece.pos && !piece.finished; }).length, 2, '나머지는 출발점에');
});

test('윷놀이: 말을 모두 완주하면 우승하고 순위가 남는다', function () {
  const game = new Yut.Game([{ id: 'a', name: '가' }, { id: 'b', name: '나' }], { seed: 8, pieces: 2 });
  const a = game.players[0];
  a.pieces[0].finished = true;
  a.pieces[1].pos = { path: 'outer', idx: 19 };
  game.throwInfo = { seq: 3, playerId: 'a', name: '도', steps: 1, bonus: false };
  game.phase = 'move';
  game.turn = 0;
  const result = game.move('a', a.pieces[1].id);
  assert.equal(result.ok, true);
  assert.equal(result.win, true);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'a');
  const ranking = game.ranking();
  assert.equal(ranking[0].id, 'a');
  assert.equal(ranking[0].score, 2);
});

test('윷놀이 봇: 끝까지 스스로 두고 우승자를 가린다', function () {
  const game = new Yut.Game([
    { id: 'b1', name: '봇1', isBot: true },
    { id: 'b2', name: '봇2', isBot: true }
  ], { seed: 12, pieces: 2 });
  const driver = new Yut.BotDriver(game);
  let guard = 0;
  while (game.status === 'playing' && guard < 400) {
    guard += 1;
    const action = driver.tick();
    assert.ok(action, '봇 차례에는 동작이 있어야 한다');
    if (action.action === 'throw') {
      const r = game.throwYut(action.playerId);
      assert.equal(r.ok, true);
    } else {
      const r = game.move(action.playerId, action.payload.pieceId);
      assert.equal(r.ok, true);
    }
  }
  assert.equal(game.status, 'finished');
  assert.ok(game.winnerId);
});
