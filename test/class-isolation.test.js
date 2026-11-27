'use strict';

/*
 * 반(교실) 격리 회귀 테스트 — 2026-11-27 수업 피드백
 *  "게임 중에 다른 반이 이겼다고 알림이 뜸", "갑자기 다른 반 관전이 됨"
 *
 * 두 반(A·B)이 같은 게임·같은 모둠 번호로 동시에 놀아도
 * 방·알림(게임 결과/포인트)·관전·방 목록이 절대 섞이지 않아야 합니다.
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
        seen: function (pred) {
          return queue.filter(function (m) { return !pred || pred(m); });
        },
        next: async function (pred, ms) {
          const testFn = typeof pred === 'string' ? function (m) { return m.t === pred; } : pred;
          const deadline = Date.now() + (ms || 3000);
          while (Date.now() < deadline) {
            for (let i = 0; i < queue.length; i++) {
              if (!used.has(i) && testFn(queue[i])) {
                used.add(i);
                return queue[i];
              }
            }
            await new Promise(function (r) { setTimeout(r, 15); });
          }
          throw new Error('메시지 대기 시간 초과. 최근: ' + JSON.stringify(queue.slice(-3)).slice(0, 600));
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

async function newClass(env, spec) {
  const c = await connect(env.ws);
  await c.next('welcome');
  c.send({ t: 'classCreate', teacherCode: 'easy', name: spec.name, pin: spec.pin });
  const created = await c.next('class_created');
  return { client: c, code: created.code, token: created.teacherToken };
}

/** 두 반이 같은 과일 딩동 1모둠에서 각자 놀고 있는 상황을 만든다. */
async function twoClassesPlaying(env) {
  const a = await newClass(env, { name: 'A반', pin: '1111' });
  const b = await newClass(env, { name: 'B반', pin: '2222' });

  const aStudent = await connect(env.ws);
  await aStudent.next('welcome');
  aStudent.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: a.code, number: 1 });
  await aStudent.next('joined');

  const bStudent = await connect(env.ws);
  await bStudent.next('welcome');
  bStudent.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: b.code, number: 1 });
  await bStudent.next('joined');

  return {
    a: a,
    b: b,
    aStudent: aStudent,
    bStudent: bStudent,
    clients: [a.client, b.client, aStudent, bStudent]
  };
}

