'use strict';

/*
 * 과일 딩동 턴 지키기 회귀 테스트 — 2026-11-27 수업 피드백
 *  "할리갈리(과일 딩동)에서 계속 한 사람이 내는 버그를 뚫음"
 *
 * - 한 사람의 덱이 비면 곧바로 탈락해서, 남은 사람들의 차례가 고르게 돌아갑니다.
 * - 서버는 차례가 아닌 사람의 뒤집기, 같은 사람의 연속 클릭(더블클릭·매크로)을 막습니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const HG = require('../public/engine.js');
const { createHub } = require('../server.js');

function connect(url) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(url);
    const queue = [];
    ws.on('message', function (raw) {
      try { queue.push(JSON.parse(String(raw))); } catch (err) { /* ignore */ }
    });
    ws.on('error', reject);
    ws.on('open', function () {
      resolve({
        ws: ws,
        send: function (obj) { ws.send(JSON.stringify(obj)); },
        close: function () { try { ws.close(); } catch (err) { /* ignore */ } },
        raw: queue,
        next: async function (pred, ms) {
          const testFn = typeof pred === 'string' ? function (m) { return m.t === pred; } : pred;
          const deadline = Date.now() + (ms || 3000);
          let cursor = 0;
          while (Date.now() < deadline) {
            for (; cursor < queue.length; cursor++) {
              if (testFn(queue[cursor])) return queue[cursor];
            }
            await new Promise(function (r) { setTimeout(r, 15); });
          }
          throw new Error('메시지 대기 시간 초과. 최근: ' + JSON.stringify(queue.slice(-3)).slice(0, 400));
        }
      });
    });
  });
}

async function boot() {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  return { hub: hub, ws: 'ws://127.0.0.1:' + info.port + '/ws' };
}

/* ---------------- 엔진 ---------------- */

test('한 사람이 계속 카드를 내지 않는다: 다른 사람 덱에 카드가 있으면 차례가 넘어간다', function () {
  for (let trial = 0; trial < 60; trial += 1) {
    const game = new HG.Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], { rng: HG.createRng(4000 + trial) });
    let last = null;
    let steps = 0;
    while (game.status === 'playing' && steps < 400) {
      steps += 1;
      const current = game.currentPlayerId();
      const othersHaveCards = game.players.some(function (p) {
        return p.id !== current && !p.eliminated && p.deck.length > 0;
      });
      const result = game.flip(current, Date.now());
      assert.equal(result.ok, true, '차례인 사람의 뒤집기는 성공해야 한다');
      assert.equal(result.ok && last === current, false,
        '다른 사람에게 낼 카드가 남아 있는데 같은 사람이 연속으로 냈다 (trial ' + trial + ')');
      last = current;
      // 종이 가능하면 정답으로 쳐서 판을 이어 간다.
      if (game.bellFruits().length) game.ring(current, Date.now());
    }
    assert.ok(steps < 400, '게임이 끝나야 한다');
    assert.equal(game.status, 'finished');
  }
});

test('덱을 다 낸 사람은 그 자리에서 탈락하고, 마지막 한 명이 남으면 게임이 끝난다', function () {
  const game = new HG.Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { rng: HG.createRng(77) });
  game.players[0].deck = game.players[0].deck.slice(0, 1);
  game.players[1].deck = game.players[1].deck.slice(0, 1);
  game.players.forEach(function (p) { p.pile = []; });

  const first = game.players[game.turn];
  const result = game.flip(first.id, Date.now());
  assert.equal(result.ok, true);
  assert.equal(first.deck.length, 0);
  assert.equal(first.eliminated, true, '덱이 비면 탈락');
  assert.equal(game.status, 'finished', '한 명만 남으면 게임 종료');
  assert.equal(game.winnerId, game.players.find(function (p) { return p.id !== first.id; }).id);
});

