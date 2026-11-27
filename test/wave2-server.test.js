'use strict';

/*
 * 2차 확장 게임 서버 연동 테스트
 * 모둠 방 입장 → 봇 추가 → 시작 → 실제 동작 → 결과·포인트까지 WebSocket으로 확인합니다.
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

function gameRoom(gameId, code, status) {
  return function (m) {
    return m.t === 'room' && m.room && m.room.gameId === gameId && m.room.code === code &&
      (!status || m.room.status === status);
  };
}

async function enterWithBot(env, cls, gameId, number, options) {
  const student = await connect(env.ws);
  await student.next('welcome');
  student.send({ t: 'join', gameId: gameId, code: '1', classCode: cls.code, number: number, studentName: '김민수' });
  await student.next('joined');
  student.send({ t: 'addBot' });
  if (options) student.send(Object.assign({ t: 'option' }, options));
  await student.next(gameRoom(gameId, '1', 'waiting'));
  student.send({ t: 'start' });
  const playing = await student.next(gameRoom(gameId, '1', 'playing'));
  return { client: student, room: playing.room };
}

test('숫자 타일 러미: 모둠 방에서 봇과 시작하고, 15점 간소화 옵션·타일 뽑기가 서버에서 동작한다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '타일 러미 반');
    const joined = await enterWithBot(env, cls, 'rummi', 4, { initialPoints: 15 });
    const room = joined.room;
    assert.equal(room.game.initialPoints, 15, '방장이 고른 15점이 적용');
    assert.equal(room.game.hand.length, 14);
    assert.equal(room.game.players.length, 2);
    assert.ok(room.game.players.some(function (p) { return p.isBot; }));
    assert.equal(room.game.table.length, 0);

    const before = room.game.handCounts[room.youId];
    joined.client.send({ t: 'action', action: 'draw', payload: {} });
    const after = await joined.client.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'rummi' && m.room.game &&
        m.room.game.handCounts[m.room.youId] === before + 1;
    }, 6000);
    assert.equal(after.room.game.handCounts[after.room.youId], before + 1);

    // 내 패에 없는 타일을 내려고 하면 거절됩니다.
    joined.client.send({ t: 'action', action: 'play', payload: { melds: [{ tileIds: ['no-such-tile'] }] } });
    const rejected = await joined.client.next('action_result', 3000);
    assert.equal(rejected.ok, false);

    joined.client.close();
  } finally {
    await env.hub.close();
  }
});

test('도둑잡기: 앞사람 패에서 카드를 뽑고, 짝 여부가 모든 화면에 같은 상태로 보인다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '도둑잡기 반');
    const joined = await enterWithBot(env, cls, 'oldmaid', 5);
    const room = joined.room;
    assert.ok(room.game.hand.length >= 1);
    assert.ok(room.game.targetCount >= 1, '앞사람 패가 보여야 뽑을 수 있음');
    assert.equal(room.game.players.length, 2);

    const targetBefore = room.game.targetCount;
    joined.client.send({ t: 'action', action: 'draw', payload: { index: 0 } });
    const after = await joined.client.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'oldmaid' && m.room.game &&
        m.room.game.lastDraw && m.room.game.lastDraw.toId === m.room.youId;
    }, 6000);
    assert.ok(after.room.game.lastDraw.cardId);
    assert.ok(after.room.game.targetCount <= targetBefore);
    assert.ok(after.room.game.players.every(function (p) { return typeof p.count === 'number'; }));

    joined.client.close();
  } finally {
    await env.hub.close();
  }
});

test('전통 장기: 9×10 판과 내 차례 수가 보이고, 병을 앞으로 옮기면 서버가 판정한다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '장기 반');
    const joined = await enterWithBot(env, cls, 'janggi', 2);
    const room = joined.room;
    assert.equal(room.game.board.length, 10);
    assert.equal(room.game.board[0].length, 9);
    assert.equal(room.game.youSide, 'cho');
    assert.ok(room.game.legalMoves.length > 0);

    const soldier = room.game.legalMoves.find(function (m) {
      return m.from.x === 0 && m.from.y === 6 && m.to.x === 0 && m.to.y === 5;
    });
    assert.ok(soldier, '병의 앞 진출 수가 있어야 함');
    joined.client.send({ t: 'action', action: 'move', payload: { from: soldier.from, to: soldier.to } });
    const after = await joined.client.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'janggi' && m.room.game && m.room.game.moveCount >= 1;
    }, 6000);
    assert.ok(after.room.game.board[5][0], '병이 (0,5)로 이동');
    assert.equal(after.room.game.board[6][0], null);

    // 규칙에 없는 이동은 거절됩니다.
    joined.client.send({ t: 'action', action: 'move', payload: { from: { x: 0, y: 9 }, to: { x: 4, y: 4 } } });
    const rejected = await joined.client.next('action_result', 3000);
    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /움직일 수 없|차례/);

    joined.client.close();
  } finally {
    await env.hub.close();
  }
});

test('컬러 숫자 카드: 손패 7장과 낼 수 있는 카드가 보이고, 내면 바닥 카드가 바뀐다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '카드 반');
    const joined = await enterWithBot(env, cls, 'onecard', 6);
    const room = joined.room;
    assert.equal(room.game.hand.length, 7);
    assert.equal(room.game.top.type, 'number');
    assert.ok(room.game.players.every(function (p) { return p.count === 7; }));

    const wilds = room.game.hand.filter(function (c) { return c.type === 'wild' || c.type === 'draw4'; }).map(function (c) { return c.id; });
    const normal = room.game.youPlayable.filter(function (id) { return wilds.indexOf(id) === -1; });
    if (normal.length) {
      const cardId = normal[0];
      joined.client.send({ t: 'action', action: 'play', payload: { cardId: cardId } });
      const after = await joined.client.next(function (m) {
        return m.t === 'room' && m.room.gameId === 'onecard' && m.room.game &&
          m.room.game.moves >= 1 && m.room.game.hand.length <= 6;
      }, 6000);
      assert.ok(after.room.game.hand.length <= 6);
    } else {
      joined.client.send({ t: 'action', action: 'draw', payload: {} });
      const after = await joined.client.next(function (m) {
        return m.t === 'room' && m.room.gameId === 'onecard' && m.room.game && m.room.game.deckCount < room.game.deckCount;
      }, 6000);
      assert.ok(after.room.game.deckCount < room.game.deckCount);
    }

    joined.client.close();
  } finally {
    await env.hub.close();
  }
});

test('선 긋기 땅따먹기: 선을 그으면 판에 남고, 이미 그은 선은 거절한다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '선 긋기 반');
    const joined = await enterWithBot(env, cls, 'dots', 7);
    const room = joined.room;
    assert.equal(room.game.claimed, 0);
    assert.equal(room.game.totalBoxes, 16);

    joined.client.send({ t: 'action', action: 'line', payload: { type: 'h', x: 0, y: 0 } });
    const after = await joined.client.next(function (m) {
      return m.t === 'room' && m.room.gameId === 'dots' && m.room.game && m.room.game.moves >= 1;
    }, 6000);
    assert.ok(after.room.game.hLines[0][0], '가로 선이 그어져야 함');

    joined.client.send({ t: 'action', action: 'line', payload: { type: 'nope', x: 0, y: 0 } });
    const rejected = await joined.client.next('action_result', 3000);
    assert.equal(rejected.ok, false);

    joined.client.close();
  } finally {
    await env.hub.close();
  }
});

test('1인용 스도쿠: 퍼즐 완성 점수를 보내면 최고 기록이 저장되고 우리 반 포인트가 쌓인다', async function () {
  const env = await boot();
  try {
    const cls = await newClass(env, '스도쿠 반');
    const student = await connect(env.ws);
    await student.next('welcome');
    student.send({ t: 'classEnter', code: cls.code });
    await student.next('class_entered');

    student.send({
      t: 'soloResult', gameId: 'sudoku', classCode: cls.code,
      number: 12, studentName: '이서연', score: 880
    });
    const result = await student.next('solo_result');
    assert.equal(result.ok, true);
    assert.equal(result.gameId, 'sudoku');
    assert.equal(result.score, 880);
    assert.equal(result.isBest, true);
    assert.ok(result.gain >= 5, '최고 기록이면 포인트를 줌');
    assert.ok(result.best >= 880);
    const me = result.stats.find(function (row) { return row.number === 12; });
    assert.ok(me && me.points >= result.gain);

    // 더 낮은 점수는 최고 기록을 갱신하지 않습니다.
    student.send({
      t: 'soloResult', gameId: 'sudoku', classCode: cls.code,
      number: 12, studentName: '이서연', score: 300
    });
    const second = await student.next('solo_result');
    assert.equal(second.isBest, false);
    assert.equal(second.best, 880);
    assert.equal(second.gain, 0);

    student.close();
  } finally {
    await env.hub.close();
  }
});

test('새 게임 5종은 모두 모둠 방 6개씩 열려 있고, 서버 게임 목록에 ready 로 보인다', async function () {
  const env = await boot();
  try {
    const client = await connect(env.ws);
    const welcome = await client.next('welcome');
    const ids = ['rummi', 'oldmaid', 'janggi', 'onecard', 'dots', 'sudoku'];
    ids.forEach(function (id) {
      const game = welcome.games.find(function (g) { return g.id === id; });
      assert.ok(game, id + ' 게임이 목록에 있어야 함');
      assert.equal(game.status, 'ready');
    });
    const solo = welcome.games.find(function (g) { return g.id === 'sudoku'; });
    assert.equal(solo.mode, 'solo');
    assert.deepEqual(solo.grades, ['low', 'mid', 'high']);

    // 연결 직후에는 방 목록을 보내지 않습니다. 연습 교실(DEMO)은 명시적으로 요청합니다.
    assert.deepEqual(welcome.rooms, []);
    client.send({ t: 'overview', classCode: 'DEMO' });
    const demo = await client.next(function (m) { return m.t === 'rooms' && m.classCode === 'DEMO'; });
    const rooms = demo.rooms.filter(function (r) { return r.classCode === 'DEMO'; });
    ['rummi', 'oldmaid', 'janggi', 'onecard', 'dots'].forEach(function (id) {
      const mine = rooms.filter(function (r) { return r.gameId === id; });
      assert.equal(mine.length, 6, id + ' 6모둠 방');
    });
    client.close();
  } finally {
    await env.hub.close();
  }
});
