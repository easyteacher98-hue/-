'use strict';

/*
 * 과일 딩동 화면: 내 차례가 아니거나 이미 보낸 뒤에는 카드 뒤집기 클릭을 무시한다.
 * (더블클릭·키 연타로 요청이 두 번 나가는 것을 막는 클라이언트 쪽 안전장치)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const WebSocket = require('ws');
const { createHub } = require('../server.js');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function waitFor(fn, label, ms) {
  const deadline = Date.now() + (ms || 6000);
  while (Date.now() < deadline) {
    try {
      const value = fn();
      if (value) return value;
    } catch (err) { /* 계속 */ }
    await sleep(25);
  }
  throw new Error('대기 실패: ' + label);
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

async function createClass(env, name, pin) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(env.ws);
    const timer = setTimeout(function () { reject(new Error('반 생성 시간 초과')); }, 4000);
    ws.on('error', reject);
    ws.on('open', function () {
      ws.send(JSON.stringify({ t: 'classCreate', teacherCode: 'easy', name: name, pin: pin }));
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

test('카드 뒤집기를 빠르게 두 번 눌러도 서버로는 한 번만 보낸다', async function () {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  const env = { hub: hub, base: 'http://127.0.0.1:' + info.port, ws: 'ws://127.0.0.1:' + info.port + '/ws' };
  const code = await createClass(env, '딩동 반', '2451');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.document.querySelector('.game-card[href="#/halligalli"]').click();
    await waitFor(function () { return window.document.querySelector('#number'); }, '출석번호');
    await waitFor(function () { return window.BG.net.connected; }, '서버 연결', 5000);

    const input = window.document.querySelector('#number');
    input.value = '1';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await waitFor(function () { return window.document.querySelector('.group-card [data-action="hg.enterGroup"]'); }, '모둠 카드', 5000);
    window.document.querySelector('.group-card [data-action="hg.enterGroup"]').click();
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    window.document.querySelector('[data-action="hg.addBot"]').click();
    await waitFor(function () { return window.document.querySelector('[data-action="hg.start"]'); }, '시작 버튼');
    await sleep(150);
    window.document.querySelector('[data-action="hg.start"]').click();

    await waitFor(function () { return window.document.querySelector('.flip-btn'); }, '게임판', 6000);

    // 보낸 메시지를 세어 본다
    const sent = [];
    const original = window.BG.net.send;
    window.BG.net.send = function (msg) {
      sent.push(msg);
      return original.call(window.BG.net, msg);
    };

    const flip = window.document.querySelector('.flip-btn');
    flip.click();
    flip.click();
    window.BG.actions['hg.flip']();

    const flips = sent.filter(function (m) { return m.t === 'action' && m.action === 'flip'; });
    assert.equal(flips.length, 1, '빠르게 세 번 눌러도 요청은 한 번만 나간다 (보낸 횟수 ' + flips.length + ')');

    // 서버 상태가 돌아오면 다시 누를 수 있다
    await waitFor(function () { return window.BG.hg.state.flipPending === false; }, '다시 누를 수 있음', 3000);
  } finally {
    window.close();
    await env.hub.close();
  }
});