test('두 반이 같은 모둠 번호로 놀아도 방 상태·방 목록이 서로 섞이지 않는다', async function () {
  const env = await boot();
  const s = await twoClassesPlaying(env);
  const clients = s.clients;
  try {
    // 서로 다른 방이어야 한다
    const roomA = env.hub.getRoom('halligalli', '1', s.a.code);
    const roomB = env.hub.getRoom('halligalli', '1', s.b.code);
    assert.ok(roomA && roomB);
    assert.notEqual(roomA, roomB);
    assert.equal(roomA.classCode, s.a.code);
    assert.equal(roomB.classCode, s.b.code);

    // 방을 하나 더 방송시킨 뒤, A 연결이 받은 방 메시지에 B반 방이 없는지 확인
    env.hub.rooms.get(roomA.key).lastEvent = '확인';
    await new Promise(function (r) { setTimeout(r, 120); });

    const roomsSeenByA = s.aStudent.raw.filter(function (m) { return m.t === 'room'; });
    assert.ok(roomsSeenByA.length > 0, 'A반 학생은 자기 방 상태를 받는다');
    roomsSeenByA.forEach(function (m) {
      assert.equal(m.room.classCode, s.a.code, 'A반 학생은 A반 방만 받는다');
    });
    const roomsSeenByB = s.bStudent.raw.filter(function (m) { return m.t === 'room'; });
    roomsSeenByB.forEach(function (m) {
      assert.equal(m.room.classCode, s.b.code, 'B반 학생은 B반 방만 받는다');
    });

    // 방 목록(rooms) 메시지도 자기 반 코드만 담는다
    s.aStudent.raw.filter(function (m) { return m.t === 'rooms'; }).forEach(function (m) {
      assert.equal(m.classCode, s.a.code);
      m.rooms.forEach(function (r) { assert.equal(r.classCode, s.a.code); });
    });
    s.bStudent.raw.filter(function (m) { return m.t === 'rooms'; }).forEach(function (m) {
      assert.equal(m.classCode, s.b.code);
      m.rooms.forEach(function (r) { assert.equal(r.classCode, s.b.code); });
    });
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('B반 게임이 끝나도 A반 화면에는 B반 승리 알림(게임 결과)이 가지 않는다', async function () {
  const env = await boot();
  const s = await twoClassesPlaying(env);
  const clients = s.clients;
  const extra = [];
  try {
    // A반 학생과 B반 학생을 각 방에서 게임 시작 (2명이 필요하므로 봇 1명씩 추가)
    s.aStudent.send({ t: 'addBot' });
    s.bStudent.send({ t: 'addBot' });
    await s.aStudent.next(function (m) { return m.t === 'room' && m.room.code === '1' && m.room.classCode === s.a.code && m.room.seats.some(function (x) { return x.isBot; }); });
    await s.bStudent.next(function (m) { return m.t === 'room' && m.room.code === '1' && m.room.classCode === s.b.code && m.room.seats.some(function (x) { return x.isBot; }); });

    s.aStudent.send({ t: 'start' });
    s.bStudent.send({ t: 'start' });
    await s.aStudent.next(function (m) { return m.t === 'room' && m.room.classCode === s.a.code && m.room.status === 'playing'; });
    await s.bStudent.next(function (m) { return m.t === 'room' && m.room.classCode === s.b.code && m.room.status === 'playing'; });

    // A반 관전(교사)도 함께 본다
    const aTeacher = await connect(env.ws);
    extra.push(aTeacher);
    await aTeacher.next('welcome');
    aTeacher.send({ t: 'classAuth', code: s.a.code, pin: '1111' });
    await aTeacher.next('class_auth_ok');
    aTeacher.send({ t: 'spectate', gameId: 'halligalli', code: '1', classCode: s.a.code });
    await aTeacher.next('spectating');

    // B반 게임을 '한 명만 남음'으로 만들어 끝낸다 (사람 차례로 바꾸고 마지막 카드를 내면 종료)
    const roomB = env.hub.getRoom('halligalli', '1', s.b.code);
    const gameB = roomB.game;
    gameB.players.forEach(function (p) { p.deck = p.deck.slice(0, 1); p.pile = []; p.eliminated = false; });
    const humanSeatB = roomB.seats.find(function (seat) { return seat.ws; });
    gameB.turn = gameB.players.findIndex(function (p) { return p.id === humanSeatB.id; });
    s.bStudent.send({ t: 'action', action: 'flip' });

    const resultB = await s.bStudent.next(function (m) { return m.t === 'game_result'; }, 4000);
    assert.equal(resultB.classCode, s.b.code, 'B반 결과는 B반에만');

    await new Promise(function (r) { setTimeout(r, 300); });

    // A반 쪽은 누구도 B반 결과 알림을 받으면 안 된다
    [s.aStudent, aTeacher, s.a.client].forEach(function (client) {
      const leaked = client.raw.filter(function (m) { return m.t === 'game_result' && m.classCode !== s.a.code; });
      assert.equal(leaked.length, 0, 'A반 연결에 다른 반 게임 결과가 오면 안 된다');
    });
    // A반 관점의 관전 방 상태도 전부 A반
    aTeacher.raw.filter(function (m) { return m.t === 'room'; }).forEach(function (m) {
      assert.equal(m.room.classCode, s.a.code, '교사 관전은 우리 반 방만');
    });
  } finally {
    extra.forEach(function (c) { c.close(); });
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('다른 반 관전·초기화·기록 열람은 서버에서 거절된다', async function () {
  const env = await boot();
  const s = await twoClassesPlaying(env);
  const clients = s.clients;
  const teacher = await connect(env.ws);
  clients.push(teacher);
  try {
    await teacher.next('welcome');
    // A반 교사로 인증
    teacher.send({ t: 'classAuth', code: s.a.code, pin: '1111' });
    await teacher.next('class_auth_ok');

    // B반 모둠 코드로 관전 시도 → A반에 묶여 있으므로 거절
    teacher.send({ t: 'spectate', gameId: 'halligalli', code: '1', classCode: s.b.code });
    const denied = await teacher.next('error');
    assert.equal(denied.code, 'no_class');

    // B반 방 초기화 시도 → 거절
    teacher.send({ t: 'resetRoom', gameId: 'halligalli', code: '1', classCode: s.b.code });
    const deniedReset = await teacher.next('error');
    assert.equal(deniedReset.code, 'no_class');

    // B반 기록(랭킹) 요청 → 거절 (A반 기록으로 바꿔 보여 주지도 않는다)
    teacher.send({ t: 'classStats', code: s.b.code });
    const deniedStats = await teacher.next('error');
    assert.equal(deniedStats.code, 'no_class');

    // 반 코드 없이 방 목록을 요청해도 아무 반이나 골라 주지 않는다
    const loner = await connect(env.ws);
    clients.push(loner);
    await loner.next('welcome');
    loner.send({ t: 'overview', gameId: 'halligalli' });
    const noClass = await loner.next('error');
    assert.equal(noClass.code, 'no_class');

    // 연결 직후에는 어느 반의 방 목록도 보내지 않는다
    const welcomeOnLoner = loner.raw.find(function (m) { return m.t === 'welcome'; });
    assert.deepEqual(welcomeOnLoner.rooms, []);
    assert.equal(welcomeOnLoner.classCode, null);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('다시 접속(resume)은 우리 반으로만 되고, 다른 반으로는 되지 않는다', async function () {
  const env = await boot();
  const s = await twoClassesPlaying(env);
  const clients = s.clients;
  try {
    // 게임을 시작해 자리가 남는 상태로 만든다 (대기방에서 끊기면 자리가 정리됩니다)
    s.aStudent.send({ t: 'addBot' });
    await s.aStudent.next(function (m) { return m.t === 'room' && m.room.seats.some(function (x) { return x.isBot; }); });
    s.aStudent.send({ t: 'start' });
    await s.aStudent.next(function (m) { return m.t === 'room' && m.room.status === 'playing'; });

    const joined = s.aStudent.raw.find(function (m) { return m.t === 'joined'; });
    assert.ok(joined && joined.token);

    // A반 학생이 끊겼다가 다시 접속
    s.aStudent.close();
    await new Promise(function (r) { setTimeout(r, 80); });

    const back = await connect(env.ws);
    clients.push(back);
    await back.next('welcome');
    back.send({ t: 'resume', gameId: 'halligalli', code: '1', classCode: s.a.code, token: joined.token });
    const resumed = await back.next(function (m) { return m.t === 'joined' && m.resumed; });
    assert.equal(resumed.classCode, s.a.code);
    assert.equal(resumed.playerId, joined.playerId, '같은 자리로 돌아온다');

    // 같은 토큰으로 다른 반을 노리면 거절
    const thief = await connect(env.ws);
    clients.push(thief);
    await thief.next('welcome');
    thief.send({ t: 'resume', gameId: 'halligalli', code: '1', classCode: s.b.code, token: joined.token });
    const noSeat = await thief.next('error');
    assert.equal(noSeat.code, 'no_seat');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('한 연결이 다른 반으로 옮겨 가면 보던 방·교사 권한을 먼저 정리한다', async function () {
  const env = await boot();
  const s = await twoClassesPlaying(env);
  const clients = s.clients;
  try {
    // A반 교사로 인증한 연결이 B반으로 입장(classEnter)
    s.a.client.send({ t: 'classAuth', code: s.a.code, pin: '1111' });
    await s.a.client.next('class_auth_ok');
    s.a.client.send({ t: 'classEnter', code: s.b.code });
    await s.a.client.next('class_entered');

    // 이제 이 연결은 B반이다 → B반 관전은 PIN 없이 되지 않는다
    s.a.client.send({ t: 'spectate', gameId: 'halligalli', code: '1', classCode: s.b.code });
    const denied = await s.a.client.next('error');
    assert.equal(denied.code, 'teacher_auth_required', '다른 반으로 옮기면 교사 권한은 다시 확인해야 한다');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});
