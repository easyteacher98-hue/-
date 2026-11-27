'use strict';

/*
 * 전국여행 마블 진행 속도 회귀 테스트 — 2026-11-27 수업 피드백 "진행이 너무 빠름"
 * 봇이 카드를 굴리고 매입을 결정하는 간격을 넉넉히 두어, 학생들이 주사위·말 이동을
 * 눈으로 따라갈 수 있게 했습니다. (수업 시간에 너무 늘어지지 않을 만큼만)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const BM = require('../public/bluemarble-engine.js');

test('봇 행동 간격은 눈으로 따라갈 수 있을 만큼 넉넉하다 (1초 이상)', function () {
  assert.ok(BM.BOT_PROFILES.normal.delay[0] >= 1000, '보통 난이도 간격');
  assert.ok(BM.BOT_PROFILES.easy.delay[0] >= 1200, '쉬움 난이도 간격');
  assert.ok(BM.BOT_PROFILES.hard.delay[0] >= 900, '어려움 난이도 간격');
  assert.ok(BM.BOT_PROFILES.normal.delay[1] <= 2500, '너무 늘어지지도 않는다');
});

test('봇은 굴림 결과가 바뀐 뒤 최소 1초는 기다렸다가 다음 동작을 한다', function () {
  const game = new BM.Game([{ id: 'me', name: '나', number: 1 }, { id: 'bot1', name: '봇', isBot: true }], { rng: BM.createRng(5), maxRounds: 15 });
  const driver = new BM.BotDriver(game, { level: 'normal', rng: BM.createRng(7) });

  // 내 차례는 건너뛰고(사람) 봇 차례로 맞춘다
  game.turn = 1;
  game.phase = 'roll';

  const start = 1000000;
  let actionAt = null;
  for (let t = start; t <= start + 4000; t += 50) {
    const action = driver.tick(t);
    if (action) { actionAt = t; break; }
  }
  assert.ok(actionAt !== null, '봇이 4초 안에 굴린다');
  assert.ok(actionAt - start >= 1200, '봇은 최소 1.2초는 기다린다 (' + (actionAt - start) + 'ms)');
  assert.ok(actionAt - start <= 2000, '봇이 너무 늦지도 않다 (' + (actionAt - start) + 'ms)');
});

test('굴린 뒤 매입 결정도 바로 하지 않고 잠깐 기다린다', function () {
  const game = new BM.Game([{ id: 'me', name: '나', number: 1 }, { id: 'bot1', name: '봇', isBot: true }], { rng: BM.createRng(11), maxRounds: 15 });
  const driver = new BM.BotDriver(game, { level: 'normal', rng: BM.createRng(13) });
  game.turn = 1;
  game.phase = 'roll';

  // 첫 동작(굴림)을 받는다
  let t = 1000000;
  let action = null;
  while (!action && t < 1000000 + 3000) { action = driver.tick(t); t += 50; }
  assert.ok(action && action.action === 'roll');
  const rolledAt = t - 50;
  game.roll('bot1', rolledAt);

  // 매입 기회가 생겼다면, 그 결정도 최소 1초 뒤
  if (game.phase === 'decide' && game.pending) {
    let decidedAt = null;
    for (let now = rolledAt; now <= rolledAt + 3000; now += 50) {
      const next = driver.tick(now);
      if (next) { decidedAt = now; break; }
    }
    assert.ok(decidedAt !== null, '결정을 한다');
    assert.ok(decidedAt - rolledAt >= 1000, '매입 결정도 1초 이상 기다린다 (' + (decidedAt - rolledAt) + 'ms)');
  }
});
