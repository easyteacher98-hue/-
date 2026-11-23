/*
 * 서버가 없는 정적 호스팅(GitHub Pages)에서의 재접속 동작 테스트
 * - 연결이 계속 실패해도 소켓을 무한히 다시 열지 않고, 한도 뒤에는 오프라인으로 확정한다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const netSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'net.js'), 'utf8');

function makeDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://easyteacher98-hue.github.io/-/',
    runScripts: 'outside-only',
  });
  return dom;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('연결이 계속 실패하면 재접속 한도 뒤에 오프라인으로 확정되고 소켓을 더 열지 않는다', async () => {
  const dom = makeDom();
  const win = dom.window;
  let created = 0;
  let offlineEvents = 0;
  win.WebSocket = class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      created += 1;
      this.readyState = 0; // CONNECTING
      setTimeout(() => {
        this.readyState = 3; // CLOSED
        if (this.onclose) this.onclose({});
      }, 1);
    }
    send() {}
    close() {}
  };
  win.eval(netSrc);
  const net = win.BG.net;
  net.on('offline', () => { offlineEvents += 1; });

  // 실제 화면은 그리기가 일어날 때마다 connect()를 호출한다 — 그 상황을 흉내낸다.
  for (let i = 0; i < 60; i += 1) {
    net.connect();
    await sleep(5);
  }

  assert.strictEqual(net.offline, true, '한도 뒤에는 오프라인 상태여야 한다');
  assert.ok(created <= net.maxAttempts + 1, `소켓 생성이 한도를 넘지 않아야 한다 (생성 ${created}회)`);
  assert.ok(offlineEvents >= 1, 'offline 이벤트가 한 번은 발생해야 한다');
  dom.window.close();
});

test('연결에 성공하면 재시도 횟수가 초기화되어 다시 재접속할 수 있다', async () => {
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
    send() {}
    close() {}
  };
  win.eval(netSrc);
  const net = win.BG.net;

  for (let i = 0; i < 20; i += 1) {
    net.connect();
    await sleep(5);
  }

  assert.strictEqual(net.connected, true, '연결에 성공해야 한다');
  assert.strictEqual(net.attempts, 0, '연결 성공 후 재시도 횟수는 0으로 돌아가야 한다');
  assert.ok(created <= 5, `실패 횟수만큼만 소켓을 열어야 한다 (생성 ${created}회)`);
  dom.window.close();
});
