'use strict';

/*
 * 부루마블 서버 통합 테스트
 * 모둠 방 · 출석번호 입장 · 서버 권위 주사위 · 매입/건설 · 게임 결과 포인트 · 교사 관전/초기화
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { createHub } = require('../server.js');

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

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
          const deadline = Date.now() + (ms || 4000);
          while (Date.now() < deadline) {
            for (let i = 0; i < queue.length; i++) {
              if (!used.has(i) && testFn(queue[i])) {
                used.add(i);
                return queue[i];
              }
            }
            await sleep(12);
          }
          throw new Error('메시지 대기 시간 초과. 최근: ' + JSON.stringify(queue.slice(-4)));
        }
      });
    });
  });
}

async function boot() {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  return {
    hub: hub,
    port: info.port,
    http: 'http://127.0.0.1:' + info.port,
    ws: 'ws://127.0.0.1:' + info.port + '/ws'
  };
}

function lastRoom(client, code) {
  for (let i = client.raw.length - 1; i >= 0; i--) {
    const m = client.raw[i];
    if (m.t === 'room' && m.room && m.room.code === code && m.room.gameId === 'bluemarble') return m.room;
  }
  return null;
}

async function waitRoom(client, code, pred, label) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const room = lastRoom(client, code);
    if (room && pred(room)) return room;
    await sleep(20);
  }
  throw new Error('방 상태 대기 실패: ' + label);
}

/* ---------------- 방 구성 ---------------- */

