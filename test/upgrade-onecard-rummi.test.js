'use strict';

/*
 * 보강한 게임 테스트 — 컬러 숫자 카드(+4 · 원카드!) · 숫자 타일 러미(세트 찾아 주기 · 조커 세트에 붙이기)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createHub } = require('../server.js');
const OneCard = require('../public/onecard-engine.js');
const Rummi = require('../public/rummi-engine.js');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function waitFor(fn, label, ms) {
  const deadline = Date.now() + (ms || 6000);
  while (Date.now() < deadline) {
    try {
      const value = fn();
      if (value) return value;
    } catch (err) { /* 계속 */ }
    await sleep(25);
  }
  throw new Error('대기 실패: ' + label);
}

/* ---------------- 컬러 숫자 카드: 무지개 +4 ---------------- */

test('컬러 숫자 카드: 무지개 +4 는 아무 때나 낼 수 있고 다음 사람이 4장 뽑고 건너뛴다', function () {
  const game = new OneCard.Game([
    { id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }
  ], { seed: 21 });
  game.players[0].hand = [
    { id: 'd41', color: null, type: 'draw4', value: 0 },
    { id: 'g9', color: 'green', type: 'number', value: 9 }
  ];
  game.top = { id: 'r1', color: 'red', type: 'number', value: 1 };
  game.activeColor = 'red';
  const bBefore = game.players[1].hand.length;

  const needColor = game.play('a', { cardId: 'd41' });
  assert.equal(needColor.ok, false);
  assert.equal(needColor.reason, 'need_color', '바꿀 색을 골라야 함');

  const played = game.play('a', { cardId: 'd41', color: 'blue' });
  assert.equal(played.ok, true);
  assert.equal(game.activeColor, 'blue');
  assert.equal(game.players[1].hand.length, bBefore + 4, '다음 사람이 4장 뽑음');
  assert.equal(game.currentPlayer().id, 'c', '+4를 맞은 사람은 건너뜀');
  assert.equal(game.top.type, 'draw4');
});

test('컬러 숫자 카드: 덱과 상태에 +4 카드가 들어 있다', function () {
  assert.equal(OneCard.makeDeck().filter(function (c) { return c.type === 'draw4'; }).length, 4);
  assert.equal(OneCard.canPlay({ color: null, type: 'draw4' }, { color: 'red', type: 'number', value: 3 }, 'red'), true);
  assert.equal(OneCard.isWildType({ type: 'draw4' }), true);
  assert.equal(OneCard.isWildType({ type: 'wild' }), true);
  assert.equal(OneCard.isWildType({ type: 'skip' }), false);
});

/* ---------------- 컬러 숫자 카드: 원카드! ---------------- */

test('컬러 숫자 카드: 원카드! 를 외치면 1장으로 남고, 안 외치면 2장을 더 받는다', function () {
  function make() {
    const game = new OneCard.Game([
      { id: 'a', name: '가' }, { id: 'b', name: '나' }, { id: 'c', name: '다' }
    ], { seed: 31 });
    game.players[0].hand = [
      { id: 'r7', color: 'red', type: 'number', value: 7 },
      { id: 'g9', color: 'green', type: 'number', value: 9 }
    ];
    game.top = { id: 'r2', color: 'red', type: 'number', value: 2 };
    game.activeColor = 'red';
    return game;
  }

  const quiet = make();
  const played = quiet.play('a', { cardId: 'r7' });
  assert.equal(played.ok, true);
  assert.equal(quiet.players[0].hand.length, 3, '외치지 않아 2장을 더 받음');
  assert.match(quiet.log.map(function (r) { return r.text; }).join(' '), /원카드/);

  const called = make();
  assert.equal(called.say('a').ok, true);
  assert.equal(called.stateFor('a').youCalled, true);
  assert.equal(called.say('a').already, true, '두 번 외쳐도 괜찮음');
  const after = called.play('a', { cardId: 'r7' });
  assert.equal(after.ok, true);
  assert.equal(called.players[0].hand.length, 1, '외쳤으니 1장 유지');
  assert.equal(called.stateFor('a').youCalled, true);
  // 1장 상태에서 다음 차례가 되면 원카드! 를 다시 외칠 수 있고, 카드를 내면 우승
  called.turn = 0;
  called.players[0].hand = [{ id: 'g8', color: 'green', type: 'number', value: 8 }];
  called.top = { id: 'g5', color: 'green', type: 'number', value: 5 };
  called.activeColor = 'green';
  assert.equal(called.play('a', { cardId: 'g8' }).win, true);
});

