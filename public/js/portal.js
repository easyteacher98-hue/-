/*
 * 포털(첫 화면) – 여러 보드게임 중 하나를 고르는 화면
 * 새 게임을 추가할 때는 BG.portalGames 에 카드 한 장을 더하면 됩니다.
 */
(function () {
  'use strict';
  const BG = window.BG;

  BG.portalGames = [
    {
      id: 'halligalli',
      title: '할리갈리',
      emoji: '🔔',
      desc: '딸기·바나나·라임·자두, 같은 과일이 정확히 5개가 되는 순간 종을 치세요. 6개 모둠이 각자 방에서 동시에 즐깁니다.',
      players: '2~5명 · 모둠당 4명',
      status: 'ready',
      href: '#/halligalli',
      action: '지금 플레이'
    },
    {
      id: 'yutnori',
      title: '윷놀이',
      emoji: '🎲',
      desc: '윷가락을 던져 말을 옮기는 우리나라 전통 보드게임. 모둠 대항전으로 준비하고 있습니다.',
      players: '2~4팀',
      status: 'coming',
      href: null,
      action: '준비 중'
    },
    {
      id: 'more',
      title: '더 많은 게임',
      emoji: '➕',
      desc: '수업에 쓸 보드게임을 차례로 추가합니다. 다음으로 원하는 게임을 알려 주세요.',
      players: '확장 예정',
      status: 'soon',
      href: null,
      action: '준비 중'
    }
  ];

  function gameCard(game) {
    const playable = game.status === 'ready';
    const badge = playable
      ? '<span class="badge ready">플레이 가능</span>'
      : '<span class="badge coming">준비 중</span>';
    const inner =
      '<div class="game-emoji">' + game.emoji + '</div>' +
      '<div class="game-name">' + BG.ui.escape(game.title) + '</div>' +
      '<div class="game-desc">' + BG.ui.escape(game.desc) + '</div>' +
      (playable && BG.cards
        ? '<div class="hero-fruits" style="justify-content:flex-start;margin-top:-2px" aria-hidden="true">' +
            ['strawberry', 'banana', 'lime', 'plum'].map(function (id) { return BG.cards.fruitIcon(id); }).join('') +
          '</div>'
        : '') +
      '<div class="game-foot">' +
        '<span class="game-players">' + BG.ui.escape(game.players) + '</span>' +
        (playable
          ? '<span class="btn btn-primary btn-sm">' + game.action + ' →</span>'
          : '<span class="badge coming">' + game.action + '</span>') +
      '</div>';

    if (playable) {
      return (
        '<a class="game-card playable" href="' + game.href + '">' +
          '<div class="row" style="justify-content:space-between">' + badge + '</div>' +
          inner +
        '</a>'
      );
    }
    return '<div class="game-card coming">' + badge + inner + '</div>';
  }

  function render() {
    const connected = BG.net.connected;
    const games = BG.portalGames.map(gameCard).join('');
    const heroFruits = (BG.cards && BG.HG_FRUITS_FOR_HERO ? BG.HG_FRUITS_FOR_HERO : ['strawberry', 'banana', 'lime', 'plum'])
      .map(function (id) { return BG.cards ? BG.cards.fruitIcon(id) : ''; }).join('');

    const html =
      '<section class="portal-hero">' +
        '<div class="portal-kicker">모둠 수업 보드게임</div>' +
        '<h1 class="portal-title">모둠 <em>보드게임</em></h1>' +
        '<p class="portal-sub">모둠원이 각자 기기로 접속해 함께 즐기는 실시간 보드게임.<br>' +
          '선생님은 교사 관전 모드로 모든 모둠의 진행 상황을 한눈에 볼 수 있어요.</p>' +
        '<div class="hero-fruits" aria-hidden="true">' + heroFruits + '</div>' +
      '</section>' +
      '<div class="game-grid">' + games + '</div>' +
      '<section class="panel" style="margin-top:22px">' +
        '<div class="panel-title">🎒 수업에서 이렇게 써요</div>' +
        '<div class="row" style="gap:14px;align-items:stretch">' +
          '<div class="tool-card" style="cursor:default;flex:1;min-width:210px">' +
            '<div class="tool-emoji">1️⃣</div><div class="tool-body"><div class="tool-title">게임 고르기</div>' +
            '<div class="tool-desc">할리갈리를 선택하면 1~6모둠 방이 열려요.</div></div>' +
          '</div>' +
          '<div class="tool-card" style="cursor:default;flex:1;min-width:210px">' +
            '<div class="tool-emoji">2️⃣</div><div class="tool-body"><div class="tool-title">모둠 방 입장</div>' +
            '<div class="tool-desc">닉네임을 쓰고 자기 모둠 번호를 누르면 바로 입장!</div></div>' +
          '</div>' +
          '<div class="tool-card" style="cursor:default;flex:1;min-width:210px">' +
            '<div class="tool-emoji">3️⃣</div><div class="tool-body"><div class="tool-title">선생님은 관전</div>' +
            '<div class="tool-desc">교사 관전 모드에서 6개 모둠을 실시간으로 확인해요.</div></div>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<div class="portal-foot">' +
        '<span><span class="conn-dot ' + (connected ? 'on' : '') + '"></span>' +
          (connected ? '실시간 서버 연결됨' : '서버 연결 없음 — AI 봇 연습은 그대로 사용할 수 있어요') + '</span>' +
        '<span class="spacer"></span>' +
        '<span>같은 와이파이에서 접속: 이 컴퓨터의 주소(예: http://192.168.0.10:3000)</span>' +
      '</div>';

    BG.ui.screen(html, 'portal');
  }

  BG.portal = { render: render };

  BG.router.add(/^\/?$/, 'portal', function () {
    render();
  });

  BG.net.on('welcome', function (msg) {
    BG.state.games = msg.games || [];
    if (document.body.dataset.screen === 'portal') render();
  });

  BG.net.on('rooms', function () {
    if (document.body.dataset.screen === 'portal') render();
  });

  BG.net.on('open', function () {
    if (document.body.dataset.screen === 'portal') render();
  });

  BG.net.on('offline', function () {
    if (document.body.dataset.screen === 'portal') render();
  });
})();
