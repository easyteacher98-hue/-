'use strict';

/*
 * "다른 모둠·다른 반이 이겼다고 알림이 뜸" 회귀 테스트
 * - 같은 반의 다른 모둠이 끝나도, 내 화면(내가 들어가 있는 방)에는 결과창이 뜨지 않습니다.
 * - 내 방이 끝났을 때만 결과창이 뜨는지도 함께 확인합니다.
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

test('같은 반 다른 모둠이 끝나도 내 화면에는 결과창이 뜨지 않는다', async function () {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  const env = { hub: hub, base: 'http://127.0.0.1:' + info.port, ws: 'ws://127.0.0.1:' + info.port + '/ws' };
  const code = await createClass(env, '결과 알림 반', '2451');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/yut';
    await waitFor(function () { return window.document.querySelector('#number'); }, '출석번호');
    await waitFor(function () { return window.BG.net.connected; }, '서버 연결', 5000);
    const input = window.document.querySelector('#number');
    input.value = '1';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await waitFor(function () { return window.document.querySelector('.group-card [data-action="mini.enterGroup"]'); }, '모둠 카드', 5000);
    window.document.querySelector('.group-card [data-action="mini.enterGroup"]').click();
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    window.document.querySelector('[data-action="mini.addBot"]') && window.document.querySelector('[data-action="mini.addBot"]').click();
    await sleep(200);
    const startBtn = window.document.querySelector('[data-action="mini.start"]');
    assert.ok(startBtn, '시작 버튼');
    startBtn.click();
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.yut.room'; }, '게임판 시작');
    await waitFor(function () { return window.BG.mini.state.room && window.BG.mini.state.room.status === 'playing'; }, '게임 진행');
    const myCode = window.BG.mini.state.room.code;

    const ranking = [
      { rank: 1, id: 'x1', name: '2모둠 친구', number: 3, isBot: false },
      { rank: 2, id: 'x2', name: '로봇', number: null, isBot: true }
    ];

    // 다른 모둠(2모둠)의 결과 → 내 화면에는 결과창 없음
    window.BG.net.emit('game_result', {
      t: 'game_result', gameId: 'yut', classCode: code, code: '2',
      ranking: ranking, points: { 3: 100 }, winners: [3], recordedAt: Date.now()
    });
    await sleep(120);
    assert.equal(window.document.querySelector('.mg-result'), null, '다른 모둠 결과창은 뜨지 않는다');

    // 내 방의 결과 → 결과창이 뜬다
    window.BG.net.emit('game_result', {
      t: 'game_result', gameId: 'yut', classCode: code, code: myCode,
      ranking: ranking, points: { 3: 100 }, winners: [3], recordedAt: Date.now() + 1
    });
    await waitFor(function () { return window.document.querySelector('.mg-result'); }, '내 방 결과창');
    assert.match(window.document.querySelector('.mg-result').textContent, /결과/);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await hub.close();
  }
});
