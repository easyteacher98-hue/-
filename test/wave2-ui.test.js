'use strict';

/*
 * 2차 확장 게임 화면(UI) 테스트 (jsdom)
 * 포털 카드 · 입장 화면 · AI 봇 연습에서 실제로 보드가 그려지고 동작하는지 확인합니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createHub } = require('../server.js');

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function waitFor(fn, label, ms) {
  const deadline = Date.now() + (ms || 6000);
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const value = fn();
      if (value) return value;
    } catch (err) {
      lastErr = err;
    }
    await sleep(25);
  }
  throw new Error('대기 실패: ' + label + (lastErr ? ' / ' + lastErr.message : ''));
}

async function openPage(url) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', function (err) {
    if (/Not implemented/.test(String(err && err.message))) return;
    errors.push(err);
  });
  virtualConsole.on('error', function (msg) { errors.push(new Error(String(msg))); });
  const dom = await JSDOM.fromURL(url, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: virtualConsole
  });
  dom.__errors = errors;
  return dom;
}

async function boot() {
  const hub = createHub({ groupCapacity: 4, store: false, redis: false });
  const info = await hub.start(0, '127.0.0.1');
  return { hub: hub, port: info.port, base: 'http://127.0.0.1:' + info.port };
}

function click(window, selector) {
  const el = window.document.querySelector(selector);
  assert.ok(el, selector + ' 요소가 있어야 한다');
  el.click();
  return el;
}

async function enterBot(window, gameId, players) {
  window.location.hash = '#/' + gameId + '/bot';
  await waitFor(function () { return window.document.body.dataset.screen === 'mg.' + gameId + '.bot'; }, gameId + ' 연습 화면');
  window.BG.mini.startBotGame(gameId, players || 2);
  await waitFor(function () { return window.document.querySelector('.mg-board'); }, gameId + ' 보드');
  await sleep(120);
}

/* ---------------- 포털 ---------------- */

test('포털: 새 게임 6종 카드가 보이고, 학년 필터가 새 게임도 걸러 준다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    ['#/rummi', '#/oldmaid', '#/janggi', '#/onecard', '#/dots', '#/sudoku'].forEach(function (href) {
      assert.ok(window.document.querySelector('.game-card[href="' + href + '"]'), href + ' 카드');
    });
    const rummi = window.document.querySelector('.game-card[href="#/rummi"]');
    assert.match(rummi.textContent, /2~4명/);
    assert.ok(rummi.querySelector('.grade-badge.g-mid'), '중학년 추천');
    assert.ok(window.document.querySelector('.game-card[href="#/sudoku"] .grade-badge.solo'), '스도쿠 1인용 배지');
    assert.ok(window.document.querySelector('.game-card[href="#/oldmaid"] .grade-badge.g-low'), '도둑잡기 저학년');

    click(window, '.filter-tab[data-filter="solo"]');
    await sleep(80);
    assert.equal(window.document.querySelectorAll('.game-card').length, 2, '1인용은 퍼즐·스도쿠');
    assert.ok(window.document.querySelector('.game-card[href="#/sudoku"]'));

    click(window, '.filter-tab[data-filter="low"]');
    await sleep(80);
    assert.ok(window.document.querySelector('.game-card[href="#/oldmaid"]'));
    assert.ok(window.document.querySelector('.game-card[href="#/onecard"]'));
    assert.ok(!window.document.querySelector('.game-card[href="#/janggi"]'), '장기는 저학년 추천 아님');
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 숫자 타일 러미 ---------------- */

