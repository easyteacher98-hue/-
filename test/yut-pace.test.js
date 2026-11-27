'use strict';

/*
 * 윷놀이 봇 진행 속도 회귀 테스트 — 2026-11-27 "말이 이동하는거 하나하나 보여줬으면 좋겠어"
 *
 * 봇이 윷가락을 던지고 곧바로 말을 옮기면, 윷가락 연출과 한 칸씩 걷는 장면이
 * 겹치거나 건너뛰어 보입니다. 그래서 봇은 던진 뒤·옮긴 뒤에 각각 연출만큼
 * 기다렸다가 다음 동작을 합니다. (수업이 늘어지지 않을 만큼만)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const YUT = require('../src/games/yut.js');

function botGame(seed) {
  return YUT.createGame([
    { id: 'b1', name: '봇1', isBot: true },
    { id: 'b2', name: '봇2', isBot: true }
  ], { seed: seed });
}

test('윷놀이 봇은 윷가락이 떨어질 때까지 기다렸다가 말을 옮긴다', function () {
  const game = botGame(7);
  const t0 = 5000000;

  const first = YUT.botTick(game, t0);
  assert.ok(first, '봇이 먼저 던진다');
  assert.equal(first.action, 'throw');
  YUT.applyAction(game, first.playerId, 'throw', null);

  assert.equal(YUT.botTick(game, t0 + 300), null, '던진 직후에는 바로 옮기지 않는다');
  assert.equal(YUT.botTick(game, t0 + 1200), null, '윷가락이 떨어지기 전에는 옮기지 않는다');
  const second = YUT.botTick(game, t0 + 1600);
  assert.ok(second, '윷가락 연출이 끝나면 이어서 움직인다');
});

test('말을 옮긴 뒤에도 한 칸씩 걷는 장면만큼 기다린다', function () {
  const game = botGame(11);
  let at = 9000000;
  // 게임이 '옮기기' 차례가 될 때까지 봇 동작을 진행합니다.
  let guard = 0;
  while (game.phase !== 'move' && guard < 20) {
    const action = YUT.botTick(game, at);
    if (action) YUT.applyAction(game, action.playerId, action.action, null);
    at += 1600;
    guard += 1;
  }
  assert.equal(game.phase, 'move', '옮길 차례가 된다');

  const move = YUT.botTick(game, at);
  assert.ok(move && move.action === 'move', '말을 옮긴다');
  YUT.applyAction(game, move.playerId, 'move', { pieceId: move.payload.pieceId });

  const after = at + 300;
  assert.equal(YUT.botTick(game, after), null, '옮긴 직후에는 다음 동작을 하지 않는다');
  // 말이 한 칸씩 걷는 시간(최대 5칸 × 약 0.2초) 뒤에는 다시 움직일 수 있습니다.
  const later = YUT.botTick(game, at + 1500);
  assert.ok(later, '걷는 장면이 끝나면 다음 동작을 한다');
});
