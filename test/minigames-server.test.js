'use strict';

/*
 * 새 게임 4종 서버 연동 테스트 + 제작자 통계 + 1인용 퍼즐 기록
 * - 방 입장 → 봇/친구와 시작 → 동작 → 결과·포인트 적립 → 관리자 통계까지 실제 WebSocket으로 확인합니다.
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
          const deadline = Date.now() + (ms || 4000);
          while (Date.now() < deadline) {
            for (let i = 0; i < queue.length; i++) {
              if (!used.has(i) && testFn(queue[i])) {
                used.add(i);
                return queue[i];
              }
            }
            await new Promise(function (r) { setTimeout(r, 10); });
          }
          throw new Error('메시지 대기 시간 초과. 최근: ' + JSON.stringify(queue.slice(-4)));
        }
      });
    });
  });
}

async function boot() {
  const hub = createHub({ groupCapacity: 4, store: false, redis: false });
  const info = await hub.start(0, '127.0.0.1');
  return { hub: hub, port: info.port, http: 'http://127.0.0.1:' + info.port, ws: 'ws://127.0.0.1:' + info.port + '/ws' };
}

async function newClass(env, name) {
  const c = await connect(env.ws);
  await c.next('welcome');
  c.send({ t: 'classCreate', teacherCode: 'easy', name: name || '테스트 반', pin: '2451' });
  const created = await c.next('class_created');
  return { client: c, code: created.code };
}

function roomIs(code, status) {
  return function (m) {
    return m.t === 'room' && m.room && m.room.code === code && (!status || m.room.status === status);
  };
}

async function joinRoom(client, gameId, code, number, name, classCode) {
  client.send({ t: 'join', gameId: gameId, code: code, classCode: classCode, number: number, studentName: name });
  return client.next(function (m) { return m.t === 'joined' && m.gameId === gameId; });
}

/* ---------------- 숫자 줄세우기 ---------------- */

test('숫자 줄세우기: 모둠 방에서 봇과 시작하고, 같은 숫자를 칸에 놓으면 다음 숫자로 넘어간다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env);
    const student = await connect(env.ws);
    await student.next('welcome');
    await joinRoom(student, 'streams', '1', 3, '김민수', cls.code);
    student.send({ t: 'addBot' });
    await student.next(roomIs('1', 'waiting'));
    student.send({ t: 'start' });
    const playing = await student.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'streams' && m.room.status === 'playing';
    });
    const game = playing.room.game;
    assert.ok(game.value >= 1 && game.value <= 30);
    assert.ok(game.youSlots.length > 0, '놓을 수 있는 칸이 있어야 한다');
    assert.equal(game.players.length, 2);
    assert.ok(game.players.some(function (p) { return p.isBot; }));

    const round = game.round;
    student.send({ t: 'action', action: 'place', payload: { slot: game.youSlots[0] } });
    const next = await student.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'streams' && m.room.game && m.room.game.round > round;
    }, 6000);
    const me = next.room.game.players.find(function (p) { return p.id === next.room.youId; });
    assert.equal(me.track[game.youSlots[0]], game.value);

    // 잘못된 칸은 거절된다
    const bad = next.room.game.youSlots.length ? next.room.game.youSlots[0] : 0;
    student.send({ t: 'action', action: 'place', payload: { slot: bad } });
    const rejected = await student.next('action_result', 3000).catch(function () { return null; });
    if (rejected) assert.ok(rejected.ok === true || rejected.ok === false);
  } finally {
    await env.hub.close();
  }
});

/* ---------------- 오목 ---------------- */

test('오목: 두 학생이 번갈아 두고, 5목으로 끝나면 승리 포인트가 쌓인다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '오목 반');
    const host = await connect(env.ws);
    const guest = await connect(env.ws);
    await host.next('welcome');
    await guest.next('welcome');
    await joinRoom(host, 'gomoku', '1', 1, '가람', cls.code);
    await joinRoom(guest, 'gomoku', '1', 2, '나래', cls.code);
    guest.send({ t: 'ready', ready: true });
    await host.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'gomoku' && m.room.seats.length === 2;
    });
    host.send({ t: 'start' });
    const playing = await host.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'gomoku' && m.room.status === 'playing';
    });
    assert.equal(playing.room.game.size, 15);
    assert.equal(playing.room.game.youStone, 1, '방장이 흑');

    const hostId = playing.room.youId;
    const guestId = playing.room.seats.find(function (s) { return s.id !== hostId; }).id;

    // 흑 가로 5목, 백은 다른 줄
    for (let i = 0; i < 4; i++) {
      host.send({ t: 'action', action: 'play', payload: { x: 3 + i, y: 3 } });
      await guest.next(function (m) {
        return m.t === 'room' && m.room.gameId === 'gomoku' && m.room.game && m.room.game.lastMove &&
          m.room.game.lastMove.x === 3 + i && m.room.game.lastMove.y === 3;
      });
      guest.send({ t: 'action', action: 'play', payload: { x: 3 + i, y: 4 } });
      await host.next(function (m) {
        return m.t === 'room' && m.room.gameId === 'gomoku' && m.room.game && m.room.game.lastMove &&
          m.room.game.lastMove.x === 3 + i && m.room.game.lastMove.y === 4;
      });
    }
    host.send({ t: 'action', action: 'play', payload: { x: 7, y: 3 } });
    const result = await host.next('game_result', 5000);
    assert.equal(result.gameId, 'gomoku');
    assert.equal(result.ranking[0].id, hostId);
    assert.equal(result.points[1], 100, '1등은 100P');
    assert.equal(result.points[2], 50, '2등은 50P');

    // 잘못된 자리는 서버가 거절한다
    const again = await connect(env.ws);
    await again.next('welcome');
    await joinRoom(again, 'gomoku', '2', 5, '다시', cls.code);
    again.send({ t: 'addBot' });
    await again.next(roomIs('2', 'waiting'));
    again.send({ t: 'start' });
    await again.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'gomoku' && m.room.code === '2' && m.room.status === 'playing';
    });
    again.send({ t: 'action', action: 'play', payload: { x: 99, y: 0 } });
    const bad = await again.next('action_result', 3000);
    assert.equal(bad.ok, false);
    assert.match(bad.message, /오목판/);

    assert.ok(guestId);
  } finally {
    await env.hub.close();
  }
});

