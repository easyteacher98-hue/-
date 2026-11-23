/*
 * 배포된 GitHub Pages 사이트의 실제 파일을 그대로 받아와,
 * 서버가 없는 환경에서의 재접속/재렌더 동작을 검사합니다.
 */
const { execSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

const BASE = 'https://easyteacher98-hue.github.io/-/';
const get = (p) => execSync(`curl -s -m 20 '${BASE}${p}'`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

(async () => {
  const indexHtml = get('');
  const scripts = ['engine.js', 'js/cards.js', 'js/net.js', 'js/app.js', 'js/portal.js', 'js/halligalli.js'];
  const sources = scripts.map((s) => get(s));

  const hasGuardInServed = sources[2].indexOf('재접속 한도를 넘었으면') !== -1;
  const closeGuardInApp = sources[3].indexOf('연결이 끊겼을 때만 화면을 다시 그립니다') !== -1;

  const dom = new JSDOM(indexHtml, { url: BASE, runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  let created = 0;
  win.WebSocket = class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() {
      created += 1;
      this.readyState = 0;
      setTimeout(() => {
        this.readyState = 3;
        if (this.onclose) this.onclose({});
      }, 20);
    }
    send() {}
    close() {}
  };

  // 첫 화면(우리 반 만들기 / 반 코드 입장)에서 시작

  let mutations = 0;
  const appEl = win.document.getElementById('app');
  const obs = new win.MutationObserver((m) => { mutations += m.length; });
  obs.observe(appEl, { childList: true, subtree: true });

  for (const src of sources) win.eval(src);

  const t0 = Date.now();
  while (Date.now() - t0 < 50000) {
    await new Promise((r) => setTimeout(r, 250));
  }
  obs.disconnect();

  const appText = win.document.getElementById('app').textContent || '';
  const badgeOffline = appText.includes('서버 연결 없음');
  const islanding = appText.includes('우리 반 만들기') && appText.includes('반 코드로 입장');
  const botButton = appText.includes('AI 봇 연습');

  console.log(JSON.stringify({
    hasGuardInServed,
    closeGuardInApp,
    socketCreations: created,
    appMutations: mutations,
    seconds: Math.round((Date.now() - t0) / 1000),
    netOffline: win.BG.net.offline,
    attempts: win.BG.net.attempts,
    badgeOffline,
    landing: islanding,
    botButton,
  }, null, 2));
  win.close();
  process.exit(0);
})();
