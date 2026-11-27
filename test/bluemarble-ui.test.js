'use strict';

/*
 * 부루마블 UI 스모크 테스트 (jsdom)
 * 우리 반 포털 → 부루마블 입장 → 출석번호 → 모둠 방 → 봇 추가 → 3D(대체 2D) 보드 → 주사위/매입
 * → AI 봇 연습 화면까지 실제 화면 흐름을 확인합니다.
 * (jsdom에는 WebGL이 없으므로 3D 대신 2D 대체 보드가 그려지는지도 함께 확인합니다.)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const WebSocket = require('ws');
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

function type(window, selector, value) {
  const el = window.document.querySelector(selector);
  assert.ok(el, selector + ' 입력창이 있어야 한다');
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function click(window, selector) {
  const el = window.document.querySelector(selector);
  assert.ok(el, selector + ' 요소가 있어야 한다');
  el.click();
  return el;
}

async function boot() {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  return {
    hub: hub,
    port: info.port,
    base: 'http://127.0.0.1:' + info.port,
    ws: 'ws://127.0.0.1:' + info.port + '/ws'
  };
}

function createClass(env, name, pin) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(env.ws);
    const timer = setTimeout(function () { reject(new Error('반 생성 시간 초과')); }, 4000);
    ws.on('error', reject);
    ws.on('open', function () {
      ws.send(JSON.stringify({ t: 'classCreate', teacherCode: 'easy', name: name || '테스트 반', pin: pin || '2451' }));
    });
    ws.on('message', function (raw) {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch (err) { return; }
      if (msg.t === 'class_created') {
        clearTimeout(timer);
        ws.close();
        resolve(msg.code);
      }
    });
  });
}

/* ---------------- 우리 반 포털 ---------------- */