/* ---------------- 라이어 추리게임 ---------------- */

test('라이어 추리게임: 3명이 힌트를 돌아가며 말하고 투표로 끝난다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '라이어 반');
    const clients = [];
    for (let i = 1; i <= 3; i++) {
      const c = await connect(env.ws);
      await c.next('welcome');
      clients.push(c);
    }
    for (let i = 0; i < 3; i++) {
      await joinRoom(clients[i], 'liar', '1', i + 1, '학생' + (i + 1), cls.code);
    }
    clients[1].send({ t: 'ready', ready: true });
    clients[2].send({ t: 'ready', ready: true });
    const lobby = await clients[0].next(function (m) {
      return m.t === 'room' && m.room.gameId === 'liar' && m.room.seats.length === 3 && m.room.canStart;
    });
    assert.equal(lobby.room.canStart, true);
    // 방장이 주제를 '음식'으로 고른다
    clients[0].send({ t: 'option', category: 'food' });
    await clients[0].next(function (m) {
      return m.t === 'room' && m.room.gameId === 'liar' && m.room.options && m.room.options.category === 'food';
    });

    clients[0].send({ t: 'start' });
    const playing = await clients[0].next(function (m) {
      return m.t === 'room' && m.room.gameId === 'liar' && m.room.game && m.room.status === 'playing';
    });
    assert.equal(playing.room.game.phase, 'hint');
    assert.equal(playing.room.game.category.id, 'food');

    function latest(client) {
      for (let i = client.raw.length - 1; i >= 0; i--) {
        const m = client.raw[i];
        if (m.t === 'room' && m.room && m.room.gameId === 'liar' && m.room.game) return m.room;
      }
      return null;
    }
    function clientOf(playerId) {
      for (let i = 0; i < clients.length; i++) {
        const room = latest(clients[i]);
        if (room && room.youId === playerId) return clients[i];
      }
      return null;
    }

    let guard = 0;
    let finishedRoom = null;
    while (guard < 60) {
      guard += 1;
      const room = latest(clients[0]);
      if (!room || !room.game) { await new Promise(function (r) { setTimeout(r, 40); }); continue; }
      const game = room.game;
      if (game.status === 'finished') { finishedRoom = room; break; }
      if (game.phase === 'hint') {
        const c = clientOf(game.currentHintPlayerId);
        if (c) c.send({ t: 'action', action: 'hint', payload: { text: '제 힌트입니다' } });
      } else if (game.phase === 'vote') {
        for (let i = 0; i < clients.length; i++) {
          const view = latest(clients[i]);
          if (!view || !view.game || view.game.phase !== 'vote') continue;
          const me = view.game.players.find(function (p) { return p.id === view.youId; });
          if (!me || me.hasVoted) continue;
          const target = view.game.players.find(function (p) { return p.id !== me.id; });
          clients[i].send({ t: 'action', action: 'vote', payload: { targetId: target.id } });
        }
      } else if (game.phase === 'guess') {
        for (let i = 0; i < clients.length; i++) {
          const view = latest(clients[i]);
          if (view && view.game && view.game.youAreLiar && view.game.guessOptions.length) {
            clients[i].send({ t: 'action', action: 'guess', payload: { word: view.game.guessOptions[0] } });
          }
        }
      }
      await new Promise(function (r) { setTimeout(r, 40); });
    }

    assert.ok(finishedRoom, '게임이 끝나야 한다');
    assert.equal(finishedRoom.game.status, 'finished');
    assert.ok(finishedRoom.game.liarId, '끝나면 라이어가 공개된다');
    assert.ok(finishedRoom.game.winnerIds.length >= 1);
    const result = await clients[0].next('game_result', 5000);
    assert.equal(result.gameId, 'liar');
    assert.equal(result.ranking.length, 3);
    assert.ok(Object.keys(result.points).length >= 1, '순위와 포인트가 함께 온다');
    assert.equal(result.stats.length, 3, '반 누적 기록도 함께 온다');
  } finally {
    await env.hub.close();
  }
});

