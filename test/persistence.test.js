'use strict';

/*
 * Upstash Redis REST 영구 저장 테스트
 *
 * - 진짜 Upstash 대신 로컬 Mock HTTP 서버로 /get · /set · /pipeline 을 흉내 냅니다.
 * - 서버를 껐다 켜도 반 목록(PIN 해시)과 반별 번호 승수·포인트가 남는지,
 *   Redis 가 없거나 잠시 고장 나도 기존처럼 동작하는지 확인합니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const { createHub } = require('../server.js');

const TOKEN = 'test-upstash-token';
const CLASSES_KEY = 'halligalli:classes';
const STATS_KEY = 'halligalli:classStats';

/* ---------------- Mock Upstash REST 서버 ---------------- */

function startMockUpstash() {
  const data = new Map();
  const calls = { get: 0, set: 0, pipeline: 0 };
  const state = { fail: false, delayMs: 0 };

  const server = http.createServer(function (req, res) {
    let body = '';
    req.on('data', function (chunk) { body += chunk; });
    req.on('end', function () {
      function reply(status, obj) {
        if (res.writableEnded || res.destroyed) return;
        try {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(obj));
        } catch (err) { /* 연결이 이미 끊김 */ }
      }
      function handle() {
        if (state.fail) return reply(500, { error: 'mock redis failure' });
        if (req.headers.authorization !== 'Bearer ' + TOKEN) {
          return reply(401, { error: 'unauthorized' });
        }
        const parts = new URL(req.url, 'http://mock').pathname.split('/').filter(Boolean);
        if (parts[0] === 'get' && parts[1]) {
          calls.get += 1;
          const key = decodeURIComponent(parts[1]);
          return reply(200, { result: data.has(key) ? data.get(key) : null });
        }
        if (parts[0] === 'set' && parts[1]) {
          calls.set += 1;
          const key = decodeURIComponent(parts[1]);
          const value = parts.length > 2
            ? decodeURIComponent(parts.slice(2).join('/'))
            : body;
          data.set(key, String(value));
          return reply(200, { result: 'OK' });
        }
        if (parts[0] === 'pipeline') {
          calls.pipeline += 1;
          let commands;
          try {
            commands = JSON.parse(body);
          } catch (err) {
            return reply(400, { error: 'bad pipeline' });
          }
          const out = commands.map(function (cmd) {
            const op = String((cmd && cmd[0]) || '').toUpperCase();
            if (op === 'GET') return { result: data.has(cmd[1]) ? data.get(cmd[1]) : null };
            if (op === 'SET') { data.set(cmd[1], String(cmd[2])); return { result: 'OK' }; }
            if (op === 'DEL') { data.delete(cmd[1]); return { result: 1 }; }
            return { error: 'unknown command' };
          });
          return reply(200, out);
        }
        return reply(404, { error: 'not found' });
      }

      if (state.delayMs > 0) setTimeout(handle, state.delayMs);
      else handle();
    });
  });

  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({
        server: server,
        data: data,
        calls: calls,
        state: state,
        url: 'http://127.0.0.1:' + server.address().port
      });
    });
  });
}

function closeMock(mock) {
  return new Promise(function (resolve) {
    if (mock.server.closeAllConnections) mock.server.closeAllConnections();
    mock.server.close(function () { resolve(); });
  });
}

/* ---------------- WebSocket 도우미 ---------------- */

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

function roomMsg(code, classCode) {
  return function (m) {
    return m.t === 'room' && m.room && m.room.code === code &&
      (!classCode || m.room.classCode === classCode);
  };
}

/** 1·2번이 한 판을 끝내 1번 우승 · 2번 준우승 기록을 만듭니다. */
async function playOneGame(env, classCode) {
  const a = await connect(env.ws);
  await a.next('welcome');
  a.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: classCode, number: 1 });
  const joinedA = await a.next('joined');
  await a.next(roomMsg('1', classCode));

  const b = await connect(env.ws);
  await b.next('welcome');
  b.send({ t: 'join', gameId: 'halligalli', code: '1', classCode: classCode, number: 2 });
  const joinedB = await b.next('joined');
  b.send({ t: 'ready', ready: true });
  await a.next(function (m) {
    return m.t === 'room' && m.room.code === '1' && m.room.classCode === classCode &&
      m.room.seats.some(function (s) { return s.name === '2번' && s.ready; });
  });

  a.send({ t: 'start' });
  await a.next(function (m) {
    return m.t === 'room' && m.room.code === '1' && m.room.status === 'playing';
  });

  // 1번만 카드 1장을 남기고 2번은 탈락시켜, 1번이 뒤집으면 바로 끝나게 만듭니다.
  const room = env.hub.getRoom('halligalli', '1', classCode);
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
  return { result: result, a: a, b: b };
}

