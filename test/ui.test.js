'use strict';

/*
 * UI 스모크 테스트 (jsdom)
 * 실제 서버를 띄우고 브라우저와 같은 DOM 환경에서 화면을 열어
 * 포털 → 할리갈리 입장 → 대기방 → 게임 시작 → 카드 뒤집기/종 치기 → 교사 관전까지 확인합니다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createHub } = require('../server.js');

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function waitFor(fn, label, ms) {
  const deadline = Date.now() + (ms || 4000);
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
    // jsdom이 지원하지 않는 브라우저 API(스크롤 등) 알림은 무시합니다.
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

test('포털에 게임 카드(할리갈리 · 윷놀이 준비 중)가 보이고 할리갈리로 들어갈 수 있다', async function () {
  const hub = createHub({ groupCapacity: 4 });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelectorAll('.game-card').length >= 2; }, '포털 게임 카드');

    const cards = Array.from(window.document.querySelectorAll('.game-card'));
    const titles = cards.map(function (c) { return c.querySelector('.game-name').textContent; });
    assert.deepEqual(titles.slice(0, 2), ['할리갈리', '윷놀이']);
    assert.ok(cards[0].classList.contains('playable'));
    assert.ok(cards[1].classList.contains('coming'));
    assert.match(cards[1].textContent, /준비 중/);
    assert.match(window.document.body.textContent, /모둠 보드게임/);

    // 할리갈리 입장 화면
    window.location.hash = '#/halligalli';
    await waitFor(function () { return window.document.querySelector('.group-grid .group-card'); }, '모둠 방 목록');
    const groups = window.document.querySelectorAll('.group-grid .group-card');
    assert.equal(groups.length, 6);
    assert.match(groups[0].textContent, /1모둠/);
    assert.match(groups[0].querySelector('.group-occ').textContent, /0/);
    assert.ok(window.document.querySelector('[data-action="hg.bot"]'), 'AI 봇 연습 카드');
    assert.ok(window.document.querySelector('[data-action="hg.teacher"]'), '교사 관전 카드');

    // 규칙 모달
    click(window, '[data-action="hg.rules"]');
    await waitFor(function () { return window.document.querySelector('.modal'); }, '규칙 모달');
    const modalText = window.document.querySelector('.modal').textContent;
    assert.match(modalText, /정확히 5개/);
    assert.match(modalText, /56장/);
    assert.match(modalText, /스페이스바/);
    click(window, '[data-action="ui.closeModal"]');

    assert.equal(dom.__errors.length, 0, 'JS 오류가 없어야 한다: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await hub.close();
  }
});

test('학생 입장 → 봇으로 인원 채우기 → 게임 시작 → 카드 뒤집기 → 종 치기가 화면에 반영된다', async function () {
  const hub = createHub({ groupCapacity: 4 });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:3000/'.replace('3000', String(info.port)));
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-card'); }, '포털');

    window.location.hash = '#/halligalli';
    await waitFor(function () { return window.document.querySelector('#nickname'); }, '닉네임 입력');

    type(window, '#nickname', '지원');
    click(window, '.group-card [data-action="hg.enterGroup"]');

    // 대기방
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    assert.match(window.document.body.textContent, /1모둠/);
    assert.match(window.document.querySelector('.seat-list').textContent, /지원/);
    assert.ok(window.document.querySelector('[data-action="hg.start"]'), '방장은 시작 버튼이 보인다');

    // 봇 3명 추가 → 4명
    for (let i = 0; i < 3; i++) {
      click(window, '[data-action="hg.addBot"]');
      await sleep(120);
    }
    await waitFor(function () {
      return window.document.querySelectorAll('.seat-list .seat').length >= 3;
    }, '봇 추가 반영');
    await waitFor(function () {
      const btn = window.document.querySelector('[data-action="hg.start"]');
      return btn && !btn.disabled;
    }, '시작 버튼 활성화');

    click(window, '[data-action="hg.start"]');

    // 게임판
    await waitFor(function () { return window.document.querySelector('.table'); }, '게임판');
    assert.equal(window.document.querySelectorAll('.tile').length, 4, '4명의 카드 자리');
    assert.ok(window.document.querySelector('.bell'), '종 버튼');
    assert.ok(window.document.querySelector('.log-panel'), '게임 기록');
    assert.equal(window.document.querySelectorAll('.tile.is-self').length, 1, '내 자리 표시');

    // 내 차례가 될 때까지 기다렸다가 뒤집기 (봇이 먼저 할 수 있음)
    const flipped = await waitFor(function () {
      const btn = window.document.querySelector('.flip-btn');
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    }, '내 차례', 8000);
    assert.ok(flipped);

    await waitFor(function () {
      return window.document.querySelectorAll('.log-item.flip').length > 0 || /공개/.test(window.document.querySelector('.log-panel').textContent);
    }, '뒤집기 기록');

    // 종 치기: 5개가 아니면 오답 기록이 남는다
    const before = window.document.querySelector('.log-panel').textContent;
    click(window, '.bell');
    await waitFor(function () {
      return window.document.querySelector('.log-panel').textContent !== before;
    }, '종 결과 반영');

    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await hub.close();
  }
});

test('AI 봇 연습은 서버 없이도 게임판이 뜨고 봇이 스스로 플레이한다', async function () {
  const hub = createHub({ groupCapacity: 4 });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-card'); }, '포털');
    window.location.hash = '#/halligalli/bot';
    await waitFor(function () { return window.document.querySelector('[data-action="hg.botStart"]'); }, '봇 연습 설정');

    click(window, '[data-action="hg.botStart"]');
    await waitFor(function () { return window.document.querySelector('.table'); }, '연습 게임판');
    assert.equal(window.document.querySelectorAll('.tile').length, 4);

    // 내 차례에 카드를 뒤집으면 봇들이 이어서 플레이한다
    await waitFor(function () {
      const btn = window.document.querySelector('.flip-btn');
      return btn && !btn.disabled;
    }, '내 차례');
    click(window, '.flip-btn');

    const before = window.document.querySelectorAll('.log-item').length;
    await waitFor(function () {
      return window.document.querySelectorAll('.log-item').length > before;
    }, '봇 플레이', 8000);

    // 합계 보기 토글
    click(window, '[data-action="hg.hintToggle"]');
    await waitFor(function () { return window.document.querySelector('.totals'); }, '합계 표시');

    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await hub.close();
  }
});

test('교사 관전 화면에 6개 모둠 현황이 보이고 관전 입장이 된다', async function () {
  const hub = createHub({ groupCapacity: 4 });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-card'); }, '포털');
    window.location.hash = '#/halligalli/teacher';
    await waitFor(function () { return window.document.querySelectorAll('.room-card').length === 6; }, '교사 대시보드');
    assert.match(window.document.body.textContent, /교사 관전 모드/);
    const cards = window.document.querySelectorAll('.room-card');
    assert.match(cards[0].textContent, /1모둠/);
    assert.match(cards[0].textContent, /대기 중/);

    // 관전 입장 (아직 게임 전이므로 대기 안내가 보인다)
    click(window, '.room-card [data-action="hg.watch"]');
    await waitFor(function () {
      return window.document.querySelector('[data-action="hg.watchBack"]');
    }, '관전 화면');
    assert.ok(window.document.querySelector('[data-action="hg.watchBack"]'), '관전 종료 버튼');

    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await hub.close();
  }
});

test('대기방에서 모둠 목록으로 나갔다가 다시 들어가고, 방 나가기로 자리를 정리한다', async function () {
  const hub = createHub({ groupCapacity: 4 });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-card'); }, '포털');
    window.location.hash = '#/halligalli';
    await waitFor(function () { return window.document.querySelector('#nickname'); }, '닉네임 입력');

    type(window, '#nickname', '다시들어가기');
    const third = Array.from(window.document.querySelectorAll('.group-grid .group-card'))[2];
    third.querySelector('[data-action="hg.enterGroup"]').click();
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    assert.ok(window.document.querySelector('[data-action="hg.leave"]'), '대기방에 방 나가기 버튼');

    // 모둠 선택으로 돌아가도 자리는 남아 있고 '다시 들어가기'가 보인다
    click(window, '.back-link');
    await waitFor(function () { return window.document.querySelector('[data-action="hg.reenter"]'); }, '다시 들어가기 카드');
    const mine = window.document.querySelector('.group-card.is-self');
    assert.ok(mine, '내가 참여 중인 모둠 카드 표시');
    assert.match(mine.textContent, /3모둠/);
    assert.match(window.document.querySelector('.my-room-banner').textContent, /참여 중/);

    // 다시 들어가기 → 대기방으로 복귀
    click(window, '[data-action="hg.reenter"]');
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방 복귀');
    assert.match(window.document.querySelector('.seat-list').textContent, /다시들어가기/);

    // 방 나가기 → 자리 정리, 로비 카드가 0/4명
    click(window, '[data-action="hg.leave"]');
    await waitFor(function () { return window.document.querySelector('.group-grid'); }, '모둠 목록 복귀');
    await waitFor(function () {
      const cards = Array.from(window.document.querySelectorAll('.group-card'));
      const card = cards.find(function (c) { return /3모둠/.test(c.textContent); });
      return card && /0/.test(card.querySelector('.group-occ').textContent);
    }, '자리 정리 반영');
    assert.equal(window.document.querySelector('.group-card.is-self'), null, '내 자리 표시가 사라진다');

    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await hub.close();
  }
});

test('게임판의 방 나가기 · 방장 게임 종료 버튼이 있고, 게임 종료를 누르면 대기실로 돌아온다', async function () {
  const hub = createHub({ groupCapacity: 4 });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-card'); }, '포털');
    window.location.hash = '#/halligalli';
    await waitFor(function () { return window.document.querySelector('#nickname'); }, '닉네임 입력');
    type(window, '#nickname', '방장');
    click(window, '.group-card [data-action="hg.enterGroup"]');
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');

    for (let i = 0; i < 3; i++) {
      click(window, '[data-action="hg.addBot"]');
      await sleep(120);
    }
    await waitFor(function () {
      const btn = window.document.querySelector('[data-action="hg.start"]');
      return btn && !btn.disabled;
    }, '시작 버튼 활성화');
    click(window, '[data-action="hg.start"]');
    await waitFor(function () { return window.document.querySelector('.table'); }, '게임판');

    assert.ok(window.document.querySelector('.board-tools [data-action="hg.leave"]'), '게임판 방 나가기 버튼');
    const endBtn = window.document.querySelector('[data-action="hg.endGame"]');
    assert.ok(endBtn, '방장에게 게임 종료 버튼');
    assert.match(endBtn.textContent, /게임 종료/);

    // 확인 모달 → 게임 종료 → 대기실
    click(window, '[data-action="hg.endGame"]');
    await waitFor(function () { return window.document.querySelector('.modal'); }, '종료 확인 모달');
    assert.match(window.document.querySelector('.modal').textContent, /게임을 종료할까요/);
    click(window, '[data-action="hg.confirmEndGame"]');
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기실 복귀');
    assert.match(window.document.body.textContent, /게임 준비/);
    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await hub.close();
  }
});

test('교사 관전 화면에서 모둠 방을 초기화할 수 있다', async function () {
  const hub = createHub({ groupCapacity: 4 });
  const info = await hub.start(0, '127.0.0.1');
  const dom = await openPage('http://127.0.0.1:' + info.port + '/');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-card'); }, '포털');
    window.location.hash = '#/halligalli/teacher';
    await waitFor(function () { return window.document.querySelectorAll('.room-card').length === 6; }, '교사 대시보드');

    const resetBtn = window.document.querySelector('.room-card [data-action="hg.resetRoom"]');
    assert.ok(resetBtn, '방 초기화 버튼');
    click(window, '.room-card [data-action="hg.resetRoom"]');
    await waitFor(function () { return window.document.querySelector('.modal'); }, '초기화 확인 모달');
    assert.match(window.document.querySelector('.modal').textContent, /초기화/);
    click(window, '[data-action="hg.confirmResetRoom"]');
    await waitFor(function () {
      const toast = window.document.getElementById('toast');
      return toast && /초기화/.test(toast.textContent);
    }, '초기화 알림');
    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await hub.close();
  }
});
