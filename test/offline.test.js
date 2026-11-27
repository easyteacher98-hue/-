/*
 * 연결 유지·재접속 동작 테스트 (서버가 없는 정적 호스팅에서도 안전하게)
 * - 연결이 계속 실패해도 화면을 그릴 때마다 소켓을 새로 열지 않습니다.
 * - 재접속 한도를 넘기면 '오프라인'으로 알리되, 느리게 계속 다시 붙으려고 합니다.
 * - 서버가 돌아오면 다시 연결되고 재시도 횟수가 0으로 돌아갑니다.
 * - 연결이 살아 있는 동안 ping 을 보내 유휴 연결이 끊기지 않게 합니다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const netSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'net.js'), 'utf8');

function makeDom() {
  return new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://easyteacher98-hue.github.io/-/',
    runScripts: 'outside-only',
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function failSocket(win) {
  win.WebSocket = class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      this.readyState = 0;
      this.sent = [];
      setTimeout(() => {
        this.readyState = 3;
        if (this.onclose) this.onclose({});
      }, 1);
    }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  };
}

test('연결이 계속 실패해도 화면을 그릴 때마다 소켓을 새로 열지 않고, 한도 뒤에는 오프라인으로 알린다', async () => {
  const dom = makeDom();
  const win = dom.window;
  let created = 0;
  let offlineEvents = 0;
  failSocket(win);
  const Fake = win.WebSocket;
  win.WebSocket = class extends Fake {
    constructor() { super(); created += 1; }
  };
  win.eval(netSrc);
  const net = win.BG.net;
  net.on('offline', () => { offlineEvents += 1; });
  net.tuning.fastDelay = (attempt) => attempt * 5;
  net.tuning.slowDelay = 20;

  // 실제 화면은 그리기가 일어날 때마다 connect()를 호출한다 — 그 상황을 흉내낸다.
  for (let i = 0; i < 60; i += 1) {
    net.connect();
    await sleep(10);
  }

  assert.ok(created < 60, `connect()를 60번 불러도 소켓은 훨씬 적게 연다 (생성 ${created}회)`);
  assert.strictEqual(net.offline, true, '한도 뒤에는 오프라인 상태로 알린다');
  assert.ok(offlineEvents >= 1, 'offline 이벤트가 한 번은 발생해야 한다');
  dom.window.close();
});

test('서버가 돌아오면 저절로 다시 연결되고 재시도 횟수가 0으로 돌아간다', async () => {
  const dom = makeDom();
  const win = dom.window;
  let failNext = 3;
  let created = 0;
  win.WebSocket = class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      created += 1;
      this.readyState = 0;
      this.sent = [];
      const self = this;
      setTimeout(() => {
        if (failNext > 0) {
          failNext -= 1;
          self.readyState = 3;
          if (self.onclose) self.onclose({});
        } else {
          self.readyState = 1; // OPEN
          if (self.onopen) self.onopen({});
        }
      }, 1);
    }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  };
  win.eval(netSrc);
  const net = win.BG.net;
  net.tuning.fastDelay = () => 5;

  net.connect();
  await sleep(120);

  assert.strictEqual(net.connected, true, '연결에 성공해야 한다');
  assert.strictEqual(net.attempts, 0, '연결 성공 후 재시도 횟수는 0으로 돌아가야 한다');
  assert.ok(created <= 5, `실패 횟수만큼만 소켓을 열어야 한다 (생성 ${created}회)`);
  dom.window.close();
});

test('연결이 살아 있는 동안 ping 을 보내 유휴 연결이 끊기지 않게 한다', async () => {
  const dom = makeDom();
  const win = dom.window;
  const sockets = [];
  win.WebSocket = class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
      const self = this;
      setTimeout(() => {
        self.readyState = 1;
        if (self.onopen) self.onopen({});
      }, 1);
    }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  };
  win.eval(netSrc);
  const net = win.BG.net;
  net.tuning.pingMs = 15;

  net.connect();
  await sleep(90);

  const pings = sockets[0].sent.filter(function (raw) {
    try { return JSON.parse(String(raw)).t === 'ping'; } catch (err) { return false; }
  });
  assert.ok(pings.length >= 2, 'ping 을 주기적으로 보낸다 (보낸 횟수 ' + pings.length + ')');
  net.close();
  dom.window.close();
});

test('끊긴 동안 쌓인 오래된 게임 동작은 다시 붙을 때 버린다', async () => {
  const dom = makeDom();
  const win = dom.window;
  const sockets = [];
  win.WebSocket = class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      this.readyState = 0;
      this.sent = [];
      sockets.push(this);
      const self = this;
      setTimeout(() => {
        self.readyState = 1;
        if (self.onopen) self.onopen({});
      }, 1);
    }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  };
  win.eval(netSrc);
  const net = win.BG.net;
  net.tuning.queueTtl = 10;

  // 서버가 없을 때(readyState 0) 누른 카드 뒤집기 등은 큐에 쌓인다.
  net.send({ t: 'action', action: 'flip' });
  net.send({ t: 'resume', gameId: 'halligalli', code: '1' });
  await sleep(40);
  net.connect();
  await sleep(40);

  const sent = sockets[0].sent.map(function (raw) { return JSON.parse(String(raw)).t; });
  assert.ok(sent.indexOf('action') === -1, '오래된 동작은 보내지 않는다');
  assert.ok(sent.indexOf('resume') !== -1, '다시 접속(resume)은 그대로 보낸다');
  net.close();
  dom.window.close();
});
