/*
 * 세계여행 마블 (3D) 화면
 * 입장 · 대기방 · 3D 게임판 · 교사 관전 · AI 봇 연습
 * 규칙 계산은 public/bluemarble-engine.js, 3D 연출은 public/js/bluemarble3d.js 가 맡습니다.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const BM = window.BlueMarble;
  const esc = BG.ui.escape;

  const SEAT_KEY = 'bm.seat';

  const S = {
    rooms: [],
    room: null,
    role: 'player',
    pendingJoin: null,
    lastJoinAt: {},
    resumeSent: {},
    spectateSent: {},
    teacherBound: false,
    stats: [],
    lastResult: null,
    lastResultAt: null,
    resultShown: {},
    cardShown: 0,
    diceShown: 0,
    screenKey: '',
    board: null,
    fallback: false,
    bot: { active: false, game: null, driver: null, timer: null, level: 'normal', count: 4 },
    botSig: '',
    pendingResetCode: null
  };

  /* ---------------- 공통 도우미 ---------------- */

  function screenName() {
    return document.body.dataset.screen || '';
  }

  function avatar(who, size) {
    return BG.avatars ? BG.avatars.html(who, size) : '';
  }

  function validNumber(text) {
    const n = Number(String(text === undefined || text === null ? '' : text).trim());
    return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
  }

  function readNumber() {
    const el = document.getElementById('number');
    const fromInput = el ? String(el.value || '').replace(/[^0-9]/g, '').slice(0, 2) : '';
    if (fromInput) return BG.setNumberFor(BG.state.classCode, fromInput);
    return String(BG.state.number || BG.numberFor(BG.state.classCode) || '');
  }

  function myLabel() {
    const n = validNumber(BG.state.number);
    return n ? n + '번' : '나';
  }

  function getSeat() { return BG.session.get(SEAT_KEY, null); }
  function saveSeat(seat) { BG.session.set(SEAT_KEY, seat); }
  function clearSeat() { BG.session.remove(SEAT_KEY); }
  function mySeatCode() {
    const seat = getSeat();
    return seat && seat.code ? String(seat.code).toUpperCase() : '';
  }

  function money(n) {
    return BM.formatMoney(n);
  }

  function colorOf(player) {
    return BG.bm3d ? BG.bm3d.colorForPlayer(player) : '#f4775c';
  }

  function statusBadge(status) {
    if (status === 'playing') return '<span class="badge playing">진행 중</span>';
    if (status === 'finished') return '<span class="badge finished">종료</span>';
    return '<span class="badge ready">대기 중</span>';
  }

  function confirmDialog(opts) {
    BG.ui.modal(
      '<h2>' + esc(opts.title) + '</h2>' +
      '<p>' + esc(opts.body) + '</p>' +
      '<div class="row" style="justify-content:flex-end;margin-top:18px">' +
        '<button class="btn btn-ghost" data-action="ui.closeModal">취소</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-action="' + opts.action + '">' +
          esc(opts.confirm) + '</button>' +
      '</div>'
    );
  }

  function classRankingHtml(limit, bare) {
    if (BG.hg && BG.hg.classRankingHtml) return BG.hg.classRankingHtml(limit, bare);
    return '';
  }

  function myRecordLine() {
    if (BG.hg && BG.hg.myRecordLine) return BG.hg.myRecordLine();
    return '';
  }

  function soundOn() { return !!(BG.sound && BG.sound.enabled); }

  function soundButton() {
    const on = soundOn();
    return '<button class="btn btn-sm btn-ghost sound-toggle" data-action="bm.soundToggle" aria-pressed="' +
      (on ? 'true' : 'false') + '">' + (on ? '🔊 소리' : '🔇 무음') + '</button>';
  }

  /* ---------------- 규칙 ---------------- */

  function rulesHtml() {
    const boardRows = BM.BOARD.map(function (tile, idx) {
      const color = tile.color || '#e8d7c4';
      const price = tile.type === BM.TILE_TYPES.CITY ? money(tile.price) : (tile.desc || '');
      return '<li class="bm-rule-tile"><span class="dot" style="background:' + esc(color) + '"></span>' +
        '<b>' + idx + '</b> ' + esc(tile.name) +
        '<span class="spacer"></span><span class="hint">' + esc(price) + '</span></li>';
    }).join('');

    return (
      '<h2>🎲 세계여행 마블 규칙</h2>' +
      '<p>주사위를 굴려 도시를 사고, <b>별장 → 빌딩 → 호텔</b>로 건물을 세워 통행료를 받는 게임입니다.</p>' +
      '<ol class="rules-list">' +
        '<li>순서대로 <b>주사위 2개</b>를 굴려 나온 합만큼 말을 옮깁니다.</li>' +
        '<li><b>출발지</b>를 지나면 월급 <b>20만원</b>을 받습니다.</li>' +
        '<li>도시 칸에 멈추면 값을 내고 <b>매입</b>할 수 있습니다. (돈이 모자라면 그냥 지나갑니다)</li>' +
        '<li>내 도시에 다시 멈추면 <b>별장 → 빌딩 → 호텔</b>로 한 단계씩 올립니다.</li>' +
        '<li>다른 사람 도시에 멈추면 건물 단계에 따라 <b>통행료</b>를 주인에게 냅니다.</li>' +
        '<li><b>더블</b>이 나오면 한 번 더 굴리고, <b>3연속 더블</b>이면 무인도로 갑니다.</li>' +
        '<li><b>무인도</b>에서는 더블이 나오면 탈출, 3번 실패하면 보석금 <b>15만원</b>을 냅니다.</li>' +
        '<li><b>황금열쇠</b> 칸에서는 카드를 뽑아 보너스·세금·이동 이벤트를 겪습니다.</li>' +
        '<li>돈을 낼 수 없으면 <b>파산</b>하고, 내 도시는 채권자에게 넘어갑니다.</li>' +
        '<li><b>15라운드</b>가 지나면 <b>총자산(현금+도시+건물)</b> 순위로 우승을 가립니다. 한 명만 남아도 끝납니다.</li>' +
      '</ol>' +
      '<h3>칸 안내</h3>' +
      '<ul class="bm-rule-board">' + boardRows + '</ul>' +
      '<button class="btn btn-primary btn-block" data-action="ui.closeModal" style="margin-top:14px">확인</button>'
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
      ? '<button class="btn btn-primary btn-sm" data-action="bm.reenter" data-code="' + esc(room.code) + '">다시 들어가기</button>'
      : '<button class="btn ' + (canEnter ? 'btn-primary' : '') + ' btn-sm" data-action="bm.enterGroup" data-code="' + esc(room.code) + '"' +
        (canEnter ? '' : ' disabled') + '>' + label + '</button>';

    const round = status === 'playing' && room.gameId === 'bluemarble' && room.round
      ? '<span class="group-round">R' + room.round + '/15</span>' : '';

    return (
      '<div class="group-card ' + cls + (mine ? ' is-self' : '') + '">' +
        '<div class="group-head"><span class="group-name">' + esc(room.name) + '</span>' +
          '<span class="group-occ"><b>' + count + '</b>/' + cap + '명</span></div>' +
        (mine ? '<div class="group-self-line"><span class="badge badge-self">🏠 내가 참여 중</span></div>' : '') +
        '<div class="group-players">' +
          (stack ? '<span class="avatar-stack">' + stack + '</span>' : '') +
          '<span class="group-names">' + (names ? esc(names) : '아직 아무도 없어요') + '</span></div>' +
        '<div class="group-actions">' + round + mainButton +
          (status === 'playing' || status === 'finished'
            ? '<button class="btn btn-sm" data-action="bm.watch" data-code="' + esc(room.code) + '">관전</button>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  function myRoomBanner() {
    if (!S.room || S.room.gameId !== 'bluemarble') return '';
    return (
      '<div class="my-room-banner">' +
        avatar({ number: BG.state.number, name: myLabel() }, 'sm') +
        '<span>지금 <b>' + esc(S.room.name) + '</b>에 참여 중이에요.</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-sm btn-primary" data-action="bm.reenter" data-code="' + esc(S.room.code) + '">다시 들어가기</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="bm.leave">나가기</button>' +
      '</div>'
    );
  }

  function renderEntry() {
    if (!BG.state.classCode) {
      BG.navigate('/');
      return;
    }
    BG.net.connect();
    const groups = S.rooms.filter(function (r) { return r.gameId === 'bluemarble'; });
    const cards = groups.length
      ? groups.map(groupCard).join('')
      : '<div class="empty">모둠 방 정보를 불러오는 중입니다…<br>서버가 꺼져 있다면 아래 <b>AI 봇과 연습</b>을 이용해 주세요.</div>';
    const connBadge = BG.net.connected
      ? '<span class="badge ready">서버 연결됨</span>'
      : '<span class="badge finished">서버 연결 안 됨</span>';

    const html =
      '<div class="entry-top">' +
        '<a class="back-link" href="#/class/' + esc(BG.state.classCode) + '">← 게임 선택</a>' +
        '<span class="spacer"></span>' +
        '<span class="badge">' + esc(BG.className() || BG.state.classCode) + '</span>' +
        connBadge +
      '</div>' +
      '<div class="screen-head">' +
        '<div>' +
          '<h1 class="entry-title">🎲 세계여행 마블 <span class="bm-3d-chip">3D</span></h1>' +
          '<p class="page-sub">주사위를 굴려 도시를 사고, 별장·빌딩·호텔을 세워 통행료를 받으세요!</p>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" data-action="bm.rules">📖 게임 규칙</button>' +
      '</div>' +

      myRoomBanner() +

      '<div class="panel number-panel" style="margin-bottom:16px">' +
        '<div class="row" style="gap:14px;align-items:flex-end;flex-wrap:wrap">' +
          '<label class="field" style="flex:1;min-width:220px">내 출석번호 (1~99)' +
            '<span class="row" style="gap:8px;flex-wrap:nowrap;align-items:center">' +
              '<span id="my-avatar-preview">' + avatar({ number: BG.state.number, name: myLabel() }, 'sm') + '</span>' +
              '<input id="number" class="input number-input" inputmode="numeric" pattern="[0-9]*" maxlength="2" ' +
                'autocomplete="off" placeholder="예: 3" style="flex:1;max-width:150px" value="' + esc(BG.state.number || '') + '">' +
              '<span class="number-suffix">번</span>' +
            '</span>' +
            '<span class="hint">이름 대신 번호만 입력하면 돼요. 친구마다 다른 번호를 써 주세요.</span>' +
            '<span class="hint">' + (validNumber(BG.state.number) ? '내 기록: ' + myRecordLine() : '번호를 넣으면 내 승수·포인트가 보여요.') + '</span>' +
          '</label>' +
          '<div class="bm-key-hint"><span>🎲 더블 = 한 번 더</span><span>🏝 무인도 = 더블/보석금</span><span>🏆 15라운드 총자산</span></div>' +
        '</div>' +
      '</div>' +

      '<h2 class="panel-title" style="margin:4px 0 12px">모둠 방 선택 <span class="hint">(1모둠 ~ 6모둠 · 모둠당 4명)</span></h2>' +
      '<div class="group-grid">' + cards + '</div>' +

      '<div class="entry-tools">' +
        '<button class="tool-card" data-action="bm.bot">' +
          '<span class="tool-emoji">🤖</span>' +
          '<span class="tool-body"><span class="tool-title">AI 봇과 연습</span>' +
          '<span class="tool-desc">혼자서도 3D 보드로 바로 게임을 해 볼 수 있어요</span></span>' +
        '</button>' +
        '<button class="tool-card" data-action="bm.teacher">' +
          '<span class="tool-emoji">👩‍🏫</span>' +
          '<span class="tool-body"><span class="tool-title">교사 관전 모드</span>' +
          '<span class="tool-desc">6개 모둠의 진행 상황을 한눈에 보고 관전합니다</span></span>' +
        '</button>' +
        '<button class="tool-card" data-action="bm.createRoom">' +
          '<span class="tool-emoji">➕</span>' +
          '<span class="tool-body"><span class="tool-title">새 방 만들기</span>' +
          '<span class="tool-desc">모둠 방이 부족할 때 새 방을 만들어 코드를 나눠 줍니다</span></span>' +
        '</button>' +
      '</div>' +

      '<div class="panel" style="margin-top:16px">' +
        '<div class="panel-title">🔗 방 코드로 입장</div>' +
        '<div class="row">' +
          '<input id="room-code" class="input" placeholder="방 코드 (예: 3 또는 AB12)" maxlength="6" style="max-width:220px;text-transform:uppercase">' +
          '<button class="btn" data-action="bm.enterByCode">입장</button>' +
        '</div>' +
        '<p class="hint" style="margin-top:8px">대부분은 위의 모둠 방을 누르면 바로 입장됩니다.</p>' +
      '</div>';

    BG.ui.screen(html, 'bluemarble');
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
    const rounds = room.rounds || 15;
    const roundOptions = [10, 15, 20].map(function (r) {
      return '<option value="' + r + '"' + (r === rounds ? ' selected' : '') + '>' + r + '라운드</option>';
    }).join('');

    return (
      '<div class="screen-head">' +
        '<div>' +
          '<a class="back-link" href="#/bluemarble">← 모둠 선택</a>' +
          '<h1 class="room-name">' + esc(room.name) + ' ' + statusBadge('waiting') + '</h1>' +
          '<p class="page-sub">친구들이 모이면 방장이 게임을 시작합니다.</p>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn btn-ghost btn-sm" data-action="bm.rules">📖 규칙</button>' +
          '<button class="btn btn-danger btn-sm" data-action="bm.leave">🚪 방 나가기</button>' +
        '</div>' +
      '</div>' +

      '<div class="lobby-wrap">' +
        '<div class="panel">' +
          '<div class="panel-title">👥 참가자 <span class="hint">' + room.seats.length + '/' + room.capacity + '명</span></div>' +
          '<div class="seat-list">' + seats + empty.join('') + '</div>' +
          '<div class="row" style="margin-top:14px">' +
            (isHost
              ? '<button class="btn" data-action="bm.addBot" ' + (room.seats.length >= room.capacity ? 'disabled' : '') + '>🤖 봇 추가</button>' +
                '<button class="btn btn-ghost" data-action="bm.removeBot">봇 내보내기</button>'
              : '') +
          '</div>' +
        '</div>' +

        '<div class="stack">' +
          '<div class="panel">' +
            '<div class="panel-title">🎮 게임 준비</div>' +
            '<div class="code-chip">방 코드 <b class="mono" style="font-size:16px">' + esc(room.code) + '</b></div>' +
            '<div class="stack" style="margin-top:14px">' +
              (isHost
                ? '<label class="field">라운드 제한 <span class="hint">(수업 시간에 맞게)</span>' +
                    '<select class="input" data-action="bm.rounds">' + roundOptions + '</select></label>'
                : '<p class="hint">라운드 제한: <b>' + rounds + '라운드</b></p>') +
              (isHost
                ? '<button class="btn btn-primary btn-block" data-action="bm.start"' +
                    (room.canStart ? '' : ' disabled') + '>▶ 게임 시작</button>'
                : '<button class="btn btn-block" data-action="bm.ready" aria-pressed="' + (mySeat && mySeat.ready ? 'true' : 'false') + '">' +
                    (mySeat && mySeat.ready ? '준비 취소' : '준비 완료') + '</button>') +
              '<button class="btn btn-block" data-action="bm.rules">📖 게임 규칙 보기</button>' +
            '</div>' +
            '<p class="hint" style="margin-top:12px">' +
              (room.canStart ? '모두 준비되면 방장이 게임을 시작할 수 있어요.' : '최소 ' + room.minPlayers + '명이 필요합니다. 봇을 추가해 인원을 채울 수 있어요.') +
              '<br>2~4명 · ' + rounds + '라운드 · 시작 자금 ' + money(BM.START_CASH) +
            '</p>' +
          '</div>' +
          '<div class="panel">' +
            '<div class="panel-title">🎒 내 기록</div>' +
            '<div class="row" style="align-items:center;gap:10px">' +
              avatar({ number: BG.state.number, name: myLabel() }, 'sm') +
              '<b>' + esc(myLabel()) + '</b><span class="spacer"></span>' + myRecordLine() +
            '</div>' +
            '<div class="lobby-rank" style="margin-top:12px">' + classRankingHtml(5, true) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------------- 2D 보드 (3D를 못 쓸 때) ---------------- */

  function gridPos(idx) {
    const i = ((idx % 28) + 28) % 28;
    if (i <= 6) return { row: 8, col: 1 + i };
    if (i <= 13) return { row: 8 - (i - 7), col: 8 };
    if (i <= 20) return { row: 1, col: 8 - (i - 14) };
    return { row: 1 + (i - 21), col: 1 };
  }

  function fallbackBoardHtml(game, youId) {
    const players = game.players || [];
    const owner = game.owner || [];
    const level = game.level || [];
    const cells = BM.BOARD.map(function (tile, idx) {
      const pos = gridPos(idx);
      const ownerId = owner[idx];
      const ownerPlayer = ownerId ? players.find(function (p) { return p.id === ownerId; }) : null;
      const tokens = players.filter(function (p) { return p.pos === idx && !p.bankrupt; });
      const isCity = tile.type === BM.TILE_TYPES.CITY;
      const cls = 'bm2d-tile t-' + tile.type + (ownerPlayer ? ' owned' : '');
      const style = 'grid-row:' + pos.row + ';grid-column:' + pos.col + ';' +
        (ownerPlayer ? '--own:' + colorOf(ownerPlayer) + ';' : '') +
        '--region:' + esc(tile.color || '#e8d7c4') + ';';
      return '<div class="' + cls + '" style="' + style + '" data-tile="' + idx + '">' +
        '<span class="bm2d-name">' + esc(tile.name) + '</span>' +
        (isCity
          ? '<span class="bm2d-price">' + money(tile.price) + '</span>' +
            (level[idx] > 0 ? '<span class="bm2d-level">' + BM.BUILD_NAMES[level[idx]] + '</span>' : '')
          : '<span class="bm2d-desc">' + esc(tile.desc || '') + '</span>') +
        (tokens.length
          ? '<span class="bm2d-tokens">' + tokens.map(function (p) {
              return '<span class="bm2d-token" style="background:' + colorOf(p) + '" title="' + esc(p.name) + '">' +
                (p.number !== null && p.number !== undefined ? p.number : '●') + '</span>';
            }).join('') + '</span>'
          : '') +
        '</div>';
    }).join('');

    const turnPlayer = players.find(function (p) { return p.id === game.turn; });
    const roll = game.lastRoll;
    return (
      '<div class="bm2d">' + cells +
        '<div class="bm2d-center">' +
          '<div class="bm2d-logo">세계여행 마블</div>' +
          '<div class="bm2d-sub">3D 보드를 표시할 수 없어 2D로 보여 드려요</div>' +
          '<div class="bm2d-dice">' + (roll ? '🎲 ' + roll.a + ' + ' + roll.b + ' = <b>' + roll.sum + '</b>' : '🎲') + '</div>' +
          '<div class="bm2d-turn">' + (game.status === 'playing'
            ? (turnPlayer ? esc(turnPlayer.name) + '님 차례' : '')
            : '게임 종료') + '</div>' +
          '<div class="bm2d-round">R' + game.round + ' / ' + game.maxRounds + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------------- 게임판 ---------------- */

  function playerPanelHtml(game, youId, role) {
    const players = game.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    return players.map(function (p) {
      const tags = [];
      if (p.isTurn && game.status === 'playing') tags.push('<span class="tag turn">차례</span>');
      if (p.id === youId) tags.push('<span class="tag you">나</span>');
      if (p.isBot) tags.push('<span class="tag bot">봇</span>');
      if (p.bankrupt) tags.push('<span class="tag off">파산</span>');
      if (p.island) tags.push('<span class="tag warn">🏝 무인도 ' + p.islandTurns + '/3</span>');
      if (p.freeBail) tags.push('<span class="tag ready">열쇠권 ' + p.freeBail + '</span>');
      return (
        '<div class="bm-player ' + (p.isTurn && game.status === 'playing' ? 'is-turn ' : '') +
          (p.id === youId ? 'is-self ' : '') + (p.bankrupt ? 'is-out' : '') + '">' +
          '<span class="bm-player-avatar">' + avatar(p, 'sm') + '</span>' +
          '<div class="bm-player-main">' +
            '<div class="bm-player-top"><b>' + esc(p.name) + '</b>' + tags.join('') + '</div>' +
            '<div class="bm-player-money">' + money(p.cash) + '</div>' +
            '<div class="bm-player-sub">🏙 ' + p.properties + '곳 · 총자산 ' + money(p.totalAsset) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function actionsHtml(view) {
    const game = view.game;
    const role = view.role;
    const mode = view.mode;
    if (game.status === 'finished') {
      return '<div class="bm-action-note">🏆 게임이 끝났습니다. 최종 순위를 확인하세요.</div>' +
        (mode === 'bot'
          ? '<button class="btn btn-primary btn-block" data-action="bm.botRestart">한 판 더</button>' +
            '<button class="btn btn-block" data-action="bm.botExit">그만하기</button>'
          : (view.isHost ? '<button class="btn btn-primary btn-block" data-action="bm.restart">한 판 더</button>' : '') +
            '<button class="btn btn-block" data-action="bm.leave">방 나가기</button>');
    }
    if (role === 'spectator') {
      return '<div class="bm-action-note">👀 관전 중입니다. 학생들이 게임을 진행합니다.</div>' +
        '<button class="btn btn-sm btn-danger btn-block" data-action="bm.watchBack">관전 종료</button>';
    }
    const me = game.players.find(function (p) { return p.id === view.youId; });
    if (me && me.bankrupt) {
      return '<div class="bm-action-note">💸 파산했습니다. 친구들의 게임을 지켜보세요.</div>' +
        '<button class="btn btn-block" data-action="bm.leave">방 나가기</button>';
    }
    if (!me) return '';

    const myTurn = game.turn === me.id && game.status === 'playing';
    const buttons = [];

    if (!myTurn) {
      const current = game.players.find(function (p) { return p.id === game.turn; });
      buttons.push('<div class="bm-action-note">⏳ ' + esc(current ? current.name : '') + '님 차례를 기다리는 중…</div>');
    } else if (game.phase === 'decide' && game.pending) {
      const p = game.pending;
      if (p.kind === 'buy') {
        buttons.push('<div class="bm-offer">🏙 <b>' + esc(p.name) + '</b>을(를) ' + money(p.price) + '에 살까요?</div>');
        buttons.push('<button class="btn btn-primary btn-block" data-action="bm.buy">매입하기 (' + money(p.price) + ')</button>');
      } else {
        buttons.push('<div class="bm-offer">🔨 <b>' + esc(p.name) + '</b>을(를) ' + esc(BM.BUILD_NAMES[p.next]) + '(으)로 올릴까요?</div>');
        buttons.push('<button class="btn btn-primary btn-block" data-action="bm.build">' + esc(BM.BUILD_NAMES[p.next]) + ' 짓기 (' + money(p.cost) + ')</button>');
      }
      buttons.push('<button class="btn btn-ghost btn-block" data-action="bm.skip">건너뛰기</button>');
    } else if (me.island) {
      buttons.push('<div class="bm-action-note">🏝 무인도에 갇혔습니다! 더블이 나오면 탈출, 3번 실패하면 보석금 ' + money(BM.ISLAND_BAIL) + '.</div>');
      buttons.push('<button class="btn btn-primary btn-block bm-roll-btn" data-action="bm.roll">🎲 주사위 굴리기</button>');
      if (me.cash >= BM.ISLAND_BAIL) {
        buttons.push('<button class="btn btn-block" data-action="bm.payBail">보석금 내고 나오기 (' + money(BM.ISLAND_BAIL) + ')</button>');
      }
    } else {
      buttons.push('<button class="btn btn-primary btn-block bm-roll-btn" data-action="bm.roll">🎲 주사위 굴리기</button>');
    }

    buttons.push('<div class="bm-action-hint">' + (myTurn ? 'Space 키로도 굴릴 수 있어요.' : '') + '</div>');
    return buttons.join('');
  }

  function logHtml(game) {
    const items = game.log.slice(-18).reverse().map(function (entry) {
      return '<li class="log-item ' + esc(entry.type) + '">' + esc(entry.text) + '</li>';
    }).join('');
    return '<div class="log-panel"><div class="log-title">게임 기록</div>' +
      '<ul class="log">' + (items || '<li class="log-item">아직 기록이 없습니다.</li>') + '</ul></div>';
  }

  function diceCardsHtml(game) {
    const roll = game.lastRoll;
    if (!roll) return '<div class="bm-dice-empty">아직 주사위를 굴리지 않았습니다.</div>';
    const pips = function (n) {
      let out = '';
      for (let i = 0; i < 9; i++) {
        const on = {
          1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
        }[n].indexOf(i) !== -1;
        out += '<span class="pip' + (on ? ' on' : '') + '"></span>';
      }
      return out;
    };
    return '<div class="bm-dice-readout">' +
      '<span class="bm-die" aria-label="' + roll.a + '">' + pips(roll.a) + '</span>' +
      '<span class="bm-die" aria-label="' + roll.b + '">' + pips(roll.b) + '</span>' +
      '<span class="bm-dice-sum">' + roll.a + ' + ' + roll.b + ' = <b>' + roll.sum + '</b>' +
        (roll.double ? ' <span class="bm-double-tag">더블!</span>' : '') + '</span>' +
      '<span class="bm-dice-by">' + esc(roll.byName) + '</span>' +
      '</div>';
  }

  function gameScreenHtml(view) {
    const game = view.game;
    const me = game.players.find(function (p) { return p.id === view.youId; });
    const turnPlayer = game.players.find(function (p) { return p.id === game.turn; });
    const subtitle = view.mode === 'bot'
      ? 'AI 봇과 연습 중 · 규칙은 실제 게임과 같습니다'
      : view.role === 'spectator'
        ? '관전 모드 · 방 코드 ' + view.code
        : '방 코드 ' + view.code + ' · 실시간 모둠 대전';

    const tools =
      '<div class="bm-tools">' +
        '<button class="btn btn-sm" data-action="bm.cameraReset">🎥 시점 초기화</button>' +
        '<button class="btn btn-sm" data-action="bm.rules">📖 규칙</button>' +
        soundButton() +
        (view.role === 'spectator'
          ? '<button class="btn btn-sm btn-warn" data-action="bm.resetRoom" data-code="' + esc(view.code) + '" data-name="' + esc(view.title) + '">🧹 방 초기화</button>' +
            '<button class="btn btn-sm btn-danger" data-action="bm.watchBack">관전 종료</button>'
          : '<button class="btn btn-sm btn-danger" data-action="bm.leave">🚪 방 나가기</button>') +
      '</div>';

    const backHref = view.role === 'spectator' ? '#/bluemarble/teacher' : '#/bluemarble';
    const backLabel = view.role === 'spectator' ? '모둠 목록' : '모둠 선택';

    return (
      '<div class="screen-head bm-game-head">' +
        '<div>' +
          '<a class="back-link" href="' + backHref + '">← ' + backLabel + '</a>' +
          '<h1 class="room-name">' + esc(view.title) + ' ' + statusBadge(game.status) + '</h1>' +
          '<p class="page-sub">' + esc(subtitle) + '</p>' +
        '</div>' +
        tools +
      '</div>' +

      '<div class="bm-game">' +
        '<section class="bm-stage">' +
          '<div class="bm-stage-top">' +
            '<span class="bm-round-chip">R <b>' + game.round + '</b>/' + game.maxRounds + '</span>' +
            '<span class="bm-turn-chip">' + (game.status === 'playing'
              ? (turnPlayer ? (turnPlayer.id === view.youId ? '👉 내 차례!' : esc(turnPlayer.name) + '님 차례') : '')
              : '🏆 게임 종료') + '</span>' +
            '<span class="spacer"></span>' +
            '<span class="bm-mini-hint">드래그로 돌리기 · 휠로 확대</span>' +
          '</div>' +
          '<div id="bm-canvas" class="bm-canvas"></div>' +
          '<div id="bm-fallback" class="bm-fallback" hidden></div>' +
          '<div class="bm-stage-bottom">' + diceCardsHtml(game) + '</div>' +
        '</section>' +

        '<aside class="bm-side">' +
          '<div class="panel bm-players-panel">' +
            '<div class="panel-title">👥 플레이어 <span class="hint">' + game.players.length + '명</span></div>' +
            '<div class="bm-players">' + playerPanelHtml(game, view.youId, view.role) + '</div>' +
          '</div>' +
          '<div class="panel bm-action-panel">' +
            (me ? '<div class="bm-actor">' + avatar(me, 'xs') + '<b>' + esc(me.name) + '</b>' +
              '<span class="spacer"></span><span class="bm-actor-cash">' + money(me.cash) + '</span></div>' : '') +
            '<div id="bm-actions" class="bm-actions">' + actionsHtml(view) + '</div>' +
          '</div>' +
          '<div id="bm-log" class="panel bm-log-panel">' + logHtml(game) + '</div>' +
        '</aside>' +
      '</div>'
    );
  }

  /* ---------------- 화면 갱신 ---------------- */

  function disposeBoard() {
    if (S.board) {
      try { S.board.dispose(); } catch (err) { /* ignore */ }
      S.board = null;
    }
  }

  function mountBoard(game, youId) {
    const container = document.getElementById('bm-canvas');
    const fallbackEl = document.getElementById('bm-fallback');
    if (!container) return;
    disposeBoard();
    S.fallback = false;
    if (BG.bm3d) {
      S.board = BG.bm3d.mount(container, { title: '세계여행 마블' });
    }
    if (!S.board) {
      S.fallback = true;
      container.hidden = true;
      if (fallbackEl) {
        fallbackEl.hidden = false;
        fallbackEl.innerHTML = fallbackBoardHtml(game, youId);
      }
      return;
    }
    if (fallbackEl) {
      fallbackEl.hidden = true;
      fallbackEl.innerHTML = '';
    }
    S.board.applyState(game, youId);
  }

  function updateGame(view) {
    const game = view.game;
    const boardEl = document.getElementById('bm-canvas');
    if (!boardEl) return;

    const roundChip = document.querySelector('.bm-round-chip');
    if (roundChip) roundChip.innerHTML = 'R <b>' + game.round + '</b>/' + game.maxRounds;
    const turnChip = document.querySelector('.bm-turn-chip');
    if (turnChip) {
      const turnPlayer = game.players.find(function (p) { return p.id === game.turn; });
      turnChip.textContent = game.status === 'playing'
        ? (turnPlayer ? (turnPlayer.id === view.youId ? '👉 내 차례!' : turnPlayer.name + '님 차례') : '')
        : '🏆 게임 종료';
    }

    const playersEl = document.querySelector('.bm-players');
    if (playersEl) playersEl.innerHTML = playerPanelHtml(game, view.youId, view.role);
    const actionsEl = document.getElementById('bm-actions');
    if (actionsEl) actionsEl.innerHTML = actionsHtml(view);
    const logEl = document.getElementById('bm-log');
    if (logEl) logEl.innerHTML = logHtml(game);
    const bottomEl = document.querySelector('.bm-stage-bottom');
    if (bottomEl) bottomEl.innerHTML = diceCardsHtml(game);
    const actorCash = document.querySelector('.bm-actor-cash');
    const me = game.players.find(function (p) { return p.id === view.youId; });
    if (actorCash && me) actorCash.textContent = money(me.cash);

    if (S.board) {
      S.board.applyState(game, view.youId);
    } else if (S.fallback) {
      const fallbackEl = document.getElementById('bm-fallback');
      if (fallbackEl) fallbackEl.innerHTML = fallbackBoardHtml(game, view.youId);
    }

    // 주사위 소리
    if (game.lastRoll && game.lastRoll.seq !== S.diceShown) {
      S.diceShown = game.lastRoll.seq;
      if (BG.sound && (BG.sound.dice || BG.sound.tap)) (BG.sound.dice || BG.sound.tap)();
    }

    maybeShowCard(view);
    maybeShowResult(view);
  }

  function maybeShowCard(view) {
    const game = view.game;
    const card = game.lastCard;
    if (!card || card.seq === S.cardShown) return;
    S.cardShown = card.seq;
    if (game.status === 'finished') return;
    const mine = card.playerId === view.youId;
    if (!mine) {
      BG.ui.toast(card.playerName + '님 황금열쇠: ' + card.title, '');
      return;
    }
    const tone = card.tone === 'good' ? 'good' : 'bad';
    BG.ui.modal(
      '<div class="bm-card ' + tone + '">' +
        '<div class="bm-card-kicker">🟡 황금열쇠</div>' +
        '<div class="bm-card-emoji">' + (card.tone === 'good' ? '🎉' : '💥') + '</div>' +
        '<h2>' + esc(card.title) + '</h2>' +
        '<p>' + esc(card.text) + '</p>' +
        '<p class="hint">' + esc(card.playerName) + '님</p>' +
        '<button class="btn btn-primary btn-block" data-action="ui.closeModal">확인</button>' +
      '</div>'
    );
  }

  /* ---------------- 결과 팝업 ---------------- */

  function confettiHtml() {
    const colors = ['#ff8fa3', '#ffd76e', '#8fd9ab', '#9cc4f2', '#c4acf0', '#ffb49b'];
    let out = '<div class="confetti-layer" aria-hidden="true">';
    for (let i = 0; i < 64; i++) {
      const left = Math.round(Math.random() * 1000) / 10;
      const delay = Math.round(Math.random() * 900) / 1000;
      const dur = 1.7 + Math.round(Math.random() * 160) / 100;
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

  function resultModalHtml(view) {
    const game = view.game;
    const ranking = game.ranking || [];
    const points = S.lastResult && S.lastResult.code === view.code ? (S.lastResult.points || null) : null;
    const myNo = validNumber(BG.state.number);
    const rows = ranking.map(function (row) {
      let gain = '—';
      if (!row.isBot && row.number !== null && row.number !== undefined) {
        if (points && points[row.number] !== undefined) gain = '+' + points[row.number] + 'P';
        else if (view.mode === 'bot') gain = '연습';
        else gain = '+10P';
      }
      const isMe = myNo && row.number === myNo;
      return '<tr class="' + (row.rank === 1 ? 'is-first ' : '') + (isMe ? 'is-me' : '') + '">' +
        '<td class="res-rank">' + medalFor(row.rank) + '</td>' +
        '<td class="res-who"><span class="res-avatar">' + avatar({ number: row.number, name: row.name }, 'xs') + '</span>' +
          '<span class="res-name">' + esc(row.number !== null && row.number !== undefined ? row.number + '번' : row.name) +
            (isMe ? ' <span class="tag you">나</span>' : '') + (row.isBot ? ' 🤖' : '') + '</span></td>' +
        '<td class="res-assets">' + money(row.totalAsset) + '</td>' +
        '<td class="res-cash">' + money(row.cash) + '</td>' +
        '<td class="res-props">' + row.properties + '곳</td>' +
        '<td class="res-points">' + gain + '</td>' +
        '</tr>';
    }).join('');

    const buttons = [];
    if (view.mode === 'bot') {
      buttons.push('<button class="btn btn-primary btn-block" data-action="bm.botRestart">한 판 더</button>');
      buttons.push('<button class="btn btn-block" data-action="bm.botExit">그만하기</button>');
    } else if (view.role === 'spectator') {
      buttons.push('<button class="btn btn-primary btn-block" data-action="bm.resultWatchBack">모둠 목록으로</button>');
      buttons.push('<button class="btn btn-ghost btn-block" data-action="ui.closeModal">닫고 계속 보기</button>');
    } else {
      if (view.isHost) buttons.push('<button class="btn btn-primary btn-block" data-action="bm.restart">한 판 더 (다시 시작)</button>');
      buttons.push('<button class="btn btn-block" data-action="bm.leave">방 나가기</button>');
      buttons.push('<button class="btn btn-ghost btn-block" data-action="ui.closeModal">닫기</button>');
    }

    const winner = ranking.find(function (r) { return r.rank === 1; });
    const myRow = myNo ? ranking.find(function (r) { return r.number === myNo; }) : null;
    const myGain = myNo && points ? points[myNo] : null;

    return confettiHtml() +
      '<div class="result-modal bm-result">' +
        '<div class="result-hero">' +
          '<div class="result-crown">🏆</div>' +
          '<h2 class="result-title">' + esc(game.winner || (winner ? winner.name : '게임')) + ' 우승!</h2>' +
          '<p class="result-sub">총자산 순위입니다. ' + (game.finishReason === 'round_limit' ? game.maxRounds + '라운드가 끝났어요.' : '마지막까지 살아남았어요!') + '</p>' +
          (myRow ? '<p class="result-mine">내 순위 <b>' + myRow.rank + '등</b>' +
            (myGain ? ' · <b>+' + myGain + 'P</b> 적립!' : '') +
            (myRow.rank === 1 ? ' 🎉 우승!' : '') + '</p>' : '') +
        '</div>' +
        '<div class="result-table-wrap">' +
          '<table class="result-table">' +
            '<thead><tr><th>순위</th><th>참가자</th><th>총자산</th><th>현금</th><th>도시</th><th>포인트</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="hint" style="text-align:center">순위 포인트: 1등 +100P · 2등 +50P · 3등 +30P · 그 외 +10P</p>' +
        '<div class="stack" style="margin-top:14px">' + buttons.join('') + '</div>' +
      '</div>';
  }

  function maybeShowResult(view) {
    const game = view.game;
    if (!game || game.status !== 'finished') return;
    const key = (view.code || view.mode) + ':' + (game.startedAt || '') + ':' + game.players.length;
    if (S.resultShown[key]) return;
    S.resultShown[key] = true;
    if (BG.sound) BG.sound.celebration();
    BG.ui.modal(resultModalHtml(view));
    const layer = document.querySelector('.confetti-layer');
    if (layer) {
      document.body.appendChild(layer);
      setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
      }, 4200);
    }
  }

  /* ---------------- 방 화면 ---------------- */

  function boardView(room, mode) {
    return {
      title: room.name,
      code: room.code,
      game: room.game,
      youId: room.youId,
      role: room.role,
      mode: mode || 'multi',
      isHost: room.youAreHost
    };
  }

  function gameKey(view) {
    const game = view.game;
    return [view.mode, view.code || '', game ? game.startedAt : '', game && game.players ? game.players.map(function (p) { return p.id; }).join(',') : ''].join('|');
  }

  function renderGame(view) {
    const key = gameKey(view);
    if (S.screenKey !== key) {
      S.screenKey = key;
      S.cardShown = 0;
      S.diceShown = 0;
      BG.ui.screen(gameScreenHtml(view), view.mode === 'bot' ? 'bm.bot' : (view.role === 'spectator' ? 'bm.watch' : 'bm.room'));
      // 결과 표시 키도 새 판마다 초기화하지 않고, 시작 시각으로 구분합니다.
      mountBoard(view.game, view.youId);
      maybeShowResult(view);
    }
    updateGame(view);
  }

  function closeResultModalIfOpen() {
    if (document.querySelector('.result-modal')) BG.ui.closeModal();
  }

  function renderRoom(params) {
    const code = String(params[0] || '').toUpperCase();
    BG.net.connect();

    if (!S.room || S.room.code !== code) {
      const seat = getSeat();
      if (BG.net.connected) {
        if (seat && seat.code === code && seat.token) {
          if (!S.resumeSent[code]) {
            S.resumeSent[code] = true;
            BG.net.send({ t: 'resume', gameId: 'bluemarble', code: code, classCode: BG.state.classCode, token: seat.token });
          }
        } else if (S.pendingJoin !== code) {
          const number = validNumber(readNumber());
          if (number) {
            S.pendingJoin = code;
            BG.net.send({ t: 'join', gameId: 'bluemarble', code: code, classCode: BG.state.classCode, number: number });
          }
        }
      }
      BG.ui.screen(
        '<div class="center-block">' +
          (validNumber(readNumber()) || getSeat()
            ? '<span class="spinner"></span><div>방에 입장하는 중…</div>'
            : '<div>출석번호가 필요합니다. <a href="#/bluemarble">모둠 선택으로 돌아가기</a></div>') +
        '</div>',
        'bm.room'
      );
      return;
    }

    const room = S.room;
    if (room.status === 'waiting') {
      disposeBoard();
      S.screenKey = '';
      closeResultModalIfOpen();
      BG.ui.screen(lobbyHtml(room), 'bm.room');
      return;
    }

    renderGame(boardView(room, 'multi'));
  }

  function renderWatch(params) {
    const code = String(params[0] || '').toUpperCase();
    BG.net.connect();
    if (!S.room || S.room.code !== code || S.room.role !== 'spectator') {
      if (BG.net.connected && !S.spectateSent[code]) {
        S.spectateSent[code] = true;
        BG.net.send({ t: 'spectate', gameId: 'bluemarble', code: code, classCode: BG.state.classCode });
      }
      BG.ui.screen('<div class="center-block"><span class="spinner"></span><div>관전 화면을 준비하는 중…</div></div>', 'bm.watch');
      return;
    }
    const room = S.room;
    if (!room.game) {
      BG.ui.screen(
        '<div class="screen-head">' +
          '<div>' +
            '<a class="back-link" href="#/bluemarble/teacher">← 모둠 목록</a>' +
            '<h1 class="room-name">' + esc(room.name) + ' 관전</h1>' +
            '<p class="page-sub">아직 게임이 시작되지 않았습니다. 학생들이 모이면 3D 보드가 보입니다.</p>' +
          '</div>' +
          '<div class="row">' +
            '<button class="btn btn-sm btn-warn" data-action="bm.resetRoom" data-code="' + esc(room.code) + '" data-name="' + esc(room.name) + '">🧹 방 초기화</button>' +
            '<button class="btn btn-sm btn-danger" data-action="bm.watchBack">관전 종료</button>' +
          '</div>' +
        '</div>' +
        '<div class="empty">대기 중인 모둠입니다.<br><br>' +
          '<button class="btn btn-primary btn-sm" data-action="bm.watchBack">모둠 목록으로</button></div>',
        'bm.watch'
      );
      return;
    }
    renderGame({
      title: room.name + ' 관전',
      code: room.code,
      game: room.game,
      youId: null,
      role: 'spectator',
      mode: 'multi',
      isHost: false
    });
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
        return '<div class="room-player ' + (p.isTurn ? 'turn' : '') + ' ' + (p.bankrupt ? 'out' : '') + '">' +
          avatar({ number: p.number, name: p.name, id: p.id }, 'xs') +
          '<span class="who">' + (p.isTurn ? '▶ ' : '') + esc(p.name) + (p.isBot ? ' 🤖' : '') + '</span>' +
          '<span class="cnt">' + money(p.cash) + '</span></div>';
      }).join('');
    }

    let meta = '참가 ' + room.playerCount + '명';
    if (status === 'waiting') meta = '참가 ' + room.playerCount + '/' + room.capacity + '명';
    else if (status === 'playing') {
      meta = 'R' + (room.round || 1) + '/15 · ' + (room.turnName ? room.turnName + '님 차례' : '진행 중') +
        ' · 도시 ' + (room.tableCount || 0) + '곳';
    } else if (status === 'finished') {
      meta = '우승 ' + (room.winner || '—');
    }

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
          '<button class="btn btn-sm btn-primary" data-action="bm.watch" data-code="' + esc(room.code) + '">👀 관전하기</button>' +
          '<button class="btn btn-sm btn-warn" data-action="bm.resetRoom" data-code="' + esc(room.code) + '" data-name="' + esc(room.name) + '">🧹 방 초기화</button>' +
        '</div>' +
      '</div>'
    );
  }

  function teacherGateHtml() {
    return (
      '<div class="teacher-gate">' +
        '<div class="gate-emoji">👩‍🏫</div>' +
        '<h1 class="page-title">' + esc(BG.className() || BG.state.classCode) + ' 선생님 확인</h1>' +
        '<p class="page-sub">우리 반을 만들 때 정한 <b>교사 비밀번호(PIN)</b>를 입력하면<br>' +
          '세계여행 마블 6개 모둠을 관전하고 방을 초기화할 수 있어요.</p>' +
        '<div class="gate-form">' +
          '<input id="teacher-pin" class="input pin-input" type="password" inputmode="numeric" maxlength="8" ' +
            'autocomplete="current-password" placeholder="교사 PIN">' +
          '<button class="btn btn-primary" data-action="bm.teacherAuth">확인</button>' +
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
      BG.ui.screen(teacherGateHtml(), 'bm.teacher');
      return;
    }

    const rooms = S.rooms.filter(function (r) { return r.gameId === 'bluemarble'; });
    const playing = rooms.filter(function (r) { return r.status === 'playing'; }).length;
    const people = rooms.reduce(function (sum, r) { return sum + (r.humanCount || 0); }, 0);

    BG.ui.screen(
      '<div class="screen-head">' +
        '<div>' +
          '<a class="back-link" href="#/class/' + esc(BG.state.classCode) + '">← ' + esc(BG.className() || '우리 반') + '</a>' +
          '<h1 class="page-title">👩‍🏫 교사 관전 · 세계여행 마블 (3D)</h1>' +
          '<p class="page-sub">' + esc(BG.className() || BG.state.classCode) + ' 6개 모둠의 3D 보드를 실시간으로 확인합니다.</p>' +
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
          '· 15라운드(약 20분)로 맞춰 두면 수업 시간에 딱 맞게 끝납니다. 대기방에서 10·15·20라운드로 바꿀 수 있어요.<br>' +
          '· 3D 보드는 드래그로 돌리고 휠로 확대할 수 있습니다. [🎥 시점 초기화]로 처음 시점으로 돌아옵니다.<br>' +
          '· 관전 화면에서는 주사위와 매입 버튼을 누를 수 없으니 안심하고 띄워 두세요.<br>' +
          '· 방이 막혀 있으면 카드의 [🧹 방 초기화]로 참가자를 정리하고 새로 시작할 수 있습니다.' +
        '</p>' +
      '</div>',
      'bm.teacher'
    );
  }

  /* ---------------- AI 봇 연습 ---------------- */

  function stopBotLoop() {
    if (S.bot.timer) {
      clearInterval(S.bot.timer);
      S.bot.timer = null;
    }
  }

  function botAction(action) {
    const game = S.bot.game;
    if (!game) return null;
    if (action === 'roll') return game.roll('me', Date.now());
    if (action === 'buy') return game.buy('me');
    if (action === 'build') return game.build('me');
    if (action === 'skip') return game.skip('me');
    if (action === 'payBail') return game.payBail('me');
    return null;
  }

  function startBotLoop() {
    stopBotLoop();
    S.bot.timer = setInterval(function () {
      const game = S.bot.game;
      if (!game || game.status !== 'playing') {
        stopBotLoop();
        return;
      }
      if (game.currentPlayerId() === 'me') {
        if (screenName() === 'bm.bot' && S.screenKey && document.getElementById('bm-actions')) updateBotScreen();
        return;
      }
      const action = S.bot.driver.tick(Date.now());
      if (!action) return;
      const result = S.bot.game && S.bot.game;
      if (action.action === 'roll') result.roll(action.playerId, Date.now());
      else if (action.action === 'buy') result.buy(action.playerId);
      else if (action.action === 'build') result.build(action.playerId);
      else if (action.action === 'skip') result.skip(action.playerId);
      else if (action.action === 'payBail') result.payBail(action.playerId);
      if (game.status !== 'playing') stopBotLoop();
      if (screenName() === 'bm.bot') updateBotScreen();
    }, 110);
  }

  function startBotGame(count, level) {
    stopBotLoop();
    const number = validNumber(BG.state.number) || 1;
    const players = [{ id: 'me', name: number + '번', number: number, isBot: false }];
    const names = BM.BOT_NAMES.slice();
    for (let i = 1; i < count; i++) {
      players.push({ id: 'bot' + i, name: names[i - 1] || ('봇' + i), number: null, isBot: true });
    }
    const game = new BM.Game(players, { maxRounds: 15 });
    S.bot = {
      active: true,
      game: game,
      driver: new BM.BotDriver(game, { level: level || 'normal' }),
      timer: null,
      level: level || 'normal',
      count: count
    };
    S.screenKey = '';
    S.botSig = '';
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
            '<a class="back-link" href="#/bluemarble">← 세계여행 마블 입장</a>' +
            '<h1 class="page-title">🤖 AI 봇과 세계여행 마블 연습</h1>' +
            '<p class="page-sub">서버에 접속하지 않아도 3D 보드로 바로 연습할 수 있습니다. (내 번호: ' + esc(myLabel()) + ')</p>' +
          '</div>' +
          '<button class="btn btn-sm" data-action="bm.rules">📖 규칙</button>' +
        '</div>' +
        '<div class="panel" style="max-width:560px">' +
          '<div class="panel-title">연습 설정</div>' +
          '<div class="stack">' +
            '<div class="field">인원' +
              '<div class="row">' +
                [2, 3, 4].map(function (n) {
                  return '<button class="btn" data-action="bm.botStart" data-count="' + n + '" data-level="normal">' +
                    n + '인 (나 + 봇 ' + (n - 1) + ')</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div class="field">난이도' +
              '<div class="row">' +
                levels.map(function (lv) {
                  return '<button class="btn btn-ghost btn-sm" data-action="bm.botStart" data-count="4" data-level="' + lv.id + '">' + lv.name + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<p class="hint">주사위는 <b>Space</b> 키로도 굴릴 수 있어요. 봇은 진짜 학생처럼 매입·건설을 결정합니다.</p>' +
            '<button class="btn btn-primary btn-block" data-action="bm.botStart" data-count="4" data-level="normal">4인 게임 시작</button>' +
          '</div>' +
        '</div>',
        'bm.bot'
      );
      return;
    }
    renderGame({
      title: 'AI 봇 연습',
      code: '연습',
      game: S.bot.game.stateFor('me'),
      youId: 'me',
      role: 'player',
      mode: 'bot',
      isHost: true
    });
  }

  function updateBotScreen() {
    if (!S.bot.game) return;
    const state = S.bot.game.stateFor('me');
    const sig = JSON.stringify([
      state.status, state.turn, state.phase, state.round,
      state.pending ? state.pending.kind + state.pending.tile : '-',
      state.lastRoll ? state.lastRoll.seq : 0,
      state.lastCard ? state.lastCard.seq : 0,
      state.players.map(function (p) { return p.cash + ':' + p.pos + ':' + (p.bankrupt ? 1 : 0); })
    ]);
    if (sig === S.botSig) return;
    S.botSig = sig;
    renderGame({
      title: 'AI 봇 연습',
      code: '연습',
      game: state,
      youId: 'me',
      role: 'player',
      mode: 'bot',
      isHost: true
    });
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
    BG.net.send({ t: 'join', gameId: 'bluemarble', code: code, classCode: BG.state.classCode, number: number });
    BG.navigate('/bluemarble/room/' + code);
  }

  function doLeave() {
    disposeBoard();
    S.screenKey = '';
    BG.net.send({ t: 'leave' });
    S.room = null;
    S.pendingJoin = null;
    S.resumeSent = {};
    clearSeat();
    BG.navigate('/bluemarble');
  }

  BG.actions['bm.rules'] = function () { openRules(); };

  BG.actions['bm.soundToggle'] = function () {
    if (!BG.sound) return;
    const on = BG.sound.toggle();
    BG.ui.toast(on ? '소리를 켰어요 🔊' : '소리를 껐어요 🔇', on ? 'ok' : '');
    const btn = document.querySelector('.sound-toggle');
    if (btn) {
      btn.textContent = on ? '🔊 소리' : '🔇 무음';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    } else {
      BG.render();
    }
  };

  BG.actions['bm.cameraReset'] = function () {
    if (S.board) S.board.resetCamera();
    else BG.ui.toast('3D 보드를 표시할 수 없는 기기에서는 시점을 바꿀 수 없습니다.', 'error');
  };

  BG.actions['bm.enterGroup'] = function (el) {
    joinCode(String(el.getAttribute('data-code') || '').toUpperCase());
  };

  BG.actions['bm.reenter'] = function (el) {
    const code = String(el.getAttribute('data-code') || '').toUpperCase();
    if (!code) return;
    BG.net.connect();
    BG.navigate('/bluemarble/room/' + code);
  };

  BG.actions['bm.enterByCode'] = function () {
    const input = document.getElementById('room-code');
    const code = input && input.value ? input.value.trim().toUpperCase() : '';
    if (!code) {
      BG.ui.toast('방 코드를 입력해 주세요.', 'error');
      return;
    }
    joinCode(code);
  };

  BG.actions['bm.createRoom'] = function () {
    const number = validNumber(readNumber());
    if (!number) {
      BG.ui.toast('출석번호를 먼저 입력해 주세요.', 'error');
      return;
    }
    if (!ensureConnected()) return;
    BG.net.send({ t: 'create', gameId: 'bluemarble', classCode: BG.state.classCode, number: number });
  };

  BG.actions['bm.teacher'] = function () { BG.navigate('/bluemarble/teacher'); };

  BG.actions['bm.teacherAuth'] = function () {
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

  BG.actions['bm.bot'] = function () { BG.navigate('/bluemarble/bot'); };

  BG.actions['bm.botStart'] = function (el) {
    startBotGame(Number(el.getAttribute('data-count') || 4), el.getAttribute('data-level') || 'normal');
  };

  BG.actions['bm.botRestart'] = function () {
    closeResultModalIfOpen();
    startBotGame(S.bot.count || 4, S.bot.level || 'normal');
  };

  BG.actions['bm.botExit'] = function () {
    closeResultModalIfOpen();
    stopBotLoop();
    disposeBoard();
    S.screenKey = '';
    S.bot = { active: false, game: null, driver: null, timer: null, level: S.bot.level || 'normal', count: S.bot.count || 4 };
    BG.navigate('/bluemarble');
  };

  BG.actions['bm.roll'] = function () {
    if (S.bot.active && screenName() === 'bm.bot') {
      const result = botAction('roll');
      if (result && !result.ok) BG.ui.toast(reasonMessage(result.reason), 'error');
      updateBotScreen();
      return;
    }
    BG.net.send({ t: 'action', action: 'roll' });
  };

  BG.actions['bm.buy'] = function () {
    if (S.bot.active && screenName() === 'bm.bot') {
      const result = botAction('buy');
      if (result && !result.ok) BG.ui.toast(reasonMessage(result.reason), 'error');
      updateBotScreen();
      return;
    }
    BG.net.send({ t: 'action', action: 'buy' });
  };

  BG.actions['bm.build'] = function () {
    if (S.bot.active && screenName() === 'bm.bot') {
      const result = botAction('build');
      if (result && !result.ok) BG.ui.toast(reasonMessage(result.reason), 'error');
      updateBotScreen();
      return;
    }
    BG.net.send({ t: 'action', action: 'build' });
  };

  BG.actions['bm.skip'] = function () {
    if (S.bot.active && screenName() === 'bm.bot') {
      botAction('skip');
      updateBotScreen();
      return;
    }
    BG.net.send({ t: 'action', action: 'skip' });
  };

  BG.actions['bm.payBail'] = function () {
    if (S.bot.active && screenName() === 'bm.bot') {
      const result = botAction('payBail');
      if (result && !result.ok) BG.ui.toast(reasonMessage(result.reason), 'error');
      updateBotScreen();
      return;
    }
    BG.net.send({ t: 'action', action: 'payBail' });
  };

  function reasonMessage(reason) {
    const map = {
      not_your_turn: '아직 내 차례가 아닙니다.',
      decide_first: '먼저 매입하거나 건너뛰기를 선택해 주세요.',
      not_enough_cash: '돈이 부족합니다.',
      nothing_to_buy: '지금 매입할 도시가 없습니다.',
      nothing_to_build: '지금 건설할 도시가 없습니다.',
      not_on_island: '무인도에 있지 않습니다.',
      bankrupt: '이미 파산했습니다.',
      not_playing: '게임이 진행 중이 아닙니다.'
    };
    return map[reason] || '지금은 할 수 없습니다.';
  }

  BG.actions['bm.ready'] = function () {
    const room = S.room;
    const me = room && room.seats.find(function (s) { return s.id === room.youId; });
    BG.net.send({ t: 'ready', ready: !(me && me.ready) });
  };

  BG.actions['bm.start'] = function () { BG.net.send({ t: 'start' }); };
  BG.actions['bm.restart'] = function () { closeResultModalIfOpen(); BG.net.send({ t: 'start' }); };
  BG.actions['bm.addBot'] = function () { BG.net.send({ t: 'addBot' }); };
  BG.actions['bm.removeBot'] = function () { BG.net.send({ t: 'removeBot' }); };

  BG.actions['bm.rounds'] = function (el) {
    const rounds = Number(el.value);
    if (Number.isInteger(rounds)) BG.net.send({ t: 'option', rounds: rounds });
  };

  BG.actions['bm.leave'] = function () {
    if (S.bot.active && screenName() === 'bm.bot') {
      BG.actions['bm.botExit']();
      return;
    }
    const playing = S.room && S.room.game && S.room.game.status === 'playing';
    if (playing && S.room.role === 'player') {
      confirmDialog({
        title: '방을 나갈까요?',
        body: '지금 나가면 이 모둠 방에서 나가게 됩니다. 친구들이 남아 있으면 게임은 그대로 이어지고, 혼자 남았던 방은 대기 상태로 돌아갑니다.',
        confirm: '나가기',
        action: 'bm.confirmLeave',
        danger: true
      });
      return;
    }
    doLeave();
  };

  BG.actions['bm.confirmLeave'] = function () {
    BG.ui.closeModal();
    doLeave();
  };

  BG.actions['bm.resetRoom'] = function (el) {
    const code = String(el.getAttribute('data-code') || '').toUpperCase();
    const name = el.getAttribute('data-name') || '이 모둠';
    S.pendingResetCode = code;
    confirmDialog({
      title: '방을 초기화할까요?',
      body: name + ' 방의 참가자를 모두 내보내고 대기 상태로 되돌립니다. 진행 중인 게임은 끝납니다.',
      confirm: '초기화',
      action: 'bm.confirmResetRoom',
      danger: true
    });
  };

  BG.actions['bm.confirmResetRoom'] = function () {
    const code = S.pendingResetCode;
    S.pendingResetCode = null;
    BG.ui.closeModal();
    if (code) BG.net.send({ t: 'resetRoom', gameId: 'bluemarble', code: code, classCode: BG.state.classCode });
  };

  BG.actions['bm.watch'] = function (el) {
    const code = el.getAttribute('data-code');
    S.spectateSent = {};
    S.screenKey = '';
    BG.navigate('/bluemarble/watch/' + code);
  };

  BG.actions['bm.watchBack'] = function () {
    disposeBoard();
    S.screenKey = '';
    BG.net.send({ t: 'stopSpectate' });
    S.room = null;
    BG.navigate('/bluemarble/teacher');
  };

  BG.actions['bm.resultWatchBack'] = function () {
    BG.ui.closeModal();
    BG.actions['bm.watchBack']();
  };

  /* ---------------- 입력 · 키보드 ---------------- */

  document.addEventListener('input', function (event) {
    const el = event.target;
    if (!el || el.id !== 'number') return;
    const preview = document.getElementById('my-avatar-preview');
    if (preview) preview.innerHTML = avatar({ number: el.value.replace(/[^0-9]/g, ''), name: '나' }, 'sm');
  });

  document.addEventListener('pointerdown', function () {
    if (BG.sound) BG.sound.unlock();
  }, { once: true, passive: true });

  BG.keyHandlers.push(function (event) {
    const screen = screenName();
    if (screen !== 'bm.room' && screen !== 'bm.bot') return false;
    if (S.room && S.room.role === 'spectator') return false;
    const actions = document.getElementById('bm-actions');
    if (!actions) return false;
    if (event.code === 'Space') {
      const roll = actions.querySelector('[data-action="bm.roll"]');
      if (roll && !roll.disabled) {
        roll.click();
        return true;
      }
    }
    if (event.code === 'Enter') {
      const first = actions.querySelector('.btn-primary[data-action]');
      if (first && !first.disabled) {
        first.click();
        return true;
      }
    }
    return false;
  });

  /* ---------------- 서버 메시지 ---------------- */

  function refreshRoomList() {
    const screen = screenName();
    if (screen === 'bluemarble') renderEntry();
    else if (screen === 'bm.teacher') renderTeacher();
    else if (screen === 'bm.room' && S.room && S.room.status === 'waiting') {
      BG.ui.screen(lobbyHtml(S.room), 'bm.room');
    }
  }

  BG.net.on('class_stats', function (msg) {
    if (!msg || msg.classCode !== BG.state.classCode) return;
    S.stats = msg.stats || [];
    refreshRoomList();
    if (screenName() === 'class' && BG.portal) BG.portal.classPortalHtml();
  });

  BG.net.on('game_result', function (msg) {
    if (!msg || msg.classCode !== BG.state.classCode) return;
    S.stats = msg.stats || S.stats;
    if (msg.gameId !== 'bluemarble') {
      refreshRoomList();
      return;
    }
    S.lastResult = msg;
    if (S.lastResultAt !== msg.recordedAt && BG.markResultSeen('bm:' + msg.classCode + ':' + msg.recordedAt)) {
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
    if (screenName() === 'room' || screenName() === 'bm.room') {
      const path = BG.currentPath();
      if (path.indexOf('/bluemarble/room/') === 0) BG.render();
    }
  });

  BG.net.on('welcome', function (msg) {
    S.rooms = (msg.rooms || []).filter(function (r) { return r.gameId === 'bluemarble'; });
    refreshRoomList();
  });

  BG.net.on('rooms', function (msg) {
    S.rooms = (msg.rooms || []).filter(function (r) { return r.gameId === 'bluemarble'; });
    refreshRoomList();
  });

  BG.net.on('joined', function (msg) {
    if (!msg || msg.gameId !== 'bluemarble') return;
    S.pendingJoin = null;
    S.resumeSent = {};
    saveSeat({ gameId: 'bluemarble', code: msg.code, token: msg.token, playerId: msg.playerId });
    const path = BG.currentPath();
    if (path.indexOf('/bluemarble/room/') !== 0) BG.navigate('/bluemarble/room/' + msg.code);
    if (msg.created) BG.ui.toast('새 방을 만들었습니다. 코드 ' + msg.code, 'ok');
    else if (msg.resumed) BG.ui.toast('다시 접속했습니다.', 'ok');
  });

  BG.net.on('room', function (msg) {
    if (!msg || !msg.room || msg.room.gameId !== 'bluemarble') return;
    S.room = msg.room;
    S.role = msg.room.role;
    const path = BG.currentPath();
    if (path.indexOf('/bluemarble/room/') === 0) renderRoom([msg.room.code]);
    else if (path.indexOf('/bluemarble/watch/') === 0) renderWatch([msg.room.code]);
  });

  BG.net.on('spectating', function (msg) {
    if (msg && msg.gameId && msg.gameId !== 'bluemarble') return;
    BG.ui.toast((msg.name || '모둠') + ' 관전을 시작합니다.', 'ok');
  });

  BG.net.on('class_auth_ok', function (msg) {
    if (!msg || !msg['class']) return;
    const cls = msg['class'];
    BG.setClass(cls.code, cls.name);
    if (msg.teacherToken) BG.setTeacherToken(cls.code, msg.teacherToken);
    S.teacherBound = true;
    BG.ui.toast(cls.name + ' 선생님 확인 완료!', 'ok');
    if (screenName() === 'bm.teacher') renderTeacher();
    else if (screenName() === 'bm.watch') {
      S.spectateSent = {};
      BG.render();
    }
  });

  BG.net.on('room_reset', function (msg) {
    if (msg && msg.gameId && msg.gameId !== 'bluemarble') return;
    BG.ui.toast(msg.message || '방이 초기화되었습니다.', 'ok');
    const seat = getSeat();
    if (seat && String(seat.code) === String(msg.code)) clearSeat();
    disposeBoard();
    S.screenKey = '';
    S.room = null;
    S.pendingJoin = null;
    const screen = screenName();
    if (screen === 'bm.room') BG.navigate('/bluemarble');
    else if (screen === 'bm.watch') {
      if (msg.self) BG.actions['bm.watchBack']();
      else BG.navigate('/bluemarble');
    } else {
      BG.render();
    }
  });

  BG.net.on('action_result', function (msg) {
    if (msg && msg.ok === false && msg.message) BG.ui.toast(msg.message, 'error');
    else if (msg && msg.ok === true && msg.message) BG.ui.toast(msg.message, 'ok');
  });

  BG.net.on('error', function (msg) {
    const path = BG.currentPath();
    const onBlue = path.indexOf('/bluemarble') === 0;
    if (!onBlue) return;
    BG.ui.toast(msg.message || '요청을 처리할 수 없습니다.', 'error');
    const code = msg.code;
    if (code === 'teacher_auth_required') {
      BG.setTeacherToken(BG.state.classCode, '');
      S.teacherBound = false;
      S.spectateSent = {};
      if (screenName() === 'bm.watch') {
        S.room = null;
        BG.navigate('/bluemarble/teacher');
      }
      return;
    }
    if (['no_seat', 'no_room', 'no_name', 'full', 'playing', 'dup_name', 'dup_number', 'bad_number', 'already_in_room'].indexOf(code) !== -1) {
      clearSeat();
      S.pendingJoin = null;
      S.room = null;
      if (path.indexOf('/bluemarble/room/') === 0) BG.navigate('/bluemarble');
    }
  });

  BG.net.on('close', function () {
    S.teacherBound = false;
  });

  BG.net.on('open', function () {
    const path = BG.currentPath();
    S.teacherBound = false;
    if (path.indexOf('/bluemarble') !== 0) return;
    if (path === '/bluemarble/teacher' && teacherReady()) {
      BG.net.send({ t: 'classAuth', code: BG.state.classCode, token: BG.teacherToken(BG.state.classCode) });
    }
    if (path.indexOf('/bluemarble/watch/') === 0 && teacherReady()) {
      BG.net.send({ t: 'classAuth', code: BG.state.classCode, token: BG.teacherToken(BG.state.classCode) });
    }
    const seat = getSeat();
    if (seat && path.indexOf('/bluemarble/room/') === 0) {
      S.resumeSent = {};
      const code = path.split('/').pop().toUpperCase();
      if (seat.code === code) {
        S.resumeSent[code] = true;
        BG.net.send({ t: 'resume', gameId: 'bluemarble', code: seat.code, classCode: BG.state.classCode, token: seat.token });
      }
    }
    BG.render();
  });

  /* ---------------- 라우트 ---------------- */

  BG.router.add(/^\/bluemarble$/, 'bluemarble', function () {
    renderEntry();
  });

  BG.router.add(/^\/bluemarble\/room\/([^/]+)$/, 'bm.room', function (params) {
    renderRoom(params);
  });

  BG.router.add(/^\/bluemarble\/watch\/([^/]+)$/, 'bm.watch', function (params) {
    renderWatch(params);
  });

  BG.router.add(/^\/bluemarble\/teacher$/, 'bm.teacher', function () {
    BG.net.connect();
    if (!BG.state.classCode) {
      BG.navigate('/');
      return;
    }
    if (!teacherReady()) {
      BG.ui.screen(teacherGateHtml(), 'bm.teacher');
      return;
    }
    if (BG.net.connected) {
      if (!S.teacherBound) {
        BG.net.send({ t: 'classAuth', code: BG.state.classCode, token: BG.teacherToken(BG.state.classCode) });
      } else {
        BG.net.send({ t: 'overview', gameId: 'bluemarble', classCode: BG.state.classCode });
      }
    }
    renderTeacher();
  });

  BG.router.add(/^\/bluemarble\/bot$/, 'bm.bot', function () {
    renderBot();
  });

  BG.bm = {
    renderEntry: renderEntry,
    renderRoom: renderRoom,
    renderTeacher: renderTeacher,
    renderBot: renderBot,
    rulesHtml: rulesHtml,
    state: S
  };
})();
