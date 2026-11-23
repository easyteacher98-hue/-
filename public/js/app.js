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
    number: ''
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
    if (document.body.dataset.screen) BG.render();
  });

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