test('우리 반 포털에 전국여행 마블 (3D) 카드가 플레이 가능으로 보인다', async function () {
  const env = await boot();
  const code = await createClass(env, '3학년 2반', '2451');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    const cards = window.document.querySelectorAll('.game-card');
    assert.ok(cards.length >= 2);
    const bm = window.document.querySelector('.game-card[href="#/bluemarble"]');
    assert.ok(bm, '전국여행 마블 카드');
    assert.match(bm.textContent, /전국여행 마블/);
    assert.match(bm.textContent, /3D/);
    assert.ok(bm.querySelector('.badge.ready'), '플레이 가능 배지');
    assert.ok(bm.querySelector('.bm-deco'), '3D 장식');
    assert.ok(window.document.querySelector('.game-card[href="#/halligalli"]'), '과일 딩동 카드도 그대로');
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 입장 · 대기방 · 게임판 ---------------- */

test('번호로 모둠 방에 입장하고, 봇을 추가해 시작하면 2D 대체 보드에 28칸과 3D 버튼이 보인다', async function () {
  const env = await boot();
  const code = await createClass(env, '부루마블 반', '2451');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    click(window, '.game-card[href="#/bluemarble"]');
    await waitFor(function () { return window.document.querySelector('#number'); }, '출석번호 입력');
    await waitFor(function () { return window.BG.net.connected; }, '서버 연결');

    assert.match(window.document.body.textContent, /전국여행 마블/);
    assert.match(window.document.body.textContent, /더블 = 한 번 더/);
    await waitFor(function () {
      return window.document.querySelectorAll('.group-card').length === 6;
    }, '1~6모둠 방 목록');
    assert.equal(window.document.querySelectorAll('.group-card').length, 6, '1~6모둠 방');
    assert.ok(window.document.querySelector('[data-action="bm.rules"]'), '규칙 버튼');
    assert.ok(window.document.querySelector('[data-action="bm.bot"]'), 'AI 봇 연습');

    type(window, '#number', '4');
    const enter = window.document.querySelector('.group-card [data-action="bm.enterGroup"]');
    assert.ok(enter, '모둠 입장 버튼');
    enter.click();

    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    assert.match(window.document.querySelector('.seat-list').textContent, /4번/);
    assert.match(window.document.body.textContent, /1모둠/);
    assert.ok(window.document.querySelector('[data-action="bm.addBot"]'), '방장은 봇 추가');
    assert.ok(window.document.querySelector('[data-action="bm.start"]'), '방장은 시작 버튼');
    assert.ok(window.document.querySelector('[data-action="bm.rounds"]'), '라운드 제한 선택');

    // 봇 2명 추가 후 시작
    for (let i = 0; i < 2; i++) {
      click(window, '[data-action="bm.addBot"]');
      await sleep(140);
    }
    await waitFor(function () {
      return /3\/4명/.test(window.document.body.textContent);
    }, '봇 2명 추가');
    click(window, '[data-action="bm.start"]');

    await waitFor(function () { return window.document.querySelector('#bm-canvas'); }, '게임판');
    await waitFor(function () { return window.document.querySelector('.bm2d'); }, '2D 대체 보드');
    assert.equal(window.document.querySelectorAll('.bm2d-tile').length, 28, '28칸');
    assert.equal(window.document.querySelectorAll('.bm-player').length, 3, '나 + 봇 2명');
    assert.match(window.document.querySelector('.bm-turn-chip').textContent, /내 차례|님 차례/);
    assert.ok(window.document.querySelector('[data-action="bm.roll"]'), '주사위 굴리기 버튼');
    assert.ok(window.document.querySelector('[data-action="bm.cameraReset"]'), '시점 초기화 버튼');
    assert.equal(window.document.querySelector('.bm-die'), null, '아직 주사위 없음');

    // 주사위를 굴리면 결과·기록이 화면에 반영된다
    click(window, '[data-action="bm.roll"]');
    await waitFor(function () { return window.document.querySelectorAll('.bm-die').length === 2; }, '주사위 결과', 8000);
    assert.match(window.document.querySelector('.bm-dice-readout').textContent, /\+/);
    await waitFor(function () {
      const log = window.document.querySelector('.bm-log-panel');
      return log && /주사위/.test(log.textContent);
    }, '게임 기록');

    // 매입 기회가 나오면 버튼이 보이고, 눌러서 매입할 수 있다
    const offer = window.document.querySelector('[data-action="bm.buy"]');
    if (offer) {
      offer.click();
      await waitFor(function () {
        const log = window.document.querySelector('.bm-log-panel');
        return log && /매입/.test(log.textContent);
      }, '매입 기록');
    }

    // 규칙 팝업
    click(window, '[data-action="bm.rules"]');
    await waitFor(function () { return window.document.querySelector('.modal'); }, '규칙 팝업');
    assert.match(window.document.querySelector('.modal').textContent, /전국여행 마블 규칙/);
    assert.match(window.document.querySelector('.modal').textContent, /황금열쇠/);
    assert.ok(window.document.querySelectorAll('.bm-rule-tile').length === 28, '보드 28칸 안내');
    click(window, '.modal [data-action="ui.closeModal"]');
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- AI 봇 연습 ---------------- */

test('AI 봇 연습은 서버 없이도 3인 게임을 시작하고 봇이 스스로 플레이한다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/#/bluemarble/bot');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('[data-action="bm.botStart"]'); }, '연습 설정');
    const start = window.document.querySelector('[data-action="bm.botStart"][data-count="3"]');
    assert.ok(start, '3인 시작 버튼');
    start.click();

    await waitFor(function () { return window.document.querySelector('.bm2d'); }, '봇 연습 보드');
    assert.equal(window.document.querySelectorAll('.bm-player').length, 3);
    assert.equal(window.document.querySelector('.bm2d-round').textContent.trim(), 'R1 / 15');

    click(window, '[data-action="bm.roll"]');
    await waitFor(function () {
      const log = window.document.querySelector('.bm-log-panel');
      return log && /주사위/.test(log.textContent);
    }, '내 주사위', 8000);

    // 봇 차례가 지나가며 기록이 쌓인다 (봇이 스스로 굴린다)
    await waitFor(function () {
      const log = window.document.querySelector('.bm-log-panel');
      const diceLines = (log.textContent.match(/주사위/g) || []).length;
      return diceLines >= 2;
    }, '봇 주사위', 12000);

    assert.ok(window.document.querySelector('[data-action="bm.rules"]'));
  } finally {
    window.close();
    await env.hub.close();
  }
});
