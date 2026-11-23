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
    nickname: ''
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
  BG.state.nickname = storage.get('bg.nickname', '') || '';

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
    if (el && el.id === 'nickname') {
      BG.state.nickname = el.value;
      storage.set('bg.nickname', el.value);
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

  BG.net.on('open', function () {
    if (document.body.dataset.screen) BG.render();
  });

  BG.net.on('close', function () {
    if (['halligalli', 'hg.room', 'hg.teacher', 'hg.watch'].indexOf(document.body.dataset.screen) !== -1) {
      BG.render();
    }
  });
})();