/* ---------------- 테스트 ---------------- */

test('Upstash Redis가 설정되면 반 목록·PIN 해시·반별 랭킹을 저장하고 다시 켜도 복원한다', async function () {
  const mock = await startMockUpstash();
  const clients = [];
  let first = null;
  let second = null;
  let code = '';

  try {
    first = await boot({ redisUrl: mock.url, redisToken: TOKEN });
    assert.equal(first.hub.settings.persistence, 'upstash');
    assert.equal(await first.hub.ready(), true);

    const teacher = await connect(first.ws);
    clients.push(teacher);
    await teacher.next('welcome');
    teacher.send({ t: 'classCreate', teacherCode: 'easy', name: '영구 저장 반', pin: '2468' });
    const created = await teacher.next('class_created');
    code = created.code;

    const played = await playOneGame(first, code);
    clients.push(played.a, played.b);
    assert.equal(played.result.points[1], 100);
    assert.equal(played.result.points[2], 50);

    assert.equal(await first.hub.flushPersistence(), true);

    // 저장된 JSON – 반 목록은 PIN 해시만, 반별 기록은 번호별 승수·포인트
    const savedClasses = JSON.parse(mock.data.get(CLASSES_KEY));
    assert.equal(savedClasses.classes.length, 1);
    assert.equal(savedClasses.classes[0].code, code);
    assert.equal(savedClasses.classes[0].name, '영구 저장 반');
    assert.ok(savedClasses.classes[0].pinHash, 'PIN 해시를 저장한다');
    assert.ok(savedClasses.classes[0].pinSalt, 'PIN 솔트를 저장한다');
    assert.ok(!JSON.stringify(savedClasses).includes('2468'), 'PIN 원문은 저장하지 않는다');

    const savedStats = JSON.parse(mock.data.get(STATS_KEY));
    assert.equal(savedStats.stats[code].length, 2);
    const savedFirst = savedStats.stats[code].find(function (r) { return r.number === 1; });
    assert.equal(savedFirst.wins, 1);
    assert.equal(savedFirst.plays, 1);
    assert.equal(savedFirst.points, 100);

    clients.forEach(function (c) { c.close(); });
    clients.length = 0;
    await first.hub.close();
    first = null;

    // 서버를 새로 띄운다 (Render 재시작·절전 후 깨어남과 같은 상황)
    second = await boot({ redisUrl: mock.url, redisToken: TOKEN });
    const cls = second.hub.getClass(code);
    assert.ok(cls, 'Upstash 에서 반이 복원되어야 한다');
    assert.equal(cls.name, '영구 저장 반');

    const scores = second.hub.classScores(code);
    const firstPlace = scores.find(function (r) { return r.number === 1; });
    const secondPlace = scores.find(function (r) { return r.number === 2; });
    assert.equal(firstPlace.rank, 1);
    assert.equal(firstPlace.plays, 1);
    assert.equal(firstPlace.wins, 1);
    assert.equal(firstPlace.points, 100);
    assert.equal(secondPlace.points, 50);

    // 모둠 방도 다시 열리고, PIN 으로 교사 인증도 된다
    assert.ok(second.hub.getRoom('halligalli', '1', code), '반의 1모둠 방이 다시 열린다');
    const again = await connect(second.ws);
    clients.push(again);
    await again.next('welcome');
    again.send({ t: 'classAuth', code: code, pin: '2468' });
    const ok = await again.next('class_auth_ok');
    assert.equal(ok.class.code, code);

    again.send({ t: 'classEnter', code: code });
    const entered = await again.next('class_entered');
    assert.equal(entered.class.name, '영구 저장 반');
    const statsMsg = await again.next('class_stats');
    assert.equal(statsMsg.stats[0].number, 1);
    assert.equal(statsMsg.stats[0].points, 100);
  } finally {
    clients.forEach(function (c) { c.close(); });
    if (first) await first.hub.close();
    if (second) await second.hub.close();
    await closeMock(mock);
  }
});

