/*
 * 할리갈리 화면 (입장 · 대기방 · 게임판 · 교사 관전 · AI 봇 연습)
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
    bot: { active: false, game: null, driver: null, timer: null, level: 'normal', count: 4 }
  };

  /* ---------------- 공통 도우미 ---------------- */

  function screenName() {
    return document.body.dataset.screen || '';
  }

  function readNickname() {
    const el = document.getElementById('nickname');
    const fromInput = el && el.value ? el.value.trim() : '';
    if (fromInput) {
      BG.state.nickname = fromInput.slice(0, 12);
      BG.storage.set('bg.nickname', BG.state.nickname);
      return BG.state.nickname;
    }
    return (BG.state.nickname || '').trim();
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

  function statusBadge(status) {
    if (status === 'playing') return '<span class="badge playing">진행 중</span>';
    if (status === 'finished') return '<span class="badge finished">종료</span>';
    return '<span class="badge ready">대기 중</span>';
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
      '<h2>🔔 할리갈리 규칙</h2>' +
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
      '모르면 [합계 보기]를 켜서 과일별 합계를 확인하며 연습해 보세요.</p>' +
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
    const names = (room.seats || []).map(function (s) {
      return s.name + (s.isBot ? '🤖' : '');
    }).join(', ');
    const full = count >= cap;
    const canEnter = status !== 'playing' && !full;
    let label = '입장';
    if (status === 'playing') label = '진행 중';
    else if (full) label = '만석';
    else if (status === 'finished') label = '새로 시작';

    return (
      '<div class="group-card ' + cls + '">' +
        '<div class="group-head"><span class="group-name">' + esc(room.name) + '</span>' +
          '<span class="group-occ"><b>' + count + '</b>/' + cap + '명</span></div>' +
        '<div class="group-players">' + (names ? esc(names) : '아직 아무도 없어요') + '</div>' +
        '<div class="group-actions">' +
          '<button class="btn ' + (canEnter ? 'btn-primary' : '') + ' btn-sm" data-action="hg.enterGroup" data-code="' + esc(room.code) + '"' +
            (canEnter ? '' : ' disabled') + '>' + label + '</button>' +
          (status === 'playing' || status === 'finished'
            ? '<button class="btn btn-sm" data-action="hg.watch" data-code="' + esc(room.code) + '">관전</button>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  function renderEntry() {
    BG.net.connect();
    if (S.room) {
      // 모둠 선택으로 돌아오면 대기방 자리를 반납합니다.
      BG.net.send({ t: 'leave' });
      S.room = null;
      S.pendingJoin = null;
      clearSeat();
    }
    const groups = S.rooms.filter(function (r) { return r.gameId === 'halligalli'; });
    const groupCards = groups.length
      ? groups.map(groupCard).join('')
      : '<div class="empty">모둠 방 정보를 불러오는 중입니다…<br>서버가 꺼져 있다면 아래 <b>AI 봇과 연습</b>을 이용해 주세요.</div>';
    const connBadge = BG.net.connected
      ? '<span class="badge ready">서버 연결됨</span>'
      : '<span class="badge finished">서버 연결 안 됨</span>';

    const html =
      '<div class="entry-top">' +
        '<a class="back-link" href="#/">← 게임 선택</a>' +
        '<span class="spacer"></span>' +
        connBadge +
      '</div>' +
      '<div class="screen-head">' +
        '<div>' +
          '<h1 class="entry-title">🔔 할리갈리</h1>' +
          '<p class="page-sub">과일이 정확히 5개가 되는 순간, 종을 치세요! 모둠 방을 골라 입장하세요.</p>' +
        '</div>' +
      '</div>' +

      '<div class="panel" style="margin-bottom:16px">' +
        '<div class="row" style="gap:14px;align-items:flex-end">' +
          '<label class="field" style="flex:1;min-width:180px">닉네임 (최대 12자)' +
            '<input id="nickname" class="input" maxlength="12" autocomplete="nickname" placeholder="예: 지원" value="' +
              esc(BG.state.nickname || '') + '">' +
          '</label>' +
          '<button class="btn btn-ghost" data-action="hg.rules">📖 게임 규칙 보기</button>' +
        '</div>' +
      '</div>' +

      '<h2 class="panel-title" style="margin:4px 0 12px">모둠 방 선택 <span class="hint">(1모둠 ~ 6모둠)</span></h2>' +
      '<div class="group-grid">' + groupCards + '</div>' +

      '<div class="entry-tools">' +
        '<button class="tool-card" data-action="hg.bot">' +
          '<span class="tool-emoji">🤖</span>' +
          '<span><span class="tool-title">AI 봇과 연습</span>' +
          '<span class="tool-desc">혼자서도 바로 4~5인 게임을 테스트할 수 있어요</span></span>' +
        '</button>' +
        '<button class="tool-card" data-action="hg.teacher">' +
          '<span class="tool-emoji">👩‍🏫</span>' +
          '<span><span class="tool-title">교사 관전 모드</span>' +
          '<span class="tool-desc">6개 모둠의 진행 상황을 한눈에 보고 관전합니다</span></span>' +
        '</button>' +
        '<button class="tool-card" data-action="hg.createRoom">' +
          '<span class="tool-emoji">➕</span>' +
          '<span><span class="tool-title">새 방 만들기</span>' +
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
          '<div class="seat-avatar">' + (s.isBot ? '🤖' : esc(s.name.slice(0, 1))) + '</div>' +
          '<div class="seat-main"><div class="seat-name">' + esc(s.name) + '</div>' +
            '<div class="seat-sub">' + (s.isBot ? '자동으로 플레이합니다' : s.ready ? '준비 완료' : '준비를 기다리는 중') + '</div></div>' +
          '<div class="tags">' + tags.join('') + '</div>' +
        '</div>'
      );
    }).join('');

    const empty = [];
    for (let i = room.seats.length; i < room.capacity; i++) {
      empty.push('<div class="seat" style="opacity:.45"><div class="seat-avatar">＋</div>' +
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
          '<button class="btn btn-danger btn-sm" data-action="hg.leave">나가기</button>' +
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
              ? '<label class="row" style="margin-top:14px;font-size:13px;font-weight:700;color:var(--muted)">' +
                  '<input type="checkbox" data-action="hg.toggleEndTwo" ' + (room.endWhenTwo ? 'checked' : '') + ' style="width:18px;height:18px">' +
                  '2명 남았을 때 게임 종료</label>'
              : '') +
            '<p class="hint" style="margin-top:12px">' +
              (room.canStart ? '모두 준비되면 방장이 게임을 시작할 수 있어요.' : '최소 ' + room.minPlayers + '명이 필요합니다. 봇을 추가해 인원을 채울 수 있어요.') +
            '</p>' +
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
          '<span class="tile-name" title="' + esc(player.name) + '">' + esc(player.name) + (player.isBot ? ' 🤖' : '') + '</span>' +
          '<span class="tile-cards">' + player.totalCards + '장</span>' +
        '</div>' +
        '<div class="tile-card">' + card + '</div>' +
        '<div class="tile-foot">' + foot + '</div>' +
      '</div>'
    );
  }

  function bellHtml(disabled) {
    return (
      '<div class="bell-slot">' +
        '<button class="bell" data-action="hg.ring" aria-label="종 치기" ' + (disabled ? 'disabled' : '') + '>' +
          '<span>🔔</span><span class="bell-label">종</span>' +
        '</button>' +
        '<span class="bell-key">Space</span>' +
      '</div>'
    );
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
          '<div class="winner-title">' + esc(game.winner || '게임') + ' 우승!</div>' +
          '<p class="winner-sub">' + (game.status === 'finished' ? '수고했어요! 다음 판도 도전해 볼까요?' : '') + '</p>' +
          '<div class="stack">' + buttons.join('') + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function boardScreen(view) {
    const game = view.game;
    const players = game.players.slice().sort(function (a, b) { return a.seat - b.seat; });
    const tiles = players.map(function (p) { return tileHtml(p, view.youId); });
    const bellIndex = Math.ceil(tiles.length / 2);
    const canRing = game.status === 'playing' && view.role === 'player';
    tiles.splice(bellIndex, 0, bellHtml(!canRing));

    const me = players.find(function (p) { return p.id === view.youId; });
    const canFlip = view.role === 'player' && game.status === 'playing' && me && me.isTurn && me.deckCount > 0;

    const myBar = view.role === 'spectator'
      ? '<div class="spectator-note">👀 관전 중입니다 — 카드나 종을 누를 수 없어요.</div>'
      : '<div class="my-bar">' +
          '<div class="my-info">내 카드 <b>' + (me ? me.totalCards : 0) + '</b>장 · 테이블 <b>' + game.tableCount + '</b>장 · ' +
            '<span>종 ' + game.bells.correct + '회 성공 / ' + game.bells.wrong + '회 실수</span></div>' +
          '<span class="spacer"></span>' +
          '<button class="flip-btn" data-action="hg.flip" ' + (canFlip ? '' : 'disabled') + '>카드 뒤집기 <span class="key">F</span></button>' +
        '</div>';

    const subtitle = view.mode === 'bot'
      ? 'AI 봇 ' + (players.length - 1) + '명과 연습 중 · 규칙은 실제 게임과 같습니다'
      : view.role === 'spectator'
        ? '관전 모드 · 방 코드 ' + view.code
        : '방 코드 ' + view.code + ' · 친구들과 실시간 대전';

    return (
      '<div class="screen-head">' +
        '<div>' +
          '<a class="back-link" href="' + (view.role === 'spectator' ? '#/halligalli/teacher' : '#/halligalli') + '">← ' +
            (view.role === 'spectator' ? '모둠 목록' : '모둠 선택') + '</a>' +
          '<h1 class="room-name">' + esc(view.title) + ' ' +
            (view.mode === 'bot' ? '<span class="badge playing">연습</span>' : statusBadge(game.status)) + '</h1>' +
          '<p class="page-sub">' + esc(subtitle) + '</p>' +
        '</div>' +
        '<div class="board-tools">' +
          '<button class="btn btn-sm ' + (S.hint ? 'btn-gold' : '') + '" data-action="hg.hintToggle" aria-pressed="' + (S.hint ? 'true' : 'false') + '">합계 보기</button>' +
          '<button class="btn btn-sm" data-action="hg.rules">📖 규칙</button>' +
          (view.role === 'spectator'
            ? '<button class="btn btn-sm btn-danger" data-action="hg.watchBack">관전 종료</button>'
            : '<button class="btn btn-sm btn-danger" data-action="hg.leave">나가기</button>') +
        '</div>' +
      '</div>' +

      '<div class="board">' +
        '<div class="board-head">' + turnBanner(game, view.youId, view.role, view.mode) + '</div>' +
        '<div class="table">' + tiles.join('') + '</div>' +
        totalsHtml(game) +
        myBar +
        logHtml(game) +
      '</div>' +
      winnerOverlay(game, view)
    );
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
            BG.net.send({ t: 'resume', gameId: 'halligalli', code: code, token: seat.token });
          }
        } else if (!S.pendingJoin || S.pendingJoin !== code) {
          const nick = BG.state.nickname;
          if (nick) {
            S.pendingJoin = code;
            BG.net.send({ t: 'join', gameId: 'halligalli', code: code, nickname: nick });
          }
        }
      }
      BG.ui.screen(
        '<div class="center-block">' +
          (BG.state.nickname || getSeat()
            ? '<span class="spinner"></span><div>방에 입장하는 중…</div>'
            : '<div>닉네임이 필요합니다. <a href="#/halligalli">모둠 선택으로 돌아가기</a></div>') +
        '</div>',
        'hg.room'
      );
      return;
    }

    const room = S.room;
    if (room.status === 'waiting') {
      BG.ui.screen(lobbyHtml(room), 'hg.room');
      return;
    }

    BG.ui.screen(boardScreen({
      title: room.name,
      code: room.code,
      game: room.game,
      youId: room.youId,
      role: room.role,
      mode: 'multi',
      isHost: room.youAreHost
    }), 'hg.room');
  }

  function renderWatch(params) {
    const code = String(params[0] || '').toUpperCase();
    BG.net.connect();
    if (!S.room || S.room.code !== code || S.room.role !== 'spectator') {
      if (BG.net.connected && !S.spectateSent[code]) {
        S.spectateSent[code] = true;
        BG.net.send({ t: 'spectate', gameId: 'halligalli', code: code });
      }
      BG.ui.screen('<div class="center-block"><span class="spinner"></span><div>관전 화면을 준비하는 중…</div></div>', 'hg.watch');
      return;
    }
    const room = S.room;
    if (!room.game) {
      BG.ui.screen(
        '<div class="screen-head">' +
          '<div>' +
            '<a class="back-link" href="#/halligalli/teacher">← 모둠 목록</a>' +
            '<h1 class="room-name">' + esc(room.name) + ' 관전</h1>' +
            '<p class="page-sub">아직 게임이 시작되지 않았습니다. 학생들이 모이면 게임판이 보입니다.</p>' +
          '</div>' +
          '<button class="btn btn-sm btn-danger" data-action="hg.watchBack">관전 종료</button>' +
        '</div>' +
        '<div class="empty">대기 중인 모둠입니다.<br><br>' +
          '<button class="btn btn-primary btn-sm" data-action="hg.watchBack">모둠 목록으로</button></div>',
        'hg.watch'
      );
      return;
    }
    BG.ui.screen(boardScreen({
      title: room.name + ' 관전',
      code: room.code,
      game: room.game,
      youId: null,
      role: 'spectator',
      mode: 'multi',
      isHost: false
    }), 'hg.watch');
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
        return '<div class="room-player ' + (s.ready || s.isBot ? '' : '') + '">' +
          '<span class="who">' + esc(s.name) + (s.isBot ? ' 🤖' : '') + (s.isHost ? ' 👑' : '') + '</span>' +
          '<span class="cnt">' + (s.isBot ? '봇' : s.ready ? '준비' : '대기') + '</span></div>';
      }).join('');
      if (!list) list = '<div class="room-player"><span class="who">아직 참가자가 없습니다</span></div>';
    } else {
      list = (room.players || []).map(function (p) {
        return '<div class="room-player ' + (p.isTurn ? 'turn' : '') + ' ' + (p.eliminated ? 'out' : '') + '">' +
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
        '<button class="btn btn-sm btn-primary" data-action="hg.watch" data-code="' + esc(room.code) + '">👀 관전하기</button>' +
      '</div>'
    );
  }

  function renderTeacher() {
    BG.net.connect();

    const rooms = S.rooms.filter(function (r) { return r.gameId === 'halligalli'; });
    const playing = rooms.filter(function (r) { return r.status === 'playing'; }).length;
    const people = rooms.reduce(function (sum, r) { return sum + (r.humanCount || 0); }, 0);

    BG.ui.screen(
      '<div class="screen-head">' +
        '<div>' +
          '<a class="back-link" href="#/halligalli">← 할리갈리 입장</a>' +
          '<h1 class="page-title">👩‍🏫 교사 관전 모드</h1>' +
          '<p class="page-sub">6개 모둠 방의 상황을 실시간으로 확인하고, 원하는 모둠을 눌러 관전할 수 있습니다.</p>' +
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
      '<div class="panel" style="margin-top:18px">' +
        '<div class="panel-title">💡 수업 운영 팁</div>' +
        '<p class="hint">' +
          '· 관전 화면에서는 카드와 종을 누를 수 없으니 안심하고 화면을 띄워 두세요.<br>' +
          '· [합계 보기]를 켜면 과일별 합계가 표시되어 학생들이 세는 방법을 익힐 수 있습니다.<br>' +
          '· 모둠 방이 부족하면 할리갈리 입장 화면에서 [새 방 만들기]로 방을 추가하세요.' +
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
      if (game.status !== 'playing') stopBotLoop();
      if (screenName() === 'hg.bot') renderBot();
    }, 90);
  }

  function startBotGame(count, level) {
    stopBotLoop();
    const name = (BG.state.nickname || '플레이어').slice(0, 12);
    const players = [{ id: 'me', name: name || '플레이어', isBot: false }];
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
            '<a class="back-link" href="#/halligalli">← 할리갈리 입장</a>' +
            '<h1 class="page-title">🤖 AI 봇과 연습</h1>' +
            '<p class="page-sub">서버에 접속하지 않아도 혼자서 4~5인 게임을 바로 테스트할 수 있습니다.</p>' +
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
    BG.ui.screen(boardScreen({
      title: 'AI 봇 연습',
      code: '연습',
      game: game,
      youId: 'me',
      role: 'player',
      mode: 'bot',
      isHost: true
    }), 'hg.bot');
  }

  /* ---------------- 동작 ---------------- */

  function ensureConnected() {
    if (BG.net.connected) return true;
    BG.net.connect();
    BG.ui.toast('서버에 연결하는 중입니다. 잠시 후 다시 눌러 주세요.', 'error');
    return false;
  }

  function joinCode(code) {
    const nick = readNickname();
    if (!nick) {
      BG.ui.toast('닉네임을 먼저 입력해 주세요.', 'error');
      const input = document.getElementById('nickname');
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
    BG.net.send({ t: 'join', gameId: 'halligalli', code: code, nickname: nick });
    BG.navigate('/halligalli/room/' + code);
  }

  BG.actions['hg.rules'] = function () { openRules(); };

  BG.actions['hg.hintToggle'] = function () {
    S.hint = !S.hint;
    BG.render();
  };

  BG.actions['hg.enterGroup'] = function (el) {
    joinCode(String(el.getAttribute('data-code') || '').toUpperCase());
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
    const nick = readNickname();
    if (!nick) {
      BG.ui.toast('닉네임을 먼저 입력해 주세요.', 'error');
      return;
    }
    if (!ensureConnected()) return;
    BG.net.send({ t: 'create', gameId: 'halligalli', nickname: nick });
  };

  BG.actions['hg.teacher'] = function () {
    BG.navigate('/halligalli/teacher');
  };

  BG.actions['hg.bot'] = function () {
    BG.navigate('/halligalli/bot');
  };

  BG.actions['hg.botStart'] = function (el) {
    startBotGame(Number(el.getAttribute('data-count') || 4), el.getAttribute('data-level') || 'normal');
  };

  BG.actions['hg.botRestart'] = function () {
    startBotGame(S.bot.count || 4, S.bot.level || 'normal');
  };

  BG.actions['hg.botExit'] = function () {
    stopBotLoop();
    S.bot = { active: false, game: null, driver: null, timer: null, level: S.bot.level || 'normal', count: S.bot.count || 4 };
    BG.navigate('/halligalli');
  };

  BG.actions['hg.flip'] = function () {
    if (S.bot.active && screenName() === 'hg.bot') {
      const result = S.bot.game.flip('me', Date.now());
      if (!result.ok) BG.ui.toast(reasonMessage(result.reason), 'error');
      if (S.bot.game.status !== 'playing') stopBotLoop();
      renderBot();
      return;
    }
    BG.net.send({ t: 'action', action: 'flip' });
  };

  BG.actions['hg.ring'] = function () {
    if (S.bot.active && screenName() === 'hg.bot') {
      const result = S.bot.game.ring('me', Date.now());
      if (!result.ok) BG.ui.toast(reasonMessage(result.reason), 'error');
      else if (!result.correct) BG.ui.toast('앗, 5개가 아니었어요! 카드 1장씩 잃었습니다.', 'error');
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

  BG.actions['hg.leave'] = function () {
    if (S.bot.active && screenName() === 'hg.bot') {
      BG.actions['hg.botExit']();
      return;
    }
    BG.net.send({ t: 'leave' });
    S.room = null;
    S.pendingJoin = null;
    clearSeat();
    BG.navigate('/halligalli');
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

  BG.net.on('welcome', function (msg) {
    S.rooms = (msg.rooms || []).filter(function (r) { return r.gameId === 'halligalli'; });
    const screen = screenName();
    if (screen === 'halligalli') renderEntry();
    else if (screen === 'hg.teacher') renderTeacher();
  });

  BG.net.on('rooms', function (msg) {
    S.rooms = (msg.rooms || []).filter(function (r) { return r.gameId === 'halligalli'; });
    const screen = screenName();
    if (screen === 'halligalli') renderEntry();
    else if (screen === 'hg.teacher') renderTeacher();
  });

  BG.net.on('joined', function (msg) {
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
    S.room = msg.room;
    S.role = msg.room.role;
    const path = BG.currentPath();
    if (path.indexOf('/halligalli/room/') === 0) renderRoom([msg.room.code]);
    else if (path.indexOf('/halligalli/watch/') === 0) renderWatch([msg.room.code]);
  });

  BG.net.on('spectating', function (msg) {
    BG.ui.toast(msg.name + ' 관전을 시작합니다.', 'ok');
  });

  BG.net.on('action_result', function (msg) {
    if (msg && msg.ok === false && msg.message) BG.ui.toast(msg.message, 'error');
  });

  BG.net.on('error', function (msg) {
    BG.ui.toast(msg.message || '요청을 처리할 수 없습니다.', 'error');
    const code = msg.code;
    if (['no_seat', 'no_room', 'no_name', 'full', 'playing', 'dup_name', 'already_in_room'].indexOf(code) !== -1) {
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

  BG.net.on('open', function () {
    const path = BG.currentPath();
    if (path.indexOf('/halligalli') !== 0) return;
    if (path === '/halligalli/teacher' && BG.net.connected) {
      BG.net.send({ t: 'overview', gameId: 'halligalli' });
    }
    const seat = getSeat();
    if (seat && path.indexOf('/halligalli/room/') === 0) {
      S.resumeSent = {};
      const code = path.split('/').pop().toUpperCase();
      if (seat.code === code) {
        S.resumeSent[code] = true;
        BG.net.send({ t: 'resume', gameId: 'halligalli', code: seat.code, token: seat.token });
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
    if (BG.net.connected) BG.net.send({ t: 'overview', gameId: 'halligalli' });
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
    state: S
  };
})();
