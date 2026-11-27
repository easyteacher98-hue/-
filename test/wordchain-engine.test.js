'use strict';

/*
 * 꼬리잡기 끝말잇기 – 규칙 엔진 테스트
 * 사전(진짜 우리말)·한방 단어·두음법칙·중복·제한 시간·탈락·봇을 확인합니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const WC = require('../public/wordchain-engine.js');

function game2(options) {
  return new WC.Game([
    { id: 'a', name: '가온' },
    { id: 'b', name: '나래' }
  ], Object.assign({ options: { seconds: 20 } }, options || {}));
}

/* ---------------- 사전 ---------------- */

test('끝말잇기: 사전에 우리말 명사가 2,500개 이상 들어 있고 모두 2글자 이상 한글이다', function () {
  assert.ok(WC.WORD_COUNT >= 2500, '사전 단어 수: ' + WC.WORD_COUNT);
  assert.ok(WC.WORDS.includes('사과'));
  assert.ok(WC.WORDS.includes('자전거'));
  assert.ok(WC.WORDS.includes('과자'));
  const bad = WC.WORDS.filter(function (w) { return !/^[가-힣]{2,}$/.test(w); });
  assert.deepEqual(bad, [], '2글자 이상 한글 낱말만');
  assert.equal(new Set(WC.WORDS).size, WC.WORDS.length, '중복 없음');
});

test('끝말잇기: 사전에 없는 낱말·1글자·영문·숫자·띄어쓰기는 거절한다', function () {
  const game = game2();
  assert.equal(game.say('a', { text: '' }).reason, 'empty_word');
  assert.equal(game.say('a', { text: '과' }).reason, 'too_short');
  assert.equal(game.say('a', { text: 'apple' }).reason, 'hangul_only');
  assert.equal(game.say('a', { text: '사과1' }).reason, 'hangul_only');
  assert.equal(game.say('a', { text: '사 과' }).reason, 'one_word_only');
  assert.equal(game.say('a', { text: '과과과과과' }).reason, 'not_in_dictionary');
  assert.equal(game.say('b', { text: '사과' }).reason, 'not_your_turn');
  assert.equal(game.chain.length, 0, '거절되면 판이 그대로');
});

test('끝말잇기: 앞 낱말의 끝 글자로 시작해야 하고, 끝 글자는 화면에 안내된다', function () {
  const game = game2();
  const first = game.say('a', { text: '사과' });
  assert.equal(first.ok, true);
  assert.equal(first.next, '과');
  assert.equal(game.stateFor('b').required, '과');
  const wrong = game.say('b', { text: '바나나' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, 'wrong_start');
  assert.equal(wrong.required, '과');
  assert.equal(game.say('b', { text: '과자' }).ok, true);
  assert.equal(game.stateFor('a').required, '자');
});

test('끝말잇기: 두음법칙을 인정한다 (녀↔여, 리↔이, 라↔나)', function () {
  assert.equal(WC.sameSound('녀', '여'), true);
  assert.equal(WC.sameSound('리', '이'), true);
  assert.equal(WC.sameSound('라', '나'), true);
  assert.equal(WC.sameSound('력', '역'), true);
  assert.equal(WC.sameSound('가', '나'), false);

  const game = game2();
  assert.equal(game.say('a', { text: '원리' }).ok, true);
  assert.equal(game.stateFor('b').required, '리');
  const ok = game.say('b', { text: '이야기' });
  assert.equal(ok.ok, true, '“리” 다음에 “이야기”');
});

test('끝말잇기: 이미 나온 낱말은 다시 쓸 수 없다', function () {
  const game = game2();
  assert.equal(game.say('a', { text: '사과' }).ok, true);
  assert.equal(game.say('b', { text: '과자' }).ok, true);
  // 앞에서 “과자”를 이미 썼으므로, “과”로 시작하는 차례에 다시 쓰면 거절됩니다.
  game.chain = game.chain.slice(0, 1);
  game.turn = 1;
  assert.equal(game.requiredSyllable(), '과');
  const dup = game.say('b', { text: '과자' });
  assert.equal(dup.ok, false);
  assert.equal(dup.reason, 'duplicate');
  assert.equal(game.chain.length, 1, '거절되면 판이 그대로');
});

test('끝말잇기: 다음 사람이 이어 말할 수 없는 한방 단어는 낼 수 없다', function () {
  assert.equal(WC.isDictionaryWord('우라늄'), true, '우라늄은 사전에 있는 낱말');
  assert.equal(WC.leavesFollowUp('우라늄', new Set()), false, '하지만 이어 말할 낱말이 없음');
  const game = game2();
  const bad = game.say('a', { text: '우라늄' });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'last_word');
  assert.equal(game.chain.length, 0);
  // 사전의 모든 낱말은 '이어 말할 낱말'이 남는지 스스로 확인할 수 있다
  const deadEnds = WC.WORDS.filter(function (w) {
    return WC.isPlayable(w, new Set());
  });
  assert.ok(deadEnds.length > WC.WORDS.length * 0.85, '85% 이상이 실제로 낼 수 있는 낱말');
});