test('부루마블 모둠 방 6개가 열려 있고 2명이 입장해 서버가 시작한다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    clients.push(a);
    const welcome = await a.next('welcome');
    const groups = welcome.rooms.filter(function (r) { return r.isGroup && r.gameId === 'bluemarble'; });
    assert.equal(groups.length, 6);
    assert.deepEqual(groups.map(function (r) { return r.code; }), ['1', '2', '3', '4', '5', '6']);
    assert.ok(groups.every(function (r) { return r.capacity === 4; }));

    a.send({ t: 'join', gameId: 'bluemarble', code: '1', number: 1 });
    const joinedA = await a.next('joined');
    assert.equal(joinedA.gameId, 'bluemarble');
    assert.equal(joinedA.number, 1);

    const b = await connect(env.ws);
    clients.push(b);
    await b.next('welcome');
    b.send({ t: 'join', gameId: 'bluemarble', code: '1', number: 2 });
    const joinedB = await b.next('joined');
    assert.equal(joinedB.number, 2);

    const waiting = await waitRoom(a, '1', function (r) { return r.seats.length === 2; }, '두 명 입장');
    assert.equal(waiting.minPlayers, 2);
    assert.equal(waiting.maxPlayers, 4);
    assert.equal(waiting.canStart, true);
    assert.equal(waiting.seats.length, 2);
    assert.deepEqual(waiting.seats.map(function (s) { return s.name; }), ['1번', '2번']);

    b.send({ t: 'ready', ready: true });
    await sleep(60);
    a.send({ t: 'start' });
    const playing = await waitRoom(a, '1', function (r) { return r.status === 'playing'; }, '게임 시작');
    assert.equal(playing.game.status, 'playing');
    assert.equal(playing.game.round, 1);
    assert.equal(playing.game.maxRounds, 15);
    assert.equal(playing.game.players.length, 2);
    assert.equal(playing.game.turn, joinedA.playerId);
    assert.equal(playing.game.phase, 'roll');
    assert.ok(Array.isArray(playing.rules) && playing.rules.length >= 8);

    // 차례가 아닌 사람이 굴리면 거절
    b.send({ t: 'action', action: 'roll' });
    const denied = await b.next(function (m) { return m.t === 'action_result' && m.ok === false; });
    assert.equal(denied.reason, 'not_your_turn');

    // 방장이 굴리면 서버가 1~6 눈을 정해 상태를 보낸다
    a.send({ t: 'action', action: 'roll' });
    const rolled = await waitRoom(a, '1', function (r) {
      return r.game.lastRoll && r.game.lastRoll.a >= 1 && r.game.players[0].pos !== 0 || (r.game.lastRoll && r.game.lastRoll.seq > 0);
    }, '주사위 결과');
    assert.ok(rolled.game.lastRoll.a >= 1 && rolled.game.lastRoll.a <= 6);
    assert.ok(rolled.game.lastRoll.b >= 1 && rolled.game.lastRoll.b <= 6);
    assert.equal(rolled.game.lastRoll.sum, rolled.game.lastRoll.a + rolled.game.lastRoll.b);
    assert.equal(rolled.game.lastRoll.playerId, joinedA.playerId);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- 끝까지 진행 · 결과 포인트 ---------------- */

test('3라운드로 맞춰 두면 끝까지 진행되고 순위·포인트가 반 기록에 쌓인다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    const b = await connect(env.ws);
    clients.push(a, b);
    await a.next('welcome');
    await b.next('welcome');

    a.send({ t: 'join', gameId: 'bluemarble', code: '2', number: 3 });
    const ja = await a.next('joined');
    b.send({ t: 'join', gameId: 'bluemarble', code: '2', number: 7 });
    const jb = await b.next('joined');
    const players = { [ja.playerId]: a, [jb.playerId]: b };

    b.send({ t: 'ready', ready: true });
    await sleep(60);

    // 방장이 라운드 제한을 3으로 바꾸고 시작
    a.send({ t: 'option', rounds: 3 });
    await waitRoom(a, '2', function (r) { return r.rounds === 3; }, '라운드 옵션');

    a.send({ t: 'start' });
    const playing = await waitRoom(a, '2', function (r) { return r.status === 'playing'; }, '게임 시작');
    assert.equal(playing.game.maxRounds, 3);

    let guard = 0;
    let finished = false;
    while (guard < 240) {
      guard += 1;
      const room = lastRoom(a, '2');
      if (room && room.game && room.game.status === 'finished') { finished = true; break; }
      if (!room || !room.game) break;
      const game = room.game;
      const actor = players[game.turn];
      if (!actor) break;
      if (game.phase === 'decide' && game.pending) {
        const me = game.players.find(function (p) { return p.id === game.turn; });
        const cost = game.pending.kind === 'buy' ? game.pending.price : game.pending.cost;
        const action = me.cash >= cost ? (game.pending.kind === 'buy' ? 'buy' : 'build') : 'skip';
        actor.send({ t: 'action', action: action });
      } else if (game.phase === 'roll') {
        actor.send({ t: 'action', action: 'roll' });
      } else {
        break;
      }
      await sleep(35);
    }

    assert.equal(finished, true, '3라운드 안에 게임이 끝나야 한다');
    const finalRoom = lastRoom(a, '2');
    assert.equal(finalRoom.game.status, 'finished');
    assert.equal(finalRoom.game.finishReason, 'round_limit');
    assert.equal(finalRoom.game.ranking.length, 2);
    assert.equal(finalRoom.game.ranking[0].rank, 1);
    assert.ok(finalRoom.game.ranking[0].totalAsset >= finalRoom.game.ranking[1].totalAsset);

    const result = await a.next(function (m) { return m.t === 'game_result' && m.gameId === 'bluemarble'; });
    assert.equal(result.ranking.length, 2);
    assert.ok(result.points[3] !== undefined || result.points[7] !== undefined);
    assert.equal(result.stats.length, 2);
    assert.ok(result.stats.some(function (row) { return row.number === 3; }));

    const scores = env.hub.classScores('DEMO');
    assert.equal(scores.length, 2, '우리 반 포인트 랭킹에 두 명이 쌓인다');
    assert.ok(scores.every(function (row) { return row.plays === 1; }));
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- 매입 · 건설 서버 판정 ---------------- */

test('서버가 매입·건설을 판정하고 소유자·건물 단계가 모든 화면에 같게 보인다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const a = await connect(env.ws);
    const b = await connect(env.ws);
    clients.push(a, b);
    await a.next('welcome');
    await b.next('welcome');
    a.send({ t: 'join', gameId: 'bluemarble', code: '3', number: 1 });
    const ja = await a.next('joined');
    b.send({ t: 'join', gameId: 'bluemarble', code: '3', number: 2 });
    await b.next('joined');
    b.send({ t: 'ready', ready: true });
    await sleep(60);
    a.send({ t: 'start' });
    await waitRoom(a, '3', function (r) { return r.status === 'playing'; }, '게임 시작');

    // 숫자를 맞춰 4번(대구)에 멈추게 한다: 1 + 3
    // 서버 주사위는 무작위이므로, 매입 기회가 나올 때까지 굴리고 그때 매입한다.
    let bought = null;
    let guard = 0;
    while (!bought && guard < 80) {
      guard += 1;
      const room = lastRoom(a, '3');
      if (!room || !room.game || room.game.status !== 'playing') break;
      const game = room.game;
      const actor = game.turn === ja.playerId ? a : b;
      if (game.phase === 'decide' && game.pending && game.pending.kind === 'buy') {
        actor.send({ t: 'action', action: 'buy' });
        const after = await waitRoom(a, '3', function (r) {
          return r.game.owner.some(function (o) { return o !== null; });
        }, '매입 반영');
        bought = after;
      } else if (game.phase === 'decide') {
        actor.send({ t: 'action', action: 'skip' });
        await sleep(35);
      } else {
        actor.send({ t: 'action', action: 'roll' });
        await sleep(35);
      }
    }
    assert.ok(bought, '한 번은 도시를 살 수 있어야 한다');
    const ownedIdx = bought.game.owner.findIndex(function (o) { return o !== null; });
    assert.ok(ownedIdx > -1);
    assert.equal(bought.game.level[ownedIdx], 0);

    // 다른 화면(두 번째 학생)에도 같은 소유자·단계가 보인다
    const seenByB = lastRoom(b, '3');
    assert.equal(seenByB.game.owner[ownedIdx], bought.game.owner[ownedIdx]);
    assert.equal(seenByB.game.level[ownedIdx], 0);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- 교사 관전 · 방 초기화 ---------------- */

test('교사는 부루마블 방을 관전하고 초기화할 수 있다', async function () {
  const env = await boot();
  const clients = [];
  try {
    const student = await connect(env.ws);
    clients.push(student);
    await student.next('welcome');
    student.send({ t: 'join', gameId: 'bluemarble', code: '4', number: 5 });
    await student.next('joined');

    const teacher = await connect(env.ws);
    clients.push(teacher);
    await teacher.next('welcome');
    teacher.send({ t: 'spectate', gameId: 'bluemarble', code: '4', classCode: 'DEMO' });
    const spectating = await teacher.next('spectating');
    assert.equal(spectating.gameId, 'bluemarble');
    const watched = await waitRoom(teacher, '4', function (r) { return r.role === 'spectator'; }, '관전 화면');
    assert.equal(watched.seats.length, 1);

    teacher.send({ t: 'resetRoom', gameId: 'bluemarble', code: '4', classCode: 'DEMO' });
    const reset = await teacher.next(function (m) { return m.t === 'room_reset' && m.self; });
    assert.equal(reset.code, '4');
    const emptied = await waitRoom(teacher, '4', function (r) { return r.seats.length === 0; }, '방 초기화');
    assert.equal(emptied.status, 'waiting');

    const kicked = await student.next(function (m) { return m.t === 'room_reset'; });
    assert.match(kicked.message, /초기화/);
  } finally {
    clients.forEach(function (c) { c.close(); });
    await env.hub.close();
  }
});

/* ---------------- HTTP 파일 제공 ---------------- */

test('부루마블 엔진과 3D 스크립트를 같은 주소에서 제공한다', async function () {
  const env = await boot();
  try {
    const home = await fetch(env.http + '/');
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /bluemarble-engine\.js/);
    assert.match(html, /js\/bluemarble\.js/);
    assert.match(html, /vendor\/three\.min\.js/);

    const engine = await fetch(env.http + '/bluemarble-engine.js');
    assert.equal(engine.status, 200);
    assert.match(await engine.text(), /class Game/);

    const three = await fetch(env.http + '/vendor/three.min.js');
    assert.equal(three.status, 200);
    const src = await three.text();
    assert.ok(src.length > 100000, 'Three.js 가 함께 배포된다');
  } finally {
    await env.hub.close();
  }
});
