'use strict';

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
          throw new Error('메시지 대기 시간 초과. 최근: ' + JSON.stringify(queue.slice(-3)));
        }
      });
    });
  });
}

async function boot() {
  const hub = createHub({ groupCapacity: 4 });
  const info = await hub.start(0, '127.0.0.1');
  return {
    hub: hub,
    port: info.port,
    http: 'http://127.0.0.1:' + info.port,
    ws: 'ws://127.0.0.1:' + info.port + '/ws'
  };
}

function findRoomMsg(client, code) {
  return function (m) {
    return m.t === 'room' && m.room && m.room.code === code;
  };
}

/* ---------------- HTTP ---------------- */

test('HTTP: 첫 화면과 health, 공용 엔진 파일을 제공한다', async function () {
  const env = await boot();
  try {
    const home = await fetch(env.http + '/');
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /보드게임천국/);
    assert.match(html, /engine\.js/);

    const health = await fetch(env.http + '/health');
    assert.equal(health.status, 200);
    const info = await health.json();
    assert.equal(info.ok, true);
    assert.equal(info.rooms, 66, '11개 모둠 게임(과일 딩동·마블·줄세우기·오목·라이어·윷놀이·타일 러미·도둑잡기·장기·컬러 카드·선 긋기) × 6모둠');

    const engine = await fetch(env.http + '/engine.js');
    assert.equal(engine.status, 200);
    const src = await engine.text();
    assert.match(src, /class Game/);

    const missing = await fetch(env.http + '/no-such-file.js');
    assert.equal(missing.status, 404);
  } finally {
    await env.hub.close();
  }
});

/* ---------------- 방 입장과 게임 진행 ---------------- */