test('끝말잇기: 낸 낱말은 다음 사람이 이어 말할 수 있는 상태를 남긴다', function () {
  const game = game2();
  game.say('a', { text: '사과' });
  const required = game.requiredSyllable();
  const options = WC.followers(required, game.used).filter(function (w) {
    return WC.isPlayable(w, game.used);
  });
  assert.ok(options.length > 0, '“' + required + '”로 시작하는 낱말이 남아 있어야 함');
  assert.equal(game.stateFor('b').optionsCount, options.length);
});

/* ---------------- 제한 시간과 탈락 ---------------- */

test('끝말잇기: 제한 시간을 넘기면 목숨 1개를 잃고 차례가 넘어간다', function () {
  const game = game2();
  const first = game.currentPlayer();
  const before = first.lives;
  game.deadline = Date.now() - 10;
  const result = game.tick(Date.now());
  assert.ok(result && result.changed);
  assert.equal(result.timeout, true);
  assert.equal(first.lives, before - 1);
  assert.equal(first.eliminated, false);
  assert.equal(game.currentPlayer().id, 'b', '차례가 넘어감');
  assert.ok(game.deadline > Date.now(), '다음 사람 제한 시간이 새로 시작');
  assert.match(game.log[game.log.length - 1].text + game.log[game.log.length - 2].text, /시간 초과|목숨/);
  assert.equal(game.tick(Date.now()), null, '시간이 남았으면 아무 일도 없음');
});

test('끝말잇기: 목숨 3개를 다 잃으면 탈락하고 마지막 한 명이 우승한다', function () {
  const game = game2();
  for (let i = 0; i < 6 && game.status === 'playing'; i++) {
    game.deadline = Date.now() - 10;
    game.tick(Date.now());
  }
  const a = game.playerById('a');
  const b = game.playerById('b');
  assert.equal(game.status, 'finished');
  assert.equal(game.finishReason, 'last_survivor');
  assert.ok(a.eliminated || b.eliminated, '한 사람은 탈락');
  const survivor = game.players.find(function (p) { return !p.eliminated; });
  assert.equal(game.winnerId, survivor.id);
  const ranking = game.ranking();
  assert.equal(ranking[0].id, survivor.id);
  assert.equal(ranking[0].rank, 1);
  assert.equal(ranking[1].result.indexOf('탈락'), 0);
});

test('끝말잇기: 정해진 낱말 수를 다 이으면 많이 말한 사람이 우승한다', function () {
  const game = game2({ options: { seconds: 20, maxTurns: 6 } });
  let guard = 0;
  while (game.status === 'playing' && guard < 40) {
    guard += 1;
    const current = game.currentPlayer();
    const required = game.requiredSyllable();
    const pool = (required === null ? WC.WORDS : WC.followers(required, game.used))
      .filter(function (w) { return WC.isPlayable(w, game.used); });
    assert.ok(pool.length, '낼 수 있는 낱말이 있어야 함');
    const result = game.say(current.id, { text: pool[0] });
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.finishReason, 'max_turns');
  assert.equal(game.turnNo, 6);
  assert.ok(game.winnerId);
});

/* ---------------- 봇 ---------------- */

test('끝말잇기: 봇끼리 끝까지 두고 순위가 정해진다 (봇은 한방 단어를 내지 않는다)', function () {
  const game = new WC.Game([
    { id: 'a', name: '봇1', isBot: true },
    { id: 'b', name: '봇2', isBot: true },
    { id: 'c', name: '봇3', isBot: true }
  ], { options: { seconds: 20 } });
  const driver = new WC.BotDriver(game);
  let guard = 0;
  while (game.status === 'playing' && guard < 200) {
    guard += 1;
    const action = driver.tick();
    if (!action) break;
    if (action.action === 'say') {
      const result = game.say(action.playerId, action.payload);
      assert.equal(result.ok, true, JSON.stringify(result));
    } else {
      game.giveUp(action.playerId);
    }
  }
  assert.equal(game.status, 'finished');
  assert.ok(guard < 200);
  assert.equal(game.ranking().length, 3);
  assert.equal(game.ranking()[0].rank, 1);
  assert.equal(game.players.every(function (p) { return p.lives <= 3; }), true);
});

test('끝말잇기: stateFor 는 남은 시간·목숨·낱말 수·화면 상태를 담아 보내고, 거절 안내가 친절하다', function () {
  const game = game2();
  game.say('a', { text: '사과' });
  const state = game.stateFor('b');
  assert.equal(state.gameId, 'wordchain');
  assert.equal(state.required, '과');
  assert.equal(state.youTurn, true);
  assert.equal(state.youEliminated, false);
  assert.ok(state.deadline > state.serverNow);
  assert.equal(state.turnSeconds, 20);
  assert.equal(state.chain.length, 1);
  assert.equal(state.chain[0].word, '사과');
  assert.equal(state.dictionaryCount, WC.WORD_COUNT);
  assert.ok(state.players.every(function (p) { return typeof p.lives === 'number'; }));
  assert.ok(state.optionsCount > 0);
  assert.equal(state.status, 'playing');

  // 연습 모드에서도 같은 안내가 보이도록 엔진이 거절 이유를 글로 돌려줍니다.
  assert.match(game.reasonText('last_word'), /한방/);
  assert.match(game.reasonText('not_in_dictionary'), /사전/);
  assert.match(game.reasonText('too_short'), /2글자/);
  assert.match(game.reasonText('duplicate'), /이미 나온/);
});
