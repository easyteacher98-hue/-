/*
 * WebSocket 연결 관리 (서버와 실시간 통신)
 * 서버가 없으면(file:// 로 열거나 꺼져 있으면) 조용히 오프라인 모드로 동작합니다.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});

  const handlers = new Map();

  const net = {
    ws: null,
    connected: false,
    offline: false,
    attempts: 0,
    maxAttempts: 12,
    reconnectTimer: null,
    queue: [],

    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },

    emit(type, payload) {
      const list = handlers.get(type) || [];
      for (const fn of list) {
        try {
          fn(payload);
        } catch (err) {
          console.error('[net] 핸들러 오류 (' + type + '):', err);
        }
      }
    },

    url() {
      if (typeof location === 'undefined') return null;
      if (location.protocol === 'file:') return null;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + location.host + '/ws';
    },

    connect() {
      if (net.ws && (net.ws.readyState === WebSocket.OPEN || net.ws.readyState === WebSocket.CONNECTING)) return;
      // 재접속 한도를 넘었으면 더 이상 소켓을 열지 않습니다.
      // (GitHub Pages처럼 서버가 아예 없는 곳에서 화면이 계속 다시 그려지는 것을 막습니다)
      if (net.attempts >= net.maxAttempts) {
        if (!net.offline) {
          net.offline = true;
          net.emit('offline');
        }
        return;
      }
      const url = net.url();
      if (!url) {
        net.offline = true;
        net.emit('offline');
        return;
      }
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        net.offline = true;
        net.emit('offline');
        return;
      }
      net.ws = ws;

      ws.onopen = function () {
        net.connected = true;
        net.offline = false;
        net.attempts = 0;
        const pending = net.queue.splice(0, net.queue.length);
        for (const msg of pending) net.send(msg);
        net.emit('open');
      };

      ws.onmessage = function (event) {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (err) {
          return;
        }
        if (!msg || !msg.t) return;
        net.emit(msg.t, msg);
        net.emit('*', msg);
      };

      ws.onclose = function () {
        net.connected = false;
        net.emit('close');
        if (net.attempts < net.maxAttempts) {
          net.attempts += 1;
          const delay = Math.min(6000, 800 * net.attempts);
          clearTimeout(net.reconnectTimer);
          net.reconnectTimer = setTimeout(function () { net.connect(); }, delay);
        } else if (!net.offline) {
          // 재접속 한도 초과 — 오프라인으로 확정하고 다시 시도하지 않습니다.
          net.offline = true;
          net.emit('offline');
        }
      };

      ws.onerror = function () {
        /* onclose에서 처리 */
      };
    },

    send(obj) {
      if (net.ws && net.ws.readyState === WebSocket.OPEN) {
        try {
          net.ws.send(JSON.stringify(obj));
        } catch (err) {
          net.queue.push(obj);
        }
        return true;
      }
      if (net.queue.length < 20) net.queue.push(obj);
      return false;
    },

    close() {
      net.attempts = net.maxAttempts;
      if (net.ws) {
        try { net.ws.close(); } catch (err) { /* ignore */ }
      }
      net.ws = null;
      net.connected = false;
    }
  };

  BG.net = net;
})();