test('숫자 타일 러미: 입장 화면 · 봇 연습에서 타일을 골라 세트를 내면 우승 팝업이 뜬다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/rummi';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.rummi.entry'; }, '타일 러미 입장');
    assert.equal(window.document.querySelectorAll('.group-grid .group-card').length, 6);
    assert.ok(window.document.querySelector('[data-action="mini.bot"]'), 'AI 봇 연습 버튼');

    await enterBot(window, 'rummi', 2);
    assert.equal(window.document.querySelectorAll('.mg-tile').length, 14, '내 패 14장');

    // 연습 손패를 규칙에 맞게 바꿔 세트 내기를 확인합니다.
    const state = window.BG.mini.state.bot;
    state.game.players[0].hand = [
      { id: 'red8', color: 'red', value: 8, joker: false },
      { id: 'blue8', color: 'blue', value: 8, joker: false },
      { id: 'yellow8', color: 'yellow', value: 8, joker: false }
    ];
    state.game.initialPoints = 15;
    window.BG.mini.rerender();
    await sleep(60);
    ['red8', 'blue8', 'yellow8'].forEach(function (id) {
      click(window, '.mg-tile[data-id="' + id + '"]');
    });
    await sleep(60);
    assert.equal(window.document.querySelectorAll('.mg-tile.is-selected').length, 3, '세 장 선택');
    click(window, '[data-action="mini.rummiMeld"]');
    await sleep(60);
    assert.ok(window.document.querySelector('.mg-rummi-pending-set'), '낼 세트로 담김');
    click(window, '[data-action="mini.rummiSubmit"]');
    await waitFor(function () {
      const modal = window.document.querySelector('.mg-result');
      return modal && /결과/.test(modal.textContent);
    }, '결과 팝업');
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 도둑잡기 ---------------- */

test('도둑잡기: 봇 연습에서 앞사람 패를 눌러 카드를 뽑고 짝 결과가 보인다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    await enterBot(window, 'oldmaid', 3);
    assert.ok(window.document.querySelector('.mg-om-hand'), '내 패');
    const backs = window.document.querySelectorAll('.mg-om-back');
    assert.ok(backs.length >= 1, '앞사람 패 카드');
    const handBefore = window.BG.mini.state.bot.game.players[0].hand.length;
    backs[0].click();
    await waitFor(function () {
      const st = window.BG.mini.state.bot.game;
      return st.lastDraw && st.lastDraw.toId === 'me';
    }, '카드 뽑기 결과');
    const game = window.BG.mini.state.bot.game;
    assert.ok(game.players[0].hand.length <= handBefore + 1);
    assert.ok(window.document.querySelector('.mg-om-last'), '뽑은 카드 안내');
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 전통 장기 ---------------- */

test('전통 장기: 봇 연습에서 병을 눌러 앞으로 움직이고 판이 갱신된다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    await enterBot(window, 'janggi', 2);
    assert.equal(window.document.querySelectorAll('.mg-jg-cell').length, 90, '9×10 칸');
    assert.equal(window.document.querySelectorAll('.mg-jg-piece').length, 32, '기물 32개');
    click(window, '.mg-jg-cell[data-x="0"][data-y="6"]');
    await sleep(60);
    assert.ok(window.document.querySelector('.mg-jg-cell.is-selected'), '기물 선택');
    assert.equal(window.document.querySelectorAll('.mg-jg-cell.can-go').length, 2, '병은 앞·옆 두 곳');
    click(window, '.mg-jg-cell[data-x="0"][data-y="5"]');
    await waitFor(function () {
      const game = window.BG.mini.state.bot.game;
      return game.moves.length >= 1;
    }, '장기 첫 수');
    const game = window.BG.mini.state.bot.game;
    assert.equal(game.board[5][0].type, 'soldier');
    assert.equal(game.board[6][0], null);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 컬러 숫자 카드 ---------------- */

test('컬러 숫자 카드: 봇 연습에서 낼 수 있는 카드를 내면 손패가 줄어든다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    await enterBot(window, 'onecard', 2);
    assert.equal(window.document.querySelectorAll('.mg-oc-hand .mg-oc-card').length, 7, '손패 7장');
    const game = window.BG.mini.state.bot.game;
    // 첫 카드를 같은 색 숫자 카드로 바꿔 확실히 낼 수 있게 합니다.
    game.players[0].hand = [{ id: 'testCard', color: game.activeColor, type: 'number', value: 9 }];
    game.players[0].hand.push({ id: 'extra', color: game.activeColor, type: 'number', value: 8 });
    window.BG.mini.rerender();
    await sleep(60);
    click(window, '.mg-oc-card[data-card="testCard"]');
    await waitFor(function () {
      const g = window.BG.mini.state.bot.game;
      return g.players[0].hand.length === 1;
    }, '카드 내기');
    assert.equal(window.BG.mini.state.bot.game.players[0].hand.length, 1);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 선 긋기 땅따먹기 ---------------- */

test('선 긋기 땅따먹기: 봇 연습에서 선을 그으면 판에 남는다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    await enterBot(window, 'dots', 2);
    assert.equal(window.document.querySelectorAll('.mg-dots-line').length, 40, '선 40개');
    assert.equal(window.document.querySelectorAll('.mg-dots-dot').length, 25, '점 25개');
    click(window, '.mg-dots-line[data-type="h"][data-x="0"][data-y="0"]');
    await waitFor(function () {
      return window.BG.mini.state.bot.game.moves >= 1;
    }, '선 긋기');
    assert.ok(window.BG.mini.state.bot.game.hLines[0][0]);
    assert.ok(window.document.querySelector('.mg-dots-scores'), '점수 표시');
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 1인용 스도쿠 ---------------- */

test('1인용 스도쿠: 난이도를 고르고 빈 칸에 숫자를 넣고 힌트를 쓸 수 있다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/sudoku';
    await waitFor(function () { return window.document.body.dataset.screen === 'sudoku'; }, '스도쿠 메뉴');
    assert.equal(window.document.querySelectorAll('.sd-size-card').length, 3, '3가지 난이도');
    ['4×4', '6×6', '9×9'].forEach(function (label) {
      assert.match(window.document.body.textContent, new RegExp(label.replace('×', '×')));
    });

    window.location.hash = '#/sudoku/4';
    await waitFor(function () { return window.document.body.dataset.screen === 'sudoku.4'; }, '4×4 화면');
    assert.equal(window.document.querySelectorAll('.sd-cell').length, 16, '4×4 칸');
    assert.equal(window.document.querySelectorAll('.sd-num').length, 5, '1~4 + 지우기');
    assert.ok(window.document.querySelector('.sd-cell.is-fixed'), '처음부터 주어진 숫자');

    const game = window.BG.sudoku.S.game;
    let empty = null;
    for (let y = 0; y < 4 && !empty; y++) {
      for (let x = 0; x < 4; x++) {
        if (!game.puzzle[y][x]) { empty = { x: x, y: y }; break; }
      }
    }
    assert.ok(empty, '빈 칸이 있어야 함');
    click(window, '.sd-cell[data-x="' + empty.x + '"][data-y="' + empty.y + '"]');
    await sleep(40);
    assert.ok(window.document.querySelector('.sd-cell.is-selected'));
    click(window, '.sd-num[data-n="1"]');
    await sleep(60);
    assert.equal(game.grid[empty.y][empty.x], 1);

    const hintsBefore = game.hintsUsed;
    click(window, '[data-action="sudoku.hint"]');
    await waitFor(function () { return game.hintsUsed === hintsBefore + 1; }, '힌트');
    assert.ok(window.document.querySelector('.sd-chip'), '힌트/오답 표시');

    // 메모 모드
    click(window, '[data-action="sudoku.notes"]');
    await sleep(40);
    assert.match(window.document.body.textContent, /메모 켜짐/);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 모둠 방(서버) 화면 ---------------- */

test('선 긋기 땅따먹기 모둠 방: 번호로 입장해 봇과 시작하고, 선을 그으면 서버 판이 화면에 반영된다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/dots';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.dots.entry'; }, '선 긋기 입장');
    const numberInput = window.document.getElementById('number');
    assert.ok(numberInput);
    numberInput.value = '9';
    numberInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(window, '.group-card [data-action="mini.enterGroup"][data-code="1"]');
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.dots.room'; }, '방 화면');
    await waitFor(function () { return window.document.querySelector('[data-action="mini.addBot"]'); }, '대기방');
    click(window, '[data-action="mini.addBot"]');
    await sleep(200);
    await waitFor(function () {
      const btn = window.document.querySelector('[data-action="mini.start"]');
      return btn && !btn.disabled;
    }, '시작 버튼');
    click(window, '[data-action="mini.start"]');
    await waitFor(function () { return window.document.querySelectorAll('.mg-dots-line').length === 40; }, '서버 게임 판');
    assert.match(window.document.body.textContent, /9번/);
    const line = window.document.querySelector('.mg-dots-line[data-type="v"][data-x="2"][data-y="2"]');
    assert.ok(line && !line.disabled, '그을 수 있는 선');
    line.click();
    await waitFor(function () {
      const room = window.BG.mini.state.room;
      return room && room.game && room.game.vLines && room.game.vLines[2][2];
    }, '서버에 선 반영');
    assert.ok(window.BG.mini.state.room.game.vLines[2][2]);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});
