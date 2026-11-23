/*
 * 미니 게임 화면 – 숫자 줄세우기 · 오목 · 라이어 추리게임 · 윷놀이
 * 입장 · 대기방 · 게임 화면 · AI 봇 연습 · 교사 관전을 한 파일에서 처리합니다.
 * 보드 그리기는 public/js/mini-boards.js, 규칙은 public/<game>-engine.js 가 맡습니다.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const esc = BG.ui.escape;

  const GAMES = {
    streams: {
      id: 'streams',
      title: '숫자 줄세우기',
      emoji: '🎯',
      desc: '같은 숫자를 모두 함께, 각자 20칸 트랙에 오름차순으로 놓습니다. 끊기지 않고 이어진 가장 긴 줄이 점수!',
      players: '1~4명 · 모둠당 4명',
      capacity: 4,
      minPlayers: 1,
      botSeats: 2,
      accent: 'streams',
      rules: [
        '1~30 숫자 타일을 섞어 한 장씩 공개합니다.',
        '같은 숫자를 모두가 동시에 자기 20칸 트랙의 빈칸에 놓습니다.',
        '트랙은 왼쪽에서 오른쪽으로 반드시 커져야 합니다. (작은 수는 왼쪽, 큰 수는 오른쪽)',
        '놓을 수 있는 칸이 없으면 그 숫자는 버리고 이번 판을 쉽니다.',
        '30장을 다 쓰거나 20칸이 다 차면 끝나고, 가장 긴 이어진 구간이 점수입니다.',
        '요령: 가운데 칸에는 중간 숫자를 놓아 두면 나중 숫자를 놓기 쉬워요.'
      ]
    },
    gomoku: {
      id: 'gomoku',
      title: '오목',
      emoji: '⚫',
      desc: '15x15 오목판에서 1:1 대결! 가로·세로·대각선 5개를 먼저 이으면 승리합니다. AI 봇과 혼자 연습할 수 있어요.',
      players: '2명 · 모둠당 2명',
      capacity: 2,
      minPlayers: 2,
      botSeats: 1,
      accent: 'gomoku',
      rules: [
        '2명이 번갈아 오목판(15x15)에 돌을 놓습니다. 흑이 먼저 시작합니다.',
        '가로·세로·대각선 어느 방향으로든 5개를 먼저 이으면 승리합니다.',
        '흑은 금수(6목 이상, 4-4, 3-3)를 둘 수 없습니다. 백은 자유롭게 둡니다.',
        '판이 가득 차면 무승부입니다.',
        '모둠방에서는 친구와 대결하고, 끝난 판은 다시 시작할 수 있습니다.'
      ]
    },
    liar: {
      id: 'liar',
      title: '라이어 추리게임',
      emoji: '🕵️',
      desc: '제시어를 모르는 한 명(라이어)이 섞여 있습니다. 힌트를 듣고 투표로 찾아내세요. 3명부터 시작!',
      players: '3~6명 · 모둠당 6명',
      capacity: 6,
      minPlayers: 3,
      botSeats: 2,
      accent: 'liar',
      rules: [
        '3명 이상이 모이면 시작합니다. 한 명만 제시어를 모르는 라이어입니다.',
        '시민들은 같은 제시어를 보고, 라이어는 주제만 압니다.',
        '순서대로 한 사람씩 힌트를 한 줄씩 말합니다. (제시어를 그대로 말하면 안 돼요)',
        '힌트가 한 바퀴 돌면 라이어라고 생각하는 사람에게 투표합니다.',
        '가장 많은 표를 받은 사람이 라이어면 → 라이어가 제시어를 맞힐 마지막 기회!',
        '라이어가 아닌 사람이 지목되거나 표가 갈리면 라이어의 승리입니다.'
      ]
    },
    yut: {
      id: 'yut',
      title: '전통 윷놀이',
      emoji: '🪵',
      desc: '도·개·걸·윷·모! 말을 업고, 잡고, 지름길로 달려 먼저 완주하세요. 2~4명이 함께 즐깁니다.',
      players: '2~4명 · 모둠당 4명',
      capacity: 4,
      minPlayers: 2,
      botSeats: 3,
      accent: 'yut',
      rules: [
        '윷가락 4개를 던져 나온 결과만큼 말을 옮깁니다. (도 1 · 개 2 · 걸 3 · 윷 4 · 모 5 · 빽도 한 칸 뒤로)',
        '윷이나 모가 나오면 한 번 더 던집니다.',
        '내 말이 있는 자리에 다른 내 말이 오면 업어서 함께 움직입니다.',
        '상대 말이 있는 자리에 내 말이 오면 상대 말을 잡아 출발점으로 보내고, 한 번 더 던집니다.',
        '모서리(5·10번 자리)에 정확히 멈추면 지름길로 갑니다.',
        '말이 모두 완주하면 우승! 방장은 말 개수(2~4개)를 정할 수 있습니다.'
      ]
    },
    rummi: {
      id: 'rummi',
      title: '숫자 타일 러미',
      emoji: '🔢',
      desc: '1~13 숫자 타일과 조커로 같은 숫자 세트·연속 숫자 런을 만들어 테이블에 내놓습니다. 내 패를 먼저 다 내면 우승!',
      players: '2~4명 · 모둠당 4명',
      capacity: 4,
      minPlayers: 2,
      botSeats: 1,
      accent: 'rummi',
      rules: [
        '타일은 1~13 × 4색(빨강·파랑·노랑·초록) + 조커 2장입니다.',
        '같은 숫자 세트: 같은 숫자 다른 색 3~4장을 모아 테이블에 냅니다.',
        '런: 같은 색 연속 숫자 3장 이상을 이어서 냅니다. (예: 초록 4·5·6)',
        '처음 등록은 한 차례에 낸 타일 합이 기준 점수(기본 30점) 이상이어야 합니다. 방장이 15점으로 쉽게 바꿀 수 있어요.',
        '조커는 한 세트에 1장까지, 어떤 빈자리든 대신할 수 있습니다. 조커가 든 세트에는 타일을 더할 수 없습니다.',
        '테이블 세트에 내 타일을 이어 붙일 수 있습니다.',
        '낼 타일이 없으면 더미에서 1장 뽑고 차례를 넘깁니다.',
        '내 패를 먼저 다 내면 우승! 더미가 비면 남은 타일 점수가 가장 낮은 사람이 우승입니다.'
      ]
    },
    oldmaid: {
      id: 'oldmaid',
      title: '도둑잡기',
      emoji: '🃏',
      desc: '동물 짝 카드를 맞춰 버리고, 마지막까지 도둑 카드를 들고 있지 않으면 됩니다. 앞사람 패에서 한 장씩 뽑아요!',
      players: '2~5명 · 모둠당 4명',
      capacity: 5,
      minPlayers: 2,
      botSeats: 2,
      accent: 'oldmaid',
      rules: [
        '동물 짝 카드 12쌍(24장)과 도둑 카드 1장, 모두 25장으로 시작합니다.',
        '카드를 나눠 받으면 같은 그림 짝은 바로 자동으로 버립니다.',
        '내 차례에는 앞사람(왼쪽 친구)의 패에서 1장을 뽑습니다.',
        '뽑은 카드가 내 패의 카드와 짝이 맞으면 두 장을 버립니다.',
        '손패를 먼저 다 털어낸 사람이 1등! 마지막까지 도둑 카드를 들고 있는 사람이 꼴찌입니다.',
        '2명이면 서로의 패에서 번갈아 뽑습니다.'
      ]
    },
    janggi: {
      id: 'janggi',
      title: '전통 장기',
      emoji: '♟️',
      desc: '9×10 장기판에서 초와 한이 1:1로 겨룹니다. 차·포·마·상·사·졸·궁을 움직여 상대 궁을 잡으세요!',
      players: '2명 · 모둠당 2명',
      capacity: 2,
      minPlayers: 2,
      botSeats: 1,
      accent: 'janggi',
      rules: [
        '9×10 장기판에서 초(아래)가 먼저 두고, 한(위)이 이어서 둡니다.',
        '차는 가로·세로로 원하는 만큼, 포는 다리 하나를 넘어서만 움직이고 잡습니다. (포끼리는 잡지 못합니다)',
        '마는 날일자, 상은 밭전자로 움직입니다. 가는 길이 막히면 못 갑니다.',
        '사와 궁은 궁성(3×3) 안에서만, 졸·병은 앞이나 옆으로 한 칸씩 움직입니다.',
        '상대 궁을 잡으면 바로 승리! 상대가 둘 곳이 없어도(외통수) 승리합니다.',
        '내 궁이 공격받는 자리로는 움직일 수 없고, 두 궁이 마주 보게 두는 것도 안 됩니다.'
      ]
    },
    onecard: {
      id: 'onecard',
      title: '컬러 숫자 카드',
      emoji: '🎨',
      desc: '같은 색이나 같은 숫자 카드를 내고, 특수 카드로 판을 흔들어 보세요. 손패를 먼저 0장으로 만들면 승리!',
      players: '2~5명 · 모둠당 4명',
      capacity: 5,
      minPlayers: 2,
      botSeats: 2,
      accent: 'onecard',
      rules: [
        '4색(빨강·파랑·노랑·초록) × 1~9 숫자 카드와 특수 카드(점프·방향전환·+2 공격), 색 바꾸기 4장으로 시작합니다.',
        '한 사람당 7장씩 나눠 받고, 바닥 카드와 같은 색이거나 같은 숫자(또는 같은 특수 카드)를 냅니다.',
        '점프: 다음 사람 차례를 건너뜁니다. 방향전환: 순서가 반대로 바뀝니다. (2명일 때는 점프처럼)',
        '+2 공격: 다음 사람이 2장을 뽑고 건너뜁니다.',
        '색 바꾸기: 아무 때나 낼 수 있고, 바꿀 색을 고릅니다.',
        '낼 카드가 없으면 더미에서 1장 뽑고 차례를 넘깁니다.',
        '손패를 먼저 0장으로 만든 사람이 우승! 남은 사람은 카드가 적은 순서로 순위를 정합니다.'
      ]
    },
    dots: {
      id: 'dots',
      title: '선 긋기 땅따먹기',
      emoji: '✏️',
      desc: '5×5 점 사이에 선을 그어 사각형을 완성하세요. 네 번째 선을 그으면 그 칸이 내 땅! 가장 많은 땅을 차지하면 승리!',
      players: '2~4명 · 모둠당 4명',
      capacity: 4,
      minPlayers: 2,
      botSeats: 2,
      accent: 'dots',
      rules: [
        '5×5 점(4×4 칸) 보드에서 번갈아 선을 하나씩 긋습니다.',
        '사각형의 네 번째 선을 완성하면 그 칸이 내 땅이 되고, 한 번 더 그을 수 있습니다.',
        '땅을 먹지 못하면 다음 사람에게 차례가 넘어갑니다.',
        '16칸을 모두 나누면 끝! 가장 많은 땅을 가진 사람이 우승합니다.',
        '요령: 상대에게 3면이 열린 칸을 만들어 주지 마세요.'
      ]
    }
  };

  const IDS = Object.keys(GAMES);

  const S = {
    rooms: [],
    room: null,
    role: 'player',
    stats: [],
    pendingJoin: null,
    resumeSent: {},
    spectateSent: {},
    lastResult: null,
    resultShown: {},
    authPending: false,
    bot: { gameId: null, game: null, driver: null, timer: null, players: 2, running: false, resultShown: false }
  };

  /* ---------------- 도우미 ---------------- */

  function screenName() {
    return document.body.dataset.screen || '';
  }

  function routeGameId() {
    const path = BG.currentPath();
    const parts = path.split('/');
    const id = parts[1] || '';
    return GAMES[id] ? id : null;
  }

  function gameMeta(id) {
    return GAMES[id] || null;
  }

  function engineOf(id) {
    if (id === 'streams') return window.Streams;
    if (id === 'gomoku') return window.Gomoku;
    if (id === 'liar') return window.Liar;
    if (id === 'yut') return window.Yut;
    if (id === 'rummi') return window.Rummi;
    if (id === 'oldmaid') return window.OldMaid;
    if (id === 'janggi') return window.Janggi;
    if (id === 'onecard') return window.OneCard;
    if (id === 'dots') return window.Dots;
    return null;
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

  function readName() {
    const el = document.getElementById('student-name');
    if (el) return BG.setNameFor(BG.state.classCode, el.value);
    return String(BG.state.name || BG.nameFor(BG.state.classCode) || '');
  }

  function myLabel() {
    return BG.studentLabel(BG.state.number, BG.state.name);
  }

  function seatKey(gameId) { return 'mg.seat.' + gameId; }
  function getSeat(gameId) { return BG.session.get(seatKey(gameId), null); }
  function saveSeat(gameId, seat) { BG.session.set(seatKey(gameId), seat); }
  function clearSeat(gameId) { BG.session.remove(seatKey(gameId)); }

  function statusBadge(status) {
    if (status === 'playing') return '<span class="badge playing">진행 중</span>';
    if (status === 'finished') return '<span class="badge finished">종료</span>';
    return '<span class="badge ready">대기 중</span>';
  }

  function rulesModal(meta) {
    BG.ui.modal(
      '<h2>' + meta.emoji + ' ' + esc(meta.title) + ' 규칙</h2>' +
      '<ol class="rules-list">' + meta.rules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ol>' +
      '<button class="btn btn-primary btn-block" data-action="ui.closeModal" style="margin-top:14px">확인</button>'
    );
  }

  function needServer() {
    if (BG.net.connected) return true;
    if (BG.net.offline) {
      BG.ui.toast('실시간 서버에 연결할 수 없어요. 혼자서는 [AI 봇 연습]을 이용해 주세요.', 'error');
      return false;
    }
    BG.net.connect();
    return true;
  }

  function ensureConnected() {
    if (BG.net.connected) return true;
    BG.net.connect();
    return false;
  }

  /* ---------------- 입장 화면 ---------------- */

  function groupCard(gameId, room) {
    const status = room.status || 'waiting';
    const cls = status === 'playing' ? 'is-playing' : status === 'finished' ? 'is-done' : 'is-open';
    const count = room.playerCount || 0;
    const cap = room.capacity || 4;
    const seats = room.seats || [];
    const seat = getSeat(gameId);
    const mine = seat && String(seat.code) === String(room.code).toUpperCase();
    const full = count >= cap;
    const canEnter = status !== 'playing' && !full;
    let label = '입장';
    if (status === 'playing') label = '진행 중';
    else if (full) label = '만석';
    else if (status === 'finished') label = '새로 시작';

    const names = seats.map(function (s) { return s.name + (s.isBot ? ' 🤖' : ''); }).join(', ');
    const stack = seats.slice(0, 5).map(function (s) { return BG.avatars ? BG.avatars.html(s, 'xs') : ''; }).join('');
    const summary = room.players && room.players.length
      ? room.players.map(function (p) {
        if (p.finishedCount !== undefined) return p.name + ' ' + p.finishedCount + '/' + (p.pieces || 0);
        if (p.score !== undefined) return p.name + ' ' + p.score;
        return p.name;
      }).join(' · ')
      : '';

    return '<div class="group-card ' + cls + (mine ? ' is-self' : '') + '" data-game="' + gameId + '">' +
      '<div class="group-head"><span class="group-name">' + esc(room.name) + '</span>' +
        '<span class="group-occ"><b>' + count + '</b>/' + cap + '명</span></div>' +
      (mine ? '<div class="group-self-line"><span class="badge badge-self">🏠 내가 참여 중</span></div>' : '') +
      '<div class="group-players">' +
        (stack ? '<span class="avatar-stack">' + stack + '</span>' : '') +
        '<span class="group-names">' + (names ? esc(names) : '아직 아무도 없어요') + '</span></div>' +
      (summary ? '<div class="group-summary">' + esc(summary) + '</div>' : '') +
      '<div class="group-actions">' +
        (mine
          ? '<button class="btn btn-primary btn-sm" data-action="mini.reenter" data-code="' + esc(room.code) + '">다시 들어가기</button>'
          : '<button class="btn ' + (canEnter ? 'btn-primary' : '') + ' btn-sm" data-action="mini.enterGroup" data-code="' + esc(room.code) + '"' +
            (canEnter ? '' : ' disabled') + '>' + label + '</button>') +
        (status === 'playing' || status === 'finished'
          ? '<button class="btn btn-sm" data-action="mini.watch" data-code="' + esc(room.code) + '">관전</button>'
          : '') +
      '</div>' +
    '</div>';
  }

  function numberPanel(meta) {
    const label = validNumber(BG.state.number) ? myLabel() : '번호를 넣으면 여기에 보여요';
    return '<div class="panel number-panel" style="margin-bottom:16px">' +
      '<div class="row" style="gap:14px;align-items:flex-start;flex-wrap:wrap">' +
        '<label class="field" style="flex:0 0 auto;min-width:170px">내 출석번호 (1~99)' +
          '<span class="row" style="gap:8px;flex-wrap:nowrap;align-items:center">' +
            '<span id="my-avatar-preview">' + (BG.avatars ? BG.avatars.html({ number: BG.state.number, name: myLabel() }, 'sm') : '') + '</span>' +
            '<input id="number" class="input number-input" inputmode="numeric" pattern="[0-9]*" maxlength="2" ' +
              'autocomplete="off" placeholder="예: 3" style="flex:1;max-width:120px" value="' + esc(BG.state.number || '') + '">' +
            '<span class="number-suffix">번</span>' +
          '</span>' +
        '</label>' +
        '<label class="field" style="flex:1;min-width:200px">내 이름 (선택)' +
          '<input id="student-name" class="input name-input" maxlength="10" autocomplete="off" ' +
            'placeholder="예: 김민수" value="' + esc(BG.state.name || '') + '">' +
          '<span class="hint">번호와 이름이 함께 보여요: <b id="my-name-preview">' + esc(label) + '</b></span>' +
        '</label>' +
      '</div>' +
      '<span class="hint" style="display:block;margin-top:10px">친구마다 다른 번호를 써 주세요. 이름을 비워 두면 번호만 보여요.</span>' +
    '</div>';
  }

  /** 방 목록만 다시 그립니다. (입력 중인 번호·이름이 지워지지 않게) */
  function refreshEntryRooms(gameId) {
    const grid = document.querySelector('.group-grid');
    if (!grid) return;
    const rooms = S.rooms.filter(function (r) { return r.gameId === gameId; });
    grid.innerHTML = rooms.length
      ? rooms.map(function (r) { return groupCard(gameId, r); }).join('')
      : '<div class="empty">모둠 방 정보를 불러오는 중입니다…</div>';
  }

  function renderEntry(gameId) {
    const meta = gameMeta(gameId);
    if (!meta) { BG.navigate('/'); return; }
    if (!BG.state.classCode) { BG.navigate('/'); return; }
    ensureConnected();
    const rooms = S.rooms.filter(function (r) { return r.gameId === gameId; });
    const cards = rooms.length
      ? rooms.map(function (r) { return groupCard(gameId, r); }).join('')
      : '<div class="empty">모둠 방 정보를 불러오는 중입니다…<br>서버가 꺼져 있다면 아래 <b>AI 봇 연습</b>을 이용해 주세요.</div>';
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
      '<div class="screen-head mg-head">' +
        '<div>' +
          '<h1 class="entry-title">' + meta.emoji + ' ' + esc(meta.title) + '</h1>' +
          '<p class="page-sub">' + esc(meta.desc) + '</p>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" data-action="mini.rules" data-game="' + gameId + '">📖 게임 규칙</button>' +
      '</div>' +
      numberPanel(meta) +
      '<h2 class="panel-title" style="margin:4px 0 12px">모둠 방 선택 <span class="hint">(' + esc(meta.players) + ')</span></h2>' +
      '<div class="group-grid">' + cards + '</div>' +
      '<div class="entry-tools">' +
        '<button class="tool-card" data-action="mini.bot" data-game="' + gameId + '">' +
          '<span class="tool-emoji">🤖</span>' +
          '<span class="tool-body"><span class="tool-title">AI 봇 연습</span>' +
          '<span class="tool-desc">혼자서도 바로 게임을 해 볼 수 있어요 (서버 없이도 가능)</span></span>' +
        '</button>' +
        '<button class="tool-card" data-action="mini.teacher" data-game="' + gameId + '">' +
          '<span class="tool-emoji">👩‍🏫</span>' +
          '<span class="tool-body"><span class="tool-title">교사 관전</span>' +
          '<span class="tool-desc">모둠 방 진행 상황을 보고 관전합니다</span></span>' +
        '</button>' +
        '<button class="tool-card" data-action="mini.createRoom" data-game="' + gameId + '">' +
          '<span class="tool-emoji">➕</span>' +
          '<span class="tool-body"><span class="tool-title">새 방 만들기</span>' +
          '<span class="tool-desc">모둠 방이 부족할 때 새 방 코드를 만들어 나눠 줍니다</span></span>' +
        '</button>' +
      '</div>' +
      '<div class="panel" style="margin-top:16px">' +
        '<div class="panel-title">🔗 방 코드로 입장</div>' +
        '<div class="row">' +
          '<input id="room-code" class="input" placeholder="방 코드 (예: 3 또는 AB12)" maxlength="6" style="max-width:220px;text-transform:uppercase">' +
          '<button class="btn" data-action="mini.enterByCode" data-game="' + gameId + '">입장</button>' +
        '</div>' +
      '</div>' +
      '<div class="portal-foot">' +
        '<span><span class="conn-dot ' + (BG.net.connected ? 'on' : '') + '"></span>' +
          (BG.net.connected ? '실시간 서버 연결됨' : '서버 연결 없음 — AI 봇 연습은 그대로 사용할 수 있어요') + '</span>' +
      '</div>';

    BG.ui.screen(html, 'mg.' + gameId + '.entry');
  }

  /* ---------------- 대기방 ---------------- */

  function lobbyOptions(meta, room) {
    const isHost = room.youAreHost;
    if (meta.id === 'liar') {
      const cats = [{ id: '', name: '무작위' }].concat(
        (BG.liarCategories || [
          { id: 'food', name: '음식' }, { id: 'animal', name: '동물' }, { id: 'school', name: '학교' },
          { id: 'job', name: '직업' }, { id: 'place', name: '장소' }, { id: 'play', name: '놀이' }
        ])
      );
      const cur = (room.options && room.options.category) || '';
      if (!isHost) {
        const found = cats.find(function (c) { return c.id === cur; });
        return '<p class="hint">주제: <b>' + esc(found ? found.name : '무작위') + '</b></p>';
      }
      return '<label class="field">힌트 주제' +
        '<select class="input" data-action="mini.option" data-game="liar" data-name="category">' +
          cats.map(function (c) {
            return '<option value="' + esc(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>' + esc(c.name) + '</option>';
          }).join('') +
        '</select></label>';
    }
    if (meta.id === 'rummi') {
      const cur = Number((room.options && room.options.initialPoints) || 30);
      if (!isHost) return '<p class="hint">처음 등록 점수: <b>' + cur + '점</b></p>';
      return '<label class="field">처음 등록 점수' +
        '<select class="input" data-action="mini.option" data-game="rummi" data-name="initialPoints">' +
          [30, 15].map(function (n) {
            return '<option value="' + n + '"' + (n === cur ? ' selected' : '') + '>' + n + '점' + (n === 15 ? ' (수업용 간단)' : ' (기본)') + '</option>';
          }).join('') +
        '</select></label>';
    }
    if (meta.id === 'yut') {
      const pieces = (room.options && room.options.pieces) || 2;
      if (!isHost) return '<p class="hint">말 개수: <b>' + pieces + '개</b></p>';
      return '<label class="field">말 개수' +
        '<select class="input" data-action="mini.option" data-game="yut" data-name="pieces">' +
          [2, 3, 4].map(function (n) {
            return '<option value="' + n + '"' + (n === pieces ? ' selected' : '') + '>' + n + '개</option>';
          }).join('') +
        '</select></label>';
    }
    return '';
  }

  function lobbyHtml(meta, room) {
    const isHost = room.youAreHost;
    const mySeat = room.seats.find(function (s) { return s.id === room.youId; });
    const seats = room.seats.map(function (s) {
      const tags = [];
      if (s.isHost) tags.push('<span class="tag host">방장</span>');
      if (s.id === room.youId) tags.push('<span class="tag you">나</span>');
      if (s.isBot) tags.push('<span class="tag bot">AI 봇</span>');
      if (!s.isBot && s.ready) tags.push('<span class="tag ready">준비 완료</span>');
      if (!s.isBot && !s.connected) tags.push('<span class="tag off">연결 끊김</span>');
      return '<div class="seat ' + (s.id === room.youId ? 'is-self' : '') + '">' +
        '<span class="seat-avatar">' + (BG.avatars ? BG.avatars.html(s, 'sm') : '') + '</span>' +
        '<div class="seat-main"><div class="seat-name">' + esc(s.name) + '</div>' +
          '<div class="seat-sub">' + (s.isBot ? '자동으로 플레이합니다' : s.ready ? '준비 완료' : '준비를 기다리는 중') + '</div></div>' +
        '<div class="tags">' + tags.join('') + '</div>' +
      '</div>';
    }).join('');
    const empty = [];
    for (let i = room.seats.length; i < room.capacity; i++) {
      empty.push('<div class="seat" style="opacity:.5"><div class="seat-avatar avatar">＋</div>' +
        '<div class="seat-main"><div class="seat-name">빈 자리</div><div class="seat-sub">친구가 입장할 수 있어요</div></div></div>');
    }

    return '<div class="entry-top">' +
        '<a class="back-link" href="#/' + meta.id + '">← 모둠 선택</a>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-ghost btn-sm" data-action="mini.rules" data-game="' + meta.id + '">📖 규칙</button>' +
      '</div>' +
      '<div class="screen-head">' +
        '<div>' +
          '<h1 class="room-name">' + esc(room.name) + ' ' + statusBadge('waiting') + '</h1>' +
          '<p class="page-sub">' + esc(meta.desc) + '</p>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" data-action="mini.leave">🚪 방 나가기</button>' +
      '</div>' +
      '<div class="lobby-wrap">' +
        '<div class="panel">' +
          '<div class="panel-title">👥 참가자 <span class="hint">' + room.seats.length + '/' + room.capacity + '명</span></div>' +
          '<div class="seat-list">' + seats + empty.join('') + '</div>' +
          '<div class="row" style="margin-top:14px">' +
            (isHost
              ? '<button class="btn" data-action="mini.addBot" ' + (room.seats.length >= room.capacity ? 'disabled' : '') + '>🤖 봇 추가</button>' +
                '<button class="btn btn-ghost" data-action="mini.removeBot">봇 내보내기</button>'
              : '') +
          '</div>' +
        '</div>' +
        '<div class="stack">' +
          '<div class="panel">' +
            '<div class="panel-title">🎮 게임 준비</div>' +
            '<div class="code-chip">방 코드 <b class="mono" style="font-size:16px">' + esc(room.code) + '</b></div>' +
            '<div class="stack" style="margin-top:14px">' +
              lobbyOptions(meta, room) +
              (isHost
                ? '<button class="btn btn-primary btn-block" data-action="mini.start"' + (room.canStart ? '' : ' disabled') + '>▶ 게임 시작</button>'
                : '<button class="btn btn-block" data-action="mini.ready" aria-pressed="' + (mySeat && mySeat.ready ? 'true' : 'false') + '">' +
                  (mySeat && mySeat.ready ? '준비 취소' : '준비 완료') + '</button>') +
            '</div>' +
            '<p class="hint" style="margin-top:12px">' +
              (room.canStart ? '모두 준비되면 방장이 게임을 시작할 수 있어요.' : '최소 ' + room.minPlayers + '명이 필요합니다. 봇을 추가해 인원을 채울 수 있어요.') +
            '</p>' +
          '</div>' +
          '<div class="panel">' +
            '<div class="panel-title">🎒 내 기록</div>' +
            '<div class="row" style="align-items:center;gap:10px">' +
              (BG.avatars ? BG.avatars.html({ number: BG.state.number, name: myLabel() }, 'sm') : '') +
              '<b>' + esc(myLabel()) + '</b><span class="spacer"></span>' + myRecordLine() +
            '</div>' +
            '<div class="lobby-rank" style="margin-top:12px">' + (BG.hg && BG.hg.classRankingHtml ? BG.hg.classRankingHtml(5, true) : '') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function myRecordLine() {
    return BG.hg && BG.hg.myRecordLine ? BG.hg.myRecordLine() : '';
  }

  /* ---------------- 게임 화면 ---------------- */

  function joinPanel(meta, code) {
    return '<div class="entry-top"><a class="back-link" href="#/' + meta.id + '">← 모둠 선택</a></div>' +
      '<div class="panel center-panel">' +
        '<div class="mg-head-emoji">' + meta.emoji + '</div>' +
        '<h1 class="entry-title">' + esc(meta.title) + ' · ' + esc(code) + ' 방</h1>' +
        '<p class="page-sub">출석번호와 이름을 넣고 입장해 주세요.</p>' +
        numberPanel(meta) +
        '<button class="btn btn-primary btn-block" data-action="mini.joinCode" data-code="' + esc(code) + '">입장하기 →</button>' +
      '</div>';
  }

  function logHtml(game) {
    const log = (game && game.log) || [];
    return '<ul class="mg-log">' + log.slice(-6).reverse().map(function (row) {
      return '<li>' + esc(row.text) + '</li>';
    }).join('') + '</ul>';
  }

  function playersPanel(meta, game, room) {
    const rows = (game.players || []).map(function (p) {
      const badges = [];
      if (game.turnPlayerId && game.turnPlayerId === p.id) badges.push('<span class="tag now">차례</span>');
      if (p.isBot) badges.push('<span class="tag bot">봇</span>');
      if (p.id === (room ? room.youId : null)) badges.push('<span class="tag you">나</span>');
      let status = '';
      if (meta.id === 'streams') status = (p.score || 0) + '칸 · ' + (p.filled || 0) + '/20';
      else if (meta.id === 'gomoku') status = p.stone === 1 ? '흑(먼저)' : '백';
      else if (meta.id === 'liar') status = p.hint ? '“' + p.hint + '”' : '힌트 전';
      else if (meta.id === 'yut') status = (p.finishedCount || 0) + '/' + p.pieces.length + ' 완주';
      else if (meta.id === 'rummi') status = '남은 타일 ' + (p.count === undefined ? 0 : p.count) + '장';
      else if (meta.id === 'oldmaid') status = p.finished ? (p.rank ? p.rank + '등' : '완료') : '카드 ' + (p.count || 0) + '장';
      else if (meta.id === 'janggi') status = p.side === 'cho' ? '초(먼저)' : '한';
      else if (meta.id === 'onecard') status = '카드 ' + (p.count || 0) + '장';
      else if (meta.id === 'dots') status = (p.score || 0) + '칸';
      return '<div class="mg-player-row' + (game.turnPlayerId === p.id ? ' is-turn' : '') + '">' +
        (BG.avatars ? BG.avatars.html(p, 'xs') : '') +
        '<span class="mg-player-name">' + esc(p.name) + '</span>' +
        '<span class="mg-player-status">' + esc(status) + '</span>' +
        '<span class="tags">' + badges.join('') + '</span>' +
      '</div>';
    }).join('');

    return '<div class="panel">' +
      '<div class="panel-title">👥 참가자' + (room ? ' <span class="hint">' + room.seats.length + '/' + room.capacity + '명</span>' : '') + '</div>' +
      '<div class="mg-player-list">' + rows + '</div>' +
      (room
        ? '<div class="mg-room-actions">' +
            (room.youAreHost && room.status === 'playing'
              ? '<button class="btn btn-sm btn-danger" data-action="mini.endGame">⏹ 게임 종료</button>'
              : '') +
            (room.role === 'spectator'
              ? '<button class="btn btn-sm" data-action="mini.stopWatch">관전 그만보기</button>'
              : '<button class="btn btn-sm btn-ghost" data-action="mini.leave">🚪 나가기</button>') +
          '</div>'
        : '') +
    '</div>';
  }

  function miniGameMeta(id) {
    return GAMES[id];
  }

  function gameScreenHtml(meta, game, room, opts) {
    const o = opts || {};
    const boardFn = BG.miniBoards && BG.miniBoards[meta.id];
    const board = boardFn ? boardFn(game, { room: room }) : '<div class="empty">보드를 그릴 수 없습니다.</div>';
    const heading = room
      ? '<h1 class="room-name">' + esc(room.name) + ' ' + statusBadge(room.status) + '</h1>'
      : '<h1 class="room-name">' + meta.emoji + ' ' + esc(meta.title) + ' <span class="badge ready">연습</span></h1>';
    return '<div class="entry-top">' +
        '<a class="back-link" href="#/' + meta.id + '">← ' + (o.bot ? '연습 그만하기' : '모둠 선택') + '</a>' +
        '<span class="spacer"></span>' +
        (room && room.role === 'spectator' ? '<span class="badge">👀 관전 중</span>' : '') +
        '<button class="btn btn-ghost btn-sm" data-action="mini.rules" data-game="' + meta.id + '">📖 규칙</button>' +
      '</div>' +
      '<div class="screen-head mg-head"><div>' + heading +
        '<p class="page-sub">' + esc(meta.desc) + '</p></div></div>' +
      '<div class="mg-game">' +
        '<div class="mg-main">' + board + '</div>' +
        '<div class="mg-side">' + playersPanel(meta, game, room) +
          '<div class="panel"><div class="panel-title">📣 진행 상황</div>' + logHtml(game) + '</div>' +
        '</div>' +
      '</div>';
  }

  function resultModal(meta, ranking, opts) {
    const o = opts || {};
    ranking = ranking || [];
    const medal = ['🥇', '🥈', '🥉'];
    const rows = ranking.map(function (row, i) {
      return '<li class="mg-result-row' + (row.rank === 1 ? ' is-first' : '') + '">' +
        '<span class="mg-result-medal">' + (medal[row.rank - 1] || row.rank) + '</span>' +
        (BG.avatars ? BG.avatars.html(row, 'xs') : '') +
        '<span class="mg-result-name">' + esc(row.name) + '</span>' +
        '<span class="mg-result-sub">' + esc(row.result || (row.score !== undefined && meta.id === 'streams' ? row.score + '칸' : '')) + '</span>' +
        (o.points && o.points[row.number] !== undefined ? '<span class="mg-result-points">+' + o.points[row.number] + 'P</span>' : '') +
      '</li>';
    }).join('');
    BG.ui.modal(
      '<div class="mg-result">' +
        '<div class="mg-result-emoji">🏁</div>' +
        '<h2>' + esc(meta.title) + ' 결과</h2>' +
        '<ul class="mg-result-list">' + rows + '</ul>' +
        '<div class="row" style="margin-top:16px;justify-content:center">' +
          (o.again ? '<button class="btn btn-primary" data-action="mini.again">🔁 다시 하기</button>' : '') +
          '<button class="btn" data-action="mini.closeResult">확인</button>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------------- 방 화면 라우팅 ---------------- */

  function renderRoomScreen(params) {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) { BG.navigate('/'); return; }
    const code = String(params && params[0] || '').toUpperCase();
    ensureConnected();
    if (!S.room || String(S.room.code) !== code || S.room.gameId !== meta.id) {
      const seat = getSeat(meta.id);
      const canResume = seat && String(seat.code) === code;
      if (!canResume) {
        BG.ui.screen(joinPanel(meta, code), 'mg.' + meta.id + '.join');
        return;
      }
      if (BG.net.connected) {
        BG.net.send({ t: 'resume', gameId: meta.id, code: code, classCode: BG.state.classCode, token: seat.token });
      }
      BG.ui.screen(joinPanel(meta, code), 'mg.' + meta.id + '.join');
      return;
    }
    const room = S.room;
    if (room.status === 'waiting') {
      BG.ui.screen(lobbyHtml(meta, room), 'mg.' + meta.id + '.room');
      return;
    }
    BG.ui.screen(gameScreenHtml(meta, room.game, room, {}), 'mg.' + meta.id + '.room');
  }

  function renderWatch(params) {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) { BG.navigate('/'); return; }
    const code = String(params && params[0] || '').toUpperCase();
    ensureConnected();
    const token = BG.teacherToken(BG.state.classCode);
    if (!token) {
      BG.ui.screen(
        '<div class="entry-top"><a class="back-link" href="#/' + meta.id + '">← 모둠 선택</a></div>' +
        '<div class="panel center-panel">' +
          '<div class="mg-head-emoji">👩‍🏫</div>' +
          '<h1 class="entry-title">교사 확인</h1>' +
          '<p class="page-sub">' + esc(BG.className() || BG.state.classCode) + '의 교사 비밀번호를 넣으면 관전할 수 있어요.</p>' +
          '<div class="row" style="justify-content:center">' +
            '<input id="mg-pin" class="input" type="password" inputmode="numeric" maxlength="8" placeholder="교사 비밀번호" style="max-width:200px">' +
            '<button class="btn btn-primary" data-action="mini.authTeacher" data-code="' + esc(code) + '">확인</button>' +
          '</div>' +
          '<p class="hint" style="margin-top:12px">연습 교실(DEMO)은 암호 없이 관전할 수 있어요.</p>' +
        '</div>',
        'mg.' + meta.id + '.watch'
      );
      return;
    }
    if (BG.net.connected && !S.spectateSent[code]) {
      S.spectateSent[code] = true;
      BG.net.send({ t: 'spectate', gameId: meta.id, code: code, classCode: BG.state.classCode });
    }
    if (S.room && S.room.role === 'spectator' && S.room.game) {
      BG.ui.screen(gameScreenHtml(meta, S.room.game, S.room, {}), 'mg.' + meta.id + '.watch');
      return;
    }
    BG.ui.screen(
      '<div class="entry-top"><a class="back-link" href="#/' + meta.id + '">← 모둠 선택</a></div>' +
      '<div class="panel center-panel"><div class="mg-head-emoji">👀</div>' +
        '<h1 class="entry-title">' + esc(meta.title) + ' 관전</h1>' +
        '<p class="page-sub">' + esc(code) + ' 방을 불러오는 중입니다…</p></div>',
      'mg.' + meta.id + '.watch'
    );
  }

  function renderTeacher(gameId) {
    const meta = miniGameMeta(gameId);
    if (!meta) { BG.navigate('/'); return; }
    ensureConnected();
    const rooms = S.rooms.filter(function (r) { return r.gameId === gameId; });
    const cards = rooms.map(function (room) {
      const active = room.status === 'playing' || room.status === 'finished';
      return '<div class="panel mg-teacher-card">' +
        '<div class="row" style="justify-content:space-between;align-items:center">' +
          '<b>' + esc(room.name) + '</b>' + statusBadge(room.status) +
        '</div>' +
        '<div class="hint">' + (room.seats || []).map(function (s) { return esc(s.name); }).join(', ') + '</div>' +
        '<div class="hint">' + esc(room.lastEvent || '') + '</div>' +
        (active ? '<button class="btn btn-sm btn-primary" data-action="mini.watch" data-code="' + esc(room.code) + '">👀 관전</button>' : '') +
      '</div>';
    }).join('');
    BG.ui.screen(
      '<div class="entry-top"><a class="back-link" href="#/' + meta.id + '">← 모둠 선택</a>' +
        '<span class="spacer"></span><span class="badge">👩‍🏫 교사</span></div>' +
      '<div class="screen-head"><div><h1 class="entry-title">' + meta.emoji + ' ' + esc(meta.title) + ' 관전</h1>' +
        '<p class="page-sub">' + esc(BG.className() || BG.state.classCode) + '의 모둠 방입니다. 교사 비밀번호로 확인한 뒤 관전할 수 있어요.</p></div></div>' +
      '<div class="mg-teacher-grid">' + (cards || '<div class="empty">아직 방이 없습니다.</div>') + '</div>',
      'mg.' + meta.id + '.teacher'
    );
  }

  /* ---------------- AI 봇 연습 ---------------- */

  function renderBotScreen(gameId) {
    const meta = miniGameMeta(gameId);
    if (!meta) { BG.navigate('/'); return; }
    if (S.bot.gameId !== gameId) {
      S.bot = { gameId: gameId, game: null, driver: null, timer: null, players: Math.min(meta.capacity, Math.max(meta.minPlayers, meta.botSeats + 1)), running: false, resultShown: false };
    }
    if (S.bot.game && S.bot.game.status !== 'finished') {
      const state = S.bot.game.stateFor('me');
      BG.ui.screen(gameScreenHtml(meta, state, null, { bot: true }), 'mg.' + gameId + '.bot');
      return;
    }
    const count = S.bot.players;
    const counts = [];
    for (let n = meta.minPlayers; n <= meta.capacity; n++) counts.push(n);
    BG.ui.screen(
      '<div class="entry-top"><a class="back-link" href="#/' + meta.id + '">← 모둠 선택</a></div>' +
      '<div class="panel center-panel">' +
        '<div class="mg-head-emoji">🤖</div>' +
        '<h1 class="entry-title">' + meta.emoji + ' AI 봇 연습</h1>' +
        '<p class="page-sub">혼자서 <b>' + esc(meta.title) + '</b> 연습을 해 보세요. 친구 없이도 바로 시작할 수 있어요.</p>' +
        '<label class="field" style="max-width:260px;margin:0 auto 14px">인원' +
          '<select id="mg-bot-count" class="input">' +
            counts.map(function (n) {
              return '<option value="' + n + '"' + (n === count ? ' selected' : '') + '>' + n + '명 (나 + 봇 ' + (n - 1) + ')</option>';
            }).join('') +
          '</select>' +
        '</label>' +
        '<button class="btn btn-primary btn-block" data-action="mini.startBot" data-game="' + gameId + '">▶ 연습 시작</button>' +
        '<ol class="rules-list" style="text-align:left;margin-top:18px">' +
          meta.rules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') +
        '</ol>' +
      '</div>',
      'mg.' + gameId + '.bot'
    );
  }

  function startBotGame(gameId, count) {
    const meta = miniGameMeta(gameId);
    const engine = engineOf(gameId);
    if (!meta || !engine) { BG.ui.toast('지금은 연습을 시작할 수 없습니다.', 'error'); return; }
    const label = myLabel();
    const players = [{ id: 'me', name: label, number: validNumber(BG.state.number) || null, isBot: false }];
    const botNames = ['로봇 별이', '로봇 솔이', '로봇 보리', '로봇 루나', '로봇 콩이'];
    for (let i = 1; i < count; i++) {
      players.push({ id: 'bot' + i, name: botNames[i - 1] || ('봇' + i), number: null, isBot: true });
    }
    let game;
    const options = { seed: Date.now() % 100000 };
    if (gameId === 'streams') game = new engine.Game(players, options);
    else if (gameId === 'gomoku') game = new engine.Game(players, options);
    else if (gameId === 'liar') game = new engine.Game(players, options);
    else if (gameId === 'yut') game = new engine.Game(players, Object.assign({ pieces: 2 }, options));
    else if (gameId === 'rummi') game = new engine.Game(players, Object.assign({ options: { initialPoints: 15 } }, options));
    else if (gameId === 'oldmaid') game = new engine.Game(players, options);
    else if (gameId === 'janggi') game = new engine.Game(players, options);
    else if (gameId === 'onecard') game = new engine.Game(players, options);
    else if (gameId === 'dots') game = new engine.Game(players, options);
    if (!game) return;
    S.bot = {
      gameId: gameId,
      game: game,
      driver: new engine.BotDriver(game),
      timer: null,
      players: count,
      running: true,
      resultShown: false
    };
    stopBotLoop();
    renderBotScreen(gameId);
    scheduleBotTick(350);
  }

  function stopBotLoop() {
    if (S.bot.timer) {
      clearTimeout(S.bot.timer);
      S.bot.timer = null;
    }
  }

  function scheduleBotTick(delay) {
    stopBotLoop();
    S.bot.timer = setTimeout(botTick, delay || 500);
  }

  function botTick() {
    const st = S.bot;
    const game = st.game;
    if (!game || !st.driver) return;
    if (game.status !== 'playing') {
      finishLocal();
      return;
    }
    const action = st.driver.tick();
    if (action) {
      const result = localApply(st.gameId, game, action.playerId, action.action, action.payload);
      if (!result || !result.ok) console.warn('[mini] 봇 동작 실패', action, result);
      if (game.status === 'finished') {
        renderBotScreen(st.gameId);
        finishLocal();
        return;
      }
      renderBotScreen(st.gameId);
    }
    scheduleBotTick(action ? 620 : 500);
  }

  function finishLocal() {
    const st = S.bot;
    if (!st.game || st.resultShown) return;
    st.resultShown = true;
    const meta = miniGameMeta(st.gameId);
    resultModal(meta, st.game.ranking(), { again: false });
  }

  /* ---------------- 동작 공통 ---------------- */

  function localApply(gameId, game, playerId, action, payload) {
    const p = payload || {};
    if (gameId === 'streams') {
      if (action === 'place') return game.place(playerId, p.slot);
      if (action === 'skip') return game.skip(playerId);
      return { ok: false, reason: 'unknown_action' };
    }
    if (gameId === 'gomoku') return game.play(playerId, p);
    if (gameId === 'liar') {
      if (action === 'hint') return game.hint(playerId, p);
      if (action === 'vote') return game.vote(playerId, p);
      if (action === 'guess') return game.guessWord(playerId, p);
      return { ok: false, reason: 'unknown_action' };
    }
    if (gameId === 'yut') {
      if (action === 'throw') return game.throwYut(playerId);
      if (action === 'move') return game.move(playerId, p.pieceId);
      return { ok: false, reason: 'unknown_action' };
    }
    if (gameId === 'rummi') {
      if (action === 'play') return game.play(playerId, p);
      if (action === 'draw') return game.draw(playerId);
      return { ok: false, reason: 'unknown_action' };
    }
    if (gameId === 'oldmaid') {
      if (action === 'draw') return game.draw(playerId, p);
      return { ok: false, reason: 'unknown_action' };
    }
    if (gameId === 'janggi') {
      if (action === 'move') return game.move(playerId, p);
      return { ok: false, reason: 'unknown_action' };
    }
    if (gameId === 'onecard') {
      if (action === 'play') return game.play(playerId, p);
      if (action === 'draw') return game.draw(playerId);
      return { ok: false, reason: 'unknown_action' };
    }
    if (gameId === 'dots') {
      if (action === 'line') return game.line(playerId, p);
      return { ok: false, reason: 'unknown_action' };
    }
    return { ok: false, reason: 'unknown_game' };
  }

  /** 화면에서 낸 동작: 연습이면 바로 적용, 모둠 방이면 서버로 보냅니다. */
  function playAction(action, payload) {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) return;
    if (screenName().indexOf('.bot') !== -1) {
      const st = S.bot;
      if (!st.game || st.game.status !== 'playing') return;
      const result = localApply(meta.id, st.game, 'me', action, payload);
      if (!result || !result.ok) {
        BG.ui.toast((st.game.reasonText && st.game.reasonText(result && result.reason)) || '지금은 할 수 없어요.', 'error');
        return;
      }
      renderBotScreen(meta.id);
      if (st.game.status === 'finished') finishLocal();
      else scheduleBotTick(300);
      return;
    }
    if (screenName().indexOf('.room') !== -1) {
      if (!needServer()) return;
      BG.net.send({ t: 'action', action: action, payload: payload });
    }
  }

  function currentGameState() {
    if (screenName().indexOf('.bot') !== -1 && S.bot.game) return S.bot.game.stateFor('me');
    if (S.room && S.room.game) return S.room.game;
    return null;
  }

  /* ---------------- 동작 등록 ---------------- */

  BG.actions['mini.rules'] = function (el) {
    const meta = miniGameMeta(el.getAttribute('data-game') || routeGameId() || '');
    if (meta) rulesModal(meta);
  };

  BG.actions['mini.enterGroup'] = function (el) {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) return;
    const code = el.getAttribute('data-code');
    const number = validNumber(readNumber());
    if (!number) {
      BG.ui.toast('출석번호를 입력해 주세요.', 'error');
      const input = document.getElementById('number');
      if (input) input.focus();
      return;
    }
    if (!needServer()) return;
    BG.net.send({ t: 'join', gameId: meta.id, code: code, classCode: BG.state.classCode, number: number, studentName: readName() });
  };

  BG.actions['mini.joinCode'] = function (el) {
    BG.actions['mini.enterGroup'](el);
  };

  BG.actions['mini.enterByCode'] = function (el) {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) return;
    const input = document.getElementById('room-code');
    const code = String(input ? input.value : '').trim().toUpperCase();
    if (!code) { BG.ui.toast('방 코드를 입력해 주세요.', 'error'); return; }
    const number = validNumber(readNumber());
    if (!number) { BG.ui.toast('출석번호를 입력해 주세요.', 'error'); return; }
    if (!needServer()) return;
    BG.net.send({ t: 'join', gameId: meta.id, code: code, classCode: BG.state.classCode, number: number, studentName: readName() });
  };

  BG.actions['mini.reenter'] = function (el) {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) return;
    const code = el.getAttribute('data-code');
    const seat = getSeat(meta.id);
    if (seat && String(seat.code) === String(code).toUpperCase() && BG.net.connected) {
      BG.net.send({ t: 'resume', gameId: meta.id, code: code, classCode: BG.state.classCode, token: seat.token });
      BG.ui.toast('다시 접속합니다.', 'ok');
      return;
    }
    BG.navigate('/' + meta.id + '/room/' + code);
  };

  BG.actions['mini.createRoom'] = function () {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) return;
    const number = validNumber(readNumber());
    if (!number) { BG.ui.toast('출석번호를 입력해 주세요.', 'error'); return; }
    if (!needServer()) return;
    BG.net.send({ t: 'create', gameId: meta.id, classCode: BG.state.classCode, number: number, studentName: readName() });
  };

  BG.actions['mini.ready'] = function () {
    if (!S.room) return;
    const me = S.room.seats.find(function (s) { return s.id === S.room.youId; });
    if (!needServer()) return;
    BG.net.send({ t: 'ready', ready: !(me && me.ready) });
  };

  BG.actions['mini.start'] = function () {
    if (!needServer()) return;
    BG.net.send({ t: 'start' });
  };

  BG.actions['mini.addBot'] = function () {
    if (!needServer()) return;
    BG.net.send({ t: 'addBot' });
  };

  BG.actions['mini.removeBot'] = function () {
    if (!needServer()) return;
    BG.net.send({ t: 'removeBot' });
  };

  BG.actions['mini.leave'] = function () {
    if (!S.bot.game || screenName().indexOf('.bot') === -1) {
      if (BG.net.connected) BG.net.send({ t: 'leave' });
    }
    stopBotLoop();
    S.room = null;
    const meta = miniGameMeta(routeGameId() || '');
    if (meta) {
      clearSeat(meta.id);
      BG.navigate('/' + meta.id);
    } else {
      BG.navigate('/');
    }
  };

  BG.actions['mini.endGame'] = function () {
    if (!needServer()) return;
    BG.net.send({ t: 'endGame' });
  };

  BG.actions['mini.option'] = function (el) {
    if (!needServer()) return;
    const name = el.getAttribute('data-name');
    if (name === 'category') BG.net.send({ t: 'option', category: el.value });
    else if (name === 'pieces') BG.net.send({ t: 'option', pieces: Number(el.value) });
    else if (name === 'initialPoints') BG.net.send({ t: 'option', initialPoints: Number(el.value) });
  };

  BG.actions['mini.teacher'] = function (el) {
    const meta = miniGameMeta(el.getAttribute('data-game') || routeGameId() || '');
    if (meta) BG.navigate('/' + meta.id + '/teacher');
  };

  BG.actions['mini.watch'] = function (el) {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) return;
    const code = el.getAttribute('data-code');
    if (code) BG.navigate('/' + meta.id + '/watch/' + code);
  };

  BG.actions['mini.stopWatch']  = function () {
    if (BG.net.connected) BG.net.send({ t: 'stopSpectate' });
    const meta = miniGameMeta(routeGameId() || '');
    S.room = null;
    if (meta) BG.navigate('/' + meta.id);
  };

  BG.actions['mini.authTeacher'] = function () {
    const input = document.getElementById('mg-pin');
    const pin = String(input ? input.value : '').replace(/[^0-9]/g, '');
    if (!pin) { BG.ui.toast('교사 비밀번호를 입력해 주세요.', 'error'); return; }
    if (!needServer()) return;
    S.authPending = true;
    S.spectateSent = {};
    BG.net.send({ t: 'classAuth', code: BG.state.classCode, pin: pin });
  };

  BG.actions['mini.bot'] = function (el) {
    const meta = miniGameMeta(el.getAttribute('data-game') || routeGameId() || '');
    if (!meta) return;
    BG.navigate('/' + meta.id + '/bot');
  };

  BG.actions['mini.startBot'] = function (el) {
    const gameId = el.getAttribute('data-game') || routeGameId();
    const sel = document.getElementById('mg-bot-count');
    const count = sel ? Number(sel.value) : 2;
    startBotGame(gameId, Math.max(1, Math.min(6, count)));
  };

  BG.actions['mini.closeResult'] = function () {
    BG.ui.closeModal();
  };

  BG.actions['mini.again'] = function () {
    BG.ui.closeModal();
    if (!needServer()) return;
    BG.net.send({ t: 'start' });
  };

  /* ----- 게임별 동작 ----- */

  BG.actions['mini.place'] = function (el) {
    const slot = Number(el.getAttribute('data-slot'));
    playAction('place', { slot: slot });
  };

  BG.actions['mini.gomokuPlay'] = function (el) {
    playAction('play', { x: Number(el.getAttribute('data-x')), y: Number(el.getAttribute('data-y')) });
  };

  BG.actions['mini.hint'] = function () {
    const input = document.getElementById('mg-hint-input');
    const text = String(input ? input.value : '').trim();
    if (!text) { BG.ui.toast('힌트를 한 줄 적어 주세요.', 'error'); return; }
    if (screenName().indexOf('.bot') !== -1) {
      playAction('hint', { text: text });
      return;
    }
    if (!needServer()) return;
    BG.net.send({ t: 'action', action: 'hint', payload: { text: text } });
  };

  BG.actions['mini.vote'] = function (el) {
    playAction('vote', { targetId: el.getAttribute('data-target') });
  };

  BG.actions['mini.guess'] = function (el) {
    playAction('guess', { word: el.getAttribute('data-word') });
  };

  BG.actions['mini.throw'] = function () {
    playAction('throw', {});
  };

  BG.actions['mini.move'] = function (el) {
    playAction('move', { pieceId: el.getAttribute('data-piece') });
  };

  /* 힌트 입력창에서 Enter 를 누르면 바로 말합니다. */
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    const el = event.target;
    if (!el || el.id !== 'mg-hint-input') return;
    event.preventDefault();
    BG.actions['mini.hint']();
  });

  /* ---------------- 서버 메시지 ---------------- */

  function rerender() {
    const screen = screenName();
    if (screen === 'mg.' + (routeGameId() || '') + '.bot') {
      renderBotScreen(routeGameId());
    } else if (screen === 'mg.' + (routeGameId() || '') + '.room') {
      renderRoomScreen([S.room ? S.room.code : (BG.currentPath().split('/').pop() || '')]);
    } else if (screen === 'mg.' + (routeGameId() || '') + '.watch') {
      renderWatch([(S.room ? S.room.code : BG.currentPath().split('/').pop())]);
    } else if (screen === 'mg.' + (routeGameId() || '') + '.teacher') {
      renderTeacher(routeGameId());
    } else if (screen === 'mg.' + (routeGameId() || '') + '.entry') {
      renderEntry(routeGameId());
    }
  }

  BG.net.on('welcome', function (msg) {
    S.rooms = msg.rooms || [];
    const id = routeGameId();
    if (!id) return;
    if (screenName() === 'mg.' + id + '.entry') refreshEntryRooms(id);
    else if (screenName() === 'mg.' + id + '.teacher') renderTeacher(id);
  });

  BG.net.on('rooms', function (msg) {
    S.rooms = msg.rooms || [];
    const id = routeGameId();
    if (!id) return;
    if (screenName() === 'mg.' + id + '.entry') refreshEntryRooms(id);
    else if (screenName() === 'mg.' + id + '.teacher') renderTeacher(id);
  });

  BG.net.on('class_stats', function (msg) {
    if (!msg || msg.classCode !== BG.state.classCode) return;
    S.stats = msg.stats || [];
    if (screenName() === 'class' && BG.portal) BG.portal.classPortalHtml();
  });

  BG.net.on('joined', function (msg) {
    if (!msg || !GAMES[msg.gameId]) return;
    const meta = GAMES[msg.gameId];
    saveSeat(meta.id, { gameId: meta.id, code: msg.code, token: msg.token, playerId: msg.playerId });
    S.resumeSent = {};
    const path = BG.currentPath();
    if (path.indexOf('/' + meta.id + '/room/') !== 0) {
      BG.navigate('/' + meta.id + '/room/' + msg.code);
    }
    if (msg.created) BG.ui.toast('새 방을 만들었습니다. 코드 ' + msg.code, 'ok');
    else if (msg.resumed) BG.ui.toast('다시 접속했습니다.', 'ok');
  });

  BG.net.on('room', function (msg) {
    if (!msg || !msg.room || !GAMES[msg.room.gameId]) return;
    const meta = GAMES[msg.room.gameId];
    S.room = msg.room;
    S.role = msg.room.role;
    const path = BG.currentPath();
    if (path.indexOf('/' + meta.id + '/room/') === 0) {
      if (msg.room.status === 'waiting') BG.ui.screen(lobbyHtml(meta, msg.room), 'mg.' + meta.id + '.room');
      else BG.ui.screen(gameScreenHtml(meta, msg.room.game, msg.room, {}), 'mg.' + meta.id + '.room');
    } else if (path.indexOf('/' + meta.id + '/watch/') === 0) {
      if (msg.room.game) BG.ui.screen(gameScreenHtml(meta, msg.room.game, msg.room, {}), 'mg.' + meta.id + '.watch');
    }
  });

  BG.net.on('spectating', function (msg) {
    if (!msg || !GAMES[msg.gameId]) return;
    BG.ui.toast(msg.name + ' 관전을 시작합니다.', 'ok');
  });

  BG.net.on('game_result', function (msg) {
    if (!msg || !GAMES[msg.gameId]) return;
    if (msg.classCode !== BG.state.classCode) return;
    const meta = GAMES[msg.gameId];
    const key = msg.gameId + ':' + msg.recordedAt;
    if (!BG.markResultSeen(key)) return;
    S.lastResult = msg;
    const myNumber = validNumber(BG.state.number);
    if (myNumber && msg.points && msg.points[myNumber] !== undefined) {
      const row = (msg.ranking || []).find(function (r) { return r.number === myNumber; });
      BG.addRecord(BG.state.classCode, myNumber, {
        wins: row && row.rank === 1 ? 1 : 0,
        points: msg.points[myNumber]
      });
    }
    if (screenName() === 'mg.' + meta.id + '.room' || screenName() === 'mg.' + meta.id + '.watch') {
      const game = S.room && S.room.game ? S.room.game : null;
      const ranking = (game && game.status === 'finished' && game.ranking) ? game.ranking : (msg.ranking || []);
      resultModal(meta, ranking, {
        points: msg.points,
        again: !!(S.room && S.room.youAreHost)
      });
    }
  });

  BG.net.on('class_auth_ok', function (msg) {
    if (!msg || !msg['class']) return;
    const cls = msg['class'];
    BG.setClass(cls.code, cls.name);
    if (msg.teacherToken) BG.setTeacherToken(cls.code, msg.teacherToken);
    S.spectateSent = {};
    if (screenName() === 'mg.' + (routeGameId() || '') + '.watch') {
      const path = BG.currentPath();
      const code = path.split('/').pop();
      renderWatch([code]);
    } else if (screenName() === 'mg.' + (routeGameId() || '') + '.teacher') {
      renderTeacher(routeGameId());
    }
  });

  BG.net.on('room_reset', function (msg) {
    if (msg && msg.gameId && !GAMES[msg.gameId]) return;
    BG.ui.toast(msg.message || '방이 초기화되었습니다.', 'ok');
    if (msg && msg.gameId) clearSeat(msg.gameId);
    S.room = null;
    S.spectateSent = {};
    if (screenName().indexOf('mg.') === 0) {
      const meta = miniGameMeta(routeGameId() || '');
      if (meta) BG.navigate('/' + meta.id);
      else BG.navigate('/');
    }
  });

  BG.net.on('action_result', function (msg) {
    if (!msg) return;
    if (msg.ok === false && msg.message) BG.ui.toast(msg.message, 'error');
    else if (msg.ok === true && msg.message) BG.ui.toast(msg.message, 'ok');
  });

  BG.net.on('error', function (msg) {
    if (!msg) return;
    if (screenName().indexOf('mg.') !== 0) return;
    BG.ui.toast(msg.message || '요청을 처리할 수 없습니다.', 'error');
    const code = msg.code;
    if (code === 'teacher_auth_required') {
      BG.setTeacherToken(BG.state.classCode, '');
      S.spectateSent = {};
      const meta = miniGameMeta(routeGameId() || '');
      if (meta) BG.navigate('/' + meta.id + '/teacher');
      return;
    }
    if (code === 'bad_pin') return;
    if (['no_seat', 'no_room', 'no_name', 'full', 'playing', 'dup_name', 'dup_number', 'bad_number', 'already_in_room'].indexOf(code) !== -1) {
      const meta = miniGameMeta(routeGameId() || '');
      if (meta) clearSeat(meta.id);
      S.room = null;
      const path = BG.currentPath();
      if (meta && path.indexOf('/' + meta.id + '/room/') === 0) BG.navigate('/' + meta.id);
    }
  });

  BG.net.on('left', function () {
    S.room = null;
  });

  BG.net.on('open', function () {
    const meta = miniGameMeta(routeGameId() || '');
    if (!meta) return;
    const path = BG.currentPath();
    if (path.indexOf('/' + meta.id + '/room/') === 0) {
      const seat = getSeat(meta.id);
      if (seat && !S.room) {
        BG.net.send({ t: 'resume', gameId: meta.id, code: seat.code, classCode: BG.state.classCode, token: seat.token });
      }
    }
  });

  BG.net.on('offline', function () {
    if (screenName().indexOf('mg.') !== 0) return;
    const meta = miniGameMeta(routeGameId() || '');
    if (meta) renderEntry(meta.id);
  });

  /* ---------------- 라우트 ---------------- */

  IDS.forEach(function (id) {
    BG.router.add(new RegExp('^/' + id + '$'), 'mg.' + id + '.entry', function () {
      S.rooms = S.rooms || [];
      renderEntry(id);
    });
    BG.router.add(new RegExp('^/' + id + '/room/([^/]+)$'), 'mg.' + id + '.room', function (params) {
      renderRoomScreen(params);
    });
    BG.router.add(new RegExp('^/' + id + '/watch/([^/]+)$'), 'mg.' + id + '.watch', function (params) {
      renderWatch(params);
    });
    BG.router.add(new RegExp('^/' + id + '/teacher$'), 'mg.' + id + '.teacher', function () {
      renderTeacher(id);
    });
    BG.router.add(new RegExp('^/' + id + '/bot$'), 'mg.' + id + '.bot', function () {
      renderBotScreen(id);
    });
  });

  BG.mini = {
    GAMES: GAMES,
    state: S,
    startBotGame: startBotGame,
    playAction: playAction,
    currentState: currentGameState,
    rerender: rerender
  };
})();