test('6개 모둠 방이 열려 있고, 입장 → 준비 → 시작 → 뒤집기 → 종 정답이 서버에서 판정된다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    const welcome = await a.next('welcome');
    const groups = welcome.rooms.filter(function (r) { return r.isGroup && r.gameId === 'halligalli'; });
    assert.equal(groups.length, 6);
    assert.deepEqual(groups.map(function (r) { return r.code; }), ['1', '2', '3', '4', '5', '6']);
    assert.equal(groups[0].capacity, 4);

    // 1모둠 입장
    a.send({ t: 'join', gameId: 'halligalli', code: '1', nickname: '학생1' });
    const joinedA = await a.next('joined');
    assert.equal(joinedA.code, '1');
    assert.ok(joinedA.token);
    const roomA = await a.next(findRoomMsg(a, '1'));
    assert.equal(roomA.room.status, 'waiting');
    assert.equal(roomA.room.seats.length, 1);
    assert.equal(roomA.room.youAreHost, true);

    // 같은 방 두 번째 학생
    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'halligalli', code: '1', nickname: '학생2' });
    await b.next('joined');
    const roomB = await b.next(findRoomMsg(b, '1'));
    assert.equal(roomB.room.seats.length, 2);
    assert.equal(roomB.room.youAreHost, false);

    // 준비 → 시작
    b.send({ t: 'ready', ready: true });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '1' && m.room.seats.some(function (s) { return s.name === '학생2' && s.ready; });
    });
    a.send({ t: 'start' });
    const started = await a.next(function (m) {
      return m.t === 'room' && m.room.code === '1' && m.room.status === 'playing';
    });
    assert.equal(started.room.game.players.length, 2);
    assert.equal(started.room.game.totalCards, 56);

    // 현재 차례인 학생이 카드를 뒤집는다
    const turnId = started.room.game.turn;
    const turnClient = turnId === started.room.youId ? a : b;
    const turnSeat = a === turnClient ? joinedA.playerId : null;
    turnClient.send({ t: 'action', action: 'flip' });
    const flipped = await a.next(function (m) {
      return m.t === 'room' && m.room.code === '1' && m.room.status === 'playing' &&
        m.room.game.tableCount > 0;
    });
    assert.equal(flipped.room.game.tableCount, 1);
    assert.equal(flipped.room.game.totalCards, 56);

    // 서버 상태를 직접 만들어 '라임 5개' 상황을 만든 뒤 종을 친다
    const room = env.hub.getRoom('halligalli', '1');
    const game = room.game;
    game.players[0].pile = [{ id: 'x1', fruit: 'lime', count: 3 }];
    game.players[1].pile = [{ id: 'x2', fruit: 'lime', count: 2 }];
    game.bellLockUntil = 0;
    assert.deepEqual(game.bellFruits(), ['lime']);

    const ringerId = joinedA.playerId;
    a.send({ t: 'action', action: 'ring' });
    const correct = await a.next(function (m) {
      return m.t === 'room' && m.room.code === '1' && m.room.game && m.room.game.tableCount === 0 &&
        m.room.game.log.some(function (e) { return e.type === 'bell-correct'; });
    });
    assert.equal(correct.room.game.bellFruits.length, 0);
    assert.equal(correct.room.game.bells.correct, 1);
    assert.equal(game.playerById(ringerId).deck.length >= 1, true);

    // 직후 연타는 잠금으로 거부된다
    b.send({ t: 'action', action: 'ring' });
    const locked = await b.next('action_result');
    assert.equal(locked.ok, false);
    assert.equal(locked.reason, 'bell_locked');

    // 진행 중인 방에는 새로 입장할 수 없다
    const c = await connect(env.ws);
    clients.push(c);
    await c.next('welcome');
    c.send({ t: 'join', gameId: 'halligalli', code: '1', nickname: '학생3' });
    const denied = await c.next('error');
    assert.equal(denied.code, 'playing');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('교사 관전: 6개 모둠 요약을 받고, 관전자는 게임에 참여할 수 없다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '2', nickname: '모둠원' });
    await a.next('joined');
    a.send({ t: 'addBot' });
    a.send({ t: 'addBot' });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '2' && m.room.seats.filter(function (s) { return s.isBot; }).length === 2;
    });
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.code === '2' && m.room.status === 'playing'; });

    const teacher = await connect(env.ws);
    clients.push(teacher);
    await teacher.next('welcome');
    teacher.send({ t: 'overview', gameId: 'halligalli' });
    const rooms = await teacher.next('rooms');
    assert.equal(rooms.rooms.length, 6);
    const room2 = rooms.rooms.find(function (r) { return r.code === '2'; });
    assert.equal(room2.status, 'playing');
    assert.equal(room2.playerCount, 3);
    assert.ok(room2.turnName);
    assert.ok(room2.lastEvent);
    assert.equal(room2.players.length, 3);

    // 관전 입장
    teacher.send({ t: 'spectate', gameId: 'halligalli', code: '2' });
    await teacher.next('spectating');
    const view = await teacher.next(findRoomMsg(teacher, '2'));
    assert.equal(view.room.role, 'spectator');
    assert.equal(view.room.youId, null);
    assert.ok(view.room.game);

    // 관전자는 종/카드 조작 불가
    teacher.send({ t: 'action', action: 'ring' });
    const rejected = await teacher.next('error');
    assert.equal(rejected.code, 'spectator');

    // 관전 종료
    teacher.send({ t: 'stopSpectate' });
    await teacher.next('left');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('모둠 방 정원(4명)을 넘으면 입장이 거부된다', async function () {
  const env = await boot();
  const clients = [];
  try {
    for (let i = 1; i <= 4; i++) {
      const c = await connect(env.ws);
      clients.push(c);
      await c.next('welcome');
      c.send({ t: 'join', gameId: 'halligalli', code: '3', nickname: '학생' + i });
      await c.next('joined');
    }
    const extra = await connect(env.ws);
    clients.push(extra);
    await extra.next('welcome');
    extra.send({ t: 'join', gameId: 'halligalli', code: '3', nickname: '학생5' });
    const err = await extra.next('error');
    assert.equal(err.code, 'full');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('같은 닉네임으로는 같은 방에 들어갈 수 없다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    const b = await connect(env.ws);
    clients.push(a, b);
    await a.next('welcome');
    await b.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '4', nickname: '지원' });
    await a.next('joined');
    b.send({ t: 'join', gameId: 'halligalli', code: '4', nickname: '지원' });
    const err = await b.next('error');
    assert.equal(err.code, 'dup_name');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('새 방 만들기와 토큰으로 재접속(resume)이 동작한다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'create', gameId: 'halligalli', nickname: '선생님' });
    const joined = await a.next('joined');
    assert.equal(joined.created, true);
    assert.equal(joined.code.length, 4);
    await a.next(findRoomMsg(a, joined.code));

    const again = await connect(env.ws);
    clients.push(again);
    await again.next('welcome');
    again.send({ t: 'resume', gameId: 'halligalli', code: joined.code, token: joined.token });
    const resumed = await again.next('joined');
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.playerId, joined.playerId);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('연결이 끊긴 플레이어는 자동 플레이로 바뀌고 게임이 멈추지 않는다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '5', nickname: '학생' });
    const joined = await a.next('joined');
    a.send({ t: 'addBot' });
    a.send({ t: 'addBot' });
    a.send({ t: 'addBot' });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '5' && m.room.seats.filter(function (s) { return s.isBot; }).length === 3;
    });
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.code === '5' && m.room.status === 'playing'; });

    const room = env.hub.getRoom('halligalli', '5');
    assert.equal(room.game.players.length, 4);

    a.close();
    await new Promise(function (r) { setTimeout(r, 250); });
    assert.equal(room.seats[0].autoPilot, true, '끊긴 플레이어는 자동 플레이');
    assert.equal(room.game.playerById(joined.playerId).isBot, true);

    // 봇들이 이어서 플레이한다 (진행 중이거나 종료)
    await new Promise(function (r) { setTimeout(r, 900); });
    assert.ok(['playing', 'finished'].indexOf(room.game.status) !== -1);
    assert.equal(room.game.totalCards(), 56);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- 방 나가기 · 게임 종료 · 방 초기화 ---------------- */

