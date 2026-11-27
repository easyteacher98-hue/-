/*
 * 앱 셸 – 라우터, 토스트, 모달, 공통 이벤틑 처리
 * 각 게임 모듈은 BG.router.add(...) 로 자기 화면 경로를 등록합니다.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});
  const appEl = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const modalEl = document.getElementById('modal-root');

  BG.state = {
    route: { name: 'portal', path: '/' },
    classCode: '',
    className: '',
    number: '',
    name: '',
    // 마지막으로 받은 방 화면(room 메시지) — 방장의 참가자 관리 창에서 씁니다.
    roomView: null,
    kickTarget: null
  };

  /* ---------- 저장소 ---------- */
  const storage = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (err) { /* ignore */ }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (err) { /* ignore */ }
    }
  };

  const session = {
    get(key, fallback) {
      try {
        const raw = window.sessionStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      } catch (err) { /* ignore */ }
    },
    remove(key) {
      try {
        window.sessionStorage.removeItem(key);
      } catch (err) { /* ignore */ }
    }
  };

  BG.storage = storage;
  BG.session = session;

  /* ---------- 반(교실) ---------- */

  function cleanClassCode(raw) {
    return String(raw === undefined || raw === null ? '' : raw)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
  }

  BG.cleanClassCode = cleanClassCode;

  /**
   * 교사 PIN 정리: 전각 숫자(１２３４)와 공백을 반각 숫자로 바꾸고 숫자만 남깁니다.
   * 휴대폰·태블릿 자판에서 전각 숫자가 들어와도 그대로 인정합니다.
   */
  BG.cleanPin = function (value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/[\uFF10-\uFF19]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .replace(/[^0-9]/g, '');
  };

  BG.state.classCode = cleanClassCode(storage.get('bg.class', ''));

  /** 우리 반 코드를 기억하고, 학생별 출석번호도 반별로 저장합니다. */
  BG.setClass = function (code, name) {
    const clean = cleanClassCode(code);
    BG.state.classCode = clean;
    BG.state.className = name || '';
    if (clean) storage.set('bg.class', clean);
    else storage.remove('bg.class');
  };

  BG.className = function () {
    if (BG.state.className) return BG.state.className;
    if (!BG.state.classCode) return '';
    return BG.state.classCode === 'DEMO' ? '연습 교실' : BG.state.classCode + ' 반';
  };

  BG.classLink = function (code) {
    const target = cleanClassCode(code) || BG.state.classCode;
    const base = location.origin && location.origin !== 'null'
      ? location.origin + location.pathname
      : location.href.split('#')[0].split('?')[0];
    return base + '?class=' + target;
  };

  BG.numberFor = function (code) {
    const map = storage.get('bg.numbers', {}) || {};
    const key = cleanClassCode(code) || BG.state.classCode || '-';
    return map[key] ? String(map[key]) : '';
  };

  BG.setNumberFor = function (code, value) {
    const digits = String(value === undefined || value === null ? '' : value).replace(/[^0-9]/g, '').slice(0, 2);
    const key = cleanClassCode(code) || BG.state.classCode || '-';
    const map = storage.get('bg.numbers', {}) || {};
    if (digits) map[key] = digits;
    else delete map[key];
    storage.set('bg.numbers', map);
    BG.state.number = digits;
    return digits;
  };

  BG.state.number = BG.numberFor(BG.state.classCode);

  /* ---------- 학생 이름 (반별로 기억) ----------
   * 입장할 때 번호와 함께 이름을 넣으면 화면·결과에 '7번 김민수'로 보입니다.
   * 이름을 비워 두면 예전처럼 번호만('7번')으로 표시합니다.
   */

  function cleanStudentName(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10);
  }

  BG.cleanStudentName = cleanStudentName;

  BG.nameFor = function (code) {
    const map = storage.get('bg.names', {}) || {};
    const key = cleanClassCode(code) || BG.state.classCode || '-';
    return map[key] ? cleanStudentName(map[key]) : '';
  };

  BG.setNameFor = function (code, value) {
    const clean = cleanStudentName(value);
    const key = cleanClassCode(code) || BG.state.classCode || '-';
    const map = storage.get('bg.names', {}) || {};
    if (clean) map[key] = clean;
    else delete map[key];
    storage.set('bg.names', map);
    BG.state.name = clean;
    return clean;
  };

  /** 화면에 쓰는 표시 이름: '7번 김민수' (이름이 없으면 '7번', 번호도 없으면 '나') */
  BG.studentLabel = function (number, name) {
    const n = Number(String(number === undefined || number === null ? '' : number).trim());
    const label = name === undefined ? BG.state.name : cleanStudentName(name);
    if (Number.isInteger(n) && n >= 1 && n <= 99) return n + '번' + (label ? ' ' + label : '');
    return label || '나';
  };

  BG.state.name = BG.nameFor(BG.state.classCode);

  /* ---------- 내 기록 (반 코드 + 출석번호, 브라우저 저장) ---------- */

  function recordKey(code, number) {
    return (cleanClassCode(code) || '-') + ':' + String(number || '');
  }

  BG.myRecord = function (code, number) {
    const n = Number(number);
    if (!n) return { wins: 0, points: 0, plays: 0 };
    const all = storage.get('bg.records', {}) || {};
    const rec = all[recordKey(code, n)] || {};
    return { wins: rec.wins || 0, points: rec.points || 0, plays: rec.plays || 0 };
  };

  /** 같은 결과(recordedAt)를 두 탭에서 두 번 더하지 않도록 한 번만 기록합니다. */
  BG.markResultSeen = function (key) {
    if (key === undefined || key === null) return true;
    const seen = storage.get('bg.seenResults', []);
    const list = Array.isArray(seen) ? seen : [];
    if (list.indexOf(key) !== -1) return false;
    list.push(key);
    storage.set('bg.seenResults', list.slice(-100));
    return true;
  };

  /** 게임 결과를 내 브라우저 기록에 더합니다. (서버와 별개로 기기에 남는 내 기록) */
  BG.addRecord = function (code, number, gain) {
    const n = Number(number);
    if (!n) return BG.myRecord(code, 0);
    const all = storage.get('bg.records', {}) || {};
    const key = recordKey(code, n);
    const rec = all[key] || { wins: 0, points: 0, plays: 0 };
    rec.wins = (rec.wins || 0) + (gain && gain.wins ? gain.wins : 0);
    rec.points = (rec.points || 0) + (gain && gain.points ? gain.points : 0);
    rec.plays = (rec.plays || 0) + 1;
    all[key] = rec;
    storage.set('bg.records', all);
    return { wins: rec.wins, points: rec.points, plays: rec.plays };
  };

  /* ?class=반코드 로 들어오면 바로 그 반의 게임 선택 화면으로 보냅니다. */
  let urlClass = '';
  try {
    urlClass = cleanClassCode(new URLSearchParams(window.location.search).get('class'));
  } catch (err) {
    urlClass = '';
  }
  if (urlClass) {
    BG.setClass(urlClass, BG.state.className);
    const currentPath = (window.location.hash || '').replace(/^#/, '') || '/';
    if (currentPath === '/') {
      try {
        window.history.replaceState(null, '', '#/class/' + urlClass);
      } catch (err) {
        window.location.hash = '#/class/' + urlClass;
      }
    }
  }

  /* 최근에 만든 반 (선생님 기기에만 남는 목록) */
  BG.recentClasses = function () {
    const list = storage.get('bg.classes', []);
    return Array.isArray(list) ? list : [];
  };

  BG.rememberClass = function (cls) {
    if (!cls || !cls.code) return;
    const code = cleanClassCode(cls.code);
    const list = BG.recentClasses().filter(function (item) { return item.code !== code; });
    list.unshift({ code: code, name: String(cls.name || '').slice(0, 20), at: Date.now() });
    storage.set('bg.classes', list.slice(0, 5));
  };

  /* ---------- UI ---------- */
  let toastTimer = null;

  const ui = {
    escape(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    screen(html, name) {
      appEl.innerHTML = html;
      if (name) document.body.dataset.screen = name;
    },

    toast(message, kind) {
      if (!message) return;
      toastEl.textContent = message;
      toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toastEl.className = 'toast';
        toastEl.hidden = true;
      }, 2600);
    },

    modal(html) {
      modalEl.innerHTML =
        '<div class="modal-backdrop" data-action="ui.closeModal">' +
          '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>' +
        '</div>';
      document.body.classList.add('modal-open');
    },

    closeModal() {
      modalEl.innerHTML = '';
      document.body.classList.remove('modal-open');
    },

    linkedRuleModal(html) {
      ui.modal(html);
    }
  };

  BG.ui = ui;

  /* ---------- 라우터 ---------- */
  const router = {
    routes: [],
    add(pattern, name, handler) {
      this.routes.push({ pattern: pattern, name: name, handler: handler });
    },
    resolve(path) {
      for (const route of this.routes) {
        const match = route.pattern.exec(path);
        if (match) return { route: route, params: match.slice(1) };
      }
      return null;
    }
  };

  BG.router = router;

  /* ---------- 화면을 벗어날 때 (브라우저 뒤로가기 포함) ----------
   * 게임 모듈은 방 화면을 벗어나는 순간 자리를 정리해야 합니다.
   * (방 나가기를 누르지 않고 뒤로가기만 하면 대기방에 '준비 중' 유령 인원이 남기 때문)
   * hashchange 전에 등록한 함수를 차례로 불러 줍니다.
   */
  const routeLeaveHandlers = [];

  BG.onRouteLeave = function (fn) {
    if (typeof fn === 'function') routeLeaveHandlers.push(fn);
  };

  BG.routeLeave = function (from, to) {
    if (!from || from === to) return;
    for (const fn of routeLeaveHandlers) {
      try {
        fn(from, to);
      } catch (err) {
        console.error('[routeLeave] 오류:', err);
      }
    }
  };

  BG.currentPath = function () {
    const hash = window.location.hash || '';
    const path = hash.startsWith('#') ? hash.slice(1) : '';
    return path || '/';
  };

  BG.navigate = function (path, opts) {
    const target = '#' + path;
    if (window.location.hash === target) {
      BG.render();
      return;
    }
    window.location.hash = target;
    if (opts && opts.replace) window.history.replaceState(null, '', target);
  };

  BG.render = function () {
    const path = BG.currentPath();
    const matched = router.resolve(path);
    if (!matched) {
      if (BG.portal) {
        BG.portal.render();
        return;
      }
      ui.screen('<div class="empty">페이지를 찾을 수 없습니다. <a href="#/">첫 화면으로 돌아가기</a></div>', 'notfound');
      return;
    }
    BG.state.route = { name: matched.route.name, path: path };
    matched.route.handler(matched.params);
  };

  /* ---------- 클릭 위임 ---------- */
  document.addEventListener('click', function (event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');
    const handler = BG.actions[action];
    if (!handler) return;
    if (target.disabled) return;
    // <select> 는 값이 바뀔 때(change) 처리합니다. 클릭 시점의 값은 아직 이전 값입니다.
    if (target.tagName === 'SELECT') return;
    // 체크박스/라디오는 기본 동작(토글)을 막지 않습니다.
    if (target.tagName !== 'INPUT') event.preventDefault();
    try {
      handler(target, event);
    } catch (err) {
      console.error('[action] ' + action + ' 오류:', err);
      ui.toast('동작 중 문제가 생겼습니다.', 'error');
    }
  });

  BG.actions = BG.actions || {};

  BG.actions['ui.closeModal'] = function (el, event) {
    if (event && event.target !== el) return;
    ui.closeModal();
  };

  /**
   * 교사 PIN 입력 화면을 그립니다.
   * 이미 같은 화면이 떠 있으면 다시 그리지 않아 입력하던 PIN·포커스가 지워지지 않습니다.
   * (방 목록 갱신·재접속 때 화면을 다시 그리는 경로가 많아서 여기서 한 번에 막습니다)
   */
  BG.showTeacherGate = function (html, screen) {
    if (document.querySelector('.teacher-gate')) return false;
    ui.screen(html, screen);
    return true;
  };

  /* ---------- 교사 PIN 입력: Enter 키로도 확인 ---------- */
  document.addEventListener('keydown', function (event) {
    if (!event || event.key !== 'Enter') return;
    const el = event.target;
    if (!el || el.id !== 'teacher-pin') return;
    const gate = el.closest ? el.closest('.teacher-gate') : null;
    const btn = gate ? gate.querySelector('button[data-action]') : null;
    if (!btn) return;
    event.preventDefault();
    btn.click();
  });

  /* ---------- 방장: 참가자 내보내기 ----------
   * 인터넷 오류로 남은 자리·겹친 친구를 방장이 정리할 수 있게 합니다.
   * 대기방 좌석의 [내보내기] 버튼과, 게임 중 [👥 참가자] 버튼이 같은 확인 창을 씁니다.
   */

  function seatCanBeKicked(room, seat) {
    return !!room && !!room.youAreHost && !seat.isBot && seat.id !== room.youId;
  }

  /** 대기방 좌석 옆에 붙는 작은 [내보내기] 버튼 (방장에게만 보입니다) */
  BG.kickButtonHtml = function (room, seat) {
    if (!seatCanBeKicked(room, seat)) return '';
    return '<button class="btn btn-sm btn-ghost seat-kick" data-action="app.kick"' +
      ' data-id="' + ui.escape(seat.id) + '" data-name="' + ui.escape(seat.name) + '"' +
      ' aria-label="' + ui.escape(seat.name) + '님 내보내기" title="' + ui.escape(seat.name) + '님 내보내기">🚪 내보내기</button>';
  };

  /** 방장의 [👥 참가자] 버튼 — 게임 중에도 열 수 있습니다. */
  BG.manageButtonHtml = function (room, label) {
    if (!room || !room.youAreHost) return '';
    return '<button class="btn btn-sm" data-action="app.manage">👥 ' + ui.escape(label || '참가자') + '</button>';
  };

  function managePlayersModal(room) {
    const seats = room.seats || [];
    const rows = seats.map(function (s) {
      const tags = [];
      if (s.isHost) tags.push('<span class="tag host">방장</span>');
      if (s.id === room.youId) tags.push('<span class="tag you">나</span>');
      if (s.isBot) tags.push('<span class="tag bot">AI 봇</span>');
      else if (!s.connected) tags.push('<span class="tag off">연결 끊김</span>');
      return '<div class="seat' + (s.id === room.youId ? ' is-self' : '') + '">' +
        '<div class="seat-main"><div class="seat-name">' + ui.escape(s.name) + '</div>' +
          '<div class="seat-sub">' + (s.isBot ? 'AI 봇' : s.connected ? '접속 중' : '연결이 끊긴 자리') + '</div></div>' +
        '<div class="tags">' + tags.join('') + '</div>' +
        BG.kickButtonHtml(room, s) +
      '</div>';
    }).join('');

    ui.modal(
      '<h2>👥 참가자 관리</h2>' +
      '<p class="hint">인터넷이 끊겨 남은 자리나 겹쳐 들어온 친구를 내보낼 수 있어요. ' +
        '내보낸 친구는 잠시 뒤 같은 번호로 다시 들어올 수 있습니다.' +
        (room.status === 'playing' ? ' 진행 중인 게임은 그 자리를 AI가 이어서 플레이합니다.' : '') +
      '</p>' +
      '<div class="seat-list" style="margin-top:12px">' + rows + '</div>' +
      '<button class="btn btn-block" data-action="ui.closeModal" style="margin-top:16px">닫기</button>'
    );
  }

  BG.managePlayers = function (room) {
    const view = room || BG.state.roomView;
    if (!view || !view.youAreHost) return;
    managePlayersModal(view);
  };

  BG.actions['app.manage'] = function () {
    BG.managePlayers();
  };

  BG.actions['app.kick'] = function (el) {
    const id = String(el.getAttribute('data-id') || '');
    const name = String(el.getAttribute('data-name') || '이 참가자');
    if (!id) return;
    const room = BG.state.roomView;
    const playing = !!(room && room.status === 'playing');
    BG.state.kickTarget = { id: id, name: name };
    ui.modal(
      '<h2>내보낼까요?</h2>' +
      '<p><b>' + ui.escape(name) + '</b>님을 이 방에서 내보냅니다.' +
        (playing ? ' 진행 중인 게임은 그 자리를 AI가 이어서 플레이합니다.' : '') +
        ' 내보낸 친구는 잠시 뒤 다시 들어올 수 있어요.</p>' +
      '<div class="row" style="justify-content:flex-end;margin-top:18px">' +
        '<button class="btn btn-ghost" data-action="ui.closeModal">취소</button>' +
        '<button class="btn btn-danger" data-action="app.kickConfirm">내보내기</button>' +
      '</div>'
    );
  };

  BG.actions['app.kickConfirm'] = function () {
    const target = BG.state.kickTarget;
    BG.state.kickTarget = null;
    ui.closeModal();
    if (!target) return;
    BG.net.send({ t: 'kickPlayer', playerId: target.id });
  };

  /* <select data-action="..."> 는 값이 바뀌는 순간 처리합니다. */
  document.addEventListener('change', function (event) {
    const el = event.target;
    if (!el || el.tagName !== 'SELECT') return;
    const target = el.closest('[data-action]');
    if (!target) return;
    const handler = BG.actions[target.getAttribute('data-action')];
    if (!handler) return;
    try {
      handler(target, event);
    } catch (err) {
      console.error('[change] 오류:', err);
    }
  });

  /* ---------- 입력 ---------- */
  document.addEventListener('input', function (event) {
    const el = event.target;
    if (!el) return;
    if (el.id === 'number') {
      // 번호는 숫자만 (모바일에서는 숫자 키패드가 뜹니다)
      const digits = String(el.value || '').replace(/[^0-9]/g, '').slice(0, 2);
      if (el.value !== digits) el.value = digits;
      BG.setNumberFor(BG.state.classCode, digits);
    }
    if (el.id === 'student-name') {
      // 이름은 10자까지, 공백/제어문자는 정리해서 반별로 기억합니다.
      const clean = cleanStudentName(el.value);
      if (el.value !== clean) el.value = clean;
      BG.setNameFor(BG.state.classCode, clean);
      const preview = document.getElementById('my-name-preview');
      if (preview) {
        preview.textContent = BG.studentLabel(BG.state.number, clean);
      }
    }
    if (el.id === 'join-class-code' || el.id === 'class-code') {
      const clean = cleanClassCode(el.value);
      if (el.value !== clean) el.value = clean;
    }
  });

  /* ---------- 키보드 ---------- */
  BG.keyHandlers = BG.keyHandlers || [];
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      ui.closeModal();
      return;
    }
    const el = event.target;
    const tag = el && el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (el && el.isContentEditable)) return;
    for (const handler of BG.keyHandlers) {
      try {
        if (handler(event) === true) {
          event.preventDefault();
          return;
        }
      } catch (err) {
        console.error('[key] 오류:', err);
      }
    }
  });

  /* ---------- 시작 ---------- */
  window.addEventListener('hashchange', function () {
    window.scrollTo(0, 0);
    // 화면을 옮기면 이전 화면의 팝업(결과 모달 등)이 남지 않게 닫습니다.
    ui.closeModal();
    // 방 화면을 뒤로가기로 벗어나면 서버에 방 나가기를 알립니다.
    BG.routeLeave(BG.state.route.path, BG.currentPath());
    BG.render();
  });

  document.addEventListener('DOMContentLoaded', function () {
    BG.net.connect();
    BG.render();
  });

  // DOMContentLoaded가 이미 지난 경우(스크립트가 늦게 로드된 경우) 대비
  if (document.readyState !== 'loading') {
    BG.net.connect();
    BG.render();
  }

  let wasConnected = false;

  BG.net.on('open', function () {
    wasConnected = true;
    // 다시 연결되면 서버는 이 연결이 어느 반인지 모릅니다. 우리 반을 먼저 알려 줍니다.
    // (이게 없으면 새로고침 없이 다시 붙었을 때 방 목록·알림을 못 받거나 연습 교실로 보입니다)
    if (BG.state.classCode) BG.net.send({ t: 'classEnter', code: BG.state.classCode });
    if (document.body.dataset.screen) BG.render();
  });

  /* ---------- 끊겼다 붙었을 때 자동 재입장 ----------
   * 서버가 새로 켜지거나 잠깐 끊겨 자리를 잃었을 수 있습니다. 그때는 같은 번호로 바로 다시 들어가 봅니다.
   * (들어가지 못하면 각 게임 화면이 모둠 선택으로 돌려보냅니다)
   */
  BG.tryRejoin = function (gameId, code) {
    if (!gameId || !code) return false;
    const number = String(BG.state.number || BG.numberFor(BG.state.classCode) || '').replace(/[^0-9]/g, '');
    if (!number) return false;
    const name = BG.state.name || BG.nameFor(BG.state.classCode) || '';
    BG.net.send({ t: 'join', gameId: gameId, code: code, classCode: BG.state.classCode, number: number, studentName: name });
    return true;
  };

  /** 모둠 방 목록을 요청합니다. (반 코드가 없으면 연습 교실(DEMO)을 명시적으로 고릅니다)
   *  화면을 다시 그릴 때마다 요청이 되풀이되지 않도록 1초에 한 번만 보냅니다.
   */
  const lastRoomRequest = {};
  BG.requestRooms = function (gameId) {
    const key = String(gameId || 'all');
    const now = Date.now();
    if (lastRoomRequest[key] && now - lastRoomRequest[key] < 1000) return;
    lastRoomRequest[key] = now;
    BG.net.send({ t: 'overview', gameId: gameId || null, classCode: BG.state.classCode || 'DEMO' });
  };

  /** 서버 목록을 기다리는 동안 화면에 먼저 보여 주는 1~6모둠 방 (누르면 바로 입장됩니다) */
  BG.placeholderRooms = function (gameId, capacity) {
    const out = [];
    for (let i = 1; i <= 6; i++) {
      out.push({
        gameId: gameId,
        code: String(i),
        name: i + '모둠',
        isGroup: true,
        capacity: capacity || 4,
        status: 'waiting',
        playerCount: 0,
        humanCount: 0,
        botCount: 0,
        connectedCount: 0,
        seats: [],
        players: [],
        loading: true
      });
    }
    return out;
  };

  BG.net.on('close', function () {
    // 연결이 끊겼을 때만 화면을 다시 그립니다. (서버 없는 정적 사이트에서
    // 실패한 연결 시도마다 화면이 새로 그려져 버튼을 누르기 어려워지는 것을 막습니다)
    const was = wasConnected;
    wasConnected = false;
    if (!was) return;
    if (['halligalli', 'hg.room', 'hg.teacher', 'hg.watch',
      'bluemarble', 'bm.room', 'bm.watch', 'bm.bot', 'bm.teacher'].indexOf(document.body.dataset.screen) !== -1) {
      BG.render();
    }
  });
})();
