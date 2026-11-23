'use strict';

/*
 * 반(교실) 코드 · 반별 방 격리 · 교사 PIN 인증 · 출석번호 입장 · 포인트 적립 테스트
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
          throw new Error('메시지 대기 시간 초과. 최근: ' + JSON.stringify(queue.slice(-4)));
        }
      });
    });
  });
}

async function boot(options) {
  const hub = createHub(Object.assign({ groupCapacity: 4, store: false }, options || {}));
  const info = await hub.start(0, '127.0.0.1');
  return {
    hub: hub,
    port: info.port,
    http: 'http://127.0.0.1:' + info.port,
    ws: 'ws://127.0.0.1:' + info.port + '/ws'
  };
}

async function newClass(env, client, spec) {
  const c = client || await connect(env.ws);
  await c.next('welcome');
  c.send({ t: 'classCreate', teacherCode: 'easy', name: spec.name || '테스트 반', pin: spec.pin || '2451', code: spec.code });
  const created = await c.next('class_created');
  return { client: c, created: created, code: created.code };
}

function roomMsg(code, classCode) {
  return function (m) {
    return m.t === 'room' && m.room && m.room.code === code &&
      (!classCode || m.room.classCode === classCode);
  };
}

/* ---------------- 반 만들기 ---------------- */

test('교사 개설 암호가 맞지 않으면 반을 만들지 않는다', async function () {
  const env = await boot();
  const c = await connect(env.ws);
  try {
    await c.next('welcome');
    c.send({ t: 'classCreate', teacherCode: 'wrong-code', name: '몰래 만든 반', pin: '2451' });
    const err = await c.next('error');
    assert.equal(err.code, 'bad_teacher_code');
    assert.match(err.message, /개설 암호/);
    assert.equal(env.hub.classes.size, 1, '기본 연습 교실 외에는 만들어지지 않는다');

    // 암호를 아예 보내지 않아도 만들 수 없다
    c.send({ t: 'classCreate', name: '암호 없는 반', pin: '2451' });
    const err2 = await c.next('error');
    assert.equal(err2.code, 'bad_teacher_code');
  } finally {
    c.close();
    await env.hub.close();
  }
});

test('반 만들기: 반 코드·전용 링크를 발급하고 PIN은 해시로만 저장한다', async function () {
  const env = await boot();
  const c = await connect(env.ws);
  try {
    await c.next('welcome');
    c.send({ t: 'classCreate', teacherCode: 'easy', name: '3학년 2반', pin: '2451' });
    const created = await c.next('class_created');
    assert.equal(created.name, '3학년 2반');
    assert.match(created.code, /^[A-Z0-9]{5}$/);
    assert.equal(created.link, '/?class=' + created.code);
    assert.ok(created.teacherToken);

    const cls = env.hub.getClass(created.code);
    assert.ok(cls);
    assert.notEqual(cls.pinHash, '2451');
    assert.equal(cls.pin, undefined, 'PIN 원문은 어디에도 남기지 않는다');

    // 그 반에는 1~6모둠 방이 따로 열린다
    c.send({ t: 'overview', gameId: 'halligalli', classCode: created.code });
    const rooms = await c.next(function (m) {
      return m.t === 'rooms' && m.classCode === created.code && m.gameId === 'halligalli';
    });
    assert.deepEqual(rooms.rooms.map(function (r) { return r.code; }), ['1', '2', '3', '4', '5', '6']);
    assert.ok(rooms.rooms.every(function (r) { return r.classCode === created.code; }));

    // 읽기 전용 API
    const info = await fetch(env.http + '/api/classes/' + created.code);
    assert.equal(info.status, 200);
    const body = await info.json();
    assert.equal(body.class.name, '3학년 2반');
    assert.equal(body.class.linkPath, '/?class=' + created.code);
    assert.equal(JSON.stringify(body).includes('pin'), false);

    // 같은 코드로 또 만들 수 없다
    const other = await connect(env.ws);
    await other.next('welcome');
    other.send({ t: 'classCreate', teacherCode: 'easy', name: '다른 반', pin: '1111', code: created.code });
    const denied = await other.next('error');
    assert.equal(denied.code, 'class_exists');
    other.close();
  } finally {
    c.close();
    await env.hub.close();
  }
});