async function startRoomWithBots(env, clients, code, nickname, bots) {
  const a = await connect(env.ws);
  clients.push(a);
  await a.next('welcome');
  a.send({ t: 'join', gameId: 'halligalli', code: code, nickname: nickname });
  const joined = await a.next('joined');
  for (let i = 0; i < bots; i++) a.send({ t: 'addBot' });
  await a.next(function (m) {
    return m.t === 'room' && m.room.code === code &&
      m.room.seats.filter(function (s) { return s.isBot; }).length === bots;
  });
  a.send({ t: 'start' });
  await a.next(function (m) { return m.t === 'room' && m.room.code === code && m.room.status === 'playing'; });
  return { client: a, joined: joined };
}

test('게임 중 방 나가기: 자리가 사라지고, 남은 사람이 없으면 대기 상태(0명)로 자동 초기화된다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const started = await startRoomWithBots(env, clients, '6', '나가기', 3);
    const room = env.hub.getRoom('halligalli', '6');
    assert.equal(room.seats.length, 4);
    assert.ok(room.game);

    started.client.send({ t: 'leave' });
    await started.client.next('left');

    // 사람이 0명 → 봇만 남았으므로 모둠 방은 대기 상태 0/4로 초기화
    assert.equal(room.game, null, '게임이 정리된다');
    assert.equal(room.seats.length, 0, '참가자 자리가 모두 비워진다');
    assert.equal(room.status, undefined, '방 자체는 남아 있다');

    const overview = await connect(env.ws);
    clients.push(overview);
    await overview.next('welcome');
    overview.send({ t: 'overview', gameId: 'halligalli' });
    const rooms = await overview.next('rooms');
    const room6 = rooms.rooms.find(function (r) { return r.code === '6'; });
    assert.equal(room6.status, 'waiting');
    assert.equal(room6.playerCount, 0);
    assert.equal(room6.humanCount, 0);
    assert.equal(room6.botCount, 0);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('게임 중 한 명이 나가도 남은 사람의 게임은 이어지고, 나간 자리는 자동 플레이가 된다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '5', nickname: '남는이' });
    await a.next('joined');

    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'halligalli', code: '5', nickname: '나가는이' });
    const joinedB = await b.next('joined');
    b.send({ t: 'ready', ready: true });
    a.send({ t: 'addBot' });
    a.send({ t: 'addBot' });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '5' && m.room.seats.length === 4 && m.room.seats.some(function (s) { return s.name === '나가는이' && s.ready; });
    });
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.code === '5' && m.room.status === 'playing'; });

    const room = env.hub.getRoom('halligalli', '5');
    assert.ok(room.game);
    assert.equal(room.game.players.length, 4);

    // 한 명이 나가면 자리는 정리되지만 게임은 이어지고, 나간 사람 자리는 자동 플레이가 된다
    b.send({ t: 'leave' });
    await b.next('left');
    assert.equal(room.seats.length, 3, '나간 사람 자리는 사라진다');
    assert.equal(room.seats.some(function (s) { return s.name === '나가는이'; }), false);
    assert.ok(room.game, '게임은 계속된다');
    assert.equal(room.game.playerById(joinedB.playerId).isBot, true, '나간 자리는 자동 플레이');
    assert.equal(room.seats[0].name, '남는이');
    assert.equal(room.hostId, room.seats[0].id, '남은 사람이 방장이 된다');

    // 마지막 사람까지 나가면 봇만 남으므로 대기 상태로 자동 초기화
    a.send({ t: 'leave' });
    await a.next('left');
    assert.equal(room.seats.length, 0);
    assert.equal(room.game, null);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('방장이 게임 종료를 누르면 대기실로 돌아오고 봇은 남아 바로 다시 시작할 수 있다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '4', nickname: '방장' });
    await a.next('joined');
    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'halligalli', code: '4', nickname: '친구' });
    await b.next('joined');
    b.send({ t: 'ready', ready: true });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '4' && m.room.seats.some(function (s) { return s.name === '친구' && s.ready; });
    });
    a.send({ t: 'addBot' });
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.code === '4' && m.room.status === 'playing'; });

    a.send({ t: 'endGame' });
    const lobby = await a.next(function (m) {
      return m.t === 'room' && m.room.code === '4' && m.room.status === 'waiting';
    });
    assert.equal(lobby.room.game, null);
    const room = env.hub.getRoom('halligalli', '4');
    assert.equal(room.seats.filter(function (s) { return !s.isBot; }).length, 2, '사람은 그대로 남는다');
    assert.equal(room.seats.filter(function (s) { return s.isBot; }).length, 1, '봇도 남아 바로 다시 시작할 수 있다');
    assert.equal(room.hostId, room.seats[0].id);
    assert.ok(room.seats.every(function (s) { return s.isBot || s.ready === false; }));

    // 방장이 아니면 게임 종료를 할 수 없다
    b.send({ t: 'endGame' });
    const denied = await b.next(function (m) { return m.t === 'error' && m.code === 'not_host'; });
    assert.equal(denied.code, 'not_host');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('교사가 진행 중인 모둠 방을 초기화하면 참가자가 정리되고 대기 상태가 된다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const started = await startRoomWithBots(env, clients, '3', '학생', 2);
    const room = env.hub.getRoom('halligalli', '3');
    assert.ok(room.game);

    // 참가 중인 학생은 방을 초기화할 수 없다
    started.client.send({ t: 'resetRoom', gameId: 'halligalli', code: '3' });
    const denied = await started.client.next(function (m) { return m.t === 'error' && m.code === 'not_teacher'; });
    assert.equal(denied.code, 'not_teacher');

    const teacher = await connect(env.ws);
    clients.push(teacher);
    await teacher.next('welcome');
    teacher.send({ t: 'overview', gameId: 'halligalli' });
    const rooms = await teacher.next('rooms');
    assert.equal(rooms.rooms.find(function (r) { return r.code === '3'; }).status, 'playing');

    teacher.send({ t: 'resetRoom', gameId: 'halligalli', code: '3' });
    const own = await teacher.next(function (m) { return m.t === 'room_reset' && m.self === true; });
    assert.match(own.message, /초기화/);
    const kicked = await started.client.next('room_reset');
    assert.match(kicked.message, /선생님/);

    assert.equal(room.game, null);
    assert.equal(room.seats.length, 0);
    const overview = await teacher.next(function (m) {
      return m.t === 'rooms' && m.rooms.some(function (r) { return r.code === '3' && r.status === 'waiting'; });
    });
    assert.equal(overview.rooms.find(function (r) { return r.code === '3'; }).playerCount, 0);

    // 초기화 뒤에는 새 학생이 다시 들어올 수 있다
    started.client.send({ t: 'join', gameId: 'halligalli', code: '3', nickname: '새학생' });
    const rejoin = await started.client.next('joined');
    assert.equal(rejoin.code, '3');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- 방장 강퇴(내보내기) ---------------- */

test('방장만 참가자를 내보낼 수 있고, 내보낸 사람은 안내를 받은 뒤 다시 입장할 수 있다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '4', number: 1, studentName: '방장' });
    const joinedA = await a.next('joined');

    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'halligalli', code: '4', number: 5, studentName: '친구' });
    const joinedB = await b.next('joined');
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '4' && m.room.seats.length === 2;
    });

    // 방장이 아니면 내보낼 수 없다
    b.send({ t: 'kickPlayer', playerId: joinedA.playerId });
    const notHost = await b.next(function (m) { return m.t === 'error' && m.code === 'not_host'; });
    assert.equal(notHost.code, 'not_host');

    // 자기 자신은 내보낼 수 없다
    a.send({ t: 'kickPlayer', playerId: joinedA.playerId });
    const self = await a.next(function (m) { return m.t === 'error' && m.code === 'kick_self'; });
    assert.match(self.message, /자기 자신/);

    // 봇은 봇 내보내기로
    a.send({ t: 'addBot' });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '4' && m.room.seats.some(function (s) { return s.isBot; });
    });
    const room = env.hub.getRoom('halligalli', '4');
    const bot = room.seats.find(function (s) { return s.isBot; });
    a.send({ t: 'kickPlayer', playerId: bot.id });
    const botErr = await a.next(function (m) { return m.t === 'error' && m.code === 'is_bot'; });
    assert.match(botErr.message, /봇/);

    // 방장이 친구를 내보낸다
    a.send({ t: 'kickPlayer', playerId: joinedB.playerId });
    const kicked = await b.next('kicked');
    assert.equal(kicked.code, '4');
    assert.equal(kicked.gameId, 'halligalli');
    assert.match(kicked.message, /방장이/);
    assert.match(kicked.message, /다시 들어올 수 있어요/);
    const done = await a.next(function (m) { return m.t === 'action_result' && m.ok === true; });
    assert.match(done.message, /내보냈습니다/);

    const after = await a.next(function (m) {
      return m.t === 'room' && m.room.code === '4' && m.room.seats.length === 2 &&
        m.room.seats.some(function (s) { return s.isBot; }) &&
        !m.room.seats.some(function (s) { return s.id === joinedB.playerId; });
    });
    assert.equal(after.room.seats.length, 2, '방장 + 봇만 남는다');
    assert.equal(after.room.youAreHost, true);
    assert.equal(room.seats.some(function (s) { return s.id === joinedB.playerId; }), false);

    // 내보낸 사람은 같은 번호로 다시 들어올 수 있다 (영구 차단 아님)
    b.send({ t: 'join', gameId: 'halligalli', code: '4', number: 5, studentName: '친구' });
    const rejoin = await b.next('joined');
    assert.equal(rejoin.code, '4');
    assert.equal(rejoin.number, 5);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('게임 중 방장이 내보내면 그 자리는 자동 플레이로 바뀌고 게임은 이어진다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '2', number: 1, studentName: '방장' });
    await a.next('joined');

    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'halligalli', code: '2', number: 2, studentName: '늦친구' });
    const joinedB = await b.next('joined');
    b.send({ t: 'ready', ready: true });
    a.send({ t: 'addBot' });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '2' && m.room.seats.length === 3 &&
        m.room.seats.some(function (s) { return s.id === joinedB.playerId && s.ready; });
    });
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.code === '2' && m.room.status === 'playing'; });

    const room = env.hub.getRoom('halligalli', '2');
    assert.equal(room.game.playerById(joinedB.playerId).isBot, false);

    a.send({ t: 'kickPlayer', playerId: joinedB.playerId });
    const kicked = await b.next('kicked');
    assert.match(kicked.message, /내보냈습니다/);

    assert.equal(room.seats.some(function (s) { return s.id === joinedB.playerId; }), false, '내보낸 자리는 정리된다');
    assert.ok(room.game, '게임은 계속된다');
    assert.equal(room.game.status, 'playing');
    assert.equal(room.game.playerById(joinedB.playerId).isBot, true, '내보낸 자리는 자동 플레이');

    // 게임 중에는 다시 들어올 수 없다 (끝난 뒤에 가능)
    b.send({ t: 'join', gameId: 'halligalli', code: '2', number: 2, studentName: '늦친구' });
    const denied = await b.next(function (m) { return m.t === 'error' && m.code === 'playing'; });
    assert.equal(denied.code, 'playing');

    // 방장이 게임을 끝내면 대기실로 돌아오고, 그때는 다시 들어올 수 있다
    a.send({ t: 'endGame' });
    await a.next(function (m) { return m.t === 'room' && m.room.code === '2' && m.room.status === 'waiting'; });
    b.send({ t: 'join', gameId: 'halligalli', code: '2', number: 2, studentName: '늦친구' });
    const rejoin = await b.next('joined');
    assert.equal(rejoin.number, 2);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

