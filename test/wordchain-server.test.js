'use strict';

/*
 * 꼬리잡기 끝말잇기 – 서버 연동 테스트
 * 모둠 방 → 봇과 시작 → 낱말 잇기 → 잘못된 낱말 거절 → 시간 초과(목숨) → 교사 관전까지
 * WebSocket 으로 실제 서버를 상대로 확인합니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { createHub } = require('../server.js');

function connect(url) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(url);
    const queue = [];
    const used = new Set();
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
          const deadline = Date.now() + (ms || 5000);
          while (Date.now() < deadline) {
            for (let i = 0; i < queue.length; i++) {
              if (!used.has(i) && testFn(queue[i])) {
                used.add(i);
                return queue[i];
              }
            }
            await new Promise(function (r) { setTimeout(r, 10); });
          }
          throw new Error('메시지 대기 시간 초과. 최근: ' + JSON.stringify(queue.slice(-3)));
        }
      });
    });
  });
}

async function boot() {
  const hub = createHub({ groupCapacity: 4, store: false, redis: false });
  const info = await hub.start(0, '127.0.0.1');
  return { hub: hub, port: info.port, ws: 'ws://127.0.0.1:' + info.port + '/ws' };
}

async function newClass(env, name) {
  const c = await connect(env.ws);
  await c.next('welcome');
  c.send({ t: 'classCreate', teacherCode: 'easy', name: name || '끝말잇기 반', pin: '2451' });
  const created = await c.next('class_created');
  return { client: c, code: created.code };
}

function gameRoom(gameId, code, status) {
  return function (m) {
    return m.t === 'room' && m.room && m.room.gameId === gameId && m.room.code === code &&
      (!status || m.room.status === status);
  };
}

async function startWithBot(env, cls, number) {
  const student = await connect(env.ws);
  await student.next('welcome');
  student.send({ t: 'join', gameId: 'wordchain', code: '1', classCode: cls.code, number: number, studentName: '김민수' });
  await student.next('joined');
  student.send({ t: 'addBot' });
  await student.next(gameRoom('wordchain', '1', 'waiting'));
  student.send({ t: 'start' });
  const playing = await student.next(gameRoom('wordchain', '1', 'playing'));
  return { client: student, room: playing.room };
}

test('끝말잇기: 서버 게임 목록에 ready 로 보이고, 모둠 방 6개가 열린다', async function () {
  const env = await boot();
  try {
    const client = await connect(env.ws);
    const welcome = await client.next('welcome');
    const game = welcome.games.find(function (g) { return g.id === 'wordchain'; });
    assert.ok(game, '게임 목록에 끝말잇기');
    assert.equal(game.status, 'ready');
    assert.equal(game.title, '꼬리잡기 끝말잇기');
    assert.equal(game.minPlayers, 2);
    assert.equal(game.maxPlayers, 5);

    client.send({ t: 'overview', classCode: 'DEMO' });
    const rooms = await client.next(function (m) { return m.t === 'rooms' && m.classCode === 'DEMO'; });
    const mine = rooms.rooms.filter(function (r) { return r.gameId === 'wordchain'; });
    assert.equal(mine.length, 6, '6모둠 방');
    client.close();
  } finally {
    await env.hub.close();
  }
});

test('끝말잇기: 봇과 시작해 진짜 낱말을 잇고, 사전에 없는 낱말은 서버가 거절한다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env);
    const joined = await startWithBot(env, cls, 3);
    const room = joined.room;
    assert.equal(room.game.gameId, 'wordchain');
    assert.equal(room.game.required, null, '첫 낱말은 자유');
    assert.equal(room.game.players.length, 2);
    assert.ok(room.game.deadline > room.game.serverNow, '제한 시간이 흐르고 있음');
    assert.ok(room.game.dictionaryCount > 2000);

    // 첫 낱말: 사과 → 다음 글자 과
    joined.client.send({ t: 'action', action: 'say', payload: { text: '사과' } });
    const after = await joined.client.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'wordchain' && m.room.game &&
        m.room.game.chain.length >= 1 && m.room.game.chain[0].word === '사과';
    }, 6000);
    assert.equal(after.room.game.chain[0].playerId, after.room.youId);
    assert.ok(after.room.game.required);

    // 내 차례가 다시 돌아오면, 이 글자로 시작하지만 사전에 없는 낱말을 보내 거절을 확인합니다.
    const mine = await joined.client.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'wordchain' && m.room.game &&
        m.room.game.turnPlayerId === m.room.youId && m.room.game.chain.length >= 2;
    }, 8000);
    const required = mine.room.game.required;
    joined.client.send({ t: 'action', action: 'say', payload: { text: required + '뷁뷁' } });
    const rejected = await joined.client.next('action_result', 4000);
    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /사전에 없는/);

    // 한방 단어는 다른 안내로 거절됩니다. (사전에 있는 낱말이지만 이을 낱말이 없음)
    joined.client.send({ t: 'action', action: 'say', payload: { text: '우라늄' } });
    const lastWord = await joined.client.next('action_result', 4000);
    assert.equal(lastWord.ok, false);
    assert.match(lastWord.message, /한방 단어|낱말/);

    joined.client.close();
  } finally {
    await env.hub.close();
  }
});

test('끝말잇기: 제한 시간을 넘기면 서버가 목숨을 줄이고 모든 화면에 알린다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '시간 초과 반');
    const joined = await startWithBot(env, cls, 4);
    const room = joined.room;
    const myId = room.youId;
    const lives0 = room.game.players.find(function (p) { return p.id === myId; }).lives;
    assert.equal(lives0, 3);

    // 서버가 들고 있는 게임의 제한 시간을 지난 시각으로 돌려, 시계가 도는지 확인합니다.
    const serverRoom = env.hub.getRoom('wordchain', '1', cls.code);
    assert.ok(serverRoom && serverRoom.game);
    serverRoom.game.deadline = Date.now() - 50;

    const after = await joined.client.next(function (m) {
      if (m.t !== 'room' || m.room.gameId !== 'wordchain' || !m.room.game) return false;
      const me = m.room.game.players.find(function (p) { return p.id === m.room.youId; });
      return me && me.lives === lives0 - 1;
    }, 6000);
    const me = after.room.game.players.find(function (p) { return p.id === after.room.youId; });
    assert.equal(me.lives, lives0 - 1, '목숨 1개 감소');
    const logText = after.room.game.log.map(function (row) { return row.text; }).join(' ');
    assert.match(logText, /시간 초과|목숨/);
    assert.equal(after.room.status, 'playing', '한 번은 아직 탈락 아님');

    joined.client.close();
  } finally {
    await env.hub.close();
  }
});

test('끝말잇기: 교사가 PIN 으로 관전하면 지금 차례와 낱말이 보인다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '관전 반');
    const joined = await startWithBot(env, cls, 5);
    joined.client.send({ t: 'action', action: 'say', payload: { text: '사과' } });
    await joined.client.next(function (m) {
      return m.t === 'room' && m.room.game && m.room.game.chain.length >= 1;
    }, 6000);

    const teacher = await connect(env.ws);
    await teacher.next('welcome');
    teacher.send({ t: 'classAuth', code: cls.code, pin: '2451' });
    await teacher.next('class_auth_ok');
    teacher.send({ t: 'spectate', gameId: 'wordchain', code: '1', classCode: cls.code });
    const watching = await teacher.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'wordchain' && m.room.role === 'spectator';
    }, 5000);
    assert.equal(watching.room.game.chain.length >= 1, true);
    assert.ok(watching.room.summary.turnName, '지금 차례 이름');
    assert.ok(watching.room.game.players.every(function (p) { return typeof p.lives === 'number'; }));

    teacher.close();
    joined.client.close();
  } finally {
    await env.hub.close();
  }
});