test('컬러 숫자 카드: 카드가 많을 때는 원카드! 를 외칠 수 없다', function () {
  const game = new OneCard.Game([{ id: 'a', name: '가' }, { id: 'b', name: '나' }], { seed: 33 });
  assert.equal(game.players[0].hand.length, 7);
  const result = game.say('a');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too_many_cards');
});

test('컬러 숫자 카드: 봇은 1장이 되기 전에 원카드! 를 외친다', function () {
  const game = new OneCard.Game([
    { id: 'a', name: '봇1', isBot: true },
    { id: 'b', name: '봇2', isBot: true }
  ], { seed: 35 });
  const driver = new OneCard.BotDriver(game);
  game.players[0].hand = [
    { id: 'r9', color: 'red', type: 'number', value: 9 },
    { id: 'b9', color: 'blue', type: 'number', value: 9 }
  ];
  game.top = { id: 'r4', color: 'red', type: 'number', value: 4 };
  game.activeColor = 'red';
  const action = driver.tick();
  assert.equal(action.action, 'say', '먼저 원카드! 를 외침');
  game.say(action.playerId);
  const next = driver.tick();
  assert.equal(next.action, 'play');
  game.play(next.playerId, next.payload);
  assert.equal(game.players[0].hand.length, 1, '외쳤으니 벌점 없음');
});

/* ---------------- 숫자 타일 러미 ---------------- */

test('타일 러미: 조커가 든 테이블 세트에도 규칙에 맞으면 타일을 붙일 수 있다', function () {
  const game = new Rummi.Game([
    { id: 'a', name: '가' },
    { id: 'b', name: '나', isBot: true }
  ], { seed: 41, options: { initialPoints: 15 } });
  const player = game.players[0];
  player.melded = true;
  game.table = [{
    id: 's1',
    type: 'run',
    tiles: [
      { id: 'red4', color: 'red', value: 4 },
      { id: 'j1', color: null, value: 0, joker: true },
      { id: 'red6', color: 'red', value: 6 }
    ]
  }];
  player.hand = [{ id: 'red7', color: 'red', value: 7 }];
  const result = game.play('a', { adds: [{ setId: 's1', tileIds: ['red7'] }] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(game.table[0].tiles.length, 4);
  assert.equal(game.status, 'finished', '마지막 타일을 붙였으니 우승');
  assert.equal(game.winnerId, 'a');
});

/* ---------------- 숫자 타일 러미: 세트 찾아 주기 (화면) ---------------- */

test('타일 러미: 봇 연습에서 [세트 찾아 주기] 를 누르면 낼 수 있는 세트를 담아 준다', async function () {
  const hub = createHub({ groupCapacity: 4, store: false, redis: false });
  const info = await hub.start(0, '127.0.0.1');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', function (err) {
    if (/Not implemented/.test(String(err && err.message))) return;
    errors.push(err);
  });
  virtualConsole.on('error', function (msg) { errors.push(new Error(String(msg))); });
  const dom = await JSDOM.fromURL('http://127.0.0.1:' + info.port + '/?class=DEMO', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: virtualConsole
  });
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/rummi/bot';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.rummi.bot'; }, '타일 러미 연습');
    window.document.querySelector('[data-action="mini.startBot"]').click();
    await waitFor(function () { return window.document.querySelector('.mg-board.mg-rummi'); }, '타일 러미 보드');

    const st = window.BG.mini.state.bot;
    st.game.players[0].hand = [
      { id: 'red8', color: 'red', value: 8, joker: false },
      { id: 'blue8', color: 'blue', value: 8, joker: false },
      { id: 'yellow8', color: 'yellow', value: 8, joker: false },
      { id: 'green2', color: 'green', value: 2, joker: false }
    ];
    st.game.initialPoints = 15;
    window.BG.mini.rerender();
    await sleep(60);

    const help = window.document.querySelector('[data-action="mini.rummiHelp"]');
    assert.ok(help, '세트 찾아 주기 버튼');
    help.click();
    await waitFor(function () { return window.document.querySelector('.mg-rummi-pending-set'); }, '자동으로 담긴 세트');
    const pending = window.document.querySelectorAll('.mg-rummi-pending-set .mg-tile');
    assert.equal(pending.length, 3, '같은 숫자 세트 3장');
    assert.deepEqual(errors.map(String), []);
  } finally {
    window.close();
    await hub.close();
  }
});