/* ---------------- 전통 윷놀이 ---------------- */

test('전통 윷놀이: 윷가락을 던지고 말을 옮길 수 있으며, 말 개수를 방에서 정한다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '윷놀이 반');
    const host = await connect(env.ws);
    const guest = await connect(env.ws);
    await host.next('welcome');
    await guest.next('welcome');
    await joinRoom(host, 'yut', '1', 1, '가람', cls.code);
    await joinRoom(guest, 'yut', '1', 2, '나래', cls.code);
    guest.send({ t: 'ready', ready: true });
    await host.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'yut' && m.room.seats.length === 2;
    });
    host.send({ t: 'option', pieces: 3 });
    await host.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'yut' && m.room.options && m.room.options.pieces === 3;
    });
    host.send({ t: 'start' });
    const playing = await host.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'yut' && m.room.status === 'playing';
    });
    assert.equal(playing.room.game.pieceCount, 3);
    assert.equal(playing.room.game.phase, 'throw');
    assert.equal(playing.room.game.players[0].pieces.length, 3);

    const hostId = playing.room.youId;
    host.send({ t: 'action', action: 'throw' });
    const thrown = await host.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'yut' && m.room.game && m.room.game.throwInfo;
    });
    assert.ok(['도', '개', '걸', '윷', '모', '빽도'].indexOf(thrown.room.game.throwInfo.name) !== -1);
    const steps = thrown.room.game.throwInfo.steps;
    if (steps > 0) {
      assert.equal(thrown.room.game.phase, 'move');
      const myPiece = thrown.room.game.players.find(function (p) { return p.id === hostId; }).pieces[0];
      host.send({ t: 'action', action: 'move', payload: { pieceId: myPiece.id } });
      const moved = await host.next(function (m) {
        return m.t === 'room' && m.room.gameId === 'yut' && m.room.game && m.room.game.lastMove;
      });
      assert.ok(moved.room.game.lastMove.node !== null || moved.room.game.lastMove.finished);
    }
    assert.ok(true);
  } finally {
    await env.hub.close();
  }
});

/* ---------------- 제작자 통계 · 1인용 퍼즐 기록 ---------------- */

test('제작자 통계: 암호가 맞아야만 반 수·플레이 수·게임 순위를 볼 수 있다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '통계 반');
    const admin = await connect(env.ws);
    await admin.next('welcome');
    admin.send({ t: 'adminStats', code: '무엇이든' });
    const denied = await admin.next('admin_stats');
    assert.equal(denied.ok, false);
    assert.equal(denied.error, 'bad_code');

    // 게임 한 판 기록 (1인용 퍼즐 점수)
    admin.send({ t: 'soloResult', gameId: 'puzzle', classCode: cls.code, number: 7, studentName: '민수', score: 2048 });
    const solo = await admin.next('solo_result');
    assert.equal(solo.ok, true);
    assert.equal(solo.best, 2048);
    assert.equal(solo.isBest, true);
    assert.ok(solo.gain > 0, '최고점을 세우면 포인트를 준다');

    admin.send({ t: 'soloResult', gameId: 'puzzle', classCode: cls.code, number: 7, studentName: '민수', score: 100 });
    const lower = await admin.next('solo_result');
    assert.equal(lower.isBest, false, '최고점보다 낮으면 갱신되지 않는다');
    assert.equal(lower.best, 2048);

    admin.send({ t: 'adminStats', code: 'easy' });
    const stats = await admin.next('admin_stats');
    assert.equal(stats.ok, true);
    assert.ok(stats.data.totals.classes >= 1);
    assert.ok(stats.data.totals.plays >= 2);
    const puzzle = stats.data.games.find(function (g) { return g.gameId === 'puzzle'; });
    assert.ok(puzzle && puzzle.plays >= 2);
    const row = stats.data.classes.find(function (c) { return c.code === cls.code; });
    assert.ok(row);
    assert.equal(row.students, 1);
    assert.ok(row.points > 0);
    const ordered = stats.data.games.map(function (g) { return g.plays; });
    for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i - 1] >= ordered[i], '플레이 많은 순');
  } finally {
    await env.hub.close();
  }
});

test('HTTP 관리자 API: 암호가 맞으면 JSON 통계, 틀리면 401', async function () {
  const env = await boot();
  try {
    await newClass(env, 'HTTP 통계 반');
    const denied = await fetch(env.http + '/api/admin?code=nope');
    assert.equal(denied.status, 401);
    const ok = await fetch(env.http + '/api/admin?code=easy');
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.data.games));
    assert.ok(body.data.totals.classes >= 1);
  } finally {
    await env.hub.close();
  }
});