test('반 코드를 직접 정할 수 있고, 형식이 틀리면 거절한다', async function () {
  const env = await boot();
  const c = await connect(env.ws);
  try {
    await c.next('welcome');
    c.send({ t: 'classCreate', teacherCode: 'easy', name: '5학년 1반', pin: '1234', code: '5-1ban' });
    const created = await c.next('class_created');
    assert.equal(created.code, '51BAN');

    const bad = await connect(env.ws);
    await bad.next('welcome');
    bad.send({ t: 'classCreate', teacherCode: 'easy', name: 'x', pin: '1234', code: '5-1ban' });
    const err = await bad.next('error');
    assert.equal(err.code, 'class_exists', '이미 쓰는 코드(대소문자 무시)는 거절');
    bad.close();

    const bad2 = await connect(env.ws);
    await bad2.next('welcome');
    bad2.send({ t: 'classCreate', teacherCode: 'easy', name: '반', pin: '12' });
    const err2 = await bad2.next('error');
    assert.equal(err2.code, 'bad_pin', 'PIN은 4자리 이상 숫자');
    bad2.close();
  } finally {
    c.close();
    await env.hub.close();
  }
});

/* ---------------- 반별 격리 ---------------- */

test('반마다 1모둠 방이 따로 있어 다른 반 학생·모둠과 섞이지 않는다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await newClass(env, null, { name: 'A반', pin: '1111' });
    clients.push(a.client);
    const b = await newClass(env, null, { name: 'B반', pin: '2222' });
    clients.push(b.client);

    a.client.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: a.code, number: 1 });
    const joinedA = await a.client.next('joined');
    assert.equal(joinedA.classCode, a.code);
    const roomA = await a.client.next(roomMsg('1', a.code));
    assert.equal(roomA.room.seats.length, 1);
    assert.equal(roomA.room.seats[0].name, '1번');

    // B반의 1모둠은 여전히 비어 있다
    b.client.send({ t: 'overview', gameId: 'halligalli', classCode: b.code });
    const roomsB = await b.client.next(function (m) { return m.t === 'rooms' && m.classCode === b.code; });
    assert.equal(roomsB.rooms.find(function (r) { return r.code === '1'; }).playerCount, 0);

    // 같은 번호라도 다른 반이면 들어갈 수 있다
    b.client.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: b.code, number: 1 });
    const joinedB = await b.client.next('joined');
    assert.equal(joinedB.classCode, b.code);
    const roomB = await b.client.next(roomMsg('1', b.code));
    assert.equal(roomB.room.seats.length, 1);

    // A반 방에는 B반 학생이 없다
    a.client.send({ t: 'overview', gameId: 'halligalli', classCode: a.code });
    const roomsA = await a.client.next(function (m) {
      if (m.t !== 'rooms' || m.classCode !== a.code) return false;
      const one = m.rooms.find(function (r) { return r.code === '1'; });
      return !!one && one.playerCount === 1;
    });
    assert.equal(roomsA.rooms.find(function (r) { return r.code === '1'; }).playerCount, 1);
    assert.deepEqual(roomsA.rooms.find(function (r) { return r.code === '1'; }).seats.map(function (s) { return s.name; }), ['1번']);

    // 이미 A반에 묶인 연결은 B반 방으로 들어올 수 없다
    const intruder = await connect(env.ws);
    clients.push(intruder);
    await intruder.next('welcome');
    intruder.send({ t: 'classEnter', code: a.code });
    await intruder.next('class_entered');
    intruder.send({ t: 'join', gameId: 'halligalli', code: '2', classCode: b.code, number: 2 });
    const denied = await intruder.next('error');
    assert.equal(denied.code, 'no_class');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('없는 반 코드로는 학생이 입장할 수 없다', async function () {
  const env = await boot();
  const c = await connect(env.ws);
  try {
    await c.next('welcome');
    c.send({ t: 'classInfo', code: 'ZZZZZ' });
    const info = await c.next('class_info');
    assert.equal(info.exists, false);

    c.send({ t: 'classEnter', code: 'ZZZZZ' });
    const err = await c.next('error');
    assert.equal(err.code, 'no_class');
  } finally {
    c.close();
    await env.hub.close();
  }
});

/* ---------------- 교사 PIN 인증 ---------------- */

