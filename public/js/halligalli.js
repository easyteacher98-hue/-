/*
 * 과일 딩동 화면 (입장 · 대기방 · 게임판 · 교사 관전 · AI 봇 연습)
 * 규칙 계산은 public/engine.js 를 그대로 사용합니다.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const HG = window.HalliGalli;
  const esc = BG.ui.escape;

  const SEAT_KEY = 'hg.seat';

  const S = {
    rooms: [],
    room: null,
    role: 'player',
    pendingJoin: null,
    lastJoinAt: {},
    resumeSent: {},
    spectateSent: {},
    hint: false,
    seenTop: {},
    pendingResetCode: null,
    fx: { lastBellAt: null, freshAt: null, soundAt: null, kind: 'correct' },
    bot: { active: false, game: null, driver: null, timer: null, level: 'normal', count: 4 },
    teacherBound: false,
    stats: [],
    lastResult: null,
    resultShown: {}
  };

  /* ---------------- 공통 도우미 ---------------- */

  function screenName() {
    return document.body.dataset.screen || '';
  }

  function avatar(who, size) {
    return BG.avatars ? BG.avatars.html(who, size) : '';
  }

  /** 출석번호(1~99)를 읽습니다. (이름은 따로 readName()으로 읽습니다) */
  function readNumber() {
    const el = document.getElementById('number');
    const fromInput = el ? String(el.value || '').replace(/[^0-9]/g, '').slice(0, 2) : '';
    if (fromInput) return BG.setNumberFor(BG.state.classCode, fromInput);
    return String(BG.state.number || BG.numberFor(BG.state.classCode) || '');
  }

  /** 내 이름(선택, 1~10자)을 읽습니다. 비워 두면 번호만으로 표시합니다. */
  function readName() {
    const el = document.getElementById('student-name');
    if (el) return BG.setNameFor(BG.state.classCode, el.value);
    return String(BG.state.name || BG.nameFor(BG.state.classCode) || '');
  }

  function validNumber(text) {
    const n = Number(String(text || '').trim());
    return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
  }

  function numberLabel(n) {
    return n + '번';
  }

  /** 화면에 쓰는 내 표시 이름 (예: 3번, 3번 김민수) */
  function myLabel() {
    return BG.studentLabel(BG.state.number, BG.state.name);
  }

  /** 내 브라우저에 쌓인 내 기록 (반 코드 + 번호) */
  function myRecord() {
    const n = validNumber(BG.state.number);
    return n ? BG.myRecord(BG.state.classCode, n) : { wins: 0, points: 0, plays: 0 };
  }

  function myRecordLine() {
    const rec = myRecord();
    return '<span class="my-record">' +
      '<span class="record-chip">🏆 <b>' + rec.wins + '</b>승</span>' +
      '<span class="record-chip">⭐ <b>' + rec.points + '</b>P</span>' +
      '<span class="record-chip muted">' + rec.plays + '판</span>' +
      '</span>';
  }

  /** 우리 반 포인트 랭킹 (서버 집계) */
  function classRankingHtml(limit, bare) {
    const list = (S.stats || []).slice(0, limit || 10);
    const myNo = validNumber(BG.state.number);
    const head = '<div class="panel-title">🏆 우리 반 포인트 랭킹' +
      (bare ? '' : ' <span class="hint">(이번 수업 기록 · 서버를 다시 켜면 초기화)</span>') + '</div>';
    let body;
    if (!list.length) {
      body = '<p class="hint">아직 기록이 없어요. 한 판이 끝나면 1등 +100P, 2등 +50P, 3등 +30P, 나머지 +10P가 쌓입니다.</p>';
    } else {
      body = '<ul class="rank-list">' + list.map(function (rec) {
        const medal = rec.rank === 1 ? '🥇' : rec.rank === 2 ? '🥈' : rec.rank === 3 ? '🥉' : String(rec.rank);
        const label = BG.studentLabel(rec.number, rec.name || '');
        return '<li class="rank-row' + (myNo === rec.number ? ' is-me' : '') + '">' +
          '<span class="rank-medal">' + medal + '</span>' +
          avatar({ number: rec.number, name: label }, 'xs') +
          '<span class="rank-name">' + esc(label) + (myNo === rec.number ? ' <span class="tag you">나</span>' : '') + '</span>' +
          '<span class="rank-sub">' + rec.wins + '승 · ' + rec.plays + '판</span>' +
          '<span class="rank-points">' + rec.points + 'P</span>' +
          '</li>';
      }).join('') + '</ul>';
    }
    return bare ? head + body : '<div class="panel rank-panel">' + head + body + '</div>';
  }

  function getSeat() {
    return BG.session.get(SEAT_KEY, null);
  }
  function saveSeat(seat) {
    BG.session.set(SEAT_KEY, seat);
  }
  function clearSeat() {
    BG.session.remove(SEAT_KEY);
  }
  function mySeatCode() {
    const seat = getSeat();
    return seat && seat.code ? String(seat.code).toUpperCase() : '';
  }

  function statusBadge(status) {
    if (status === 'playing') return '<span class="badge playing">진행 중</span>';
    if (status === 'finished') return '<span class="badge finished">종료</span>';
    return '<span class="badge ready">대기 중</span>';
  }

  function soundOn() {
    return !!(BG.sound && BG.sound.enabled);
  }

  function soundButton() {
    const on = soundOn();
    return '<button class="btn btn-sm btn-ghost sound-toggle" data-action="hg.soundToggle" aria-pressed="' +
      (on ? 'true' : 'false') + '" title="' + (on ? '종소리 끄기' : '종소리 켜기') + '">' +
      (on ? '🔔 소리' : '🔕 무음') + '</button>';
  }

  function confirmDialog(opts) {
    BG.ui.modal(
      '<h2>' + esc(opts.title) + '</h2>' +
      '<p>' + esc(opts.body) + '</p>' +
      '<div class="row" style="justify-content:flex-end;margin-top:18px">' +
        '<button class="btn btn-ghost" data-action="ui.closeModal">취소</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-action="' +
          opts.action + '">' + esc(opts.confirm) + '</button>' +
      '</div>'
    );
  }

  function rulesHtml() {
    const rows = HG.FRUITS.map(function (f) {
      return (
        '<tr><td>' + f.name + '</td>' +
        [1, 2, 3, 4, 5].map(function (n) { return '<td class="num">' + HG.COPIES_BY_COUNT[n] + '장</td>'; }).join('') +
        '<td class="num">14장</td></tr>'
      );
    }).join('');

    return (
      '<h2>🔔 과일 딩동 규칙</h2>' +
      '<p>카드에 그려진 과일을 세다가, <b>어떤 과일이든 정확히 5개</b>가 되는 순간 종을 치는 게임입니다.</p>' +
      '<h3>카드 구성 (총 56장)</h3>' +
      '<table class="deck-table">' +
        '<thead><tr><th>과일</th><th>1개</th><th>2개</th><th>3개</th><th>4개</th><th>5개</th><th>합계</th></tr></thead>' +
        '<tbody>' + rows +
        '<tr><th>합계</th><th>20장</th><th>12장</th><th>12장</th><th>8장</th><th>4장</th><th>56장</th></tr>' +
        '</tbody></table>' +
      '<h3>놀이 방법</h3>' +
      '<ol class="rules-list">' +
        '<li>카드 56장을 인원수대로 똑같이 나눕니다. (내 차례에만 카드를 낼 수 있어요)</li>' +
        '<li>자기 차례가 되면 <b>내 덱 맨 위 카드 1장</b>을 내 앞에 뒤집어 놓습니다.</li>' +
        '<li>테이블에 보이는 <b>모든 사람의 맨 위 카드</b>를 보고, 어떤 과일이든 <b>정확히 5개</b>가 되면 종을 칩니다.</li>' +
        '<li>가장 먼저 종을 친 사람이 <b>테이블에 공개된 카드를 모두</b> 가져갑니다.</li>' +
        '<li>5개가 아닌데 종을 치면, <b>다른 모든 플레이어에게 내 카드 1장씩</b> 줘야 합니다.</li>' +
        '<li>카드가 모두 떨어지면 탈락! 마지막까지 남은 사람이 우승합니다.</li>' +
      '</ol>' +
      '<h3>조작 방법</h3>' +
      '<p>종은 화면 가운데 <b>🔔 종 버튼</b> 또는 <b>스페이스바</b>, 카드 뒤집기는 <b>카드 뒤집기 버튼</b> 또는 <b>F 키</b>입니다.<br>' +
      '모르면 [합계 보기]를 켜서 과일별 합계를 확인하며 연습해 보세요.<br>' +
      '그만하고 싶을 때는 화면 위 <b>[방 나가기]</b>를 누르면 됩니다.</p>' +
      '<button class="btn btn-primary btn-block" data-action="ui.closeModal">확인</button>'
    );
  }

  function openRules() {
    BG.ui.modal(rulesHtml());
  }

  /* ---------------- 입장 화면 ---------------- */

  function groupCard(room) {
    const status = room.status || 'waiting';
    const cls = status === 'playing' ? 'is-playing' : status === 'finished' ? 'is-done' : 'is-open';
    const count = room.playerCount || 0;
    const cap = room.capacity || 4;
    const seats = room.seats || [];
    const mine = mySeatCode() === String(room.code).toUpperCase();
    const stack = seats.slice(0, 4).map(function (s) { return avatar(s, 'xs'); }).join('');
    const names = seats.map(function (s) { return s.name + (s.isBot ? ' 🤖' : ''); }).join(', ');
    const full = count >= cap;
    const canEnter = status !== 'playing' && !full;
    let label = '입장';
    if (status === 'playing') label = '진행 중';
    else if (full) label = '만석';
    else if (status === 'finished') label = '새로 시작';

    const mainButton = mine
      ? '<button class="btn btn-primary btn-sm" data-action="hg.reenter" data-code="' + esc(room.code) + '">다시 들어가기</button>'
      : '<button class="btn ' + (canEnter ? 'btn-primary' : '') + ' btn-sm" data-action="hg.enterGroup" data-code="' + esc(room.code) + '"' +
        (canEnter ? '' : ' disabled') + '>' + label + '</button>';

    return (
      '<div class="group-card ' + cls + (mine ? ' is-self' : '') + '">' +
        '<div class="group-head"><span class="group-name">' + esc(room.name) + '</span>' +
          '<span class="group-occ"><b>' + count + '</b>/' + cap + '명</span></div>' +
        (mine ? '<div class="group-self-line"><span class="badge badge-self">🏠 내가 참여 중</span></div>' : '') +
        '<div class="group-players">' +
          (stack ? '<span class="avatar-stack">' + stack + '</span>' : '') +
          '<span class="group-names">' + (names ? esc(names) : '아직 아무도 없어요') + '</span></div>' +
        '<div class="group-actions">' +
          mainButton +
          (status === 'playing' || status === 'finished'
            ? '<button class="btn btn-sm" data-action="hg.watch" data-code="' + esc(room.code) + '">관전</button>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  function myRoomBanner() {
    if (!S.room || S.room.gameId !== 'halligalli') return '';
    return (
      '<div class="my-room-banner">' +
        avatar({ number: BG.state.number, name: myLabel() }, 'sm') +
        '<span>지금 <b>' + esc(S.room.name) + '</b>에 참여 중이에요.</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-sm btn-primary" data-action="hg.reenter" data-code="' + esc(S.room.code) + '">다시 들어가기</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="hg.leave">나가기</button>' +
      '</div>'
    );
  }

  function renderEntry() {
    if (!BG.state.classCode) {
      // 반 코드 없이 들어오면 첫 화면에서 반을 고르게 합니다.
      BG.navigate('/');
      return;
    }
    BG.net.connect();
    const groups = S.rooms.filter(function (r) { return r.gameId === 'halligalli'; });
    const groupCards = groups.length
      ? groups.map(groupCard).join('')
      : '<div class="empty">모둠 방 정보를 불러오는 중입니다…<br>서버가 꺼져 있다면 아래 <b>AI 봇과 연습</b>을 이용해 주세요.</div>';
    const connBadge = BG.net.connected
      ? '<span class="badge ready">서버 연결됨</span>'
      : '<span class="badge finished">서버 연결 안 됨</span>';
    const namePreviewLabel = validNumber(BG.state.number) ? myLabel() : '번호를 넣으면 여기에 보여요';

    const html =
      '<div class="entry-top">' +
        '<a class="back-link" href="#/class/' + esc(BG.state.classCode) + '">← 게임 선택</a>' +
        '<span class="spacer"></span>' +
        '<span class="badge">' + esc(BG.className() || BG.state.classCode) + '</span>' +
        connBadge +
      '</div>' +
      '<div class="screen-head">' +
        '<div>' +
          '<h1 class="entry-title">🔔 과일 딩동</h1>' +
          '<p class="page-sub">과일이 정확히 5개가 되는 순간, 종을 치세요! 모둠 방을 골라 입장하세요.</p>' +
        '</div>' +
      '</div>' +

      myRoomBanner() +

      '<div class="panel number-panel" style="margin-bottom:16px">' +
        '<div class="row" style="gap:14px;align-items:flex-start;flex-wrap:wrap">' +
          '<label class="field" style="flex:0 0 auto;min-width:170px">내 출석번호 (1~99)' +
            '<span class="row" style="gap:8px;flex-wrap:nowrap;align-items:center">' +
              '<span id="my-avatar-preview">' + avatar({ number: BG.state.number, name: myLabel() }, 'sm') + '</span>' +
              '<input id="number" class="input number-input" inputmode="numeric" pattern="[0-9]*" maxlength="2" ' +
                'autocomplete="off" placeholder="예: 3" style="flex:1;max-width:120px" value="' +
                esc(BG.state.number || '') + '">' +
              '<span class="number-suffix">번</span>' +
            '</span>' +
          '</label>' +
          '<label class="field" style="flex:1;min-width:200px">내 이름 (선택)' +
            '<input id="student-name" class="input name-input" maxlength="10" autocomplete="off" ' +
              'placeholder="예: 김민수" value="' + esc(BG.state.name || '') + '">' +
            '<span class="hint">번호와 이름이 함께 보여요: <b id="my-name-preview">' + esc(namePreviewLabel) + '</b></span>' +
          '</label>' +
          '<button class="btn btn-ghost" data-action="hg.rules" style="align-self:flex-end">📖 게임 규칙 보기</button>' +
        '</div>' +
        '<span class="hint" style="display:block;margin-top:10px">친구마다 다른 번호를 써 주세요. 이름을 비워 두면 번호만 보여요.</span>' +
        '<span class="hint" style="display:block">' + (validNumber(BG.state.number) ? '내 기록: ' + myRecordLine() : '번호를 넣으면 내 승수·포인트가 보여요.') + '</span>' +
      '</div>' +

      '<h2 class="panel-title" style="margin:4px 0 12px">모둠 방 선택 <span class="hint">(1모둠 ~ 6모둠)</span></h2>' +
      '<div class="group-grid">' + groupCards + '</div>' +

      '<div class="entry-tools">' +
        '<button class="tool-card" data-action="hg.bot">' +
          '<span class="tool-emoji">🤖</span>' +
          '<span class="tool-body"><span class="tool-title">AI 봇과 연습</span>' +
          '<span class="tool-desc">혼자서도 바로 4~5인 게임을 테스트할 수 있어요</span></span>' +
        '</button>' +
        '<button class="tool-card" data-action="hg.teacher">' +
          '<span class="tool-emoji">👩‍🏫</span>' +
          '<span class="tool-body"><span class="tool-title">교사 관전 모드</span>' +
          '<span class="tool-desc">6개 모둠의 진행 상황을 한눈에 보고 관전합니다</span></span>' +
        '</button>' +
        '<button class="tool-card" data-action="hg.createRoom">' +
          '<span class="tool-emoji">➕</span>' +
          '<span class="tool-body"><span class="tool-title">새 방 만들기</span>' +
          '<span class="tool-desc">모둠 방이 부족할 때 새 방을 만들어 코드를 나눠 줍니다</span></span>' +
        '</button>' +
      '</div>' +

      '<div class="panel" style="margin-top:16px">' +
        '<div class="panel-title">🔗 방 코드로 입장</div>' +
        '<div class="row">' +
          '<input id="room-code" class="input" placeholder="방 코드 (예: 3 또는 AB12)" maxlength="6" style="max-width:220px;text-transform:uppercase">' +
          '<button class="btn" data-action="hg.enterByCode">입장</button>' +
        '</div>' +
        '<p class="hint" style="margin-top:8px">대부분은 위의 모둠 방을 누르면 바로 입장됩니다. 선생님이 만든 방은 코드로 들어갈 수 있어요.</p>' +
      '</div>';

    BG.ui.screen(html, 'halligalli');
  }

  /* ---------------- 대기방 ---------------- */

  function lobbyHtml(room) {
    const isHost = room.youAreHost;
    const seats = room.seats.map(function (s) {
      const tags = [];
      if (s.isHost) tags.push('<span class="tag host">방장</span>');
      if (s.id === room.youId) tags.push('<span class="tag you">나</span>');
      if (s.isBot) tags.push('<span class="tag bot">AI 봇</span>');
      if (!s.isBot && s.ready) tags.push('<span class="tag ready">준비 완료</span>');
      if (!s.isBot && !s.connected) tags.push('<span class="tag off">연결 끊김</span>');
      return (
        '<div class="seat ' + (s.id === room.youId ? 'is-self' : '') + '">' +
          '<span class="seat-avatar">' + avatar(s) + '</span>' +
          '<div class="seat-main"><div class="seat-name">' + esc(s.name) + '</div>' +
            '<div class="seat-sub">' + (s.isBot ? '자동으로 플레이합니다' : s.ready ? '준비 완료' : '준비를 기다리는 중') + '</div></div>' +
          '<div class="tags">' + tags.join('') + '</div>' +
        '</div>'
      );
    }).join('');

    const empty = [];
    for (let i = room.seats.length; i < room.capacity; i++) {
      empty.push('<div class="seat" style="opacity:.5"><div class="seat-avatar avatar">＋</div>' +
        '<div class="seat-main"><div class="seat-name">빈 자리</div><div class="seat-sub">친구가 입장할 수 있어요</div></div></div>');
    }

    const mySeat = room.seats.find(function (s) { return s.id === room.youId; });
    const baseUrl = location.origin && location.origin !== 'null'
      ? location.origin + location.pathname
      : location.href.split('#')[0];
    const inviteUrl = baseUrl + '#/halligalli/room/' + room.code;

    return (
      '<div class="screen-head">' +
        '<div>' +
          '<a class="back-link" href="#/halligalli">← 모둠 선택</a>' +
          '<h1 class="room-name">' + esc(room.name) + ' ' + statusBadge('waiting') + '</h1>' +
          '<p class="page-sub">친구들이 같은 방에 들어오면 게임을 시작할 수 있어요.</p>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn btn-ghost btn-sm" data-action="hg.rules">📖 규칙</button>' +
          '<button class="btn btn-danger btn-sm" data-action="hg.leave">🚪 방 나가기</button>' +
        '</div>' +
      '</div>' +

      '<div class="lobby-wrap">' +
        '<div class="panel">' +
          '<div class="panel-title">👥 참가자 <span class="hint">' + room.seats.length + '/' + room.capacity + '명</span></div>' +
          '<div class="seat-list">' + seats + empty.join('') + '</div>' +
          '<div class="row" style="margin-top:14px">' +
            (isHost
              ? '<button class="btn" data-action="hg.addBot" ' + (room.seats.length >= room.capacity ? 'disabled' : '') + '>🤖 봇 추가</button>' +
                '<button class="btn btn-ghost" data-action="hg.removeBot">봇 내보내기</button>'
              : '') +
          '</div>' +
        '</div>' +

        '<div class="stack">' +
          '<div class="panel">' +
            '<div class="panel-title">🎮 게임 준비</div>' +
            '<div class="code-chip">방 코드 <b class="mono" style="font-size:16px">' + esc(room.code) + '</b>' +
              '<button class="btn btn-sm" data-action="hg.copyLink" data-code="' + esc(room.code) + '">링크 복사</button></div>' +
            '<p class="hint" style="margin-top:10px">' + esc(inviteUrl) + '</p>' +
            '<div class="stack" style="margin-top:14px">' +
              (isHost
                ? '<button class="btn btn-primary btn-block" data-action="hg.start"' +
                    (room.canStart ? '' : ' disabled') + '>▶ 게임 시작</button>'
                : '<button class="btn btn-block" data-action="hg.ready" aria-pressed="' + (mySeat && mySeat.ready ? 'true' : 'false') + '">' +
                    (mySeat && mySeat.ready ? '준비 취소' : '준비 완료') + '</button>') +
              '<button class="btn btn-block" data-action="hg.rules">📖 게임 규칙 보기</button>' +
            '</div>' +
            (isHost
              ? '<label class="row" style="margin-top:14px;font-size:12.5px;font-weight:800;color:var(--muted)">' +
                  '<input type="checkbox" data-action="hg.toggleEndTwo" ' + (room.endWhenTwo ? 'checked' : '') + ' style="width:18px;height:18px">' +
                  '2명 남았을 때 게임 종료</label>'
              : '') +
            '<p class="hint" style="margin-top:12px">' +
              (room.canStart ? '모두 준비되면 방장이 게임을 시작할 수 있어요.' : '최소 ' + room.minPlayers + '명이 필요합니다. 봇을 추가해 인원을 채울 수 있어요.') +
            '</p>' +
          '</div>' +
          '<div class="panel">' +
            '<div class="panel-title">🎒 내 기록</div>' +
            '<div class="row" style="align-items:center;gap:10px">' +
              avatar({ number: BG.state.number, name: myLabel() }, 'sm') +
              '<b>' + esc(myLabel()) + '</b>' +
              '<span class="spacer"></span>' +
              myRecordLine() +
            '</div>' +
            '<div class="lobby-rank" style="margin-top:12px">' + classRankingHtml(5, true) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------------- 게임판 ---------------- */

  function popClass(player) {
    const id = player.top ? player.top.id : null;
    const prev = S.seenTop[player.id];
    S.seenTop[player.id] = id;
    if (id && prev !== undefined && prev !== id) return 'card-pop';
    return '';
  }

  function tileHtml(player, youId) {
    const isSelf = player.id === youId;
    const card = player.top
      ? BG.cards.cardHtml(player.top, 'md', popClass(player))
      : BG.cards.emptyCardHtml('md');
    const foot = player.eliminated
      ? '탈락'
      : isSelf
        ? '내 카드'
        : '';
    return (
      '<div class="tile ' + (player.isTurn && !player.eliminated ? 'is-turn ' : '') + (isSelf ? 'is-self ' : '') + (player.eliminated ? 'is-out' : '') + '">' +
        '<div class="tile-top">' +
          '<span class="tile-person">' + avatar(player, 'xs') +
            '<span class="tile-name" title="' + esc(player.name) + (player.isBot ? ' (AI 봇)' : '') + '">' + esc(player.name) + '</span>' +
          '</span>' +
          '<span class="tile-cards">' + player.totalCards + '장</span>' +
        '</div>' +
        '<div class="tile-card">' + card + '</div>' +
        '<div class="tile-foot">' + foot + '</div>' +
      '</div>'
    );
  }

  /** 마지막 종 소식이 2초 안이면 종 위에 말풍선을 보여 줍니다. */
  function bellFx(game) {
    const lb = game.lastBell;
    if (!lb || !lb.at) return null;
    const fresh = S.fx.lastBellAt !== lb.at;
    const age = Date.now() - lb.at;
    if (fresh && age > 2400) return null;
    if (!fresh && age > 2600) return null;
    if (fresh) {
      S.fx.lastBellAt = lb.at;
      S.fx.freshAt = lb.at;
      S.fx.kind = lb.correct ? 'correct' : 'wrong';
    }
    return {
      kind: S.fx.kind,
      text: lb.correct ? '정답! 카드 ' + lb.cards + '장' : '앗, 5개가 아니에요!',
      fresh: S.fx.freshAt === lb.at
    };
  }

  function bellHtml(disabled, fx) {
    return (
      '<div class="bell-slot">' +
        (fx ? '<div class="bell-pop ' + fx.kind + '">' + esc(fx.text) + '</div>' : '') +
        '<button class="bell" data-action="hg.ring" aria-label="종 치기" ' + (disabled ? 'disabled' : '') + '>' +
          '<span class="bell-emoji">🔔</span><span class="bell-label">종</span>' +
        '</button>' +
        '<span class="bell-key">Space</span>' +
      '</div>'
    );
  }

  function sparksHtml() {
    let out = '<div class="fx-layer">';
    for (let i = 0; i < 14; i++) {
      const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
      const dist = 60 + Math.random() * 90;
      const dx = Math.round(Math.cos(angle) * dist);
      const dy = Math.round(Math.sin(angle) * dist) - 20;
      const colors = ['#ffd76e', '#ff9db0', '#8fd9ab', '#9cc4f2', '#c4acf0'];
      out += '<span class="spark" style="--dx:' + dx + 'px;--dy:' + dy + 'px;background:' +
        colors[i % colors.length] + ';animation:sparkFly ' + (0.7 + Math.random() * 0.5) + 's ease-out forwards;' +
        'animation-delay:' + (Math.random() * 0.1) + 's"></span>';
    }
    return out + '</div>';
  }

  function totalsHtml(game) {
    if (!S.hint) return '';
    return (
      '<div class="totals">' +
        HG.FRUITS.map(function (f) {
          const n = game.counts[f.id] || 0;
          return '<span class="total ' + (n === 5 ? 'five' : '') + '">' +
            '<span class="fruit-icon mini">' + BG.cards.fruitSvg(f.id) + '</span>' +
            f.name + ' <b>' + n + '</b></span>';
        }).join('') +
      '</div>'
    );
  }

  function logHtml(game) {
    const items = game.log.slice(-14).reverse().map(function (entry) {
      return '<li class="log-item ' + esc(entry.type) + '">' + esc(entry.text) + '</li>';
    }).join('');
    return (
      '<div class="log-panel">' +
        '<div class="log-title">게임 기록</div>' +
        '<ul class="log">' + (items || '<li class="log-item">아직 기록이 없습니다.</li>') + '</ul>' +
      '</div>'
    );
  }

  function turnBanner(game, youId, role, mode) {
    if (game.status === 'finished') {
      return '<div class="turn-banner over">🏆 ' + esc(game.winner || '게임') + ' 우승!</div>';
    }
    const current = game.players.find(function (p) { return p.id === game.turn; });
    const name = current ? current.name : '';
    if (role === 'player' && game.turn === youId) {
      return '<div class="turn-banner my-turn">👉 내 차례! 카드를 뒤집으세요 (F)</div>';
    }
    return '<div class="turn-banner">' + (role === 'spectator' ? '👀 관전 중 · ' : '') + esc(name) + '님 차례</div>';
  }

  /** 우승자 좌석(번호 아바타 일관성을 위해 player 객체를 찾습니다) */
  function winnerPlayer(game) {
    if (!game || !game.players) return null;
    return game.players.find(function (p) { return p.id === game.winnerId || p.name === game.winner; }) || null;
  }

  function winnerOverlay(game, opts) {
    if (game.status !== 'finished') return '';
    const buttons = [];
    if (opts.mode === 'bot') {
      buttons.push('<button class="btn btn-primary btn-block" data-action="hg.botRestart">한 판 더</button>');
      buttons.push('<button class="btn btn-block" data-action="hg.botExit">그만하기</button>');
    } else if (opts.role === 'spectator') {
      buttons.push('<button class="btn btn-primary btn-block" data-action="hg.watchBack">모둠 목록으로</button>');
    } else {
      if (opts.isHost) {
        buttons.push('<button class="btn btn-primary btn-block" data-action="hg.start">다시 시작</button>');
      }
      buttons.push('<button class="btn btn-block" data-action="hg.leave">방 나가기</button>');
    }
    return (
      '<div class="winner-overlay">' +
        '<div class="winner-card">' +
          '<div class="winner-crown">🏆</div>' +
          (game.winner ? avatar(winnerPlayer(game) || game.winner, 'lg') : '') +
          '<div class="winner-title">' + esc(game.winner || '게임') + ' 우승!</div>' +
          '<p class="winner-sub">' + (game.status === 'finished' ? '수고했어요! 다음 판도 도전해 볼까요?' : '') + '</p>' +
          '<div class="stack">' + buttons.join('') + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------------- 우승 결과 팝업 · 컨페티 ---------------- */

  function pointsForRankLocal(rank) {
    if (rank === 1) return 100;
    if (rank === 2) return 50;
    if (rank === 3) return 30;
    return 10;
  }

  function confettiHtml() {
    const colors = ['#ff8fa3', '#ffd76e', '#8fd9ab', '#9cc4f2', '#c4acf0', '#ffb49b'];
    let out = '<div class="confetti-layer" aria-hidden="true">';
    for (let i = 0; i < 56; i++) {
      const left = Math.round(Math.random() * 1000) / 10;
      const delay = Math.round(Math.random() * 900) / 1000;
      const dur = 1.6 + Math.round(Math.random() * 160) / 100;
      const size = 7 + Math.round(Math.random() * 9);
      const rotate = Math.round(Math.random() * 720 - 360);
      out += '<span class="confetti-piece" style="left:' + left + '%;' +
        'width:' + size + 'px;height:' + Math.round(size * 0.55) + 'px;' +
        'background:' + colors[i % colors.length] + ';' +
        'animation-delay:' + delay + 's;animation-duration:' + dur + 's;' +
        '--spin:' + rotate + 'deg"></span>';
    }
    return out + '</div>';
  }

  function medalFor(rank) {
    if (rank === 1) return '🏆';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '<span class="rank-plain">' + rank + '</span>';
  }

  function resultModalHtml(game, opts) {
    const ranking = game.ranking || [];
    const useServerPoints = !!(S.lastResult && S.lastResult.code === opts.code);
    const points = useServerPoints ? (S.lastResult.points || {}) : null;
    const myNo = validNumber(BG.state.number);

    const rows = ranking.map(function (row) {
      let gain = '—';
      if (!row.isBot && row.number !== null && row.number !== undefined) {
        if (points && points[row.number] !== undefined) gain = '+' + points[row.number] + 'P';
        else if (opts.mode === 'bot') gain = '연습';
        else gain = '+' + pointsForRankLocal(row.rank) + 'P';
      }
      const isMe = myNo && row.number === myNo;
      return '<tr class="' + (row.rank === 1 ? 'is-first ' : '') + (isMe ? 'is-me' : '') + '">' +
        '<td class="res-rank">' + medalFor(row.rank) + '</td>' +
        '<td class="res-who"><span class="res-avatar">' + avatar({ number: row.number, name: row.name }, 'xs') + '</span>' +
          '<span class="res-name">' + esc(row.name || (row.number !== null && row.number !== undefined ? row.number + '번' : '')) +
            (isMe ? ' <span class="tag you">나</span>' : '') + (row.isBot ? ' 🤖' : '') + '</span></td>' +
        '<td class="res-cards">' + row.cards + '장' + (row.eliminated ? ' <span class="res-out">탈락</span>' : '') + '</td>' +
        '<td class="res-bells"><span class="ok">✓' + row.bells.correct + '</span> <span class="no">✗' + row.bells.wrong + '</span></td>' +
        '<td class="res-points">' + gain + '</td>' +
        '</tr>';
    }).join('');

    const buttons = [];
    if (opts.mode === 'bot') {
      buttons.push('<button class="btn btn-primary btn-block" data-action="hg.botRestart">한 판 더</button>');
      buttons.push('<button class="btn btn-block" data-action="hg.botExit">그만하기</button>');
    } else if (opts.role === 'spectator') {
      buttons.push('<button class="btn btn-primary btn-block" data-action="hg.resultWatchBack">모둠 목록으로</button>');
      buttons.push('<button class="btn btn-ghost btn-block" data-action="hg.closeResult">닫고 계속 보기</button>');
    } else {
      if (opts.isHost) {
        buttons.push('<button class="btn btn-primary btn-block" data-action="hg.resultRestart">한 판 더 (다시 시작)</button>');
      }
      buttons.push('<button class="btn btn-block" data-action="hg.resultLeave">방 나가기</button>');
      buttons.push('<button class="btn btn-ghost btn-block" data-action="hg.closeResult">닫기</button>');
    }

    const winner = ranking.find(function (r) { return r.rank === 1; });
    const myRow = myNo ? ranking.find(function (r) { return r.number === myNo; }) : null;
    const myGain = myNo && points ? points[myNo] : null;
    const myLine = myRow
      ? '<p class="result-mine">내 순위 <b>' + myRow.rank + '등</b>' +
        (myGain ? ' · <b>+' + myGain + 'P</b> 적립!' : '') +
        (myRow.rank === 1 ? ' 🎉 우승!' : '') + '</p>'
      : '';

    return (
      confettiHtml() +
      '<div class="result-modal">' +
        '<div class="result-hero">' +
          '<div class="result-crown">🏆</div>' +
          '<h2 class="result-title">' + esc(game.winner || (winner ? winner.name : '게임')) + ' 우승!</h2>' +
          '<p class="result-sub">수고했어요! 최종 순위를 확인해 보세요.</p>' +
          myLine +
        '</div>' +
        '<div class="result-table-wrap">' +
          '<table class="result-table">' +
            '<thead><tr><th>순위</th><th>참가자</th><th>남은 카드</th><th>종 성공/실수</th><th>포인트</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="hint" style="text-align:center">순위 포인트: 1등 +100P · 2등 +50P · 3등 +30P · 그 외 +10P<br>' +
          '우리 반 누적 랭킹은 교사 관전 화면에서 볼 수 있어요.</p>' +
        '<div class="stack" style="margin-top:14px">' + buttons.join('') + '</div>' +
      '</div>'
    );
  }

  /** 게임이 끝나면 한 번만 결과 팝업과 축하 소리를 보여 줍니다. */
  function maybeShowResult(game, opts) {
    if (!game || game.status !== 'finished') return;
    const key = (opts.code || opts.mode || 'game') + ':' + (game.startedAt || '') + ':' + game.players.length;
    if (S.resultShown[key]) return;
    S.resultShown[key] = true;
    if (BG.sound) BG.sound.celebration();
    BG.ui.modal(resultModalHtml(game, opts));
    // 컨페티는 모달 밖(화면 전체)에 뿌려 스크롤·클리핑에 영향받지 않게 합니다.
    const layer = document.querySelector('.confetti-layer');
    if (layer) {
      document.body.appendChild(layer);
      setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }, 4200);
    }
  }

  BG.actions['hg.closeResult'] = function () {
    BG.ui.closeModal();
  };

  BG.actions['hg.resultRestart'] = function () {
    BG.ui.closeModal();
    BG.net.send({ t: 'start' });
  };

  BG.actions['hg.resultLeave'] = function () {
    BG.ui.closeModal();
    doLeave();
  };

  BG.actions['hg.resultWatchBack'] = function () {
    BG.ui.closeModal();
    BG.actions['hg.watchBack']();
  };

  function boardScreen(view) {
    const game = view.game;
    const players = game.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    const tiles = players.map(function (p) { return tileHtml(p, view.youId); });
    const bellIndex = Math.ceil(tiles.length / 2);
    const canRing = game.status === 'playing' && view.role === 'player';
    const fx = bellFx(game);
    tiles.splice(bellIndex, 0, bellHtml(!canRing, fx));

    const me = players.find(function (p) { return p.id === view.youId; });
    const canFlip = view.role === 'player' && game.status === 'playing' && me && me.isTurn && me.deckCount > 0;

    const myBar = view.role === 'spectator'
      ? '<div class="spectator-note">👀 관전 중입니다 — 카드나 종을 누를 수 없어요.</div>'
      : '<div class="my-bar">' +
          '<div class="my-who">' + avatar(me || { number: BG.state.number, name: myLabel() }, 'sm') +
            '<div><div class="my-name">' + esc(me ? me.name : myLabel()) + '</div>' +
            '<div class="my-info">내 카드 <b>' + (me ? me.totalCards : 0) + '</b>장 · 테이블 <b>' + game.tableCount + '</b>장 · ' +
              '종 <b>' + game.bells.correct + '</b>번 성공 / <b>' + game.bells.wrong + '</b>번 실수</div></div>' +
          '</div>' +
          '<span class="spacer"></span>' +
          '<button class="flip-btn" data-action="hg.flip" ' + (canFlip ? '' : 'disabled') + '>카드 뒤집기 <span class="key">F</span></button>' +
        '</div>';

    const subtitle = view.mode === 'bot'
      ? 'AI 봇 ' + (players.length - 1) + '명과 연습 중 · 규칙은 실제 게임과 같습니다'
      : view.role === 'spectator'
        ? '관전 모드 · 방 코드 ' + view.code
        : '방 코드 ' + view.code + ' · 친구들과 실시간 대전';

    const isMultiHost = view.mode === 'multi' && view.role === 'player' && view.isHost;

    const tools =
      '<div class="board-tools">' +
        '<button class="btn btn-sm ' + (S.hint ? 'btn-gold' : '') + '" data-action="hg.hintToggle" aria-pressed="' + (S.hint ? 'true' : 'false') + '">합계 보기</button>' +
        '<button class="btn btn-sm" data-action="hg.rules">📖 규칙</button>' +
        soundButton() +
        (isMultiHost ? '<button class="btn btn-sm btn-warn" data-action="hg.endGame">⏹ 게임 종료</button>' : '') +
        (view.role === 'spectator'
          ? '<button class="btn btn-sm btn-warn" data-action="hg.resetRoom" data-code="' + esc(view.code) + '" data-name="' + esc(String(view.title).replace(' 관전', '')) + '">🧹 방 초기화</button>' +
            '<button class="btn btn-sm btn-danger" data-action="hg.watchBack">관전 종료</button>'
          : '<button class="btn btn-sm btn-danger" data-action="hg.leave">🚪 방 나가기</button>') +
      '</div>';

    const backHref = view.role === 'spectator' ? '#/halligalli/teacher' : '#/halligalli';
    const backLabel = view.role === 'spectator' ? '모둠 목록' : '모둠 선택';

    const html =
      '<div class="screen-head">' +
        '<div>' +
          '<a class="back-link" href="' + backHref + '">← ' + backLabel + '</a>' +
          '<h1 class="room-name">' + esc(view.title) + ' ' + statusBadge(game.status) + '</h1>' +
          '<p class="page-sub">' + esc(subtitle) + '</p>' +
        '</div>' +
        tools +
      '</div>' +

      '<div class="board">' +
        '<div class="board-head">' + turnBanner(game, view.youId, view.role, view.mode) + '</div>' +
        '<div class="table">' +
          tiles.join('') +
          (fx && fx.fresh ? '<div class="board-flash ' + fx.kind + '"></div>' + sparksHtml() : '') +
        '</div>' +
        totalsHtml(game) +
        myBar +
        logHtml(game) +
      '</div>' +
      winnerOverlay(game, view);

    // 피드백은 한 번만 그려지도록 표시를 소비합니다.
    if (fx) S.fx.freshAt = null;

    return html;
  }

  /** 종을 쳤을 때(내 차례든 다른 사람이든) 소리를 냅니다. */
  function playBellSound(game) {
    const lb = game && game.lastBell;
    if (!lb || !lb.at) return;
    if (Date.now() - lb.at > 3000) return;
    if (S.fx.soundAt === lb.at) return;
    S.fx.soundAt = lb.at;
    if (BG.sound) {
      BG.sound.bell(lb.correct ? 'correct' : 'wrong');
      if (lb.correct) BG.sound.cheer();
    }
  }

  /* ---------------- 방 화면 ---------------- */

  function renderRoom(params) {
    const code = String(params[0] || '').toUpperCase();
    BG.net.connect();

    if (!S.room || S.room.code !== code) {
      const seat = getSeat();
      if (BG.net.connected) {
        if (seat && seat.code === code && seat.token) {
          if (!S.resumeSent[code]) {
            S.resumeSent[code] = true;
            BG.net.send({ t: 'resume', gameId: 'halligalli', code: code, classCode: BG.state.classCode, token: seat.token });
          }
        } else if (!S.pendingJoin || S.pendingJoin !== code) {
          const number = validNumber(readNumber());
          if (number) {
            S.pendingJoin = code;
            BG.net.send({ t: 'join', gameId: 'halligalli', code: code, classCode: BG.state.classCode, number: number, studentName: readName() });
          }
        }
      }
      BG.ui.screen(
        '<div class="center-block">' +
          (validNumber(readNumber()) || getSeat()
            ? '<span class="spinner"></span><div>방에 입장하는 중…</div>'
            : '<div>출석번호가 필요합니다. <a href="#/halligalli">모둠 선택으로 돌아가기</a></div>') +
        '</div>',
        'hg.room'
      );
      return;
    }

    const room = S.room;
    if (room.status === 'waiting') {
      closeResultModalIfOpen();
      BG.ui.screen(lobbyHtml(room), 'hg.room');
      return;
    }

    const view = {
      title: room.name,
      code: room.code,
      game: room.game,
      youId: room.youId,
      role: room.role,
      mode: 'multi',
      isHost: room.youAreHost
    };
    BG.ui.screen(boardScreen(view), 'hg.room');
    maybeShowResult(room.game, view);
  }

  function closeResultModalIfOpen() {
    if (document.querySelector('.result-modal')) BG.ui.closeModal();
  }

  function renderWatch(params) {
    const code = String(params[0] || '').toUpperCase();
    BG.net.connect();
    if (!S.room || S.room.code !== code || S.room.role !== 'spectator') {
      if (BG.net.connected && !S.spectateSent[code]) {
        S.spectateSent[code] = true;
        BG.net.send({ t: 'spectate', gameId: 'halligalli', code: code, classCode: BG.state.classCode });
      }
      BG.ui.screen('<div class="center-block"><span class="spinner"></span><div>관전 화면을 준비하는 중…</div></div>', 'hg.watch');
      return;
    }
    const room = S.room;
    if (!room.game) {
      closeResultModalIfOpen();
      BG.ui.screen(
        '<div class="screen-head">' +
          '<div>' +
            '<a class="back-link" href="#/halligalli/teacher">← 모둠 목록</a>' +
            '<h1 class="room-name">' + esc(room.name) + ' 관전</h1>' +
            '<p class="page-sub">아직 게임이 시작되지 않았습니다. 학생들이 모이면 게임판이 보입니다.</p>' +
          '</div>' +
          '<div class="row">' +
            '<button class="btn btn-sm btn-warn" data-action="hg.resetRoom" data-code="' + esc(room.code) + '" data-name="' + esc(room.name) + '">🧹 방 초기화</button>' +
            '<button class="btn btn-sm btn-danger" data-action="hg.watchBack">관전 종료</button>' +
          '</div>' +
        '</div>' +
        '<div class="empty">대기 중인 모둠입니다.<br><br>' +
          '<button class="btn btn-primary btn-sm" data-action="hg.watchBack">모둠 목록으로</button></div>',
        'hg.watch'
      );
      return;
    }
    const view = {
      title: room.name + ' 관전',
      code: room.code,
      game: room.game,
      youId: null,
      role: 'spectator',
      mode: 'multi',
      isHost: false
    };
    BG.ui.screen(boardScreen(view), 'hg.watch');
    maybeShowResult(room.game, view);
  }

  /* ---------------- 교사 관전 ---------------- */

  function teacherRoomCard(room) {
    const status = room.status || 'waiting';
    const cls = status === 'playing' ? 'is-playing' : status === 'finished' ? 'is-done' : 'is-waiting';
    const label = status === 'playing' ? '진행 중' : status === 'finished' ? '종료' : '대기 중';
    const badgeCls = status === 'playing' ? 'playing' : status === 'finished' ? 'finished' : 'ready';

    let list = '';
    if (status === 'waiting') {
      list = (room.seats || []).map(function (s) {
        return '<div class="room-player">' + avatar(s, 'xs') +
          '<span class="who">' + esc(s.name) + (s.isBot ? ' 🤖' : '') + (s.isHost ? ' 👑' : '') + '</span>' +
          '<span class="cnt">' + (s.isBot ? '봇' : s.ready ? '준비' : '대기') + '</span></div>';
      }).join('');
      if (!list) list = '<div class="room-player"><span class="who">아직 참가자가 없습니다</span></div>';
    } else {
      list = (room.players || []).map(function (p) {
        return '<div class="room-player ' + (p.isTurn ? 'turn' : '') + ' ' + (p.eliminated ? 'out' : '') + '">' +
          avatar({ number: p.number, name: p.name, id: p.id }, 'xs') +
          '<span class="who">' + (p.isTurn ? '▶ ' : '') + esc(p.name) + (p.isBot ? ' 🤖' : '') + '</span>' +
          '<span class="cnt">' + p.deckCount + '장</span></div>';
      }).join('');
    }

    const meta = status === 'waiting'
      ? '참가 ' + room.playerCount + '/' + room.capacity + '명'
      : '참가 ' + room.playerCount + '명 · 테이블 ' + (room.tableCount || 0) + '장' +
        (status === 'playing' && room.turnName ? ' · ' + room.turnName + '님 차례' : '') +
        (status === 'finished' && room.winner ? ' · 우승 ' + room.winner : '');

    return (
      '<div class="room-card ' + cls + '">' +
        '<div class="room-card-head">' +
          '<div class="room-card-name">' + esc(room.name) + '</div>' +
          '<span class="badge ' + badgeCls + '">' + label + '</span>' +
        '</div>' +
        '<div class="room-card-meta">' + esc(meta) + '</div>' +
        '<div class="room-players">' + list + '</div>' +
        '<div class="room-event">최근: ' + esc(room.lastEvent || '—') + '</div>' +
        '<div class="room-card-actions">' +
          '<button class="btn btn-sm btn-primary" data-action="hg.watch" data-code="' + esc(room.code) + '">👀 관전하기</button>' +
          '<button class="btn btn-sm btn-warn" data-action="hg.resetRoom" data-code="' + esc(room.code) + '" data-name="' + esc(room.name) + '">🧹 방 초기화</button>' +
        '</div>' +
      '</div>'
    );
  }

  /** 교사 확인(PIN) 화면 — 우리 반 선생님만 관전·방 초기화를 할 수 있습니다. */
  function teacherGateHtml() {
    return (
      '<div class="teacher-gate">' +
        '<div class="gate-emoji">👩‍🏫</div>' +
        '<h1 class="page-title">' + esc(BG.className() || BG.state.classCode) + ' 선생님 확인</h1>' +
        '<p class="page-sub">우리 반을 만들 때 정한 <b>교사 비밀번호(PIN)</b>를 입력하면<br>' +
          '우리 반 6개 모둠의 진행 상황을 보고 방을 초기화할 수 있어요.</p>' +
        '<div class="gate-form">' +
          '<input id="teacher-pin" class="input pin-input" type="password" inputmode="numeric" maxlength="8" ' +
            'autocomplete="current-password" placeholder="교사 PIN">' +
          '<button class="btn btn-primary" data-action="hg.teacherAuth">확인</button>' +
        '</div>' +
        '<a class="back-link" href="#/class/' + esc(BG.state.classCode) + '">← 우리 반으로</a>' +
      '</div>'
    );
  }

  function teacherReady() {
    return !!BG.teacherToken(BG.state.classCode);
  }

  function renderTeacher() {
    BG.net.connect();

    if (!BG.state.classCode) {
      BG.navigate('/');
      return;
    }
    if (!teacherReady()) {
      BG.ui.screen(teacherGateHtml(), 'hg.teacher');
      return;
    }

    const rooms = S.rooms.filter(function (r) { return r.gameId === 'halligalli'; });
    const playing = rooms.filter(function (r) { return r.status === 'playing'; }).length;
    const people = rooms.reduce(function (sum, r) { return sum + (r.humanCount || 0); }, 0);

    BG.ui.screen(
      '<div class="screen-head">' +
        '<div>' +
          '<a class="back-link" href="#/class/' + esc(BG.state.classCode) + '">← ' + esc(BG.className() || '우리 반') + '</a>' +
          '<h1 class="page-title">👩‍🏫 교사 관전 모드</h1>' +
          '<p class="page-sub">' + esc(BG.className() || BG.state.classCode) + ' 우리 반 6개 모둠의 상황을 실시간으로 확인하고, 원하는 모둠을 눌러 관전할 수 있습니다.</p>' +
        '</div>' +
        '<div class="row">' +
          '<span class="badge ' + (playing ? 'playing' : 'ready') + '">' + playing + '개 모둠 진행 중</span>' +
          '<span class="badge">학생 ' + people + '명 접속</span>' +
          '<span class="badge ' + (BG.net.connected ? 'ready' : 'finished') + '">' + (BG.net.connected ? '실시간 연결' : '연결 끊김') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="teacher-grid">' +
        (rooms.length ? rooms.map(teacherRoomCard).join('') : '<div class="empty">모둠 방 정보를 불러오는 중입니다…</div>') +
      '</div>' +
      '<div style="margin-top:18px">' + classRankingHtml(10) + '</div>' +
      '<div class="panel" style="margin-top:18px">' +
        '<div class="panel-title">💡 수업 운영 팁</div>' +
        '<p class="hint">' +
          '· 관전 화면에서는 카드와 종을 누를 수 없으니 안심하고 화면을 띄워 두세요.<br>' +
          '· [합계 보기]를 켜면 과일별 합계가 표시되어 학생들이 세는 방법을 익힐 수 있습니다.<br>' +
          '· 학생이 나가기를 누르거나 모두 나가면 모둠 방은 자동으로 대기 상태(0/4명)가 됩니다.<br>' +
          '· 그래도 방이 막혀 있으면 카드의 [🧹 방 초기화]로 참가자를 정리하고 새로 시작할 수 있습니다.' +
        '</p>' +
      '</div>',
      'hg.teacher'
    );
  }

  /* ---------------- AI 봇 연습 ---------------- */

  function stopBotLoop() {
    if (S.bot.timer) {
      clearInterval(S.bot.timer);
      S.bot.timer = null;
    }
  }

  function startBotLoop() {
    stopBotLoop();
    S.bot.timer = setInterval(function () {
      const game = S.bot.game;
      if (!game || game.status !== 'playing') {
        stopBotLoop();
        return;
      }
      const action = S.bot.driver.tick(Date.now());
      if (!action) return;
      if (action.action === 'ring') game.ring(action.playerId, Date.now());
      else if (action.action === 'flip') game.flip(action.playerId, Date.now());
      if (game.lastBell) playBellSound(game);
      if (game.status !== 'playing') stopBotLoop();
      if (screenName() === 'hg.bot') renderBot();
    }, 90);
  }

  function startBotGame(count, level) {
    stopBotLoop();
    const number = validNumber(BG.state.number) || 1;
    const name = myLabel();
    const players = [{ id: 'me', name: name, number: number, isBot: false }];
    const names = HG.BOT_NAMES.slice();
    for (let i = 1; i < count; i++) {
      players.push({ id: 'bot' + i, name: names[i - 1] || ('봇' + i), isBot: true });
    }
    const game = new HG.Game(players, { endWhenTwo: false });
    S.bot = {
      active: true,
      game: game,
      driver: new HG.BotDriver(game, { level: level || 'normal' }),
      timer: null,
      level: level || 'normal',
      count: count
    };
    S.seenTop = {};
    S.fx = { lastBellAt: null, freshAt: null, soundAt: null, kind: 'correct' };
    startBotLoop();
    renderBot();
  }

  function renderBot() {
    if (!S.bot.active || !S.bot.game) {
      const levels = [
        { id: 'easy', name: '쉬움 (초보)' },
        { id: 'normal', name: '보통' },
        { id: 'hard', name: '어려움' }
      ];
      BG.ui.screen(
        '<div class="screen-head">' +
          '<div>' +
            '<a class="back-link" href="#/halligalli">← 과일 딩동 입장</a>' +
            '<h1 class="page-title">🤖 AI 봇과 연습</h1>' +
            '<p class="page-sub">서버에 접속하지 않아도 혼자서 4~5인 게임을 바로 테스트할 수 있습니다. (내 이름: ' + esc(myLabel()) + ')</p>' +
          '</div>' +
          '<button class="btn btn-sm" data-action="hg.rules">📖 규칙</button>' +
        '</div>' +
        '<div class="panel" style="max-width:520px">' +
          '<div class="panel-title">연습 설정</div>' +
          '<div class="stack">' +
            '<div class="field">인원' +
              '<div class="row">' +
                [4, 5].map(function (n) {
                  return '<button class="btn" data-action="hg.botStart" data-count="' + n + '" data-level="normal">' +
                    n + '인 (나 + 봇 ' + (n - 1) + ')</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div class="field">난이도' +
              '<div class="row">' +
                levels.map(function (lv) {
                  return '<button class="btn btn-ghost btn-sm" data-action="hg.botStart" data-count="4" data-level="' + lv.id + '">' + lv.name + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<p class="hint">카드 뒤집기 <b>F</b> · 종 치기 <b>스페이스바</b>. 봇은 진짜 학생처럼 반응 속도가 조금씩 다릅니다.</p>' +
            '<button class="btn btn-primary btn-block" data-action="hg.botStart" data-count="4" data-level="normal">4인 게임 시작</button>' +
          '</div>' +
        '</div>',
        'hg.bot'
      );
      return;
    }

    const game = S.bot.game.stateFor('me');
    const view = {
      title: 'AI 봇 연습',
      code: '연습',
      game: game,
      youId: 'me',
      role: 'player',
      mode: 'bot',
      isHost: true
    };
    BG.ui.screen(boardScreen(view), 'hg.bot');
    maybeShowResult(game, view);
  }

  /* ---------------- 동작 ---------------- */

  function ensureConnected() {
    if (BG.net.connected) return true;
    BG.net.connect();
    BG.ui.toast('서버에 연결하는 중입니다. 잠시 후 다시 눌러 주세요.', 'error');
    return false;
  }

  function joinCode(code) {
    const number = validNumber(readNumber());
    if (!number) {
      BG.ui.toast('출석번호를 1~99 사이 숫자로 입력해 주세요.', 'error');
      const input = document.getElementById('number');
      if (input) input.focus();
      return;
    }
    const studentName = readName();
    if (!ensureConnected()) return;
    const now = Date.now();
    if (S.lastJoinAt[code] && now - S.lastJoinAt[code] < 2000) return;
    S.lastJoinAt[code] = now;
    if (S.room && S.room.code !== code) {
      BG.net.send({ t: 'leave' });
      S.room = null;
      clearSeat();
    }
    S.pendingJoin = code;
    S.resumeSent[code] = false;
    BG.net.send({ t: 'join', gameId: 'halligalli', code: code, classCode: BG.state.classCode, number: number, studentName: studentName });
    BG.navigate('/halligalli/room/' + code);
  }

  /** 방에서 실제로 나갑니다. (서버가 자리 정리 + 사람이 없으면 방 초기화) */
  function doLeave() {
    BG.net.send({ t: 'leave' });
    S.room = null;
    S.pendingJoin = null;
    S.resumeSent = {};
    clearSeat();
    BG.navigate('/halligalli');
  }

  BG.actions['hg.rules'] = function () { openRules(); };

  BG.actions['hg.hintToggle'] = function () {
    S.hint = !S.hint;
    BG.render();
  };

  BG.actions['hg.soundToggle'] = function () {
    if (!BG.sound) return;
    const on = BG.sound.toggle();
    BG.ui.toast(on ? '종소리를 켰어요 🔔' : '종소리를 껐어요 🔕', on ? 'ok' : '');
    BG.render();
  };

  BG.actions['hg.enterGroup'] = function (el) {
    joinCode(String(el.getAttribute('data-code') || '').toUpperCase());
  };

  BG.actions['hg.reenter'] = function (el) {
    const code = String(el.getAttribute('data-code') || '').toUpperCase();
    if (!code) return;
    BG.net.connect();
    BG.navigate('/halligalli/room/' + code);
  };

  BG.actions['hg.enterByCode'] = function () {
    const input = document.getElementById('room-code');
    const code = input && input.value ? input.value.trim().toUpperCase() : '';
    if (!code) {
      BG.ui.toast('방 코드를 입력해 주세요.', 'error');
      return;
    }
    joinCode(code);
  };

  BG.actions['hg.createRoom'] = function () {
    const number = validNumber(readNumber());
    if (!number) {
      BG.ui.toast('출석번호를 먼저 입력해 주세요.', 'error');
      return;
    }
    if (!ensureConnected()) return;
    BG.net.send({ t: 'create', gameId: 'halligalli', classCode: BG.state.classCode, number: number, studentName: readName() });
  };

  BG.actions['hg.teacher'] = function () {
    BG.navigate('/halligalli/teacher');
  };

  /** 교사 PIN 확인 → 성공하면 교사 기능(관전·방 초기화)이 열립니다. */
  BG.actions['hg.teacherAuth'] = function () {
    const el = document.getElementById('teacher-pin');
    const pin = el ? String(el.value || '').replace(/[^0-9]/g, '') : '';
    if (!pin) {
      BG.ui.toast('교사 비밀번호를 입력해 주세요.', 'error');
      if (el) el.focus();
      return;
    }
    if (!ensureConnected()) return;
    S.teacherBound = false;
    BG.net.send({ t: 'classAuth', code: BG.state.classCode, pin: pin });
  };

  BG.actions['hg.teacherExit'] = function () {
    BG.setTeacherToken(BG.state.classCode, '');
    S.teacherBound = false;
    BG.navigate('/class/' + BG.state.classCode);
  };

  BG.actions['hg.bot'] = function () {
    BG.navigate('/halligalli/bot');
  };

  BG.actions['hg.botStart'] = function (el) {
    startBotGame(Number(el.getAttribute('data-count') || 4), el.getAttribute('data-level') || 'normal');
  };

  BG.actions['hg.botRestart'] = function () {
    closeResultModalIfOpen();
    startBotGame(S.bot.count || 4, S.bot.level || 'normal');
  };

  BG.actions['hg.botExit'] = function () {
    closeResultModalIfOpen();
    stopBotLoop();
    S.bot = { active: false, game: null, driver: null, timer: null, level: S.bot.level || 'normal', count: S.bot.count || 4 };
    BG.navigate('/halligalli');
  };

  BG.actions['hg.flip'] = function () {
    if (S.bot.active && screenName() === 'hg.bot') {
      const result = S.bot.game.flip('me', Date.now());
      if (!result.ok) BG.ui.toast(reasonMessage(result.reason), 'error');
      else if (BG.sound) BG.sound.flip();
      if (S.bot.game.status !== 'playing') stopBotLoop();
      renderBot();
      return;
    }
    if (BG.sound) BG.sound.flip();
    BG.net.send({ t: 'action', action: 'flip' });
  };

  BG.actions['hg.ring'] = function () {
    if (S.bot.active && screenName() === 'hg.bot') {
      const result = S.bot.game.ring('me', Date.now());
      if (!result.ok) {
        BG.ui.toast(reasonMessage(result.reason), 'error');
      } else {
        playBellSound(S.bot.game);
        if (!result.correct) BG.ui.toast('앗, 5개가 아니었어요! 카드 1장씩 잃었습니다.', 'error');
      }
      renderBot();
      return;
    }
    BG.net.send({ t: 'action', action: 'ring' });
  };

  function reasonMessage(reason) {
    const map = {
      not_your_turn: '아직 내 차례가 아닙니다.',
      empty_deck: '낼 카드가 없습니다.',
      bell_locked: '방금 종을 쳤어요. 잠시만 기다려 주세요.',
      eliminated: '탈락한 플레이어입니다.',
      not_playing: '게임이 진행 중이 아닙니다.'
    };
    return map[reason] || '지금은 할 수 없습니다.';
  }

  BG.actions['hg.ready'] = function () {
    const room = S.room;
    const me = room && room.seats.find(function (s) { return s.id === room.youId; });
    BG.net.send({ t: 'ready', ready: !(me && me.ready) });
  };

  BG.actions['hg.start'] = function () {
    BG.net.send({ t: 'start' });
  };

  BG.actions['hg.addBot'] = function () {
    BG.net.send({ t: 'addBot' });
  };

  BG.actions['hg.removeBot'] = function () {
    BG.net.send({ t: 'removeBot' });
  };

  BG.actions['hg.toggleEndTwo'] = function (el) {
    BG.net.send({ t: 'option', endWhenTwo: !!el.checked });
  };

  /* 나가기: 게임 중이면 한 번 확인한 뒤 실제로 퇴장합니다. */
  BG.actions['hg.leave'] = function () {
    if (S.bot.active && screenName() === 'hg.bot') {
      BG.actions['hg.botExit']();
      return;
    }
    const playing = S.room && S.room.game && S.room.game.status === 'playing';
    if (playing && S.room.role === 'player') {
      confirmDialog({
        title: '방을 나갈까요?',
        body: '지금 나가면 이 모둠 방에서 나가게 됩니다. 친구들이 남아 있으면 게임은 그대로 이어지고, 혼자 남았던 방은 대기 상태로 돌아갑니다.',
        confirm: '나가기',
        action: 'hg.confirmLeave',
        danger: true
      });
      return;
    }
    doLeave();
  };

  BG.actions['hg.confirmLeave'] = function () {
    BG.ui.closeModal();
    doLeave();
  };

  /* 방장: 게임 종료 → 대기실로 */
  BG.actions['hg.endGame'] = function () {
    confirmDialog({
      title: '게임을 종료할까요?',
      body: '모둠 방이 대기실로 돌아갑니다. 봇은 그대로 남아 있어 바로 다음 판을 시작할 수 있어요.',
      confirm: '게임 종료',
      action: 'hg.confirmEndGame'
    });
  };

  BG.actions['hg.confirmEndGame'] = function () {
    BG.ui.closeModal();
    BG.net.send({ t: 'endGame' });
  };

  /* 교사: 막힌 방 초기화 */
  BG.actions['hg.resetRoom'] = function (el) {
    const code = String(el.getAttribute('data-code') || '').toUpperCase();
    const name = el.getAttribute('data-name') || '이 모둠';
    S.pendingResetCode = code;
    confirmDialog({
      title: '방을 초기화할까요?',
      body: name + ' 방의 참가자를 모두 내보내고 대기 상태(0/' + ((S.room && S.room.capacity) || 4) + '명)로 되돌립니다. 진행 중인 게임은 끝납니다.',
      confirm: '초기화',
      action: 'hg.confirmResetRoom',
      danger: true
    });
  };

  BG.actions['hg.confirmResetRoom'] = function () {
    const code = S.pendingResetCode;
    S.pendingResetCode = null;
    BG.ui.closeModal();
    if (code) BG.net.send({ t: 'resetRoom', gameId: 'halligalli', code: code, classCode: BG.state.classCode });
  };

  BG.actions['hg.watch'] = function (el) {
    const code = el.getAttribute('data-code');
    S.spectateSent = {};
    BG.navigate('/halligalli/watch/' + code);
  };

  BG.actions['hg.watchBack'] = function () {
    BG.net.send({ t: 'stopSpectate' });
    S.room = null;
    BG.navigate('/halligalli/teacher');
  };

  BG.actions['hg.copyLink'] = function (el) {
    const code = el.getAttribute('data-code');
    const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split('#')[0];
    const url = base + '#/halligalli/room/' + code;
    const done = function () { BG.ui.toast('초대 링크를 복사했습니다.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () {
        BG.ui.modal('<h2>초대 링크</h2><p class="mono" style="word-break:break-all">' + esc(url) + '</p>' +
          '<button class="btn btn-primary btn-block" data-action="ui.closeModal">확인</button>');
      });
    } else {
      BG.ui.modal('<h2>초대 링크</h2><p class="mono" style="word-break:break-all">' + esc(url) + '</p>' +
        '<button class="btn btn-primary btn-block" data-action="ui.closeModal">확인</button>');
    }
  };

  /* ---------------- 번호 아바타 미리보기 ---------------- */

  document.addEventListener('input', function (event) {
    const el = event.target;
    if (!el || el.id !== 'number') return;
    const digits = el.value.replace(/[^0-9]/g, '');
    const preview = document.getElementById('my-avatar-preview');
    if (preview) preview.innerHTML = avatar({ number: digits, name: '나' }, 'sm');
    const namePreview = document.getElementById('my-name-preview');
    if (namePreview) namePreview.textContent = BG.studentLabel(digits, BG.state.name);
  });

  // 첫 터치/클릭에서 브라우저의 소리 재생 권한을 확보합니다.
  document.addEventListener('pointerdown', function () {
    if (BG.sound) BG.sound.unlock();
  }, { once: true, passive: true });

  /* ---------------- 키보드 ---------------- */

  BG.keyHandlers.push(function (event) {
    const screen = screenName();
    if (screen !== 'hg.room' && screen !== 'hg.bot') return false;
    if (screen === 'hg.room' && S.room && S.room.role === 'spectator') return false;
    if (event.code === 'Space') {
      const el = document.querySelector('.bell');
      if (el && !el.disabled) {
        el.classList.add('pressed');
        setTimeout(function () { el.classList.remove('pressed'); }, 140);
      }
      BG.actions['hg.ring']();
      return true;
    }
    if (event.code === 'KeyF' || event.code === 'Enter') {
      BG.actions['hg.flip']();
      return true;
    }
    return false;
  });

  /* ---------------- 서버 메시지 ---------------- */

  function refreshRoomList() {
    const screen = screenName();
    if (screen === 'halligalli') renderEntry();
    else if (screen === 'hg.teacher') renderTeacher();
    else if (screen === 'hg.room' && S.room && S.room.status === 'waiting') {
      BG.ui.screen(lobbyHtml(S.room), 'hg.room');
    }
  }

  /* 우리 반 누적 기록(승수·포인트) — 서버 집계 */
  BG.net.on('class_stats', function (msg) {
    if (!msg || msg.classCode !== BG.state.classCode) return;
    S.stats = msg.stats || [];
    refreshRoomList();
    if (screenName() === 'class' && BG.portal) BG.portal.classPortalHtml();
  });

  BG.net.on('game_result', function (msg) {
    if (!msg || msg.classCode !== BG.state.classCode) return;
    S.stats = msg.stats || S.stats;
    if (msg.gameId && msg.gameId !== 'halligalli') {
      refreshRoomList();
      if (screenName() === 'class' && BG.portal) BG.portal.classPortalHtml();
      return;
    }
    S.lastResult = msg;
    if (S.lastResultAt !== msg.recordedAt && BG.markResultSeen(msg.classCode + ':' + msg.recordedAt)) {
      S.lastResultAt = msg.recordedAt;
      const myNo = validNumber(BG.state.number);
      if (myNo && msg.points && msg.points[myNo] !== undefined) {
        const row = (msg.ranking || []).find(function (r) { return r.number === myNo; });
        BG.addRecord(BG.state.classCode, myNo, {
          wins: row && row.rank === 1 ? 1 : 0,
          points: msg.points[myNo]
        });
      }
    }
    refreshRoomList();
    if (screenName() === 'class' && BG.portal) BG.portal.classPortalHtml();
  });

  BG.net.on('welcome', function (msg) {
    S.rooms = (msg.rooms || []).filter(function (r) { return r.gameId === 'halligalli'; });
    refreshRoomList();
  });

  BG.net.on('rooms', function (msg) {
    S.rooms = (msg.rooms || []).filter(function (r) { return r.gameId === 'halligalli'; });
    refreshRoomList();
  });

  BG.net.on('joined', function (msg) {
    if (!msg || msg.gameId !== 'halligalli') return;
    S.pendingJoin = null;
    S.resumeSent = {};
    saveSeat({ gameId: 'halligalli', code: msg.code, token: msg.token, playerId: msg.playerId });
    const path = BG.currentPath();
    if (path.indexOf('/halligalli/room/') !== 0) {
      BG.navigate('/halligalli/room/' + msg.code);
    }
    if (msg.created) BG.ui.toast('새 방을 만들었습니다. 코드 ' + msg.code, 'ok');
    else if (msg.resumed) BG.ui.toast('다시 접속했습니다.', 'ok');
  });

  BG.net.on('room', function (msg) {
    if (!msg || !msg.room || msg.room.gameId !== 'halligalli') return;
    S.room = msg.room;
    S.role = msg.room.role;
    if (msg.room.game) playBellSound(msg.room.game);
    const path = BG.currentPath();
    if (path.indexOf('/halligalli/room/') === 0) renderRoom([msg.room.code]);
    else if (path.indexOf('/halligalli/watch/') === 0) renderWatch([msg.room.code]);
  });

  BG.net.on('spectating', function (msg) {
    if (msg && msg.gameId && msg.gameId !== 'halligalli') return;
    BG.ui.toast(msg.name + ' 관전을 시작합니다.', 'ok');
  });

  /* 교사 PIN 인증 성공 → 교사 토큰을 이 탭에만 저장 */
  BG.net.on('class_auth_ok', function (msg) {
    if (!msg || !msg['class']) return;
    const cls = msg['class'];
    BG.setClass(cls.code, cls.name);
    if (msg.teacherToken) BG.setTeacherToken(cls.code, msg.teacherToken);
    S.teacherBound = true;
    BG.ui.toast(cls.name + ' 선생님 확인 완료!', 'ok');
    if (screenName() === 'hg.teacher') renderTeacher();
    else if (screenName() === 'class' && BG.portal) BG.portal.classPortalHtml();
    else if (screenName() === 'hg.watch') {
      S.spectateSent = {};
      BG.render();
    }
  });

  BG.net.on('room_reset', function (msg) {
    if (msg && msg.gameId && msg.gameId !== 'halligalli') return;
    BG.ui.toast(msg.message || '방이 초기화되었습니다.', 'ok');
    const seat = getSeat();
    if (seat && String(seat.code) === String(msg.code)) clearSeat();
    S.room = null;
    S.pendingJoin = null;
    const screen = screenName();
    if (screen === 'hg.room') BG.navigate('/halligalli');
    else if (screen === 'hg.watch') {
      if (msg.self) BG.actions['hg.watchBack']();
      else BG.navigate('/halligalli');
    } else {
      BG.render();
    }
  });

  BG.net.on('action_result', function (msg) {
    if (msg && msg.ok === false && msg.message) BG.ui.toast(msg.message, 'error');
    else if (msg && msg.ok === true && msg.message) BG.ui.toast(msg.message, 'ok');
  });

  BG.net.on('error', function (msg) {
    const hgPath = BG.currentPath().indexOf('/halligalli') === 0;
    if (!hgPath) return;
    BG.ui.toast(msg.message || '요청을 처리할 수 없습니다.', 'error');
    const code = msg.code;
    if (code === 'teacher_auth_required') {
      BG.setTeacherToken(BG.state.classCode, '');
      S.teacherBound = false;
      S.spectateSent = {};
      if (screenName() === 'hg.watch') {
        S.room = null;
        BG.navigate('/halligalli/teacher');
      }
      return;
    }
    if (code === 'bad_pin' && screenName() === 'hg.teacher') return;
    if (['no_seat', 'no_room', 'no_name', 'full', 'playing', 'dup_name', 'dup_number', 'bad_number', 'already_in_room'].indexOf(code) !== -1) {
      clearSeat();
      S.pendingJoin = null;
      S.room = null;
      const path = BG.currentPath();
      if (path.indexOf('/halligalli/room/') === 0) BG.navigate('/halligalli');
    }
  });

  BG.net.on('left', function () {
    S.room = null;
    S.pendingJoin = null;
  });

  BG.net.on('close', function () {
    S.teacherBound = false;
  });

  BG.net.on('open', function () {
    const path = BG.currentPath();
    S.teacherBound = false;
    if (path.indexOf('/halligalli') !== 0) return;
    if (path === '/halligalli/teacher' && BG.net.connected) {
      if (teacherReady()) {
        BG.net.send({ t: 'classAuth', code: BG.state.classCode, token: BG.teacherToken(BG.state.classCode) });
      }
    }
    if (path.indexOf('/halligalli/watch/') === 0 && teacherReady()) {
      BG.net.send({ t: 'classAuth', code: BG.state.classCode, token: BG.teacherToken(BG.state.classCode) });
    }
    const seat = getSeat();
    if (seat && path.indexOf('/halligalli/room/') === 0) {
      S.resumeSent = {};
      const code = path.split('/').pop().toUpperCase();
      if (seat.code === code) {
        S.resumeSent[code] = true;
        BG.net.send({ t: 'resume', gameId: 'halligalli', code: seat.code, classCode: BG.state.classCode, token: seat.token });
      }
    }
    BG.render();
  });

  /* ---------------- 라우트 등록 ---------------- */

  BG.router.add(/^\/halligalli$/, 'halligalli', function () {
    renderEntry();
  });

  BG.router.add(/^\/halligalli\/room\/([^/]+)$/, 'hg.room', function (params) {
    renderRoom(params);
  });

  BG.router.add(/^\/halligalli\/watch\/([^/]+)$/, 'hg.watch', function (params) {
    renderWatch(params);
  });

  BG.router.add(/^\/halligalli\/teacher$/, 'hg.teacher', function () {
    BG.net.connect();
    if (!BG.state.classCode) {
      BG.navigate('/');
      return;
    }
    if (!teacherReady()) {
      BG.ui.screen(teacherGateHtml(), 'hg.teacher');
      return;
    }
    if (BG.net.connected) {
      if (!S.teacherBound) {
        BG.net.send({ t: 'classAuth', code: BG.state.classCode, token: BG.teacherToken(BG.state.classCode) });
      } else {
        BG.net.send({ t: 'overview', gameId: 'halligalli', classCode: BG.state.classCode });
      }
    }
    renderTeacher();
  });

  BG.router.add(/^\/halligalli\/bot$/, 'hg.bot', function () {
    renderBot();
  });

  BG.hg = {
    renderEntry: renderEntry,
    renderRoom: renderRoom,
    renderTeacher: renderTeacher,
    renderBot: renderBot,
    rulesHtml: rulesHtml,
    classRankingHtml: classRankingHtml,
    myRecordLine: myRecordLine,
    resultModalHtml: resultModalHtml,
    state: S
  };
})();
