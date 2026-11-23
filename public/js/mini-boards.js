/*
 * 미니 게임 보드 그리기 – 숫자 줄세우기 · 오목 · 라이어 추리게임 · 윷놀이
 * minigames.js 가 상태를 넘기면 HTML 문자열을 돌려줍니다.
 */
(function () {
  'use strict';
  const BG = (window.BG = window.BG || {});
  const esc = BG.ui.escape;

  const SEAT_COLORS = ['#e0583c', '#2f7fbf', '#2f9b6a', '#9b5fc0', '#d4912a', '#c94f88'];

  function josaOf(value) {
    const Streams = window.Streams;
    if (Streams && Streams.josa) return Streams.josa(value, '을', '를');
    return '을(를)';
  }

  function colorOf(player) {
    if (!player) return SEAT_COLORS[0];
    if (player.number !== null && player.number !== undefined && player.number !== '') {
      const animal = BG.avatars ? BG.avatars.forKey('no:' + player.number) : null;
      if (animal && SEAT_COLORS[animal.seat % SEAT_COLORS.length]) {
        // 동물마다 색을 조금 다르게 (번호 기준으로 안정적)
        return SEAT_COLORS[(Number(player.number) + (animal.seat || 0)) % SEAT_COLORS.length];
      }
    }
    return SEAT_COLORS[(player.seat || 0) % SEAT_COLORS.length];
  }

  function avatar(player, size) {
    return BG.avatars ? BG.avatars.html(player, size || 'xs') : '';
  }

  function playerHead(player, opts) {
    const o = opts || {};
    return '<span class="mg-phead">' + avatar(player) +
      '<span class="mg-pname">' + esc(player.name) + '</span>' +
      (o.badge ? '<span class="mg-pbadge">' + o.badge + '</span>' : '') +
      '</span>';
  }

  /* ---------------- 숫자 줄세우기 ---------------- */

  function streamsBoard(state, ctx) {
    const isMyTurn = state.status === 'playing' && state.waiting.indexOf(state.youId) !== -1;
    const value = state.value;
    const banner =
      '<div class="mg-turn-bar ' + (isMyTurn ? 'is-me' : '') + '">' +
        (state.status === 'finished'
          ? '<span class="mg-turn-text">🏁 게임 끝! 가장 긴 줄이 우승입니다.</span>'
          : '<span class="mg-num-tile">' + (value === null ? '?' : value) + '</span>' +
            '<span class="mg-turn-text">' + (isMyTurn
              ? '내 차례! <b>' + value + '</b>' + josaOf(value) + ' 놓을 칸을 누르세요.'
              : '<b>' + value + '</b> — 다른 친구가 놓는 중…') + '</span>' +
            '<span class="mg-round-chip">' + state.round + '번째 숫자 · 남은 ' + state.remaining + '장</span>') +
      '</div>';

    const boards = state.players.map(function (p) {
      const mine = p.id === state.youId;
      const slots = [];
      for (let i = 0; i < state.trackSize; i++) {
        const v = p.track[i];
        const canPlace = mine && isMyTurn && v === null && state.youSlots.indexOf(i) !== -1;
        const filled = v !== null && v !== undefined;
        slots.push(
          '<' + (canPlace ? 'button' : 'span') + ' class="mg-slot' + (filled ? ' filled' : '') +
            (canPlace ? ' can-place' : '') + (i === p.lastSlot ? ' just-placed' : '') + '"' +
            (canPlace ? ' data-action="mini.place" data-slot="' + i + '" aria-label="' + (i + 1) + '번째 칸에 ' + value + ' 놓기"' : '') +
            '>' + (filled ? v : '<i>' + (i + 1) + '</i>') + '</' + (canPlace ? 'button' : 'span') + '>'
        );
      }
      return '<div class="mg-track-card' + (mine ? ' is-me' : '') + '">' +
        '<div class="mg-track-head">' + playerHead(p, { badge: '<b>' + p.score + '</b>칸' }) +
          '<span class="mg-track-sub">' + p.filled + '/20 · 버림 ' + p.discarded + '</span></div>' +
        '<div class="mg-track">' + slots.join('') + '</div>' +
        (mine && isMyTurn
          ? '<div class="mg-track-hint">반짝이는 칸을 누르면 됩니다. (왼쪽은 작은 수, 오른쪽은 큰 수)</div>'
          : '') +
      '</div>';
    }).join('');

    return '<div class="mg-board mg-streams">' + banner + boards + '</div>';
  }

  /* ---------------- 오목 ---------------- */

  function gomokuBoard(state, ctx) {
    const myTurn = state.status === 'playing' && state.turnPlayerId === state.youId;
    const winSet = {};
    (state.winLine || []).forEach(function (c) { winSet[c.x + ',' + c.y] = true; });
    // 바둑판 선: 돌(칸 가운데)이 선의 교차점에 오도록 0.5 간격으로 그립니다.
    const lines = [];
    for (let i = 0; i < state.size; i++) {
      const p = i + 0.5;
      lines.push('<line x1="0.5" y1="' + p + '" x2="' + (state.size - 0.5) + '" y2="' + p + '" />');
      lines.push('<line x1="' + p + '" y1="0.5" x2="' + p + '" y2="' + (state.size - 0.5) + '" />');
    }
    const stars = [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]].map(function (c) {
      return '<circle cx="' + (c[0] + 0.5) + '" cy="' + (c[1] + 0.5) + '" r="0.12" />';
    }).join('');
    const gridSvg = '<svg class="mg-gomoku-lines" viewBox="0 0 ' + state.size + ' ' + state.size +
      '" preserveAspectRatio="none" aria-hidden="true"><g class="mg-gomoku-strokes">' + lines.join('') + '</g>' +
      '<g class="mg-gomoku-stars">' + stars + '</g></svg>';

    const cells = [];
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const stone = state.board[y][x];
        const last = state.lastMove && state.lastMove.x === x && state.lastMove.y === y;
        const isWin = winSet[x + ',' + y];
        const playable = myTurn && stone === 0;
        cells.push(
          '<' + (playable ? 'button' : 'div') + ' class="mg-cell' + (stone ? ' stone-' + stone : '') +
            (last ? ' last' : '') + (isWin ? ' win' : '') + '"' +
            (playable ? ' data-action="mini.gomokuPlay" data-x="' + x + '" data-y="' + y + '"' : '') +
            ' aria-label="' + String.fromCharCode(65 + x) + (y + 1) + (stone ? (stone === 1 ? ' 흑' : ' 백') : ' 빈칸') + '">' +
            (stone ? '<span class="mg-stone"></span>' : '') +
          '</' + (playable ? 'button' : 'div') + '>'
        );
      }
    }
    const turnName = (state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name;
    return '<div class="mg-board mg-gomoku">' +
      '<div class="mg-turn-bar ' + (myTurn ? 'is-me' : '') + '">' +
        (state.status === 'finished'
          ? '<span class="mg-turn-text">🏁 ' + (state.finishReason === 'draw' ? '무승부입니다.' :
              esc((state.players.find(function (p) { return p.id === state.winnerId; }) || {}).name || '') + '님 승리!') + '</span>'
          : '<span class="mg-stone-mini ' + (state.youStone === 1 ? 'black' : 'white') + '"></span>' +
            '<span class="mg-turn-text">' + (myTurn ? '내 차례! 돌을 놓을 자리를 누르세요.' : esc(turnName || '') + ' 차례…') + '</span>' +
            '<span class="mg-round-chip">' + state.moves + '수</span>') +
      '</div>' +
      '<div class="mg-gomoku-wrap"><div class="mg-gomoku-grid">' + gridSvg + cells.join('') + '</div></div>' +
      '<div class="mg-gomoku-foot">' +
        '<span class="mg-legend"><i class="dot black"></i>흑 ' + esc((state.players[0] || {}).name || '') + '</span>' +
        '<span class="mg-legend"><i class="dot white"></i>백 ' + esc((state.players[1] || {}).name || '') + '</span>' +
        '<span class="mg-hint-line">흑은 6목·4-4·3-3 자리에 둘 수 없어요. (금수)</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 라이어 추리게임 ---------------- */

  function liarBoard(state, ctx) {
    const me = state.youId;
    const myPlayer = state.players.find(function (p) { return p.id === me; });
    const secretCard = state.status === 'finished'
      ? '<div class="mg-secret reveal"><span class="mg-secret-label">제시어</span><b>' + esc(state.secret || '') + '</b>' +
        '<span class="mg-secret-sub">라이어: ' + esc((state.players.find(function (p) { return p.id === state.liarId; }) || {}).name || '') + '</span></div>'
      : state.youAreLiar
        ? '<div class="mg-secret liar"><span class="mg-secret-label">당신은 라이어입니다</span><b>제시어를 모릅니다</b>' +
          '<span class="mg-secret-sub">힌트를 잘 둘러대고, 지목되면 제시어를 맞혀 보세요!</span></div>'
        : '<div class="mg-secret"><span class="mg-secret-label">우리 반 제시어</span><b>' + esc(state.secret || '') + '</b>' +
          '<span class="mg-secret-sub">라이어만 이 단어를 모릅니다.</span></div>';

    const hintRows = state.players.map(function (p) {
      return '<li class="mg-hint-row' + (p.isTurn ? ' is-turn' : '') + '">' +
        playerHead(p, { badge: p.isYou ? '나' : '' }) +
        '<span class="mg-hint-text">' + (p.hint ? '“' + esc(p.hint) + '”' : '<i class="muted">아직 힌트 없음</i>') + '</span>' +
        (p.votes !== null && p.votes !== undefined ? '<span class="mg-vote-count">' + p.votes + '표</span>' : '') +
      '</li>';
    }).join('');

    let phaseBox = '';
    if (state.status === 'playing' && state.phase === 'hint') {
      const current = state.players.find(function (p) { return p.id === state.currentHintPlayerId; });
      if (current && current.id === me) {
        phaseBox =
          '<div class="mg-phase-box is-me">' +
            '<div class="mg-phase-title">🕵️ 내 힌트 차례!</div>' +
            '<div class="mg-hint-form">' +
              '<input id="mg-hint-input" class="input" maxlength="40" placeholder="예: 빨개요 (제시어는 그대로 말하지 않기)" autocomplete="off">' +
              '<button class="btn btn-primary" data-action="mini.hint">힌트 말하기</button>' +
            '</div>' +
          '</div>';
      } else {
        phaseBox = '<div class="mg-phase-box"><div class="mg-phase-title">힌트 차례: <b>' +
          esc((current || {}).name || '') + '</b></div><p class="hint">그 친구의 힌트를 기다리는 중…</p></div>';
      }
    } else if (state.status === 'playing' && state.phase === 'vote') {
      if (myPlayer && myPlayer.hasVoted) {
        phaseBox = '<div class="mg-phase-box"><div class="mg-phase-title">🗳️ 투표 완료</div><p class="hint">다른 친구들의 투표를 기다리는 중…</p></div>';
      } else {
        phaseBox = '<div class="mg-phase-box is-me"><div class="mg-phase-title">🗳️ 라이어라고 생각하는 사람에게 투표!</div>' +
          '<div class="mg-vote-grid">' +
            state.players.filter(function (p) { return p.id !== me; }).map(function (p) {
              return '<button class="mg-vote-btn" data-action="mini.vote" data-target="' + esc(p.id) + '">' +
                avatar(p) + '<span>' + esc(p.name) + '</span></button>';
            }).join('') +
          '</div></div>';
      }
    } else if (state.status === 'playing' && state.phase === 'guess') {
      if (state.youAreLiar) {
        phaseBox = '<div class="mg-phase-box is-me"><div class="mg-phase-title">😈 지목당했습니다! 제시어를 맞혀 보세요</div>' +
          '<div class="mg-guess-grid">' +
            state.guessOptions.map(function (w) {
              return '<button class="btn mg-guess-btn" data-action="mini.guess" data-word="' + esc(w) + '">' + esc(w) + '</button>';
            }).join('') +
          '</div><p class="hint">맞히면 라이어 승리, 틀리면 시민들 승리!</p></div>';
      } else {
        phaseBox = '<div class="mg-phase-box"><div class="mg-phase-title">😈 라이어가 제시어를 맞히는 중…</div>' +
          '<p class="hint">우리 팀 제시어는 <b>' + esc(state.secret || '') + '</b> 입니다.</p></div>';
      }
    } else if (state.status === 'finished') {
      const winners = state.players.filter(function (p) { return state.winnerIds.indexOf(p.id) !== -1; });
      phaseBox = '<div class="mg-phase-box"><div class="mg-phase-title">🏁 ' +
        (winners.some(function (p) { return p.id === state.liarId; }) ? '라이어 승리!' : '시민들 승리!') + '</div>' +
        '<p class="hint">라이어는 <b>' + esc((state.players.find(function (p) { return p.id === state.liarId; }) || {}).name || '') +
        '</b>, 제시어는 <b>' + esc(state.secret || '') + '</b>였습니다.</p></div>';
    }

    return '<div class="mg-board mg-liar">' +
      '<div class="mg-turn-bar">' +
        '<span class="mg-cat-chip">주제 · ' + esc(state.category.name) + '</span>' +
        '<span class="mg-turn-text">' + (state.phase === 'hint' ? '힌트 말하기' : state.phase === 'vote' ? '투표' :
          state.phase === 'guess' ? '제시어 맞히기' : '결과') + '</span>' +
        '<span class="mg-round-chip">' + state.players.length + '명</span>' +
      '</div>' +
      secretCard +
      '<ul class="mg-hint-list">' + hintRows + '</ul>' +
      phaseBox +
    '</div>';
  }

  /* ---------------- 윷놀이 ---------------- */

  function nodeXY(node) {
    const Y = window.Yut;
    const p = (Y && Y.NODE_POS[node]) || { x: 2.5, y: 2.5 };
    return { x: 10 + p.x * 16, y: 10 + p.y * 16 };
  }

  function yutSvg(state) {
    const Y = window.Yut;
    const lines = [];
    function line(a, b) {
      const p1 = nodeXY(a);
      const p2 = nodeXY(b);
      lines.push('<line x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" />');
    }
    // 바깥 둘레
    for (let i = 0; i < 19; i++) line(i, i + 1);
    line(19, 0);
    // 지름길 (0↔10, 5↔15)
    line(0, 21); line(21, 22); line(22, 20);
    line(20, 23); line(23, 24); line(24, 10);
    line(5, 25); line(25, 26); line(26, 20);
    line(20, 27); line(27, 28); line(28, 15);

    const nodes = [];
    for (let i = 0; i < 29; i++) {
      const p = nodeXY(i);
      const big = i === 0 || i === 5 || i === 10 || i === 15 || i === 20;
      nodes.push('<circle class="mg-yut-node' + (big ? ' big' : '') + '" cx="' + p.x + '" cy="' + p.y + '" r="' + (big ? 3 : 2.2) + '" />');
    }

    // 말 그리기 (같은 자리 말은 옆으로 벌려 표시)
    const tokens = [];
    const byNode = {};
    state.players.forEach(function (p, pi) {
      p.pieces.forEach(function (piece) {
        if (piece.node === null || piece.node === undefined || piece.finished) return;
        if (!byNode[piece.node]) byNode[piece.node] = [];
        byNode[piece.node].push({ player: p, pi: pi, piece: piece });
      });
    });
    Object.keys(byNode).forEach(function (nodeKey) {
      const list = byNode[nodeKey];
      const base = nodeXY(Number(nodeKey));
      list.forEach(function (item, i) {
        const spread = (i - (list.length - 1) / 2) * 2.6;
        tokens.push('<circle class="mg-yut-piece" cx="' + (base.x + spread) + '" cy="' + (base.y - 2.2) + '" r="2.1" fill="' + colorOf(item.player) + '" />');
      });
      if (list.length > 1) {
        tokens.push('<text class="mg-yut-count" x="' + base.x + '" y="' + (base.y + 4.6) + '">' + list.length + '</text>');
      }
    });

    return '<svg class="mg-yut-svg" viewBox="0 0 100 100" role="img" aria-label="윷놀이판">' +
      '<rect x="2" y="2" width="96" height="96" rx="6" class="mg-yut-frame" />' +
      '<g class="mg-yut-lines">' + lines.join('') + '</g>' +
      '<g class="mg-yut-nodes">' + nodes.join('') + '</g>' +
      '<text class="mg-yut-label" x="' + nodeXY(0).x + '" y="' + (nodeXY(0).y + 7) + '">출발</text>' +
      '<text class="mg-yut-label" x="' + nodeXY(20).x + '" y="' + (nodeXY(20).y + 6) + '">가운데</text>' +
      '<g class="mg-yut-tokens">' + tokens.join('') + '</g>' +
    '</svg>';
  }

  function sticksHtml(info) {
    if (!info) return '<div class="mg-sticks"><span class="mg-stick-empty">윷가락을 던져 주세요</span></div>';
    const sticks = info.sticks.map(function (back) {
      return '<span class="mg-stick' + (back ? ' back' : '') + '"></span>';
    }).join('');
    const label = info.name + (info.steps > 0 ? ' · ' + info.steps + '칸' : ' · 한 칸 뒤로');
    return '<div class="mg-sticks">' + sticks + '<b class="mg-stick-name">' + esc(label) + '</b>' +
      (info.bonus ? '<span class="mg-bonus">한 번 더!</span>' : '') + '</div>';
  }

  function yutBoard(state, ctx) {
    const me = state.youId;
    const myPlayer = state.players.find(function (p) { return p.id === me; });
    const myTurn = state.status === 'playing' && state.turnPlayerId === me;
    const Y = window.Yut;

    let actionBox = '';
    if (state.status === 'playing') {
      if (myTurn && state.phase === 'throw') {
        actionBox = '<button class="btn btn-primary btn-block mg-throw-btn" data-action="mini.throw">🪵 윷가락 던지기</button>';
      } else if (myTurn && state.phase === 'move') {
        const groups = [];
        const seen = {};
        const waiting = [];
        (myPlayer ? myPlayer.pieces : []).forEach(function (piece) {
          if (piece.finished) return;
          if (!piece.path) {
            // 출발점의 말은 한 번에 한 개씩 나갑니다.
            waiting.push(piece);
            return;
          }
          const key = piece.path + ':' + piece.idx;
          if (seen[key]) return;
          seen[key] = true;
          const group = (myPlayer.pieces).filter(function (other) {
            if (other.finished || !other.path) return false;
            return other.path === piece.path && other.idx === piece.idx;
          });
          groups.push({ key: key, piece: piece, count: group.length });
        });
        waiting.forEach(function (piece, i) {
          groups.unshift({ key: 'wait' + i, piece: piece, count: 1, waiting: true });
        });
        actionBox = '<div class="mg-move-box"><div class="mg-phase-title">옮길 말을 고르세요</div>' +
          '<div class="mg-move-grid">' + groups.map(function (g) {
            const from = g.piece.path === null ? '출발점' : g.piece.node + '번 자리';
            let to = '완주';
            if (Y && state.throwInfo) {
              const result = Y.advance(g.piece.path ? { path: g.piece.path, idx: g.piece.idx } : null, state.throwInfo.steps);
              to = result.finished ? '완주 🎉' : result.toStart ? '출발점' : result.node + '번 자리' + (result.shortcut ? ' (지름길)' : '');
            }
            return '<button class="btn mg-move-btn" data-action="mini.move" data-piece="' + esc(g.piece.id) + '">' +
              '<b>' + esc(from) + '</b>' + (g.count > 1 ? ' 말 ' + g.count + '개' : '') + ' → ' + esc(to) + '</button>';
          }).join('') + '</div>' +
          '<p class="hint">말을 누르면 그 자리의 말이 함께 움직입니다. (업기)</p></div>';
      } else {
        const turnName = (state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name;
        actionBox = '<div class="mg-phase-box"><div class="mg-phase-title">' + esc(turnName || '') + '님 차례…</div></div>';
      }
    } else {
      const winner = state.players.find(function (p) { return p.id === state.winnerId; });
      actionBox = '<div class="mg-phase-box"><div class="mg-phase-title">🏆 ' + esc((winner || {}).name || '') + '님 우승!</div></div>';
    }

    const scoreRows = state.players.map(function (p) {
      const waiting = p.pieces.filter(function (piece) { return piece.waiting; }).length;
      return '<div class="mg-yut-row' + (p.id === me ? ' is-me' : '') + (p.isTurn ? ' is-turn' : '') + '">' +
        playerHead(p, { badge: '<b>' + p.finishedCount + '</b>/' + p.pieces.length + ' 완주' }) +
        (waiting ? '<span class="mg-wait-chip">출발점 ' + waiting + '</span>' : '') +
      '</div>';
    }).join('');

    return '<div class="mg-board mg-yut">' +
      '<div class="mg-turn-bar ' + (myTurn ? 'is-me' : '') + '">' +
        sticksHtml(state.throwInfo) +
        '<span class="mg-turn-text">' + (state.status === 'finished' ? '게임 끝' :
          myTurn ? (state.phase === 'throw' ? '내 차례! 윷가락을 던지세요.' : '옮길 말을 고르세요!') :
            esc((state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name || '') + ' 차례') + '</span>' +
      '</div>' +
      '<div class="mg-yut-stage">' + yutSvg(state) + '</div>' +
      '<div class="mg-yut-players">' + scoreRows + '</div>' +
      actionBox +
    '</div>';
  }

  BG.miniBoards = {
    SEAT_COLORS: SEAT_COLORS,
    colorOf: colorOf,
    streams: streamsBoard,
    gomoku: gomokuBoard,
    liar: liarBoard,
    yut: yutBoard
  };
})();