test('교사 관전·방 초기화는 반 PIN 인증(또는 교사 토큰)이 있어야 한다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const made = await newClass(env, null, { name: '4학년 3반', pin: '9182' });
    clients.push(made.client);
    const code = made.code;

    // 학생 입장
    const student = await connect(env.ws);
    clients.push(student);
    await student.next('welcome');
    student.send({ t: 'join', gameId: 'halligalli', code: '2', classCode: code, number: 7 });
    await student.next('joined');
    await student.next(roomMsg('2', code));

    // 인증 없이 관전/초기화 → 거절
    const teacher = await connect(env.ws);
    clients.push(teacher);
    await teacher.next('welcome');
    teacher.send({ t: 'spectate', gameId: 'halligalli', code: '2', classCode: code });
    const spectateDenied = await teacher.next('error');
    assert.equal(spectateDenied.code, 'teacher_auth_required');

    teacher.send({ t: 'resetRoom', gameId: 'halligalli', code: '2', classCode: code });
    const resetDenied = await teacher.next('error');
    assert.equal(resetDenied.code, 'teacher_auth_required');

    // 틀린 PIN
    teacher.send({ t: 'classAuth', code: code, pin: '0000' });
    const badPin = await teacher.next('error');
    assert.equal(badPin.code, 'bad_pin');

    // 맞는 PIN
    teacher.send({ t: 'classAuth', code: code, pin: '9182' });
    const ok = await teacher.next('class_auth_ok');
    assert.equal(ok.class.code, code);
    assert.ok(ok.teacherToken);

    teacher.send({ t: 'spectate', gameId: 'halligalli', code: '2', classCode: code });
    await teacher.next('spectating');
    const view = await teacher.next(roomMsg('2', code));
    assert.equal(view.room.role, 'spectator');

    teacher.send({ t: 'resetRoom', gameId: 'halligalli', code: '2', classCode: code });
    const own = await teacher.next(function (m) { return m.t === 'room_reset' && m.self === true; });
    assert.match(own.message, /초기화/);
    const kicked = await student.next('room_reset');
    assert.match(kicked.message, /선생님/);

    // 학생(참가자)은 초기화 불가
    student.send({ t: 'join', gameId: 'halligalli', code: '2', classCode: code, number: 7 });
    await student.next('joined');
    student.send({ t: 'resetRoom', gameId: 'halligalli', code: '2', classCode: code });
    const notTeacher = await student.next('error');
    assert.equal(notTeacher.code, 'not_teacher');

    // 다른 연결에서도 교사 토큰으로 다시 인증할 수 있다
    const again = await connect(env.ws);
    clients.push(again);
    await again.next('welcome');
    again.send({ t: 'classAuth', code: code, token: ok.teacherToken });
    const againOk = await again.next('class_auth_ok');
    assert.equal(againOk.class.code, code);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('다른 반의 교사 토큰으로는 관전할 수 없다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await newClass(env, null, { name: 'A반', pin: '1111' });
    clients.push(a.client);
    const b = await newClass(env, null, { name: 'B반', pin: '2222' });
    clients.push(b.client);

    const aTeacher = await connect(env.ws);
    clients.push(aTeacher);
    await aTeacher.next('welcome');
    aTeacher.send({ t: 'classAuth', code: a.code, pin: '1111' });
    const aOk = await aTeacher.next('class_auth_ok');

    b.client.send({ t: 'classAuth', code: b.code, token: aOk.teacherToken });
    const denied = await b.client.next('error');
    assert.equal(denied.code, 'bad_pin', '다른 반 토큰은 통하지 않는다');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- 출석번호 ---------------- */

test('학생은 이름 대신 출석번호(1~99)로 입장하고, 화면 이름은 "3번"이 된다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const made = await newClass(env, null, { name: '번호 반', pin: '4321' });
    clients.push(made.client);
    const code = made.code;

    const s1 = await connect(env.ws);
    clients.push(s1);
    await s1.next('welcome');
    s1.send({ t: 'join', gameId: 'halligalli', code: '3', classCode: code, number: 3 });
    const joined = await s1.next('joined');
    assert.equal(joined.name, '3번');
    assert.equal(joined.number, 3);
    const room = await s1.next(roomMsg('3', code));
    assert.equal(room.room.seats[0].name, '3번');
    assert.equal(room.room.seats[0].number, 3);

    // 같은 방 같은 번호는 거절
    const s2 = await connect(env.ws);
    clients.push(s2);
    await s2.next('welcome');
    s2.send({ t: 'join', gameId: 'halligalli', code: '3', classCode: code, number: 3 });
    const dup = await s2.next('error');
    assert.equal(dup.code, 'dup_number');

    // 잘못된 번호는 거절
    for (const bad of ['0', '100', 'abc', '3.5', '-1']) {
      const c = await connect(env.ws);
      clients.push(c);
      await c.next('welcome');
      c.send({ t: 'join', gameId: 'halligalli', code: '4', classCode: code, number: bad });
      const err = await c.next('error');
      assert.equal(err.code, 'bad_number', bad + ' 는 거절되어야 한다');
      c.close();
    }

    // 99번은 허용
    s2.send({ t: 'join', gameId: 'halligalli', code: '4', classCode: code, number: 99 });
    const joined99 = await s2.next('joined');
    assert.equal(joined99.name, '99번');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('학생은 출석번호와 이름을 함께 넣고, 화면·랭킹에 "번호 이름"으로 남는다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const made = await newClass(env, null, { name: '이름 반', pin: '4321' });
    clients.push(made.client);
    const code = made.code;

    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: code, number: 7, studentName: '  김 민수 ' });
    const joined = await a.next('joined');
    assert.equal(joined.name, '7번 김 민수', '번호 + 이름으로 표시된다');
    assert.equal(joined.number, 7);
    assert.equal(joined.studentName, '김 민수', '이름만 따로 전달된다');
    const room = await a.next(roomMsg('1', code));
    assert.equal(room.room.seats[0].name, '7번 김 민수');
    assert.equal(room.room.seats[0].studentName, '김 민수');

    // 이름을 비우면 예전처럼 번호만 표시된다
    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: code, number: 8 });
    const joinedB = await b.next('joined');
    assert.equal(joinedB.name, '8번');
    assert.equal(joinedB.studentName, '');
    b.send({ t: 'ready', ready: true });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '1' &&
        m.room.seats.some(function (s) { return s.number === 8 && s.ready; });
    });

    // 이름이 달라도 같은 번호는 같은 방에 들어올 수 없다
    const c = await connect(env.ws);
    clients.push(c);
    await c.next('welcome');
    c.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: code, number: 7, studentName: '다른이름' });
    const dup = await c.next('error');
    assert.equal(dup.code, 'dup_number');

    // 이름은 10자까지만 남는다
    c.send({ t: 'join', gameId: 'halligalli', code: '2', classCode: code, number: 9, studentName: '가나다라마바사아자차카타파하' });
    const joinedC = await c.next('joined');
    assert.equal(joinedC.studentName, '가나다라마바사아자차');
    assert.equal(joinedC.name, '9번 가나다라마바사아자차');

    // 새 방을 만들 때도 번호 + 이름이 쓰인다
    const d = await connect(env.ws);
    clients.push(d);
    await d.next('welcome');
    d.send({ t: 'create', gameId: 'bluemarble', classCode: code, number: 11, studentName: '박지훈' });
    const created = await d.next('joined');
    assert.equal(created.name, '11번 박지훈');
    assert.equal(created.studentName, '박지훈');

    // 한 판이 끝나면 우리 반 랭킹에도 이름이 남는다
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.code === '1' && m.room.status === 'playing'; });
    const live = env.hub.getRoom('halligalli', '1', code);
    const game = live.game;
    const p7 = game.playerById(joined.playerId);
    const p8 = game.playerById(joinedB.playerId);
    p7.deck = [p7.deck[0] || { id: 'z1', fruit: 'lime', count: 1 }];
    p7.pile = [];
    p8.deck = [];
    p8.pile = [];
    p8.eliminated = true;
    game.turn = p7.seat;
    game.status = 'playing';
    game.finishReason = null;
    game.winnerId = null;
    a.send({ t: 'action', action: 'flip' });

    const result = await a.next('game_result');
    assert.equal(result.ranking.find(function (r) { return r.number === 7; }).name, '7번 김 민수');
    assert.equal(result.stats.find(function (r) { return r.number === 7; }).name, '김 민수');
    assert.equal(result.stats.find(function (r) { return r.number === 8; }).name, '');
    assert.equal(env.hub.classScores(code).find(function (r) { return r.number === 7; }).name, '김 민수');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- 포인트 적립 ---------------- */