test('Upstash Redis가 잠시 안 되도 서버는 계속 동작하고, 복구되면 다시 저장한다', async function () {
  const mock = await startMockUpstash();
  mock.state.fail = true;
  let env = null;
  const clients = [];

  try {
    env = await boot({ redisUrl: mock.url, redisToken: TOKEN });
    assert.equal(await env.hub.ready(), false, '복원 실패는 서버 기동을 막지 않는다');

    const c = await connect(env.ws);
    clients.push(c);
    await c.next('welcome');
    c.send({ t: 'classCreate', teacherCode: 'easy', name: '복구 반', pin: '1357' });
    const created = await c.next('class_created');
    assert.ok(created.code, 'Redis 가 죽어 있어도 반은 만들어진다');

    assert.equal(await env.hub.flushPersistence(), false);
    assert.equal(mock.data.size, 0, '실패 중에는 아무것도 덮어쓰지 않는다');

    // Redis 복구 → 다음 저장 때 복원부터 다시 시도하고, 성공하면 저장한다
    mock.state.fail = false;
    assert.equal(await env.hub.flushPersistence(), true);
    const savedClasses = JSON.parse(mock.data.get(CLASSES_KEY));
    assert.equal(savedClasses.classes.length, 1);
    assert.equal(savedClasses.classes[0].code, created.code);
    assert.equal(savedClasses.classes[0].name, '복구 반');
  } finally {
    clients.forEach(function (c) { c.close(); });
    if (env) await env.hub.close();
    await closeMock(mock);
  }
});

test('Upstash 응답이 늦으면 제한 시간 안에 포기하고 서버는 정상 동작한다', async function () {
  const mock = await startMockUpstash();
  mock.state.delayMs = 1200;
  let env = null;

  try {
    const started = Date.now();
    env = await boot({ redisUrl: mock.url, redisToken: TOKEN, redisTimeoutMs: 200 });
    const waited = Date.now() - started;
    assert.ok(waited < 1000, '응답을 기다리며 멈추지 않는다 (' + waited + 'ms)');
    assert.equal(await env.hub.ready(), false);

    const res = await fetch(env.http + '/health');
    const health = await res.json();
    assert.equal(health.ok, true);
    assert.equal(health.persistence, 'upstash');
  } finally {
    mock.state.delayMs = 0;
    if (env) await env.hub.close();
    await closeMock(mock);
  }
});

test('Upstash 설정이 없으면 Redis 를 부르지 않고 기존 파일 저장으로 동작한다', async function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-redis-off-'));
  const storePath = path.join(dir, 'classes.json');
  let fetchCalls = 0;
  let first = null;
  let second = null;
  const clients = [];
  let code = '';

  try {
    first = await boot({
      store: true,
      storePath: storePath,
      redisFetch: function () {
        fetchCalls += 1;
        return Promise.reject(new Error('Upstash 를 부르면 안 됩니다'));
      }
    });
    assert.equal(first.hub.settings.persistence, 'file');
    assert.equal(await first.hub.ready(), false);

    const c = await connect(first.ws);
    clients.push(c);
    await c.next('welcome');
    c.send({ t: 'classCreate', teacherCode: 'easy', name: '로컬 반', pin: '4321' });
    const created = await c.next('class_created');
    code = created.code;
    c.close();
    clients.length = 0;

    assert.equal(fetchCalls, 0, 'Upstash 환경변수가 없으면 fetch 를 부르지 않는다');
    const file = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(file.classes[0].code, code);
    assert.equal(await first.hub.flushPersistence(), false);

    await first.hub.close();
    first = null;

    second = await boot({ store: true, storePath: storePath });
    assert.ok(second.hub.getClass(code), '파일에서 반이 복원된다');
    assert.equal(second.hub.classScores(code).length, 0, '로컬에서는 랭킹이 메모리에만 있다');
  } finally {
    clients.forEach(function (c) { c.close(); });
    if (first) await first.hub.close();
    if (second) await second.hub.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Upstash 에 깨진 값이 있어도 서버는 메모리 상태로 뜬다', async function () {
  const mock = await startMockUpstash();
  mock.data.set(CLASSES_KEY, '{ 깨진 JSON');
  mock.data.set(STATS_KEY, '[]');
  let env = null;

  try {
    env = await boot({ redisUrl: mock.url, redisToken: TOKEN });
    assert.equal(await env.hub.ready(), true);
    assert.equal(env.hub.classes.size, 1, '기본 연습 교실만 있다');
    assert.ok(env.hub.getClass('DEMO'));

    const c = await connect(env.ws);
    await c.next('welcome');
    c.send({ t: 'classCreate', teacherCode: 'easy', name: '깨진 값 뒤 반', pin: '9876' });
    const created = await c.next('class_created');
    assert.ok(created.code);
    assert.equal(await env.hub.flushPersistence(), true, '깨진 값을 새 값으로 덮어쓴다');
    const saved = JSON.parse(mock.data.get(CLASSES_KEY));
    assert.equal(saved.classes[0].name, '깨진 값 뒤 반');
    c.close();
  } finally {
    if (env) await env.hub.close();
    await closeMock(mock);
  }
});
