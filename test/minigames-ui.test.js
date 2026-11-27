'use strict';

/*
 * 새 화면 UI 스모크 테스트 (jsdom)
 * 학년별 카테고리 필터 · 새 게임 입장/연습 화면 · 1인용 퍼즐 · 제작자 통계 페이지
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

/* ---------------- 포털 카테고리 ---------------- */

test('포털: 13개 게임 카드와 학년별 필터 탭이 보이고, 필터가 카드를 걸러 준다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    const cards = window.document.querySelectorAll('.game-card');
    assert.equal(cards.length, 13);
    for (const href of ['#/halligalli', '#/bluemarble', '#/streams', '#/gomoku', '#/liar', '#/yut', '#/puzzle',
      '#/rummi', '#/oldmaid', '#/janggi', '#/onecard', '#/dots', '#/sudoku']) {
      assert.ok(window.document.querySelector('.game-card[href="' + href + '"]'), href + ' 카드');
    }
    const tabs = window.document.querySelectorAll('.filter-tab');
    assert.equal(tabs.length, 5);
    assert.match(window.document.querySelector('.game-card[href="#/yut"]').textContent, /저학년|중학년|고학년/);
    assert.ok(window.document.querySelector('.game-card[href="#/puzzle"] .grade-badge.solo'), '1인용 배지');

    // 저학년 추천 → 오목(중·고학년)은 숨겨진다
    click(window, '.filter-tab[data-filter="low"]');
    await sleep(100);
    assert.ok(!window.document.querySelector('.game-card[href="#/gomoku"]'), '저학년 필터에서 오목 제외');
    assert.ok(window.document.querySelector('.game-card[href="#/yut"]'), '윷놀이는 남는다');
    assert.ok(window.document.querySelector('.filter-tab[data-filter="low"]').classList.contains('is-active'));

    // 1인용 → 퍼즐만
    click(window, '.filter-tab[data-filter="solo"]');
    await sleep(100);
    const soloCards = window.document.querySelectorAll('.game-card.playable');
    assert.equal(soloCards.length, 2);
    assert.ok(window.document.querySelector('.game-card[href="#/puzzle"]'));
    assert.ok(window.document.querySelector('.game-card[href="#/sudoku"]'));

    click(window, '.filter-tab[data-filter="all"]');
    await sleep(100);
    assert.equal(window.document.querySelectorAll('.game-card').length, 13);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 새 게임 입장 · 연습 ---------------- */

test('숫자 줄세우기: 입장 화면에서 번호를 넣고, AI 봇 연습에서 숫자를 칸에 놓을 수 있다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/streams';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.streams.entry'; }, '줄세우기 입장');
    assert.equal(window.document.querySelectorAll('.group-grid .group-card').length, 6);
    assert.ok(window.document.getElementById('number'), '출석번호 입력');
    assert.ok(window.document.querySelector('[data-action="mini.bot"]'), 'AI 봇 연습');

    window.location.hash = '#/streams/bot';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.streams.bot'; }, '연습 화면');
    click(window, '[data-action="mini.startBot"]');
    await waitFor(function () { return window.document.querySelectorAll('.mg-slot').length >= 40; }, '트랙 그리기');
    const canPlace = window.document.querySelectorAll('.mg-slot.can-place');
    assert.equal(canPlace.length, 20, '내 트랙의 빈 20칸이 모두 눌러 놓을 수 있는 칸');
    assert.ok(window.document.querySelector('.mg-track-hint'), '빈 칸을 누르라는 안내');
    assert.ok(!window.document.querySelector('.mg-track-hint.is-forced'), '강제 배치 경고는 없어졌다');
    assert.ok(!window.document.querySelector('.mg-slot.forced'), '막힌 칸 강조는 없어졌다');
    const tileText = window.document.querySelector('.mg-num-tile').textContent.trim();
    canPlace[0].click();
    await sleep(300);
    const filled = window.document.querySelectorAll('.mg-slot.filled');
    assert.ok(filled.length >= 1, '숫자가 놓여야 한다');
    assert.ok(Array.prototype.some.call(filled, function (el) { return el.textContent.trim() === tileText; }));

    // 방향키/스와이프 대신 클릭으로만 진행되므로 오류가 없어야 한다
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('오목: 입장 화면과 AI 봇 연습에서 15x15 오목판이 그려지고 돌을 놓을 수 있다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/gomoku/bot';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.gomoku.bot'; }, '오목 연습');
    click(window, '[data-action="mini.startBot"]');
    await waitFor(function () { return window.document.querySelectorAll('.mg-cell').length === 225; }, '오목판');
    const cell = window.document.querySelector('.mg-cell[data-action]');
    assert.ok(cell, '놓을 수 있는 칸');
    cell.click();
    await waitFor(function () {
      return window.document.querySelectorAll('.mg-cell.stone-1').length >= 1;
    }, '내 돌');
    assert.match(window.document.querySelector('.mg-gomoku-foot').textContent, /금수/);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('윷놀이: 29개 자리 윷판과 윷가락 던지기 버튼이 있고, 결과에 따라 말을 옮길 수 있다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/yut/bot';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.yut.bot'; }, '윷놀이 연습');
    click(window, '[data-action="mini.startBot"]');
    await waitFor(function () { return window.document.querySelector('.mg-yut-svg'); }, '윷판');
    assert.equal(window.document.querySelectorAll('.mg-yut-node').length, 29);
    click(window, '[data-action="mini.throw"]');
    await waitFor(function () { return window.document.querySelector('.mg-stick-name'); }, '윷가락 결과');
    const name = window.document.querySelector('.mg-stick-name').textContent;
    assert.match(name, /도|개|걸|윷|모|빽도/);

    // 빽도가 나오면 보드 위의 말이 없어 차례가 넘어갑니다. 옮길 말이 나올 때까지 다시 던집니다.
    let moved = false;
    for (let i = 0; i < 15 && !moved; i++) {
      const ready = window.document.querySelectorAll('[data-action="mini.move"]');
      if (ready.length) {
        ready[0].click();
        moved = true;
        break;
      }
      const throwBtn = window.document.querySelector('[data-action="mini.throw"]');
      if (throwBtn) throwBtn.click();
      await sleep(350);
    }
    assert.ok(moved, '옮길 말 버튼이 나와야 한다');
    await waitFor(function () { return window.document.querySelectorAll('.mg-yut-piece').length >= 1; }, '보드 위의 말');
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('라이어: 주제와 제시어 카드, 힌트 입력, 투표 화면이 그려진다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/liar/bot';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.liar.bot'; }, '라이어 연습');
    const select = window.document.getElementById('mg-bot-count');
    select.value = '4';
    click(window, '[data-action="mini.startBot"]');
    await waitFor(function () { return window.document.querySelector('.mg-secret'); }, '제시어 카드');
    assert.ok(window.document.querySelector('.mg-hint-list'));
    assert.ok(window.document.getElementById('mg-hint-input'), '내 힌트 차례 입력창');
    const input = window.document.getElementById('mg-hint-input');
    input.value = '빨개요';
    click(window, '[data-action="mini.hint"]');
    await waitFor(function () {
      return /빨개요/.test(window.document.querySelector('.mg-hint-list').textContent);
    }, '힌트 표시');
    assert.match(window.document.querySelector('.mg-cat-chip').textContent, /주제/);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 1인용 퍼즐 ---------------- */

test('1인용 퍼즐: 2048 보드가 그려지고 방향키로 숫자가 움직인다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/puzzle';
    await waitFor(function () { return window.document.body.dataset.screen === 'puzzle'; }, '퍼즐 홈');
    assert.equal(window.document.querySelectorAll('.pz-choice-card').length, 2);

    window.location.hash = '#/puzzle/2048';
    await waitFor(function () { return window.document.querySelectorAll('.pz-tile').length === 16; }, '2048 보드');
    assert.ok(window.document.querySelector('.pz-scoreboard'));
    // 실제 키 이벤트로 이동 (처음 숫자가 이미 왼쪽에 붙어 있으면 왼쪽 이동은 판이 그대로일 수 있어,
    // 판이 바뀌는 방향이 나올 때까지 네 방향을 차례로 눌러 확인합니다.)
    let moved = false;
    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']) {
      const before = window.document.querySelector('.pz-2048-grid').textContent;
      window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: key, bubbles: true }));
      await sleep(120);
      const after = window.document.querySelector('.pz-2048-grid').textContent;
      if (before !== after) { moved = true; break; }
    }
    assert.ok(moved, '방향키를 누르면 판이 바뀐다');

    window.location.hash = '#/puzzle/pairs';
    await waitFor(function () { return window.document.querySelectorAll('.pz-card').length === 16; }, '짝맞추기');
    const first = window.document.querySelector('.pz-card');
    first.click();
    await sleep(120);
    assert.equal(window.document.querySelectorAll('.pz-card.is-open').length, 1);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 제작자 통계 ---------------- */

test('제작자 통계: 교사용 화면 아래 링크로만 들어가고, 암호가 맞아야 대시보드가 보인다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/#/teacher');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.body.dataset.screen === 'teacher'; }, '교사 화면');
    const link = window.document.querySelector('.admin-link');
    assert.ok(link, '교사 화면 하단의 제작자 통계 링크');
    assert.equal(link.getAttribute('href'), '#/admin');

    // 학생 첫 화면에는 없다
    window.location.hash = '#/';
    await waitFor(function () { return window.document.body.dataset.screen === 'portal'; }, '첫 화면');
    assert.ok(!window.document.querySelector('.admin-link'), '학생 첫 화면에는 통계 링크 없음');

    window.location.hash = '#/admin';
    await waitFor(function () { return window.document.getElementById('admin-code'); }, '통계 로그인');
    const input = window.document.getElementById('admin-code');
    input.value = 'nope';
    click(window, '[data-action="admin.login"]');
    await waitFor(function () { return window.document.querySelector('.admin-error'); }, '암호 오류');
    assert.match(window.document.querySelector('.admin-error').textContent, /암호가 맞지 않습니다/);

    const input2 = window.document.getElementById('admin-code');
    input2.value = 'easy';
    click(window, '[data-action="admin.login"]');
    await waitFor(function () { return window.document.querySelector('.admin-totals'); }, '통계 대시보드');
    assert.ok(window.document.querySelectorAll('.admin-total').length >= 5);
    assert.ok(window.document.querySelectorAll('.admin-game-row').length >= 7);
    assert.match(window.document.querySelector('.admin-columns').textContent, /반별 현황/);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('미니게임 방에서도 뒤로가기로 화면을 벗어나면 자동으로 방에서 나가진다 (오목)', async function () {
  const env = await boot();
  const hostDom = await openPage(env.base + '/?class=DEMO');
  const studentDom = await openPage(env.base + '/?class=DEMO');
  const hw = hostDom.window;
  const sw = studentDom.window;
  function typeNumber(window, value) {
    const el = window.document.querySelector('#number');
    assert.ok(el, '#number 입력창');
    el.value = value;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  try {
    await waitFor(function () { return hw.document.querySelector('.game-grid'); }, '방장 포털');
    await waitFor(function () { return sw.document.querySelector('.game-grid'); }, '친구 포털');

    // 방장: 오목 1모둠, 1번
    click(hw, '.game-card[href="#/gomoku"]');
    await waitFor(function () { return hw.document.querySelector('#number'); }, '방장 번호 입력');
    await waitFor(function () { return hw.BG.net.connected; }, '방장 서버 연결', 4000);
    typeNumber(hw, '1');
    click(hw, '.group-card [data-action="mini.enterGroup"]');
    await waitFor(function () { return hw.document.querySelector('.seat-list'); }, '방장 대기방');

    // 친구: 같은 방, 2번
    click(sw, '.game-card[href="#/gomoku"]');
    await waitFor(function () { return sw.document.querySelector('#number'); }, '친구 번호 입력');
    await waitFor(function () { return sw.BG.net.connected; }, '친구 서버 연결', 4000);
    typeNumber(sw, '2');
    click(sw, '.group-card [data-action="mini.enterGroup"]');
    await waitFor(function () { return sw.document.querySelector('.seat-list'); }, '친구 대기방');
    await waitFor(function () {
      const list = hw.document.querySelector('.seat-list');
      return list && /2번/.test(list.textContent);
    }, '두 명이 모인 오목 대기방');
    assert.ok(sw.sessionStorage.getItem('mg.seat.gomoku'), '친구 좌석 정보 저장');

    // 뒤로가기로 방 화면을 벗어난다
    sw.history.back();
    await waitFor(function () { return sw.location.hash === '#/gomoku'; }, '뒤로가기');
    await waitFor(function () { return sw.sessionStorage.getItem('mg.seat.gomoku') === null; }, '좌석 정보 정리');
    await waitFor(function () {
      const list = hw.document.querySelector('.seat-list');
      return list && !/2번/.test(list.textContent);
    }, '유령 인원 정리');
    assert.match(hw.document.querySelector('.panel-title').textContent, /1\/2명/);

    assert.equal(hostDom.__errors.length, 0, 'JS 오류(방장): ' + hostDom.__errors.map(function (e) { return e.message; }).join(' | '));
    assert.equal(studentDom.__errors.length, 0, 'JS 오류(친구): ' + studentDom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    hw.close();
    sw.close();
    await env.hub.close();
  }
});
