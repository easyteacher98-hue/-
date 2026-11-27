'use strict';

/*
 * 윷놀이 3D 연출 회귀 테스트 — 2026-11-27 수업 피드백 "윷가락·말도 부루마블 주사위처럼 3D로"
 *
 * - 3D 말판 스크립트가 실제로 제공됩니다.
 * - 3D 를 그릴 수 없는 기기(jsdom 처럼 WebGL 이 없는 곳)에서는 지금까지의 2D 윷판으로
 *   자연스럽게 내려가고, 말·윷가락 결과는 그대로 보입니다.
 * - 윷을 던지면 결과(도·개·걸·윷·모·빽도)가 화면에 나옵니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { JSDOM, VirtualConsole } = require('jsdom');
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

test('3D 윷놀이 스크립트를 같은 주소에서 내려준다', async function () {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  try {
    const body = await new Promise(function (resolve, reject) {
      http.get('http://127.0.0.1:' + info.port + '/js/yut3d.js', function (res) {
        let text = '';
        res.on('data', function (c) { text += c; });
        res.on('end', function () { resolve({ status: res.statusCode, text: text }); });
      }).on('error', reject);
    });
    assert.equal(body.status, 200);
    assert.match(body.text, /BG\.yut3d/);
    assert.match(body.text, /applyState/);

    const html = await new Promise(function (resolve, reject) {
      http.get('http://127.0.0.1:' + info.port + '/', function (res) {
        let text = '';
        res.on('data', function (c) { text += c; });
        res.on('end', function () { resolve(text); });
      }).on('error', reject);
    });
    assert.match(html, /js\/yut3d\.js/, 'index.html 이 3D 윷놀이를 불러온다');
  } finally {
    await hub.close();
  }
});

test('WebGL 이 없는 기기에서는 2D 윷판으로 내려가고, 3D 그릇과 안내가 함께 있다', async function () {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    assert.equal(window.BG.yut3d.supported(), false, 'jsdom 에는 WebGL 이 없다');
    assert.equal(window.BG.yut3d.mount(window.document.createElement('div')), null, '3D 를 못 그리면 조용히 null');

    window.location.hash = '#/yut/bot';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.yut.bot'; }, '윷놀이 연습');
    window.document.querySelector('[data-action="mini.startBot"]').click();
    await waitFor(function () { return window.document.querySelector('.mg-yut-svg'); }, '2D 윷판');
    assert.equal(window.document.querySelectorAll('.mg-yut-node').length, 29);
    assert.ok(window.document.getElementById('mg-yut3d'), '3D 말판을 넣을 자리');
    assert.equal(window.document.querySelector('.mg-yut-stage').classList.contains('is-3d'), false, '2D 로 보인다');
    assert.equal(window.document.querySelectorAll('.mg-yut-3d canvas').length, 0);

    // 윷가락을 던지면 결과가 나오고, 던지는 동작 표시가 붙는다
    const throwBtn = window.document.querySelector('[data-action="mini.throw"]');
    throwBtn.click();
    await waitFor(function () { return window.document.querySelector('.mg-stick-name'); }, '윷가락 결과');
    assert.match(window.document.querySelector('.mg-stick-name').textContent, /도|개|걸|윷|모|빽도/);
    assert.ok(window.document.querySelector('.mg-sticks.is-toss'), '던지는 동작 표시');
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await hub.close();
  }
});

test('말을 옮기면 2D 윷판에서도 말 위치가 바뀐다 (3D 가 없어도 진행이 보인다)', async function () {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/yut/bot';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.yut.bot'; }, '윷놀이 연습');
    window.document.querySelector('[data-action="mini.startBot"]').click();
    await waitFor(function () { return window.document.querySelector('.mg-yut-svg'); }, '2D 윷판');

    let moved = false;
    for (let i = 0; i < 15 && !moved; i += 1) {
      const ready = window.document.querySelectorAll('[data-action="mini.move"]');
      if (ready.length) {
        const before = window.document.querySelectorAll('.mg-yut-piece').length;
        ready[0].click();
        await waitFor(function () {
          return window.document.querySelectorAll('.mg-yut-piece').length !== before ||
            window.document.querySelector('[data-action="mini.throw"]');
        }, '말 이동 반영');
        moved = true;
        break;
      }
      const throwBtn = window.document.querySelector('[data-action="mini.throw"]');
      if (throwBtn) throwBtn.click();
      await sleep(320);
    }
    assert.ok(moved, '옮길 말 버튼이 나와야 한다');
    assert.ok(window.document.querySelectorAll('.mg-yut-piece').length >= 1, '말이 보인다');
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await hub.close();
  }
});

/*
 * 2026-11-27 "말이 이동하는거 하나하나 보여줬으면 좋겠어"
 * 걸(3칸)이면 1칸 → 2칸 → 3칸을 차례로 밟아야 합니다.
 * 3D 연출은 이 목록대로 한 칸씩 말을 움직입니다.
 */
test('3D 말은 도착 자리까지 한 칸씩 밟아 갑니다 (엔진 경로와 같은 순서)', async function () {
  const hub = createHub({ groupCapacity: 4, store: false });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.BG && window.BG.yut3d && window.Yut; }, '윷놀이 스크립트');
    const YT = window.Yut;
    const paths = YT.PATHS;
    const rawNodes = window.BG.yut3d.pathNodes;
    const nodes = function (from, to, opts) { return Array.from(rawNodes(from, to, opts)); };
    assert.equal(typeof nodes, 'function', '경로를 확인할 수 있다');

    // 출발점에서 나가면 1 → 2 → 3
    assert.deepEqual(nodes(null, { path: 'outer', idx: 3 }), [1, 2, 3]);
    // 모서리(5)에 정확히 멈추면 지름길로 (지나치면 그냥 바깥 둘레)
    assert.deepEqual(nodes({ path: 'outer', idx: 3 }, { path: 'd5', idx: 0 }), [4, 5]);
    assert.deepEqual(nodes({ path: 'outer', idx: 3 }, { path: 'outer', idx: 6 }), [4, 5, 6]);
    // 완주는 마지막 자리(출발점)까지 밟고 갑니다.
    assert.deepEqual(nodes({ path: 'outer', idx: 18 }, null, { toFinish: true }), [19, 0]);

    // 엔진이 계산한 도착 자리와 같은 순서·같은 칸 수인지 전부 확인합니다.
    Object.keys(paths).forEach(function (path) {
      const length = paths[path].length;
      for (let i = 0; i < length - 1; i++) {
        for (let steps = 1; steps <= 5; steps++) {
          const result = YT.advance({ path: path, idx: i }, steps);
          if (result.finished) {
            const hops = nodes({ path: path, idx: i }, null, { toFinish: true });
            assert.equal(hops[hops.length - 1], 0, path + ' ' + i + ' 완주는 출발점에서 끝난다');
            continue;
          }
          const hops = nodes({ path: path, idx: i }, result.pos);
          assert.ok(hops, path + ' ' + i + ' +' + steps + ' 경로가 앞으로 이어진다');
          assert.equal(hops.length, steps, path + ' ' + i + ' +' + steps + ' 은 ' + steps + '칸');
          assert.equal(hops[hops.length - 1], result.node, path + ' ' + i + ' +' + steps + ' 도착 자리');
        }
      }
    });
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await hub.close();
  }
});
