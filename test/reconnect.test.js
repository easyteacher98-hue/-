'use strict';

/*
 * 끊김·다시 접속 회귀 테스트 — 2026-11-27 수업 피드백 "게임 중간에 많이 팅김"
 * - 같은 번호의 끊긴 자리는 다시 이어받을 수 있다 (새로고침·인터넷 끊김).
 * - 게임 중에 끊긴 자리는 자동 플레이로 이어지고, 돌아오면 곧바로 내 자리로 복귀한다.
 * - 연결이 살아 있는 자리를 다른 창이 빼앗지는 않는다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
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
        kill: function () { try { ws.terminate(); } catch (err) { /* ignore */ } },
        raw: queue,
        next: async function (pred, ms) {
          const testFn = typeof pred === 'string' ? function (m) { return m.t === pred; } : pred;
          const deadline = Date.now() + (ms || 3000);
          while (Date.now() < deadline) {
            const found = queue.find(testFn);
            if (found) return found;
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

test('게임 중에 끊긴 자리는 같은 번호로 다시 들어와 이어서 할 수 있다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: 'DEMO', number: 5 });
    await a.next('joined');
    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: 'DEMO', number: 6 });
    await b.next('joined');
    b.send({ t: 'ready', ready: true });
    await a.next(function (m) { return m.t === 'room' && m.room.seats.length === 2; });
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.status === 'playing'; });

    // 5번 학생의 인터넷이 끊김 (정상 종료 없이 소켓만 끊김)
    a.kill();
    await new Promise(function (r) { setTimeout(r, 120); });

    const room = env.hub.getRoom('halligalli', '1', 'DEMO');
    const seat = room.seats.find(function (s) { return s.number === 5; });
    assert.ok(seat, '자리는 남아 있다');
    seat.ws = null;                  // 서버가 끊김을 확인한 상태
    seat.connected = false;

    const back = await connect(env.ws);
    clients.push(back);
    await back.next('welcome');
    back.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: 'DEMO', number: 5 });
    const joined = await back.next(function (m) { return m.t === 'joined'; });
    assert.equal(joined.resumed, true, '같은 자리로 돌아온다');
    assert.equal(joined.playerId, seat.id);
    assert.equal(room.seats.length, 2, '자리가 늘어나지 않는다');
    assert.equal(seat.connected, true);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('연결이 살아 있는 자리는 다른 창이 같은 번호로 빼앗지 못한다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '2', classCode: 'DEMO', number: 7 });
    await a.next('joined');

    const intruder = await connect(env.ws);
    clients.push(intruder);
    await intruder.next('welcome');
    intruder.send({ t: 'join', gameId: 'halligalli', code: '2', classCode: 'DEMO', number: 7 });
    const err = await intruder.next('error');
    assert.equal(err.code, 'dup_number');

    const room = env.hub.getRoom('halligalli', '2', 'DEMO');
    assert.equal(room.seats.length, 1);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('핑에 응답하고, 끊긴 연결은 서버가 정리한다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'ping' });
    const pong = await a.next('pong');
    assert.ok(pong.now > 0, 'pong 에 서버 시각이 담긴다');

    const before = env.hub.wss.clients.size;
    a.kill();
    await new Promise(function (r) { setTimeout(r, 200); });
    assert.ok(env.hub.wss.clients.size < before, '끊긴 연결은 목록에서 빠진다');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});