test('탈락한 사람의 테이블 카드도 과일 5개 세기에 포함된다', function () {
  const game = new HG.Game([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { rng: HG.createRng(91) });
  game.players[0].deck = [{ id: 'z', fruit: 'lime', count: 1 }];
  game.players[0].pile = [{ id: 'x', fruit: 'lime', count: 3 }];
  game.players[0].eliminated = true;
  game.players[1].pile = [{ id: 'y', fruit: 'lime', count: 2 }];
  assert.deepEqual(game.bellFruits(), ['lime']);
});

/* ---------------- 서버 ---------------- */

async function startTwoPlayerGame(env, code) {
  const a = await connect(env.ws);
  await a.next('welcome');
  a.send({ t: 'join', gameId: 'halligalli', code: code, classCode: 'DEMO', number: 1 });
  await a.next('joined');
  const b = await connect(env.ws);
  await b.next('welcome');
  b.send({ t: 'join', gameId: 'halligalli', code: code, classCode: 'DEMO', number: 2 });
  await b.next('joined');
  b.send({ t: 'ready', ready: true });
  await a.next(function (m) {
    return m.t === 'room' && m.room.seats.length === 2 && m.room.seats.some(function (s) { return s.ready; });
  });
  a.send({ t: 'start' });
  const playing = await a.next(function (m) { return m.t === 'room' && m.room.status === 'playing'; });
  return { a: a, b: b, playing: playing };
}

test('서버는 차례가 아닌 사람의 뒤집기를 거절한다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const g = await startTwoPlayerGame(env, '1');
    clients.push(g.a, g.b);
    const turnId = g.playing.room.game.turn;
    const notTurn = turnId === g.playing.room.youId ? g.b : g.a;
    notTurn.send({ t: 'action', action: 'flip' });
    const denied = await notTurn.next('action_result');
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, 'not_your_turn');

    const room = env.hub.getRoom('halligalli', '1', 'DEMO');
    assert.equal(room.game.tableCardCount(), 0, '카드가 나가면 안 된다');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('빠른 연타(더블클릭·매크로)로 같은 사람이 두 번 내지 못한다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const g = await startTwoPlayerGame(env, '2');
    clients.push(g.a, g.b);
    const turnId = g.playing.room.game.turn;
    const turnClient = turnId === g.playing.room.youId ? g.a : g.b;

    // 거의 동시에 두 번 (더블클릭)
    turnClient.send({ t: 'action', action: 'flip' });
    turnClient.send({ t: 'action', action: 'flip' });

    const room = env.hub.getRoom('halligalli', '2', 'DEMO');
    await new Promise(function (r) { setTimeout(r, 250); });
    assert.equal(room.game.tableCardCount(), 1, '카드는 한 장만 나간다');

    // 카드가 계속 빨리 나가지 않는다: 30번 연속으로 눌러도 테이블 카드는 2장을 넘지 않는다
    for (let i = 0; i < 30; i += 1) turnClient.send({ t: 'action', action: 'flip' });
    await new Promise(function (r) { setTimeout(r, 400); });
    assert.ok(room.game.tableCardCount() <= 2, '연타로 자기 차례를 여러 번 쓰지 못한다 (테이블 ' + room.game.tableCardCount() + '장)');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('같은 자리로 다시 접속하면 옛 창은 더 이상 게임에 관여하지 못한다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const g = await startTwoPlayerGame(env, '3');
    clients.push(g.a, g.b);
    const joined = g.a.raw.find(function (m) { return m.t === 'joined'; });
    const token = joined.token;

    // 같은 사람이 새 창으로 다시 접속 (resume)
    const again = await connect(env.ws);
    clients.push(again);
    await again.next('welcome');
    again.send({ t: 'resume', gameId: 'halligalli', code: '3', classCode: 'DEMO', token: token });
    await again.next(function (m) { return m.t === 'joined' && m.resumed; });

    const room = env.hub.getRoom('halligalli', '3', 'DEMO');
    await new Promise(function (r) { setTimeout(r, 150); });
    assert.ok(room.game && room.game.status === 'playing', '게임은 그대로 이어진다 (초기화되지 않는다)');
    assert.equal(room.seats.length, 2, '자리가 사라지지 않는다');

    // 옛 창은 닫히거나 '다른 창에서 접속' 안내를 받고, 게임 상태를 바꾸지 못한다
    const before = room.game.tableCardCount();
    try { g.a.send({ t: 'action', action: 'flip' }); } catch (err) { /* 닫혀 있으면 무시 */ }
    await new Promise(function (r) { setTimeout(r, 250); });
    assert.equal(room.game.tableCardCount(), before, '옛 창의 클릭으로 카드가 나가지 않는다');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});
