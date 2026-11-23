/*
 * 첫 화면(반 만들기 · 반 코드 입장)과 우리 반 게임 포털
 *
 * - 맨 첫 화면: 오직 두 가지 — 선생님 '우리 반 만들기', 학생 '반 코드로 입장하기'
 * - ?class=반코드 로 들어오면 바로 그 반의 게임 선택 화면(#/class/반코드)으로 갑니다.
 * - 새 게임을 추가할 때는 BG.portalGames 에 카드 한 장을 더하면 됩니다.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const esc = BG.ui.escape;

  BG.portalGames = [
    {
      id: 'halligalli',
      title: '과일 딩동',
      emoji: '🔔',
      desc: '딸기·바나나·라임·자두, 같은 과일이 정확히 5개가 되는 순간 종을 치세요. 6개 모둠이 각자 방에서 동시에 즐깁니다.',
      players: '2~5명 · 모둠당 4명',
      status: 'ready',
      href: '#/halligalli',
      action: '지금 플레이',
      grades: ['low', 'mid', 'high'],
      mode: 'multi'
    },
    {
      id: 'bluemarble',
      title: '전국여행 마블 (3D)',
      emoji: '🎲',
      desc: '주사위를 굴려 도시를 사고, 별장·빌딩·호텔을 세워 통행료를 받는 3D 보드게임. 드래그로 보드를 돌려 보세요.',
      players: '2~4명 · 모둠당 4명',
      status: 'ready',
      href: '#/bluemarble',
      action: '지금 플레이',
      grades: ['mid', 'high'],
      mode: 'multi'
    },
    {
      id: 'streams',
      title: '숫자 줄세우기',
      emoji: '🎯',
      desc: '같은 숫자를 모두 함께, 각자 20칸 트랙에 오름차순으로! 끊기지 않고 이어진 가장 긴 줄이 점수입니다.',
      players: '1~4명 · 모둠당 4명',
      status: 'ready',
      href: '#/streams',
      action: '지금 플레이',
      grades: ['low', 'mid', 'high'],
      mode: 'multi'
    },
    {
      id: 'gomoku',
      title: '오목',
      emoji: '⚫',
      desc: '15x15 오목판 1:1 대결. 가로·세로·대각선 5개를 먼저 이으면 승리! AI 봇과 혼자 연습할 수 있어요.',
      players: '2명 · 모둠당 2명',
      status: 'ready',
      href: '#/gomoku',
      action: '지금 플레이',
      grades: ['mid', 'high'],
      mode: 'multi'
    },
    {
      id: 'liar',
      title: '라이어 추리게임',
      emoji: '🕵️',
      desc: '제시어를 모르는 한 명(라이어)이 섞여 있어요. 친구들의 힌트를 듣고 투표로 라이어를 찾아내세요!',
      players: '3~6명 · 모둠당 6명',
      status: 'ready',
      href: '#/liar',
      action: '지금 플레이',
      grades: ['mid', 'high'],
      mode: 'multi'
    },
    {
      id: 'yut',
      title: '전통 윷놀이',
      emoji: '🪵',
      desc: '도·개·걸·윷·모! 말을 업고, 잡고, 지름길로 달려 먼저 완주하세요. 우리나라 전통 보드게임.',
      players: '2~4명 · 모둠당 4명',
      status: 'ready',
      href: '#/yut',
      action: '지금 플레이',
      grades: ['low', 'mid', 'high'],
      mode: 'multi'
    },
    {
      id: 'puzzle',
      title: '1인용 미니 퍼즐',
      emoji: '🧩',
      desc: '2048과 짝맞추기. 짝을 기다리거나 혼자 연습할 때 바로 즐겨요. 최고점은 이 기기에 저장됩니다.',
      players: '1명 · 혼자서',
      status: 'ready',
      href: '#/puzzle',
      action: '혼자 하기',
      grades: ['low', 'mid', 'high'],
      mode: 'solo'
    },
    {
      id: 'more',
      title: '더 많은 게임',
      emoji: '➕',
      desc: '수업에 쓸 보드게임을 차례로 추가합니다. 다음으로 원하는 게임을 알려 주세요.',
      players: '확장 예정',
      status: 'soon',
      href: null,
      action: '준비 중',
      grades: [],
      mode: 'multi'
    }
  ];

  const GRADE_FILTERS = [
    { id: 'all', label: '전체' },
    { id: 'low', label: '저학년 추천 (1~2학년)' },
    { id: 'mid', label: '중학년 추천 (3~4학년)' },
    { id: 'high', label: '고학년 추천 (5~6학년)' },
    { id: 'solo', label: '1인용' }
  ];

  const GRADE_LABEL = { low: '저학년', mid: '중학년', high: '고학년' };

  const F = { filter: 'all' };

  function matchesFilter(game, filter) {
    if (filter === 'all') return true;
    if (filter === 'solo') return game.mode === 'solo';
    return (game.grades || []).indexOf(filter) !== -1;
  }

  /* ---------------- 공통 ---------------- */

  function connectionLine() {
    const connected = BG.net.connected;
    return '<div class="portal-foot">' +
      '<span><span class="conn-dot ' + (connected ? 'on' : '') + '"></span>' +
        (connected ? '실시간 서버 연결됨' : '서버 연결 없음 — AI 봇 연습은 그대로 사용할 수 있어요') + '</span>' +
      '<span class="spacer"></span>' +
      '<span>같은 와이파이에서 접속: 이 컴퓨터의 주소(예: http://192.168.0.10:3000)</span>' +
      '</div>';
  }

  function copyText(text, message) {
    const done = function () {
      BG.ui.toast(message || '복사했습니다.', 'ok');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        showLink(text);
      });
    } else {
      showLink(text);
    }
  }

  function showLink(text) {
    BG.ui.modal(
      '<h2>링크</h2>' +
      '<p class="mono" style="word-break:break-all">' + esc(text) + '</p>' +
      '<button class="btn btn-primary btn-block" data-action="ui.closeModal">확인</button>'
    );
  }

  function needServer() {
    if (BG.net.connected) return true;
    if (BG.net.offline) {
      BG.ui.toast('실시간 서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해 주세요.', 'error');
      return false;
    }
    // 연결 중이면 보낸 요청은 연결되는 순간 자동으로 전달됩니다.
    BG.net.connect();
    return true;
  }

  /* ---------------- 첫 화면 ---------------- */

  function recentHtml() {
    const list = BG.recentClasses();
    if (!list.length) return '';
    return '<div class="recent-class">' +
      '<span class="recent-label">최근 우리 반</span>' +
      list.map(function (item) {
        return '<button class="recent-chip" data-action="portal.openClass" data-code="' + esc(item.code) + '">' +
          '<b>' + esc(item.name || item.code) + '</b><span class="mono">' + esc(item.code) + '</span></button>';
      }).join('') +
      '</div>';
  }

  function landingHtml() {
    const connected = BG.net.connected;
    const codeValue = BG.state.classCode || '';
    const heroFruits = (BG.cards ? ['strawberry', 'banana', 'lime', 'plum'] : [])
      .map(function (id) { return BG.cards.fruitIcon(id); }).join('');

    const html =
      '<section class="portal-hero landing-hero">' +
        '<div class="portal-kicker">모둠 수업 보드게임</div>' +
        '<h1 class="portal-title">보드게임<em>천국</em></h1>' +
        '<p class="portal-sub">선생님이 알려 준 <b>반 코드</b>로 입장해요.<br>' +
          '반마다 1~6모둠이 따로 열려서 다른 반과 섞이지 않습니다.</p>' +
        '<div class="hero-fruits" aria-hidden="true">' + heroFruits + '</div>' +
      '</section>' +

      '<div class="role-grid solo">' +
        '<section class="role-card student student-main" id="student-card">' +
          '<div class="role-head">' +
            '<span class="role-emoji">🎒</span>' +
            '<div><div class="role-title">학생</div><div class="role-sub">반 코드로 입장하기</div></div>' +
          '</div>' +
          '<div class="stack">' +
            '<label class="field">선생님이 알려 준 반 코드' +
              '<input id="join-class-code" class="input mono code-input" maxlength="8" placeholder="예: A7K2M" ' +
                'autocomplete="off" autocapitalize="characters" spellcheck="false">' +
            '</label>' +
            (codeValue
              ? '<p class="hint">이 기기에서 마지막으로 쓴 반: <b>' + esc(BG.className() || codeValue) + '</b> (' + esc(codeValue) + ')</p>'
              : '<p class="hint">링크로 들어오면 반 코드를 넣지 않아도 바로 입장돼요.</p>') +
            '<button class="btn btn-primary btn-block role-submit role-submit-big" data-action="portal.enterClass">' +
              '입장하기 →</button>' +
            '<p class="hint">입장한 뒤에는 <b>출석번호</b>와 <b>이름</b>을 넣어요. (이름은 비워도 됩니다)</p>' +
            '<div class="role-ready">' +
              '<span class="ready-title">준비물은 네 가지</span>' +
              '<span class="ready-chips"><span class="ready-chip">📌 반 코드</span>' +
                '<span class="ready-chip">🔢 출석번호</span>' +
                '<span class="ready-chip">✏️ 내 이름</span>' +
                '<span class="ready-chip">👥 내 모둠</span></span>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>' +

      recentHtml() +

      '<div class="portal-foot">' +
        '<span><span class="conn-dot ' + (connected ? 'on' : '') + '"></span>' +
          (connected ? '실시간 서버 연결됨' : '서버 연결 없음 — AI 봇 연습과 규칙은 그대로 사용할 수 있어요') + '</span>' +
        '<span class="spacer"></span>' +
        '<a class="foot-link" href="#/halligalli/bot">🤖 AI 봇 연습</a>' +
      '</div>';

    BG.ui.screen(html, 'portal');
  }

  /* ---------------- 선생님 전용: 우리 반 만들기 ---------------- */

  function teacherHtml() {
    const recent = BG.recentClasses();
    const html =
      '<div class="entry-top">' +
        '<a class="back-link" href="#/">← 학생 입장 화면</a>' +
        '<span class="spacer"></span>' +
        '<span class="badge">👩‍🏫 교사용</span>' +
      '</div>' +
      '<section class="portal-hero teacher-hero">' +
        '<div class="portal-kicker">선생님 전용</div>' +
        '<h1 class="portal-title">우리 반 <em>만들기</em></h1>' +
        '<p class="portal-sub">반 이름과 교사 비밀번호를 정하면 <b>반 코드</b>와 <b>학생용 링크</b>가 만들어집니다.<br>' +
          '학생은 이 링크로 바로 들어와 출석번호만 고르면 됩니다.</p>' +
      '</section>' +

      (recent.length
        ? '<div class="recent-class"><span class="recent-label">최근 만든 반</span>' +
          recent.map(function (item) {
            return '<button class="recent-chip" data-action="portal.openClass" data-code="' + esc(item.code) + '">' +
              '<b>' + esc(item.name || item.code) + '</b><span class="mono">' + esc(item.code) + '</span></button>';
          }).join('') + '</div>'
        : '') +

      '<div class="role-grid solo">' +
        '<section class="role-card teacher teacher-page" id="teacher-card">' +
          '<div class="role-head">' +
            '<span class="role-emoji">👩‍🏫</span>' +
            '<div><div class="role-title">선생님</div><div class="role-sub">우리 반 만들기</div></div>' +
          '</div>' +
          '<div class="stack">' +
            '<label class="field">반 이름' +
              '<input id="class-name" class="input" maxlength="20" placeholder="예: 3학년 2반" autocomplete="off">' +
            '</label>' +
            '<label class="field">반 코드 <span class="hint">(비워 두면 자동으로 만들어요)</span>' +
              '<input id="class-code" class="input mono" maxlength="8" placeholder="예: 3-2BAN 또는 자동" autocomplete="off">' +
            '</label>' +
            '<label class="field">교사 비밀번호 (숫자 4~8자리)' +
              '<input id="class-pin" class="input" type="password" inputmode="numeric" maxlength="8" placeholder="예: 2451" autocomplete="new-password">' +
            '</label>' +
            '<label class="field">교사 개설 암호' +
              '<input id="teacher-create-code" class="input" type="password" maxlength="30" placeholder="학교에서 안내받은 암호" autocomplete="off">' +
            '</label>' +
            '<p class="hint">교사 개설 암호를 아는 선생님만 새 반을 만들 수 있어요. 학교 관리자(또는 서버를 설치한 선생님)에게 안내받은 암호를 넣어 주세요.</p>' +
            '<p class="hint">교사 비밀번호는 이 반의 <b>교사 관전·방 초기화</b>에 쓰입니다. 잊지 않게 기억해 주세요.</p>' +
            '<button class="btn btn-primary btn-block role-submit" data-action="portal.createClass">' +
              '우리 반 만들기 →</button>' +
          '</div>' +
        '</section>' +
      '</div>' +

      '<div class="portal-foot">' +
        '<span>학생에게는 반 코드나 링크만 알려 주세요.</span>' +
        '<span class="spacer"></span>' +
        '<a class="foot-link" href="#/">학생 입장 화면으로</a>' +
        '<a class="foot-link admin-link" href="#/admin">📊 제작자 통계</a>' +
      '</div>';

    BG.ui.screen(html, 'teacher');
  }

  /* ---------------- 우리 반 게임 포털 ---------------- */

  function gradeBadges(game) {
    if (!game.grades || !game.grades.length) return '';
    return '<span class="grade-badges">' +
      (game.mode === 'solo' ? '<span class="grade-badge solo">1인용</span>' : '') +
      game.grades.map(function (g) {
        return '<span class="grade-badge g-' + g + '">' + (GRADE_LABEL[g] || g) + '</span>';
      }).join('') +
    '</span>';
  }

  function gameCard(game) {
    const playable = game.status === 'ready';
    const badge = playable
      ? '<span class="badge ready">플레이 가능</span>'
      : '<span class="badge coming">준비 중</span>';
    const inner =
      '<div class="game-emoji">' + game.emoji + '</div>' +
      '<div class="game-name">' + esc(game.title) + '</div>' +
      '<div class="game-desc">' + esc(game.desc) + '</div>' +
      gradeBadges(game) +
      (playable && BG.cards && game.id === 'halligalli'
        ? '<div class="hero-fruits" style="justify-content:flex-start;margin-top:-2px" aria-hidden="true">' +
            ['strawberry', 'banana', 'lime', 'plum'].map(function (id) { return BG.cards.fruitIcon(id); }).join('') +
          '</div>'
        : '') +
      (playable && game.id === 'bluemarble'
        ? '<div class="game-deco bm-deco" aria-hidden="true">' +
            '<span class="bm-deco-die">🎲</span><span class="bm-deco-tiles"><i></i><i></i><i></i><i></i></span>' +
            '<span class="bm-deco-3d">3D</span>' +
          '</div>'
        : '') +
      '<div class="game-foot">' +
        '<span class="game-players">' + esc(game.players) + '</span>' +
        (playable
          ? '<span class="btn btn-primary btn-sm">' + game.action + ' →</span>'
          : '<span class="badge coming">' + game.action + '</span>') +
      '</div>';

    if (playable) {
      return (
        '<a class="game-card playable game-' + game.id + '" href="' + game.href + '" ' +
          'data-grades="' + (game.grades || []).join(' ') + '" data-mode="' + (game.mode || 'multi') + '">' +
          '<div class="row" style="justify-content:space-between">' + badge + '</div>' +
          inner +
        '</a>'
      );
    }
    return '<div class="game-card coming game-' + game.id + '" data-grades="' + (game.grades || []).join(' ') + '">' + badge + inner + '</div>';
  }

  function filterTabs() {
    return '<div class="game-filters" role="tablist" aria-label="학년별 게임 추천">' +
      GRADE_FILTERS.map(function (f) {
        return '<button class="filter-tab' + (F.filter === f.id ? ' is-active' : '') + '" role="tab" ' +
          'aria-selected="' + (F.filter === f.id ? 'true' : 'false') + '" ' +
          'data-action="portal.filter" data-filter="' + f.id + '">' + esc(f.label) + '</button>';
      }).join('') +
    '</div>';
  }

  function filteredGames() {
    return BG.portalGames.filter(function (g) { return matchesFilter(g, F.filter); });
  }

  function classPortalHtml() {
    const code = BG.state.classCode;
    const name = BG.className();
    const connected = BG.net.connected;
    const games = filteredGames().map(gameCard).join('') ||
      '<div class="empty">이 조건에 맞는 게임이 아직 없어요. 다른 탭을 눌러 보세요.</div>';
    const link = BG.classLink(code);

    const html =
      '<section class="portal-hero class-hero">' +
        '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">' +
          '<div>' +
            '<div class="portal-kicker">보드게임천국 · 우리 반</div>' +
            '<h1 class="portal-title class-title">' + esc(name) + '</h1>' +
            '<p class="portal-sub">반 코드 <b class="mono code-badge">' + esc(code) + '</b> · 우리 반 1~6모둠만 보여요.</p>' +
          '</div>' +
          '<div class="row class-actions">' +
            '<button class="btn btn-sm" data-action="portal.copyClassLink">🔗 링크 복사</button>' +
            '<a class="btn btn-sm btn-gold" href="#/halligalli/teacher">👩‍🏫 선생님 모드</a>' +
            '<a class="btn btn-sm" href="#/bluemarble/teacher">🎲 전국여행 마블 관전</a>' +
            '<button class="btn btn-sm btn-ghost" data-action="portal.changeClass">다른 반</button>' +
          '</div>' +
        '</div>' +
        '<p class="hint" style="margin-top:10px">학생 링크: <span class="mono">' + esc(link) + '</span></p>' +
      '</section>' +

      (BG.net.offline
        ? '<div class="offline-note">🔌 지금은 실시간 서버에 연결할 수 없어 모둠 대전을 할 수 없어요. ' +
            '<a href="#/halligalli/bot">🤖 AI 봇 연습</a>은 그대로 됩니다. (선생님은 서버가 켜진 주소로 접속해 주세요.)</div>'
        : '') +

      '<h2 class="panel-title" style="margin:18px 0 10px">게임 선택 <span class="hint">' + filteredGames().length + '개</span></h2>' +
      filterTabs() +
      '<div class="game-grid" style="margin-top:12px">' + games + '</div>' +

      '<div class="class-lower">' +
        ((BG.hg && BG.hg.classRankingHtml) ? BG.hg.classRankingHtml(10) : '') +
        '<section class="panel my-class-card">' +
          '<div class="panel-title">🎒 내 기록</div>' +
          (BG.state.number
            ? '<div class="row" style="align-items:center;gap:10px">' +
                BG.avatars.html({ number: BG.state.number, name: BG.studentLabel() }, 'sm') +
                '<b>' + esc(BG.studentLabel()) + '</b><span class="spacer"></span>' +
                (BG.hg && BG.hg.myRecordLine ? BG.hg.myRecordLine() : '') + '</div>' +
              '<p class="hint" style="margin-top:10px">게임에서 번호·이름을 바꾸면 그 번호의 기록으로 보여요.</p>'
            : '<p class="hint">게임에 들어가 <b>출석번호</b>를 넣으면 내 승수·포인트가 여기에 쌓여요.</p>') +
          '<p class="hint" style="margin-top:8px">승수·포인트는 이 기기에도 저장되어, 서버가 다시 켜져도 내 기록은 남아 있어요.</p>' +
        '</section>' +
      '</div>' +

      '<section class="panel" style="margin-top:22px">' +
        '<div class="panel-title">🎮 입장 방법</div>' +
        '<ol class="rules-list">' +
          '<li>원하는 게임(과일 딩동 · 전국여행 마블 · 숫자 줄세우기 · 오목 · 라이어 · 윷놀이)을 고르고 <b>출석번호(1~99)</b>와 <b>이름</b>을 입력합니다.</li>' +
          '<li>자기 <b>모둠(1~6모둠)</b>을 누르면 바로 그 모둠 방으로 들어가요.</li>' +
          '<li>모둠원이 모이면 방장이 <b>게임 시작</b>을 누릅니다.</li>' +
        '</ol>' +
      '</section>' +

      '<div class="portal-foot">' +
        '<span><span class="conn-dot ' + (connected ? 'on' : '') + '"></span>' +
          (connected ? '실시간 서버 연결됨' : '서버 연결 없음 — AI 봇 연습은 그대로 사용할 수 있어요') + '</span>' +
        '<span class="spacer"></span>' +
        '<a class="foot-link" href="#/halligalli/bot">🤖 AI 봇 연습</a>' +
      '</div>';

    BG.ui.screen(html, 'class');
  }

  function renderLanding() {
    landingHtml();
    BG.net.connect();
  }

  function renderClass(params) {
    const code = BG.cleanClassCode(params && params[0]);
    if (!code) {
      BG.navigate('/');
      return;
    }
    if (code !== BG.state.classCode) {
      // 다른 반으로 옮기면 이전 반의 랭킹이 잠깐 보이지 않게 비웁니다.
      if (BG.hg) BG.hg.state.stats = [];
      if (BG.bm) BG.bm.state.stats = [];
      BG.setClass(code, '');
    }
    BG.state.number = BG.numberFor(code);
    BG.state.name = BG.nameFor(code);
    classPortalHtml();
    BG.net.connect();
    if (BG.net.connected) BG.net.send({ t: 'classEnter', code: code });
  }

  BG.portal = {
    renderLanding: renderLanding,
    renderClass: renderClass,
    renderTeacher: teacherHtml,
    landingHtml: landingHtml,
    teacherHtml: teacherHtml,
    classPortalHtml: classPortalHtml
  };

  /* ---------------- 동작 ---------------- */

  function teacherTokenKey(code) {
    return 'bg.teacher.' + code;
  }

  BG.teacherToken = function (code) {
    return BG.session.get(teacherTokenKey(BG.cleanClassCode(code)), '') || '';
  };
  BG.setTeacherToken = function (code, token) {
    const key = teacherTokenKey(BG.cleanClassCode(code));
    if (token) BG.session.set(key, token);
    else BG.session.remove(key);
  };

  BG.actions['portal.createClass'] = function () {
    const nameEl = document.getElementById('class-name');
    const codeEl = document.getElementById('class-code');
    const pinEl = document.getElementById('class-pin');
    const teacherEl = document.getElementById('teacher-create-code');
    const name = nameEl ? nameEl.value.trim() : '';
    const pin = pinEl ? String(pinEl.value || '').replace(/[^0-9]/g, '') : '';
    const code = BG.cleanClassCode(codeEl ? codeEl.value : '');
    const teacherCode = teacherEl ? String(teacherEl.value || '').trim() : '';

    if (teacherEl && !teacherCode) {
      BG.ui.toast('교사 개설 암호를 입력해 주세요.', 'error');
      teacherEl.focus();
      return;
    }
    if (!name) {
      BG.ui.toast('반 이름을 입력해 주세요. (예: 3학년 2반)', 'error');
      if (nameEl) nameEl.focus();
      return;
    }
    if (pin.length < 4 || pin.length > 8) {
      BG.ui.toast('교사 비밀번호는 숫자 4~8자리로 정해 주세요.', 'error');
      if (pinEl) pinEl.focus();
      return;
    }
    if (code && code.length < 4) {
      BG.ui.toast('반 코드는 4~8자로 정해 주세요.', 'error');
      if (codeEl) codeEl.focus();
      return;
    }
    if (!needServer()) return;
    BG.net.send({ t: 'classCreate', name: name, code: code || undefined, pin: pin, teacherCode: teacherCode });
  };

  const S = { pendingClass: '' };

  BG.actions['portal.enterClass'] = function () {
    const el = document.getElementById('join-class-code');
    const code = BG.cleanClassCode(el ? el.value : '') || BG.state.classCode;
    if (!code) {
      BG.ui.toast('선생님이 알려 준 반 코드를 입력해 주세요.', 'error');
      if (el) el.focus();
      return;
    }
    if (!needServer()) return;
    S.pendingClass = code;
    BG.net.send({ t: 'classInfo', code: code });
  };

  BG.actions['portal.filter'] = function (el) {
    const next = el.getAttribute('data-filter') || 'all';
    if (F.filter === next) return;
    F.filter = next;
    classPortalHtml();
  };

  BG.actions['portal.copyClassLink'] = function () {
    copyText(BG.classLink(BG.state.classCode), '학생용 링크를 복사했습니다.');
  };

  BG.actions['portal.copyCreatedLink'] = function (el) {
    copyText(el.getAttribute('data-link') || BG.classLink(BG.state.classCode), '학생용 링크를 복사했습니다.');
  };

  BG.actions['portal.copyCode'] = function (el) {
    copyText(el.getAttribute('data-code') || BG.state.classCode, '반 코드를 복사했습니다.');
  };

  BG.actions['portal.openClass'] = function (el) {
    const code = BG.cleanClassCode(el.getAttribute('data-code'));
    if (!code) return;
    BG.setClass(code, BG.state.className);
    BG.navigate('/class/' + code);
  };

  BG.actions['portal.openCreated'] = function (el) {
    const code = BG.cleanClassCode(el.getAttribute('data-code'));
    const name = el.getAttribute('data-name') || '';
    BG.ui.closeModal();
    BG.setClass(code, name);
    BG.navigate('/class/' + code);
  };

  BG.actions['portal.changeClass'] = function () {
    if (BG.hg) BG.hg.state.stats = [];
    if (BG.bm) BG.bm.state.stats = [];
    BG.setClass('', '');
    BG.navigate('/');
  };

  /* ---------------- 서버 응답 ---------------- */

  function createdModal(msg) {
    // gh-pages 처럼 하위 경로에 올라간 경우에도 맞는 주소가 나오도록 직접 만듭니다.
    const link = BG.classLink(msg.code);
    BG.ui.modal(
      '<div class="created-class">' +
        '<div class="created-emoji">🎉</div>' +
        '<h2>' + esc(msg.name) + ' 준비 완료!</h2>' +
        '<p>학생에게 아래 <b>반 코드</b>나 <b>링크</b>를 보내 주세요.</p>' +
        '<div class="class-code-big mono">' + esc(msg.code) + '</div>' +
        '<p class="mono created-link">' + esc(link) + '</p>' +
        '<div class="stack" style="margin-top:14px">' +
          '<button class="btn btn-primary btn-block" data-action="portal.copyCreatedLink" data-link="' + esc(link) + '">🔗 학생용 링크 복사</button>' +
          '<button class="btn btn-block" data-action="portal.copyCode" data-code="' + esc(msg.code) + '">반 코드만 복사 (' + esc(msg.code) + ')</button>' +
          '<button class="btn btn-block" data-action="portal.openCreated" data-code="' + esc(msg.code) + '" data-name="' + esc(msg.name) + '">우리 반 열기 →</button>' +
        '</div>' +
        '<p class="hint" style="margin-top:12px">교사 비밀번호를 잊으면 그 반의 교사 관전과 방 초기화를 할 수 없으니 꼭 기억해 주세요.</p>' +
      '</div>'
    );
  }

  BG.net.on('class_created', function (msg) {
    const cls = msg.class || { code: msg.code, name: msg.name };
    if (BG.hg) BG.hg.state.stats = [];
    BG.setClass(cls.code, cls.name);
    BG.state.number = BG.numberFor(cls.code);
    BG.state.name = BG.nameFor(cls.code);
    BG.rememberClass(cls);
    if (msg.teacherToken) BG.setTeacherToken(cls.code, msg.teacherToken);
    createdModal({ code: cls.code, name: cls.name, link: msg.link });
  });

  BG.net.on('class_info', function (msg) {
    if (!S.pendingClass) return;
    const code = S.pendingClass;
    S.pendingClass = '';
    if (!msg || !msg.exists) {
      BG.ui.toast('그 반 코드를 찾을 수 없어요. 선생님께 다시 확인해 주세요.', 'error');
      return;
    }
    BG.setClass(msg.code || code, msg.name || '');
    BG.rememberClass({ code: msg.code || code, name: msg.name });
    BG.navigate('/class/' + (msg.code || code));
  });

  BG.net.on('class_entered', function (msg) {
    if (!msg || !msg['class']) return;
    BG.setClass(msg['class'].code, msg['class'].name);
    if (document.body.dataset.screen === 'class') classPortalHtml();
  });

  BG.net.on('open', function () {
    const screen = document.body.dataset.screen;
    if (screen === 'portal') landingHtml();
    else if (screen === 'class' && BG.state.classCode) {
      BG.net.send({ t: 'classEnter', code: BG.state.classCode });
      classPortalHtml();
    }
  });

  BG.net.on('offline', function () {
    const screen = document.body.dataset.screen;
    if (screen === 'portal') landingHtml();
    else if (screen === 'class') classPortalHtml();
  });

  BG.net.on('close', function () {
    if (document.body.dataset.screen === 'class') classPortalHtml();
  });

  BG.net.on('error', function (msg) {
    if (!msg) return;
    if (msg.code === 'no_class' && document.body.dataset.screen === 'class') {
      // 잘못된 우리 반 링크로 들어온 경우 — 빈 방 목록 대신 안내를 보여 줍니다.
      BG.ui.screen(
        '<div class="center-block">' +
          '<div style="font-size:40px">🔍</div>' +
          '<div><b>' + esc(BG.state.classCode) + '</b> 반을 찾을 수 없습니다.<br>선생님께 받은 링크나 반 코드를 다시 확인해 주세요.</div>' +
          '<a class="btn btn-primary btn-sm" href="#/">첫 화면으로</a>' +
        '</div>',
        'class'
      );
      return;
    }
    if (msg.code === 'class_exists' || msg.code === 'bad_pin' || msg.code === 'bad_class_code' || msg.code === 'bad_teacher_code') {
      if (document.body.dataset.screen === 'portal' || document.body.dataset.screen === 'teacher') BG.ui.toast(msg.message, 'error');
    }
  });

  /* ---------------- 라우트 ---------------- */

  BG.router.add(/^\/$/, 'portal', function () {
    renderLanding();
  });

  BG.router.add(/^\/teacher$/, 'teacher', function () {
    teacherHtml();
    BG.net.connect();
  });

  BG.router.add(/^\/class\/([A-Za-z0-9]{4,8})$/, 'class', function (params) {
    renderClass(params);
  });
})();