test('인터넷이 끊겨 남은 자리(자동 플레이)도 방장이 내보내 정리할 수 있다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    await a.next('welcome');
    a.send({ t: 'join', gameId: 'halligalli', code: '5', number: 1, studentName: '방장' });
    await a.next('joined');

    const ghost = await connect(env.ws);
    clients.push(ghost);
    await ghost.next('welcome');
    ghost.send({ t: 'join', gameId: 'halligalli', code: '5', number: 9, studentName: '끊긴친구' });
    const joinedGhost = await ghost.next('joined');
    ghost.send({ t: 'ready', ready: true });
    a.send({ t: 'addBot' });
    a.send({ t: 'addBot' });
    await a.next(function (m) {
      return m.t === 'room' && m.room.code === '5' && m.room.seats.length === 4 &&
        m.room.seats.some(function (s) { return s.id === joinedGhost.playerId && s.ready; });
    });
    a.send({ t: 'start' });
    await a.next(function (m) { return m.t === 'room' && m.room.code === '5' && m.room.status === 'playing'; });
    const room = env.hub.getRoom('halligalli', '5');

    // 게임 중 연결이 끊긴다 → 자리는 남고 자동 플레이로 바뀐다
    ghost.close();
    const seen = await a.next(function (m) {
      return m.t === 'room' && m.room.code === '5' &&
        m.room.seats.some(function (s) { return s.id === joinedGhost.playerId && !s.connected; });
    });
    assert.ok(seen, '끊긴 자리가 남아 있다');
    const before = room.seats.length;
    assert.equal(before, 4);

    // 방장이 끊긴 자리를 내보내 정리한다
    a.send({ t: 'kickPlayer', playerId: joinedGhost.playerId });
    const after = await a.next(function (m) {
      return m.t === 'room' && m.room.code === '5' && m.room.seats.length === before - 1 &&
        !m.room.seats.some(function (s) { return s.id === joinedGhost.playerId; });
    });
    assert.equal(after.room.seats.length, before - 1, '끊긴 자리가 사라진다');
    assert.ok(room.game && room.game.playerById(joinedGhost.playerId).isBot, '게임은 자동 플레이로 이어진다');
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});