test('게임이 끝나면 순위대로 승수·포인트가 우리 반에 쌓이고 랭킹으로 보인다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const made = await newClass(env, null, { name: '포인트 반', pin: '7777' });
    clients.push(made.client);
    const code = made.code;

    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: code, number: 1 });
    const joinedA = await a.next('joined');
    await a.next(roomMsg('1', code));

    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: code, number: 2 });
    const joinedB = await b.next('joined');
    b.send({ t: 'ready', ready: true });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '1' && m.room.classCode === code &&
        m.room.seats.some(function (s) { return s.name === '2번' && s.ready; });
    });

    a.send({ t: 'start' });
    const started = await a.next(function (m) {
      return m.t === 'room' && m.room.code === '1' && m.room.status === 'playing';
    });
    assert.equal(started.room.game.players.length, 2);

    // 1번만 카드 1장을 남기고, 2번은 카드가 없어 탈락한 상태로 만든 뒤
    // 1번이 카드를 뒤집으면 더 낼 사람이 없어 게임이 끝난다.
    const room = env.hub.getRoom('halligalli', '1', code);
    const game = room.game;
    const p1 = game.playerById(joinedA.playerId);
    const p2 = game.playerById(joinedB.playerId);
    p1.deck = [p1.deck[0] || { id: 'z1', fruit: 'lime', count: 1 }];
    p1.pile = [];
    p2.deck = [];
    p2.pile = [];
    p2.eliminated = true;
    game.turn = p1.seat;
    game.status = 'playing';
    game.finishReason = null;
    game.winnerId = null;

    a.send({ t: 'action', action: 'flip' });

    const result = await a.next('game_result');
    assert.equal(result.classCode, code);
    assert.equal(result.ranking[0].number, 1);
    assert.equal(result.ranking[0].rank, 1);
    assert.equal(result.points[1], 100);
    assert.equal(result.points[2], 50);
    assert.deepEqual(result.winners, [1]);
    assert.equal(result.stats.find(function (r) { return r.number === 1; }).wins, 1);
    assert.equal(result.stats.find(function (r) { return r.number === 1; }).points, 100);
    assert.equal(result.stats.find(function (r) { return r.number === 2; }).points, 50);

    // 같은 결과가 2번 적립되지 않는다
    const stored = env.hub.classScores(code);
    assert.equal(stored.find(function (r) { return r.number === 1; }).plays, 1);

    // 새로 접속한 학생도 우리 반 랭킹을 받는다
    const later = await connect(env.ws);
    clients.push(later);
    await later.next('welcome');
    later.send({ t: 'classEnter', code: code });
    await later.next('class_entered');
    const stats = await later.next('class_stats');
    assert.equal(stats.stats[0].number, 1);
    assert.equal(stats.stats[0].points, 100);
    assert.equal(stats.stats[1].number, 2);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('방장이 게임을 중간에 종료하면 포인트를 적립하지 않는다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const made = await newClass(env, null, { name: '종료 반', pin: '8888' });
    clients.push(made.client);
    const code = made.code;

    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '2', classCode: code, number: 5 });
    await a.next('joined');
    a.send({ t: 'addBot' });
    a.send({ t: 'addBot' });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '2' && m.room.seats.filter(function (s) { return s.isBot; }).length === 2;
    });
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.status === 'playing'; });

    a.send({ t: 'endGame' });
    await a.next(function (m) { return m.t === 'room' && m.room.status === 'waiting'; });
    await new Promise(function (r) { setTimeout(r, 80); });
    assert.equal(env.hub.classScores(code).length, 0, '중간 종료는 기록하지 않는다');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- 반 목록 저장 ---------------- */

