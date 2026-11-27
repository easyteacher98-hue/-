/*
 * WebSocket 연결 관리 (서버와 실시간 통신)
 * 서버가 없으면(file:// 로 열거나 꺼져 있으면) 조용히 오프라인 모드로 동작합니다.
 *
 * 수업 중에 화면이 자주 튕기지 않도록:
 * - 20초마다 ping 을 보내, Render 무료 서버의 프록시가 유휴 연결을 끊지 않게 합니다.
 * - 연결이 끊기면 다시 붙습니다. (Render 가 새로 배포되어 1분쯤 걸려도 포기하지 않습니다)
 * - 탭으로 돌아왔을 때(visibilitychange) 바로 다시 붙습니다.
 * - 끊긴 동안 쌓인 요청은 10초가 지난 게임 동작이면 버립니다. (늦게 도착한 옛 클릭이 실행되지 않게)
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
    pingTimer: null,
    lastMessageAt: 0,
    queue: [],
    manuallyClosed: false,

    /* 연결 유지·재접속 설정 (테스트에서 짧게 바꿀 수 있게 한 곳에 모아 둡니다) */
    tuning: {
      pingMs: 20000,        // ping 주기
      deadMs: 55000,        // 이 시간 동안 아무 소식도 없으면 끊긴 것으로 보고 다시 붙습니다
      slowDelay: 10000,     // 재접속 한도를 넘긴 뒤 다시 시도하는 간격
      queueTtl: 10000,      // 끊긴 동안 쌓인 '동작' 요청은 이 시간까지만 회복
      fastDelay(attempt) {
        return Math.min(6000, 800 * attempt);
      }
    },

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
      // 이미 다시 붙을 예정이면 기다립니다. (화면을 그릴 때마다 소켓을 새로 열지 않게)
      if (net.reconnectTimer) return;
      const url = net.url();
      if (!url) {
        net.offline = true;
        net.emit('offline');
        return;
      }
      net.manuallyClosed = false;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        net.scheduleReconnect();
        return;
      }
      net.ws = ws;

      ws.onopen = function () {
        net.connected = true;
        net.offline = false;
        net.attempts = 0;
        net.lastMessageAt = Date.now();
        net.startPing();
        const pending = net.queue.splice(0, net.queue.length);
        const now = Date.now();
        for (const item of pending) {
          // 끊긴 지 오래된 '동작'(카드 뒤집기 등)은 지금 실행하면 엉뚱하게 처리되므로 버립니다.
          if (item.at && now - item.at > net.tuning.queueTtl && (item.msg.t === 'action' || item.msg.t === 'ready')) continue;
          net.send(item.msg);
        }
        net.emit('open');
      };

      ws.onmessage = function (event) {
        net.lastMessageAt = Date.now();
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
        net.stopPing();
        net.emit('close');
        if (net.manuallyClosed) return;
        net.scheduleReconnect();
      };

      ws.onerror = function () {
        /* onclose에서 처리 */
      };
    },

    /** 끊긴 뒤 다시 붙습니다. 서버가 새로 배포되어 1분 넘게 걸려도 계속 시도합니다. */
    scheduleReconnect() {
      if (net.manuallyClosed) return;
      if (net.reconnectTimer) return;
      let delay;
      if (net.attempts < net.maxAttempts) {
        net.attempts += 1;
        delay = net.tuning.fastDelay(net.attempts);
      } else {
        // 한도를 넘으면 '서버 없음'으로 화면에 알리되, 포기하지 않고 느리게 계속 시도합니다.
        // (수업 중에 서버가 다시 배포되어 1분 넘게 걸려도 아이들이 새로고침할 필요가 없게)
        delay = net.tuning.slowDelay;
        if (!net.offline) {
          net.offline = true;
          net.emit('offline');
        }
      }
      clearTimeout(net.reconnectTimer);
      net.reconnectTimer = setTimeout(function () {
        net.reconnectTimer = null;
        net.connect();
      }, delay);
    },

    /** 연결이 살아 있는지 주기적으로 확인합니다. (프록시 유휴 종료·유령 연결 방지) */
    startPing() {
      net.stopPing();
      net.pingTimer = setInterval(function () {
        if (!net.ws || net.ws.readyState !== WebSocket.OPEN) return;
        // 서버가 한참 조용하면 연결이 이미 죽은 것으로 보고 새로 붙습니다.
        if (net.lastMessageAt && Date.now() - net.lastMessageAt > net.tuning.deadMs) {
          try { net.ws.close(); } catch (err) { /* ignore */ }
          return;
        }
        net.send({ t: 'ping' });
      }, net.tuning.pingMs);
    },

    stopPing() {
      if (net.pingTimer) {
        clearInterval(net.pingTimer);
        net.pingTimer = null;
      }
    },

    send(obj) {
      if (net.ws && net.ws.readyState === WebSocket.OPEN) {
        try {
          net.ws.send(JSON.stringify(obj));
        } catch (err) {
          net.queue.push({ msg: obj, at: Date.now() });
        }
        return true;
      }
      if (net.queue.length < 20) net.queue.push({ msg: obj, at: Date.now() });
      return false;
    },

    close() {
      net.manuallyClosed = true;
      net.stopPing();
      if (net.ws) {
        try { net.ws.close(); } catch (err) { /* ignore */ }
      }
      net.ws = null;
      net.connected = false;
    }
  };

  /* 탭으로 돌아오면(휴대폰에서 다른 앱을 봤다가 돌아오는 경우가 많습니다) 바로 다시 붙습니다. */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (net.connected) {
        net.send({ t: 'ping' });
        return;
      }
      net.attempts = 0;
      if (net.reconnectTimer) {
        clearTimeout(net.reconnectTimer);
        net.reconnectTimer = null;
      }
      net.connect();
    });
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', function () {
      net.attempts = 0;
      if (net.reconnectTimer) {
        clearTimeout(net.reconnectTimer);
        net.reconnectTimer = null;
      }
      net.connect();
    });
  }

  BG.net = net;
})();
