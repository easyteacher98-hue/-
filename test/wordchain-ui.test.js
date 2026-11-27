'use strict';

/*
 * 꼬리잡기 끝말잇기 – 화면(UI) 테스트 (jsdom)
 * 포털 카드 → 입장 화면 → AI 봇 연습에서 낱말을 입력해 잇기 → 남은 시간 막대까지 확인합니다.
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

test('끝말잇기: 포털에 카드가 보이고 학년 필터에도 들어간다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    const card = window.document.querySelector('.game-card[href="#/wordchain"]');
    assert.ok(card, '끝말잇기 카드');
    assert.match(card.textContent, /꼬리잡기 끝말잇기/);
    assert.match(card.textContent, /2~5명/);
    assert.ok(card.querySelector('.grade-badge.g-low'), '저학년 추천 배지');
    assert.ok(card.querySelector('.grade-badge.g-high'), '고학년 추천 배지');

    click(window, '.filter-tab[data-filter="solo"]');
    await sleep(80);
    assert.equal(window.document.querySelector('.game-card[href="#/wordchain"]'), null, '1인용 필터에서는 숨김');

    click(window, '.filter-tab[data-filter="mid"]');
    await sleep(80);
    assert.ok(window.document.querySelector('.game-card[href="#/wordchain"]'), '중학년 추천에 보임');
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('끝말잇기: 입장 화면에 6모둠 방·출석번호·AI 봇 연습이 있다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/wordchain';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.wordchain.entry'; }, '끝말잇기 입장');
    assert.equal(window.document.querySelectorAll('.group-grid .group-card').length, 6, '1~6모둠');
    assert.ok(window.document.getElementById('number'), '출석번호 입력');
    assert.ok(window.document.querySelector('[data-action="mini.bot"]'), 'AI 봇 연습');
    assert.match(window.document.querySelector('.screen-head').textContent, /꼬리잡기 끝말잇기/);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('끝말잇기: 봇 연습에서 낱말을 입력해 이어 말하고, 남은 시간·목숨이 보인다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/?class=DEMO');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/wordchain/bot';
    await waitFor(function () { return window.document.body.dataset.screen === 'mg.wordchain.bot'; }, '끝말잇기 연습 화면');
    click(window, '[data-action="mini.startBot"]');
    await waitFor(function () { return window.document.querySelector('.mg-board.mg-wordchain'); }, '끝말잇기 보드');

    assert.ok(window.document.getElementById('mg-wc-input'), '낱말 입력칸');
    assert.ok(window.document.querySelector('.mg-wc-timer .mg-wc-timer-fill'), '남은 시간 막대');
    assert.ok(window.document.querySelector('.mg-wc-target'), '시작 글자 표시');
    assert.match(window.document.querySelector('.mg-wc-players').textContent, /❤️/);

    const input = window.document.getElementById('mg-wc-input');
    input.value = '사과';
    click(window, '[data-action="mini.wcSay"]');
    await waitFor(function () {
      const chain = window.document.querySelectorAll('.mg-wc-word .mg-wc-word-text');
      return Array.prototype.some.call(chain, function (el) { return el.textContent === '사과'; });
    }, '사과가 사슬에 남음');
    const state = window.BG.mini.state.bot.game;
    assert.equal(state.chain[0].word, '사과');
    assert.ok(state.requiredSyllable(), '다음 글자 안내');

    // 다음 차례가 되면 입력칸이 “이 글자로 시작” 안내로 바뀌고, 남의 차례에는 입력칸이 없다.
    await waitFor(function () { return window.document.querySelector('.mg-wc-last b'); }, '마지막 낱말 표시');
    assert.match(window.document.querySelector('.mg-wc-last b').textContent, /사과/);
    assert.deepEqual(dom.__errors.map(String), []);
  } finally {
    window.close();
    await env.hub.close();
  }
});
