'use strict';

/*
 * UI 스모크 테스트 (jsdom)
 * 실제 서버를 띄우고 브라우저와 같은 DOM 환경에서
 * 첫 화면(반 만들기 · 반 코드 입장) → 우리 반 게임 포털 → 반 코드(?class=) 진입
 * → 출석번호 입장 → 대기방 → 게임 → 결과 팝업 → 교사 PIN 인증 순서로 확인합니다.
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
  const deadline = Date.now() + (ms || 5000);
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

/** 서버에 반을 하나 만들어 코드를 돌려줍니다. (화면 테스트용 준비) */
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

/* ---------------- 첫 화면 ---------------- */

test('첫 화면은 학생 [반 코드로 입장하기] 카드 하나만 크게 보여 주고, 교사 개설은 교사용 화면에서만 된다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.role-grid'); }, '첫 화면 역할 카드');
    assert.equal(window.document.querySelectorAll('.role-card').length, 1, '학생 카드 하나만');
    assert.ok(window.document.querySelector('.role-card.student'), '학생 카드');
    assert.equal(window.document.querySelector('.role-card.teacher'), null, '첫 화면에는 교사 카드가 없다');
    assert.equal(window.document.querySelector('#class-name'), null, '첫 화면에서는 반을 만들 수 없다');
    assert.match(window.document.body.textContent, /반 코드로 입장/);
    assert.doesNotMatch(window.document.body.textContent, /우리 반 만들기/);
    assert.equal(window.document.querySelectorAll('.game-card').length, 0, '첫 화면에는 게임 플레이 버튼이 없다');
    assert.ok(window.document.querySelector('#join-class-code'), '반 코드 입력');
    assert.equal(window.document.querySelectorAll('.role-ready .ready-chip').length, 4, '학생 준비물 안내 (반 코드 · 번호 · 이름 · 모둠)');
    assert.match(window.document.querySelector('.site-credit').textContent, /Made by easy/);
    assert.ok(window.document.querySelector('.site-credit .teacher-link'), '푸터의 교사용 링크');

    // 푸터의 '교사용' 링크 → 교사 전용 개설 화면
    click(window, '.site-credit .teacher-link');
    await waitFor(function () { return window.document.querySelector('#teacher-create-code'); }, '교사 개설 화면');
    assert.match(window.location.hash, /^#\/teacher/);
    assert.equal(window.document.querySelectorAll('.role-card').length, 1);
    assert.match(window.document.body.textContent, /우리 반 만들기/);
    assert.ok(window.document.querySelector('#class-name'), '반 이름 입력');
    assert.ok(window.document.querySelector('#class-pin'), '교사 PIN 입력');
    assert.ok(window.document.querySelector('#teacher-create-code'), '교사 개설 암호 입력');

    // 교사 개설 암호가 틀리면 서버가 거절한다
    type(window, '#class-name', '몰래 만든 반');
    type(window, '#class-pin', '2451');
    type(window, '#teacher-create-code', 'not-easy');
    click(window, '[data-action="portal.createClass"]');
    await waitFor(function () {
      const toast = window.document.getElementById('toast');
      return toast && /개설 암호/.test(toast.textContent);
    }, '개설 암호 안내');
    assert.equal(window.document.querySelector('.class-code-big'), null, '반이 만들어지지 않는다');

    // 암호가 맞으면 반 만들기 → 코드·전용 링크 안내 → 우리 반 열기
    type(window, '#teacher-create-code', 'easy');
    click(window, '[data-action="portal.createClass"]');
    await waitFor(function () { return window.document.querySelector('.class-code-big'); }, '반 코드 안내');
    const code = window.document.querySelector('.class-code-big').textContent.trim();
    assert.match(code, /^[A-Z0-9]{5}$/);
    assert.match(window.document.querySelector('.created-link').textContent, new RegExp('class=' + code));
    assert.ok(window.document.querySelector('[data-action="portal.copyCreatedLink"]'), '학생용 링크 복사');

    click(window, '[data-action="portal.openCreated"]');
    await waitFor(function () {
      return /몰래 만든 반/.test(window.document.body.textContent) &&
        window.document.querySelector('.game-grid .game-card');
    }, '우리 반 게임 포털');
    assert.match(window.location.hash, /^#\/class\//);
    assert.equal(window.document.querySelectorAll('.role-card').length, 0, '게임 포털에는 역할 카드가 없다');
    assert.match(window.document.body.textContent, new RegExp(code));
    assert.ok(window.document.querySelector('[href="#/halligalli/teacher"]'), '선생님 모드');
    assert.ok(window.document.querySelector('.game-card.playable'), '할리갈리 카드');
    assert.ok(window.document.querySelector('[href="#/bluemarble"]'), '부루마블 카드');

    // '다른 반'으로 돌아가면 첫 화면으로 돌아간다
    click(window, '[data-action="portal.changeClass"]');
    await waitFor(function () { return window.document.querySelector('.role-grid.solo'); }, '첫 화면 복귀');
    assert.equal(window.document.querySelectorAll('.role-card').length, 1, '복귀해도 학생 카드 하나만');
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('교사용 화면에서 PIN 형식이 틀리면 안내하고 만들지 않는다', async function () {
  const env = await boot();
  const dom = await openPage(env.base + '/#/teacher');
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('#teacher-create-code'); }, '교사 개설 화면');
    type(window, '#class-name', '검사 반');
    type(window, '#class-pin', '12');
    type(window, '#teacher-create-code', 'easy');
    click(window, '[data-action="portal.createClass"]');
    await waitFor(function () {
      const toast = window.document.getElementById('toast');
      return toast && /4~8자리/.test(toast.textContent);
    }, 'PIN 안내');
    assert.equal(window.document.querySelector('.class-code-big'), null, '반이 만들어지지 않는다');
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- ?class= 링크 · 출석번호 ---------------- */

test('?class=반코드 링크로 들어오면 바로 그 반의 게임 포털이 열리고, 번호로 모둠에 입장한다', async function () {
  const env = await boot();
  const code = await createClass(env, '3학년 2반', '2451');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '우리 반 포털');
    assert.match(window.location.hash, new RegExp('#/class/' + code));
    await waitFor(function () { return /3학년 2반/.test(window.document.body.textContent); }, '반 이름');
    assert.match(window.document.querySelector('.code-badge').textContent, new RegExp(code));

    click(window, '.game-card.playable');
    await waitFor(function () { return window.document.querySelector('#number'); }, '출석번호 입력');
    await waitFor(function () { return window.BG.net.connected; }, '서버 연결', 4000);
    const input = window.document.querySelector('#number');
    assert.equal(input.getAttribute('inputmode'), 'numeric');
    assert.match(window.document.body.textContent, /출석번호/);

    type(window, '#number', '3');
    click(window, '.group-card [data-action="hg.enterGroup"]');
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    assert.match(window.document.querySelector('.seat-list').textContent, /3번/);
    assert.match(window.document.body.textContent, /1모둠/);
    assert.ok(window.document.querySelector('[data-action="hg.start"]'), '방장은 시작 버튼');

    // 봇 3명 → 게임 시작 → 카드 뒤집기 · 종
    for (let i = 0; i < 3; i++) {
      click(window, '[data-action="hg.addBot"]');
      await sleep(110);
    }
    await waitFor(function () {
      const btn = window.document.querySelector('[data-action="hg.start"]');
      return btn && !btn.disabled;
    }, '시작 버튼');
    click(window, '[data-action="hg.start"]');
    await waitFor(function () { return window.document.querySelector('.table'); }, '게임판');
    assert.equal(window.document.querySelectorAll('.tile').length, 4);
    assert.ok(window.document.querySelector('.bell'));
    assert.match(window.document.querySelectorAll('.tile.is-self')[0].textContent, /3번/);

    await waitFor(function () {
      const btn = window.document.querySelector('.flip-btn');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    }, '내 차례', 8000);
    await waitFor(function () {
      return /공개/.test(window.document.querySelector('.log-panel').textContent);
    }, '뒤집기 기록');

    const before = window.document.querySelector('.log-panel').textContent;
    click(window, '.bell');
    await waitFor(function () {
      return window.document.querySelector('.log-panel').textContent !== before;
    }, '종 결과');

    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('출석번호가 1~99가 아니면 입장을 막고, 맞는 번호는 "12번"으로 표시된다', async function () {
  const env = await boot();
  const code = await createClass(env, '번호 검사 반', '3333');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    click(window, '.game-card.playable');
    await waitFor(function () { return window.document.querySelector('#number'); }, '번호 입력');

    // 0번은 거절
    type(window, '#number', '0');
    click(window, '.group-card [data-action="hg.enterGroup"]');
    await waitFor(function () {
      const toast = window.document.getElementById('toast');
      return toast && /1~99/.test(toast.textContent);
    }, '번호 오류 안내');
    assert.equal(window.document.querySelector('.seat-list'), null, '입장되지 않는다');

    // 숫자가 아닌 글자는 입력되지 않는다
    type(window, '#number', 'a1b2');
    assert.equal(window.document.querySelector('#number').value, '12');

    click(window, '.group-card [data-action="hg.enterGroup"]');
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    assert.match(window.document.querySelector('.seat-list').textContent, /12번/);
    assert.equal(window.localStorage.getItem('bg.numbers'), JSON.stringify({ [code]: '12' }));
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('번호와 이름을 함께 넣으면 대기방에 "7번 김민수"로 보이고 이름은 반별로 기억된다', async function () {
  const env = await boot();
  const code = await createClass(env, '이름 검사 반', '5555');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    click(window, '.game-card[href="#/halligalli"]');
    await waitFor(function () { return window.document.querySelector('#student-name'); }, '이름 입력');
    await waitFor(function () { return window.BG.net.connected; }, '서버 연결', 4000);

    const nameInput = window.document.querySelector('#student-name');
    assert.equal(nameInput.getAttribute('maxlength'), '10', '이름은 10자까지');

    type(window, '#number', '7');
    type(window, '#student-name', '김민수');
    assert.match(window.document.querySelector('#my-name-preview').textContent, /7번 김민수/);
    assert.equal(window.localStorage.getItem('bg.names'), JSON.stringify({ [code]: '김민수' }));

    click(window, '.group-card [data-action="hg.enterGroup"]');
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    assert.match(window.document.querySelector('.seat-list').textContent, /7번 김민수/);

    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('전국여행 마블 입장 화면에도 번호·이름 두 칸이 있고, 이름이 대기방에 보인다', async function () {
  const env = await boot();
  const code = await createClass(env, '마블 이름 반', '5566');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    click(window, '.game-card[href="#/bluemarble"]');
    await waitFor(function () { return window.document.querySelector('#number'); }, '번호 입력');
    assert.ok(window.document.querySelector('#student-name'), '이름 입력칸도 있다');
    await waitFor(function () { return window.BG.net.connected; }, '서버 연결', 4000);

    type(window, '#number', '4');
    type(window, '#student-name', '이영희');
    click(window, '.group-card [data-action="bm.enterGroup"]');
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    assert.match(window.document.querySelector('.seat-list').textContent, /4번 이영희/);
    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 교사 PIN ---------------- */

test('교사 모드는 반 PIN을 넣어야 열리고, 틀리면 막힌다', async function () {
  const env = await boot();
  const code = await createClass(env, '4학년 3반', '2468');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    await waitFor(function () { return window.BG.net.connected; }, '서버 연결', 4000);
    click(window, '[href="#/halligalli/teacher"]');
    await waitFor(function () { return window.document.querySelector('#teacher-pin'); }, '교사 PIN 화면');
    assert.match(window.document.body.textContent, /4학년 3반 선생님 확인/);

    type(window, '#teacher-pin', '0000');
    click(window, '[data-action="hg.teacherAuth"]');
    await waitFor(function () {
      const toast = window.document.getElementById('toast');
      return toast && /맞지 않습니다/.test(toast.textContent);
    }, '틀린 PIN 안내');
    assert.equal(window.document.querySelectorAll('.room-card').length, 0, '아직 관전 화면이 아니다');

    type(window, '#teacher-pin', '2468');
    click(window, '[data-action="hg.teacherAuth"]');
    await waitFor(function () { return window.document.querySelectorAll('.room-card').length === 6; }, '교사 대시보드');
    assert.match(window.document.body.textContent, /교사 관전 모드/);
    assert.match(window.document.querySelector('.room-card').textContent, /1모둠/);

    // 방 초기화도 PIN 인증 뒤에 동작한다
    click(window, '.room-card [data-action="hg.resetRoom"]');
    await waitFor(function () { return window.document.querySelector('.modal'); }, '초기화 확인');
    click(window, '[data-action="hg.confirmResetRoom"]');
    await waitFor(function () {
      const toast = window.document.getElementById('toast');
      return toast && /초기화/.test(toast.textContent);
    }, '초기화 알림');
    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await env.hub.close();
  }
});

/* ---------------- 결과 팝업 · 포인트 ---------------- */

test('우승하면 컨페티와 최종 순위 팝업(1~4등·카드·종 성공/실수·포인트)이 뜨고 다시 시작할 수 있다', async function () {
  const env = await boot();
  const code = await createClass(env, '결과 반', '5555');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    window.location.hash = '#/halligalli/bot';
    await waitFor(function () { return window.document.querySelector('[data-action="hg.botStart"]'); }, '봇 연습 설정');
    click(window, '[data-action="hg.botStart"]');
    await waitFor(function () { return window.document.querySelector('.table'); }, '연습 게임판');

    // 마지막까지 남은 사람이 정해진 상황을 만들어 결과 화면을 확인한다.
    window.BG.hg.state.bot.game.finishGame('no_cards');
    window.BG.hg.renderBot();

    await waitFor(function () { return window.document.querySelector('.result-modal'); }, '결과 팝업');
    const rows = window.document.querySelectorAll('.result-table tbody tr');
    assert.equal(rows.length, 4, '참가자 4명의 최종 순위');
    assert.match(rows[0].textContent, /🏆/);
    assert.match(rows[1].textContent, /🥈/);
    assert.match(rows[2].textContent, /🥉/);
    assert.match(window.document.querySelector('.result-title').textContent, /우승/);
    assert.ok(window.document.querySelectorAll('.confetti-piece').length >= 20, '컨페티 파티클');
    // 연습 모드에서는 우리 반 포인트를 적립하지 않으므로 '연습'으로 표시된다
    assert.match(rows[0].textContent, /연습/);

    // 실제 우리 반 게임 결과에서는 순위 포인트가 표시된다
    window.BG.state.number = '3';
    window.BG.hg.state.lastResult = {
      code: '1',
      points: { 3: 100, 5: 50, 7: 30, 9: 10 },
      ranking: []
    };
    const fakeGame = {
      status: 'finished',
      winner: '3번',
      startedAt: 1,
      players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      ranking: [
        { rank: 1, id: 'a', name: '3번', number: 3, isBot: false, cards: 22, eliminated: false, bells: { correct: 2, wrong: 1 } },
        { rank: 2, id: 'b', name: '5번', number: 5, isBot: false, cards: 0, eliminated: true, bells: { correct: 1, wrong: 0 } },
        { rank: 3, id: 'c', name: '7번', number: 7, isBot: false, cards: 0, eliminated: true, bells: { correct: 0, wrong: 2 } },
        { rank: 4, id: 'd', name: '9번', number: 9, isBot: false, cards: 0, eliminated: true, bells: { correct: 0, wrong: 0 } }
      ]
    };
    window.BG.ui.closeModal();
    window.BG.ui.modal(window.BG.hg.resultModalHtml(fakeGame, { code: '1', role: 'player', mode: 'multi', isHost: true }));
    const multiRows = window.document.querySelectorAll('.result-table tbody tr');
    assert.equal(multiRows.length, 4);
    assert.match(multiRows[0].textContent, /\+100P/);
    assert.match(multiRows[0].textContent, /🏆/);
    assert.match(multiRows[1].textContent, /\+50P/);
    assert.match(multiRows[2].textContent, /\+30P/);
    assert.match(multiRows[3].textContent, /\+10P/);
    assert.match(window.document.querySelector('.result-mine').textContent, /1등/);
    assert.ok(window.document.querySelector('[data-action="hg.resultRestart"]'), '다시 시작 버튼');
    assert.ok(window.document.querySelector('[data-action="hg.resultLeave"]'), '나가기 버튼');
    window.BG.ui.closeModal();

    // 연습 모드 다시 시작
    window.BG.hg.renderBot();
    await waitFor(function () { return window.document.querySelector('[data-action="hg.botRestart"]'); }, '결과 재표시');
    const restart = window.document.querySelector('[data-action="hg.botRestart"]');

    assert.ok(restart, '한 판 더 버튼');
    restart.click();
    await waitFor(function () {
      return window.document.querySelector('.table') && !window.document.querySelector('.result-modal');
    }, '한 판 더');
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('우리 반 포인트 랭킹과 내 기록(승수·포인트)이 화면과 브라우저 저장소에 반영된다', async function () {
  const env = await boot();
  const code = await createClass(env, '기록 반', '6666');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');

    window.BG.setNumberFor(code, '3');
    window.BG.state.number = '3';
    window.BG.net.emit('class_stats', {
      classCode: code,
      stats: [
        { rank: 1, number: 5, wins: 2, plays: 3, points: 200 },
        { rank: 2, number: 3, wins: 1, plays: 3, points: 150 }
      ]
    });

    await waitFor(function () { return window.document.querySelectorAll('.rank-row').length === 2; }, '랭킹 표시');
    const rows = window.document.querySelectorAll('.rank-row');
    assert.match(rows[0].textContent, /5번/);
    assert.match(rows[0].textContent, /200P/);
    assert.match(rows[1].textContent, /3번/);
    assert.match(rows[1].textContent, /나/, '내 번호가 강조된다');

    window.BG.net.emit('game_result', {
      classCode: code,
      code: '1',
      roomName: '1모둠',
      recordedAt: Date.now(),
      ranking: [
        { rank: 1, id: 'p1', name: '3번', number: 3, isBot: false, cards: 20, eliminated: false, bells: { correct: 2, wrong: 1 } },
        { rank: 2, id: 'p2', name: '5번', number: 5, isBot: false, cards: 0, eliminated: true, bells: { correct: 0, wrong: 0 } }
      ],
      points: { 3: 100, 5: 50 },
      winners: [3],
      stats: [
        { rank: 1, number: 3, wins: 1, plays: 1, points: 100 },
        { rank: 2, number: 5, wins: 0, plays: 1, points: 50 }
      ]
    });

    await waitFor(function () {
      const rec = window.BG.myRecord(code, 3);
      return rec.points === 100 && rec.wins === 1;
    }, '내 기록 저장');
    const raw = JSON.parse(window.localStorage.getItem('bg.records'));
    assert.equal(raw[code + ':3'].points, 100);
    assert.equal(raw[code + ':3'].wins, 1);
    assert.equal(raw[code + ':3'].plays, 1);

    await waitFor(function () {
      return window.document.querySelectorAll('.rank-row').length === 2 &&
        /100P/.test(window.document.querySelector('.rank-row').textContent);
    }, '랭킹 갱신');
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('실제 우리 반 게임이 끝나면 서버가 준 포인트가 결과 팝업과 랭킹에 나타난다', async function () {
  const env = await boot();
  const code = await createClass(env, '실전 반', '9999');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    click(window, '.game-card.playable');
    await waitFor(function () { return window.document.querySelector('#number'); }, '번호 입력');
    type(window, '#number', '3');
    click(window, '.group-card [data-action="hg.enterGroup"]');
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');

    for (let i = 0; i < 3; i++) {
      click(window, '[data-action="hg.addBot"]');
      await sleep(110);
    }
    await waitFor(function () {
      const btn = window.document.querySelector('[data-action="hg.start"]');
      return btn && !btn.disabled;
    }, '시작 버튼');
    click(window, '[data-action="hg.start"]');
    await waitFor(function () { return window.document.querySelector('.table'); }, '게임판');

    // 사람만 카드 1장을 남기고 봇은 모두 탈락시킨 뒤, 내 차례에 뒤집으면 게임이 끝난다.
    const room = env.hub.getRoom('halligalli', '1', code);
    const game = room.game;
    const me = game.players.find(function (p) { return p.number === 3; });
    game.players.forEach(function (p) {
      if (p.id !== me.id) {
        p.deck = [];
        p.pile = [];
        p.eliminated = true;
      }
    });
    me.deck = [me.deck[0]];
    me.pile = [];
    game.turn = me.seat;
    game.status = 'playing';
    game.winnerId = null;

    // 종을 한 번 울려 서버 상태를 화면에 반영시키고(내 차례), 카드를 뒤집어 게임을 끝낸다.
    click(window, '.bell');
    await waitFor(function () {
      const btn = window.document.querySelector('.flip-btn');
      return btn && !btn.disabled;
    }, '내 차례', 5000);
    click(window, '.flip-btn');

    await waitFor(function () { return window.document.querySelector('.result-modal'); }, '결과 팝업', 6000);
    const rows = window.document.querySelectorAll('.result-table tbody tr');
    assert.equal(rows.length, 4);
    assert.match(rows[0].textContent, /3번/);
    assert.match(rows[0].textContent, /\+100P/);
    assert.match(window.document.querySelector('.result-mine').textContent, /1등/);

    // 서버 랭킹에도 적립
    const stats = env.hub.classScores(code);
    assert.equal(stats.find(function (r) { return r.number === 3; }).points, 100);
    assert.equal(stats.find(function (r) { return r.number === 3; }).wins, 1);

    // 내 브라우저 기록에도 저장
    const rec = window.BG.myRecord(code, 3);
    assert.equal(rec.points, 100);
    assert.equal(rec.wins, 1);
  } finally {
    window.close();
    await env.hub.close();
  }
});

test('대기방에서 나가기를 누르면 자리가 정리되고 모둠 목록이 0명으로 돌아온다', async function () {
  const env = await boot();
  const code = await createClass(env, '나가기 반', '7777');
  const dom = await openPage(env.base + '/?class=' + code);
  const window = dom.window;
  try {
    await waitFor(function () { return window.document.querySelector('.game-grid'); }, '게임 포털');
    click(window, '.game-card.playable');
    await waitFor(function () { return window.document.querySelector('#number'); }, '번호 입력');
    type(window, '#number', '7');
    const third = Array.from(window.document.querySelectorAll('.group-grid .group-card'))[2];
    third.querySelector('[data-action="hg.enterGroup"]').click();
    await waitFor(function () { return window.document.querySelector('.seat-list'); }, '대기방');
    assert.match(window.document.querySelector('.seat-list').textContent, /7번/);

    click(window, '[data-action="hg.leave"]');
    await waitFor(function () { return window.document.querySelector('.group-grid'); }, '모둠 목록');
    await waitFor(function () {
      const cards = Array.from(window.document.querySelectorAll('.group-card'));
      const card = cards.find(function (c) { return /3모둠/.test(c.textContent); });
      return card && /0/.test(card.querySelector('.group-occ').textContent);
    }, '자리 정리');
    assert.equal(dom.__errors.length, 0, 'JS 오류: ' + dom.__errors.map(function (e) { return e.message; }).join(' | '));
  } finally {
    window.close();
    await env.hub.close();
  }
});