test('서버를 다시 켜도 만든 반과 PIN이 남아 있다 (파일 저장)', async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-class-'));
  const store = path.join(dir, 'classes.json');
  const first = await boot({ store: true, storePath: store });
  let code = '';
  const c = await connect(first.ws);
  try {
    await c.next('welcome');
    c.send({ t: 'classCreate', teacherCode: 'easy', name: '이어지는 반', pin: '1357' });
    const created = await c.next('class_created');
    code = created.code;
  } finally {
    c.close();
    await first.hub.close();
  }

  const second = await boot({ store: true, storePath: store });
  const again = await connect(second.ws);
  try {
    await again.next('welcome');
    const cls = second.hub.getClass(code);
    assert.ok(cls, '반이 복원되어야 한다');
    assert.equal(cls.name, '이어지는 반');

    again.send({ t: 'classAuth', code: code, pin: '1357' });
    const ok = await again.next('class_auth_ok');
    assert.equal(ok.class.code, code);

    // 1~6모둠 방도 다시 열린다
    again.send({ t: 'overview', gameId: 'halligalli', classCode: code });
    const rooms = await again.next(function (m) {
      return m.t === 'rooms' && m.classCode === code && m.gameId === 'halligalli';
    });
    assert.equal(rooms.rooms.length, 6);
  } finally {
    again.close();
    await second.hub.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
