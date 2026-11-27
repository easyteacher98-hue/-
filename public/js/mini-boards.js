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
    const joker = !!state.joker || value === '★';
    const valueLabel = value === null ? '?' : (joker ? '★' : value);
    const total = state.roundsTotal || 20;
    let turnText;
    if (isMyTurn) {
      if (joker) turnText = '내 차례! <b>★ 조커</b>를 놓을 빈 칸을 누르세요.';
      else turnText = '내 차례! <b>' + value + '</b>' + josaOf(value) + ' 놓을 빈 칸을 누르세요.';
    } else if (joker) {
      turnText = '<b>★ 조커</b> — 다른 친구가 놓는 중…';
    } else {
      turnText = '<b>' + value + '</b> — 다른 친구가 놓는 중…';
    }
    const banner =
      '<div class="mg-turn-bar ' + (isMyTurn ? 'is-me' : '') + '">' +
        (state.status === 'finished'
          ? '<span class="mg-turn-text">🏁 게임 끝! 20칸을 다 채웠어요. 가장 긴 줄이 우승입니다.</span>'
          : '<span class="mg-num-tile' + (joker ? ' is-joker' : '') + '">' + valueLabel + '</span>' +
            '<span class="mg-turn-text">' + turnText + '</span>' +
            '<span class="mg-round-chip">' + state.round + '/' + total + '번째 타일 · 남은 ' + state.remaining + '장</span>') +
      '</div>';

    const boards = state.players.map(function (p) {
      const mine = p.id === state.youId;
      const slots = [];
      for (let i = 0; i < state.trackSize; i++) {
        const v = p.track[i];
        const filled = v !== null && v !== undefined;
        const canPlace = mine && isMyTurn && !filled;
        const isJokerSlot = filled && v === '★';
        slots.push(
          '<' + (canPlace ? 'button' : 'span') + ' class="mg-slot' + (filled ? ' filled' : '') +
            (isJokerSlot ? ' joker-filled' : '') +
            (canPlace ? ' can-place' : '') +
            (i === p.lastSlot ? ' just-placed' : '') + '"' +
            (canPlace ? ' data-action="mini.place" data-slot="' + i + '" aria-label="' + (i + 1) + '번째 칸에 ' + valueLabel + ' 놓기"' : '') +
            '>' + (filled ? (isJokerSlot ? '★' : v) : '<i>' + (i + 1) + '</i>') + '</' + (canPlace ? 'button' : 'span') + '>'
        );
      }
      let hint = '';
      if (mine && isMyTurn) {
        hint = '<div class="mg-track-hint">빈 칸을 눌러 배치하세요.</div>';
      }
      return '<div class="mg-track-card' + (mine ? ' is-me' : '') + '">' +
        '<div class="mg-track-head">' + playerHead(p, { badge: '<b>' + p.score + '</b>칸' }) +
          '<span class="mg-track-sub">' + p.filled + '/' + state.trackSize + '</span></div>' +
        '<div class="mg-track">' + slots.join('') + '</div>' + hint +
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
      '<text class="mg-yut-label" x="' + (nodeXY(0).x + 9) + '" y="' + (nodeXY(0).y + 8.4) + '">출발</text>' +
      '<text class="mg-yut-label" x="' + nodeXY(20).x + '" y="' + (nodeXY(20).y - 6.2) + '">가운데</text>' +
      '<g class="mg-yut-tokens">' + tokens.join('') + '</g>' +
    '</svg>';
  }

  function sticksHtml(info, animate) {
    if (!info) return '<div class="mg-sticks"><span class="mg-stick-empty">윷가락을 던져 주세요</span></div>';
    const sticks = info.sticks.map(function (back) {
      return '<span class="mg-stick' + (back ? ' back' : '') + '"></span>';
    }).join('');
    const label = info.name + (info.steps > 0 ? ' · ' + info.steps + '칸' : ' · 한 칸 뒤로');
    return '<div class="mg-sticks' + (animate ? ' is-toss' : '') + '" data-seq="' + (info.seq || 0) + '">' + sticks +
      '<b class="mg-stick-name">' + esc(label) + '</b>' +
      (info.bonus ? '<span class="mg-bonus">한 번 더!</span>' : '') + '</div>';
  }

  /* 윷가락이 새로 던져졌을 때만 던지는 동작을 보여 줍니다. */
  const yutUI = { throwSeq: 0 };

  function yutBoard(state, ctx) {
    const me = state.youId;
    const myPlayer = state.players.find(function (p) { return p.id === me; });
    const myTurn = state.status === 'playing' && state.turnPlayerId === me;
    const Y = window.Yut;
    const shownThrow = state.throwInfo || state.lastThrow || null;
    const throwSeq = shownThrow ? shownThrow.seq : 0;
    const tossNow = !!throwSeq && throwSeq !== yutUI.throwSeq;
    if (throwSeq) yutUI.throwSeq = throwSeq;

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
        if (waiting.length) {
          groups.unshift({ key: 'wait', piece: waiting[0], count: 1, waiting: true, waitingCount: waiting.length });
        }
        actionBox = '<div class="mg-move-box"><div class="mg-phase-title">옮길 말을 고르세요</div>' +
          '<div class="mg-move-grid">' + groups.map(function (g) {
            const from = g.piece.path === null ? '출발점' : g.piece.node + '번 자리';
            let to = '완주';
            if (Y && state.throwInfo) {
              const result = Y.advance(g.piece.path ? { path: g.piece.path, idx: g.piece.idx } : null, state.throwInfo.steps);
              to = result.finished ? '완주 🎉' : result.toStart ? '출발점' : result.node + '번 자리' + (result.shortcut ? ' (지름길)' : '');
            }
            return '<button class="btn mg-move-btn" data-action="mini.move" data-piece="' + esc(g.piece.id) + '">' +
              '<b>' + esc(from) + '</b>' +
              (g.waiting && g.waitingCount > 1 ? ' (남은 ' + g.waitingCount + '개 중 1개)' : (g.count > 1 ? ' 말 ' + g.count + '개' : '')) +
              ' → ' + esc(to) + '</button>';
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
        sticksHtml(shownThrow, tossNow) +
        '<span class="mg-turn-text">' + (state.status === 'finished' ? '게임 끝' :
          myTurn ? (state.phase === 'throw' ? '내 차례! 윷가락을 던지세요.' : '옮길 말을 고르세요!') :
            esc((state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name || '') + ' 차례') + '</span>' +
      '</div>' +
      '<div class="mg-yut-stage">' +
        // 3D 말판(WebGL)을 그릴 수 있으면 여기에 그립니다. 그림을 못 그리면 아래 2D 말판이 보입니다.
        '<div class="mg-yut-3d" id="mg-yut3d" aria-hidden="true"></div>' +
        '<div class="mg-yut-svg-holder">' + yutSvg(state) + '</div>' +
        '<div class="mg-yut-3d-hint">🖱️ 드래그해서 판을 돌려 보세요</div>' +
      '</div>' +
      '<div class="mg-yut-players">' + scoreRows + '</div>' +
      '<div class="mg-yut-actions">' + actionBox + '</div>' +
    '</div>';
  }

  /* ---------------- 숫자 타일 러미 ---------------- */

  const RUMMI_COLOR = { red: '빨강', blue: '파랑', yellow: '노랑', green: '초록' };
  const rummiUI = { selected: [], pendingMelds: [], pendingAdds: [], moves: -1, turn: null };

  function resetRummiUI(state) {
    rummiUI.selected = [];
    rummiUI.pendingMelds = [];
    rummiUI.pendingAdds = [];
    rummiUI.moves = state ? state.moves : -1;
    rummiUI.turn = state ? state.turnPlayerId : null;
  }

  function rummiTileHtml(tile, opts) {
    const o = opts || {};
    const cls = 'mg-tile ' + (tile.joker ? 'joker' : 'c-' + tile.color) +
      (o.selected ? ' is-selected' : '') + (o.small ? ' is-small' : '');
    const body = tile.joker ? '⭐' : tile.value;
    const label = tile.joker ? '조커' : RUMMI_COLOR[tile.color] + ' ' + tile.value;
    if (o.static) return '<span class="' + cls + '" aria-label="' + label + '">' + body + '</span>';
    return '<button class="' + cls + '" data-action="mini.rummiTile" data-id="' + tile.id + '"' +
      ' aria-pressed="' + (o.selected ? 'true' : 'false') + '" aria-label="' + label + '">' + body + '</button>';
  }

  function handTileOf(state, id) {
    return (state.hand || []).find(function (t) { return t.id === id; }) || null;
  }

  function pendingIds() {
    const ids = [];
    rummiUI.pendingMelds.forEach(function (group) { group.forEach(function (id) { ids.push(id); }); });
    rummiUI.pendingAdds.forEach(function (add) { add.tileIds.forEach(function (id) { ids.push(id); }); });
    return ids;
  }

  function rummiBoard(state, ctx) {
    if (rummiUI.moves !== state.moves || rummiUI.turn !== state.turnPlayerId) resetRummiUI(state);
    const myTurn = state.status === 'playing' && state.turnPlayerId === state.youId;
    const staged = pendingIds();
    const stagedTiles = staged.map(function (id) { return handTileOf(state, id); }).filter(Boolean);
    const stagedPoints = stagedTiles.reduce(function (sum, t) { return sum + (t.joker ? 10 : t.value); }, 0);
    const need = state.initialPoints;
    const needLeft = Math.max(0, need - stagedPoints);

    const handTiles = (state.hand || []).filter(function (t) { return staged.indexOf(t.id) === -1; });
    const hand = handTiles.map(function (tile) {
      return rummiTileHtml(tile, { selected: rummiUI.selected.indexOf(tile.id) !== -1 });
    }).join('') || '<span class="mg-empty-hand">' + (state.youId ? '손패가 비었습니다!' : '관전 중입니다.') + '</span>';

    const table = (state.table || []).map(function (set) {
      const tiles = set.tiles.map(function (t) { return rummiTileHtml(t, { static: true, small: true }); }).join('');
      const pick = rummiUI.selected.length;
      return '<div class="mg-rummi-set">' +
        '<div class="mg-rummi-set-tiles">' + tiles + '</div>' +
        '<div class="mg-rummi-set-foot">' +
          '<span class="mg-rummi-set-points">' + set.points + '점</span>' +
          (myTurn && pick
            ? '<button class="btn btn-ghost btn-xs" data-action="mini.rummiAdd" data-set="' + set.id + '">여기에 붙이기</button>'
            : '') +
        '</div>' +
      '</div>';
    }).join('') || '<div class="empty">아직 테이블에 낸 타일이 없습니다.</div>';

    const stagedHtml = rummiUI.pendingMelds.map(function (group) {
      return '<span class="mg-rummi-pending-set">' + group.map(function (id) {
        const t = handTileOf(state, id);
        return t ? rummiTileHtml(t, { static: true, small: true }) : '';
      }).join('') + '</span>';
    }).join('');
    const stagedAdds = rummiUI.pendingAdds.map(function (add) {
      return '<span class="mg-rummi-pending-set is-add">붙이기 ' + add.tileIds.length + '장</span>';
    }).join('');

    const canMeld = rummiUI.selected.length >= 3 &&
      window.Rummi && window.Rummi.validateSet(rummiUI.selected.map(function (id) { return handTileOf(state, id); }).filter(Boolean)).ok;
    const submitReady = (rummiUI.pendingMelds.length + rummiUI.pendingAdds.length) > 0 &&
      (state.youMelded || stagedPoints >= need);

    const registerLine = state.youMelded
      ? '<span class="mg-rummi-registered">✅ 처음 등록 완료</span>'
      : '<span class="mg-rummi-register">처음 등록까지 <b>' + needLeft + '점</b> 남음 (기준 ' + need + '점)</span>';

    return '<div class="mg-board mg-rummi">' +
      '<div class="mg-turn-bar ' + (myTurn ? 'is-me' : '') + '">' +
        (state.status === 'finished'
          ? '<span class="mg-turn-text">🏁 게임 끝! ' + esc((state.players.find(function (p) { return p.id === state.winnerId; }) || (state.ranking && state.ranking[0]) || {}).name || '') + '님이 가장 좋은 성적!</span>'
          : '<span class="mg-turn-text">' + (myTurn
            ? '내 차례! 타일을 골라 세트를 만드세요.'
            : esc((state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name || '') + '님 차례…') + '</span>') +
        '<span class="mg-round-chip">더미 ' + state.deckCount + '장</span>' +
      '</div>' +
      '<div class="mg-rummi-register-line">' + registerLine + '</div>' +
      '<div class="mg-rummi-table">' + table + '</div>' +
      '<div class="mg-rummi-staging">' +
        '<div class="mg-rummi-staging-head">내가 낼 타일' +
          (stagedTiles.length ? ' <b>' + stagedTiles.length + '장 · ' + stagedPoints + '점</b>' : ' <span class="hint">타일을 골라 [세트로 담기]</span>') + '</div>' +
        '<div class="mg-rummi-pending">' + (stagedHtml + stagedAdds || '<span class="hint">없음</span>') + '</div>' +
        (staged.length
          ? '<div class="row" style="gap:8px;margin-top:8px">' +
              '<button class="btn btn-sm btn-ghost" data-action="mini.rummiReset">되돌리기</button>' +
            '</div>'
          : '') +
      '</div>' +
      '<div class="mg-rummi-hand-wrap">' +
        '<div class="mg-rummi-hand-head">내 패 <span class="hint">' + handTiles.length + '장</span></div>' +
        '<div class="mg-rummi-hand">' + hand + '</div>' +
      '</div>' +
      '<div class="mg-rummi-actions">' +
        (myTurn && state.status === 'playing'
          ? '<button class="btn btn-sm btn-gold" data-action="mini.rummiHelp">🙋 세트 찾아 주기</button>' +
            '<button class="btn btn-sm" data-action="mini.rummiMeld"' + (canMeld ? '' : ' disabled') + '>세트로 담기</button>' +
            '<button class="btn btn-sm btn-ghost" data-action="mini.rummiDraw"' + (staged.length ? ' disabled' : '') + '>한 장 뽑기</button>' +
            '<button class="btn btn-sm btn-primary" data-action="mini.rummiSubmit"' + (submitReady ? '' : ' disabled') + '>타일 내기 ▶</button>'
          : '') +
      '</div>' +
    '</div>';
  }

  /* ---------------- 도둑잡기 ---------------- */

  function oldmaidBoard(state) {
    const myTurn = state.status === 'playing' && state.turnPlayerId === state.youId;
    const turnName = (state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name;
    const target = state.players.find(function (p) { return p.id === state.targetId; });

    const hand = (state.hand || []).map(function (card) {
      return '<span class="mg-om-card' + (card.thief ? ' is-thief' : '') + '" aria-label="' + (card.thief ? '도둑 카드' : '동물 카드') + '">' + card.emoji + '</span>';
    }).join('') || '<span class="mg-empty-hand">' + (state.youId ? '손패가 비었습니다! 🎉' : '관전 중입니다.') + '</span>';

    let targetBox = '';
    if (state.status === 'playing') {
      if (myTurn && target && state.targetCount > 0) {
        const cards = [];
        for (let i = 0; i < state.targetCount; i++) {
          cards.push('<button class="mg-om-back" data-action="mini.omDraw" data-index="' + i + '" aria-label="' + esc(target.name) + '의 ' + (i + 1) + '번째 카드 뽑기">?</button>');
        }
        targetBox = '<div class="mg-om-target is-me">' +
          '<div class="mg-om-target-head">👉 <b>' + esc(target.name) + '</b>님의 패에서 한 장 뽑으세요</div>' +
          '<div class="mg-om-back-row">' + cards.join('') + '</div></div>';
      } else if (myTurn) {
        targetBox = '<div class="mg-om-target"><div class="mg-om-target-head">뽑을 카드가 없습니다. 차례를 기다려 주세요…</div></div>';
      } else {
        targetBox = '<div class="mg-om-target"><div class="mg-om-target-head">' + esc(turnName || '') + '님이 카드를 뽑는 중…</div></div>';
      }
    } else {
      const holder = state.players.find(function (p) { return p.id === state.thiefHolderId; });
      targetBox = '<div class="mg-om-target is-done"><div class="mg-om-target-head">🃏 도둑 카드를 들고 있는 사람: <b>' +
        esc(holder ? holder.name : '없음') + '</b></div></div>';
    }

    const last = state.lastDraw;
    const lastLine = last
      ? '<div class="mg-om-last">' + esc((state.players.find(function (p) { return p.id === last.toId; }) || {}).name || '') +
        '님이 ' + esc((state.players.find(function (p) { return p.id === last.fromId; }) || {}).name || '') + '님에게서 ' +
        (last.thief ? '도둑 카드 🃏' : last.emoji) + (last.paired ? ' → 짝을 맞춰 버렸어요!' : '') + '</div>'
      : '';

    return '<div class="mg-board mg-oldmaid">' +
      '<div class="mg-turn-bar ' + (myTurn ? 'is-me' : '') + '">' +
        '<span class="mg-turn-text">' + (state.status === 'finished' ? '🏁 게임 끝' :
          myTurn ? '내 차례! 앞사람 패에서 카드를 뽑으세요.' : esc(turnName || '') + '님 차례…') + '</span>' +
        '<span class="mg-round-chip">남은 사람 ' + state.players.filter(function (p) { return !p.finished; }).length + '명</span>' +
      '</div>' +
      targetBox + lastLine +
      '<div class="mg-om-hand-wrap"><div class="mg-rummi-hand-head">내 패 <span class="hint">' + (state.hand || []).length + '장</span></div>' +
        '<div class="mg-om-hand">' + hand + '</div></div>' +
    '</div>';
  }

  /* ---------------- 전통 장기 ---------------- */

  const janggiUI = { selected: null, moves: -1, turn: null };

  function janggiBoard(state) {
    if (janggiUI.moves !== state.moveCount || janggiUI.turn !== state.turnPlayerId) {
      janggiUI.selected = null;
      janggiUI.moves = state.moveCount;
      janggiUI.turn = state.turnPlayerId;
    }
    const myTurn = state.status === 'playing' && state.turnPlayerId === state.youId;
    const myMoves = state.legalMoves || [];
    const fromMoves = janggiUI.selected
      ? myMoves.filter(function (m) { return m.from.x === janggiUI.selected.x && m.from.y === janggiUI.selected.y; })
      : [];
    const targets = {};
    fromMoves.forEach(function (m) { targets[m.to.x + ',' + m.to.y] = true; });
    const last = state.lastMove;

    const cells = [];
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const piece = state.board[y][x];
        const isSel = janggiUI.selected && janggiUI.selected.x === x && janggiUI.selected.y === y;
        const canGo = !!targets[x + ',' + y];
        const isLastFrom = last && last.from.x === x && last.from.y === y;
        const isLastTo = last && last.to.x === x && last.to.y === y;
        const palace = x >= 3 && x <= 5 && ((y >= 0 && y <= 2) || (y >= 7 && y <= 9));
        let cls = 'mg-jg-cell' + (palace ? ' palace' : '');
        if (isSel) cls += ' is-selected';
        if (canGo) cls += ' can-go';
        if (isLastFrom) cls += ' last-from';
        if (isLastTo) cls += ' last-to';
        const mine = piece && state.youSide && piece.side === state.youSide;
        cells.push(
          '<button class="' + cls + '" data-action="mini.janggiCell" data-x="' + x + '" data-y="' + y + '"' +
            ' aria-label="' + String.fromCharCode(65 + x) + (state.height - y) + (piece ? ' ' + piece.char : ' 빈칸') + '">' +
            (piece
              ? '<span class="mg-jg-piece ' + piece.side + (mine ? ' mine' : '') + '">' + piece.char + '</span>'
              : (canGo ? '<span class="mg-jg-dot"></span>' : '')) +
          '</button>'
        );
      }
    }

    const turnName = (state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name;
    const me = state.players.find(function (p) { return p.id === state.youId; });
    const opp = state.players.find(function (p) { return p.id !== state.youId; });
    const CHAR = { general: '궁', chariot: '차', cannon: '포', horse: '마', elephant: '상', guard: '사', soldier: '졸' };

    return '<div class="mg-board mg-janggi">' +
      '<div class="mg-turn-bar ' + (myTurn ? 'is-me' : '') + '">' +
        (state.status === 'finished'
          ? '<span class="mg-turn-text">🏁 ' + (state.winnerId
              ? esc((state.players.find(function (p) { return p.id === state.winnerId; }) || {}).name || '') + '님 승리!'
              : '무승부입니다.') + '</span>'
          : '<span class="mg-turn-text">' + (myTurn ? '내 차례! 기물을 누르고 갈 곳을 고르세요.' : esc(turnName || '') + '님 차례…') + '</span>') +
        '<span class="mg-round-chip">' + state.moveCount + '수</span>' +
      '</div>' +
      '<div class="mg-jg-wrap"><div class="mg-jg-grid">' + cells.join('') + '</div></div>' +
      '<div class="mg-jg-foot">' +
        '<span class="mg-legend"><i class="mg-jg-swatch cho"></i>초 ' + esc(me && me.side === 'cho' ? '나' : (opp ? opp.name : '')) + '</span>' +
        '<span class="mg-legend"><i class="mg-jg-swatch han"></i>한 ' + esc(me && me.side === 'han' ? '나' : (opp ? opp.name : '')) + '</span>' +
        (myTurn && janggiUI.selected ? '<span class="mg-hint-line">반짝이는 곳으로 움직이면 됩니다. (다시 누르면 취소)</span>' : '') +
      '</div>' +
      '<div class="mg-jg-captured">' +
        (me ? '<span>내가 잡은 기물: ' + (me.captured.length ? me.captured.map(function (t) { return CHAR[t] || t; }).join(' ') : '없음') + '</span>' : '') +
        (opp ? '<span>상대가 잡은 기물: ' + (opp.captured.length ? opp.captured.map(function (t) { return CHAR[t] || t; }).join(' ') : '없음') + '</span>' : '') +
      '</div>' +
    '</div>';
  }

  /* ---------------- 컬러 숫자 카드 ---------------- */

  const OC_LABEL = { skip: '⏭', reverse: '🔄', draw2: '+2', wild: '🌈', draw4: '🌈+4' };

  const OC_ARIA = { skip: '점프', reverse: '방향전환', draw2: '+2 공격', wild: '색 바꾸기', draw4: '무지개 +4' };
  const OC_COLOR_NAME = { red: '빨강', blue: '파랑', yellow: '노랑', green: '초록' };

  function ocCardHtml(card, opts) {
    const o = opts || {};
    let cls = 'mg-oc-card ' + (card.color ? 'c-' + card.color : 'is-wild');
    if (o.playable) cls += ' is-playable';
    if (o.small) cls += ' is-small';
    const label = card.type === 'number' ? card.value : (OC_LABEL[card.type] || '?');
    const name = card.type === 'number'
      ? ((OC_COLOR_NAME[card.color] || '') + ' ' + card.value).trim()
      : (OC_ARIA[card.type] || card.type);
    if (o.static) { return '<span class="' + cls + '" aria-label="' + name + '">' + label + '</span>'; }
    return '<button class="' + cls + '" data-action="mini.ocPlay" data-card="' + card.id + '" aria-label="' + name + '"' +
      (o.playable ? '' : ' disabled') + '>' + label + '</button>';
  }

  function onecardBoard(state) {
    const myTurn = state.status === 'playing' && state.turnPlayerId === state.youId;
    const playable = state.youPlayable || [];
    const turnName = (state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name;
    const COLOR_NAME = { red: '빨강', blue: '파랑', yellow: '노랑', green: '초록' };

    const hand = (state.hand || []).map(function (card) {
      return ocCardHtml(card, { playable: myTurn && playable.indexOf(card.id) !== -1 });
    }).join('') || '<span class="mg-empty-hand">' + (state.youId ? '손패가 비었습니다! 🎉' : '관전 중입니다.') + '</span>';

    let callRow = '';
    if (state.status === 'playing' && myTurn) {
      if (state.youCanSay) {
        callRow = '<div class="mg-oc-call is-me"><button class="btn btn-gold mg-oc-call-btn" data-action="mini.ocSay">📣 원카드! 외치기</button>' +
          '<span class="hint">카드가 1장 남을 때 먼저 외쳐야 해요. 안 외치면 2장을 더 받아요!</span></div>';
      } else if (state.youCalled) {
        callRow = '<div class="mg-oc-call"><span class="mg-oc-called">📣 원카드! 외쳤어요</span><span class="hint">이제 카드를 내면 됩니다.</span></div>';
      }
    }

    return '<div class="mg-board mg-onecard">' +
      '<div class="mg-turn-bar ' + (myTurn ? 'is-me' : '') + '">' +
        (state.status === 'finished'
          ? '<span class="mg-turn-text">🏁 ' + esc((state.players.find(function (p) { return p.id === state.winnerId; }) || {}).name || '') + '님 우승!</span>'
          : '<span class="mg-turn-text">' + (myTurn ? '내 차례! 낼 카드를 고르세요.' : esc(turnName || '') + '님 차례…') + '</span>') +
        '<span class="mg-round-chip">더미 ' + state.deckCount + '장 · ' + (state.direction === 1 ? '↻' : '↺') + '</span>' +
      '</div>' +
      callRow +
      '<div class="mg-oc-table">' +
        '<div class="mg-oc-discard">' + (state.top ? ocCardHtml(state.top, { static: true }) : '') +
          '<span class="mg-oc-color-chip c-' + state.activeColor + '">' + (COLOR_NAME[state.activeColor] || '') + '</span></div>' +
        '<div class="mg-oc-draw">' +
          '<div class="mg-oc-deck">🂠<span>' + state.deckCount + '</span></div>' +
          (myTurn && state.status === 'playing'
            ? '<button class="btn btn-sm" data-action="mini.ocDraw">카드 뽑기</button>'
            : '') +
        '</div>' +
      '</div>' +
      '<div class="mg-rummi-hand-wrap"><div class="mg-rummi-hand-head">내 패 <span class="hint">' + (state.hand || []).length + '장</span></div>' +
        '<div class="mg-oc-hand">' + hand + '</div></div>' +
      (myTurn && state.status === 'playing'
        ? '<p class="hint" style="margin-top:8px">같은 색이거나 같은 숫자(또는 같은 특수 카드)만 낼 수 있어요. 낼 카드가 없으면 1장 뽑으세요. 카드가 1장 남으면 [원카드!]를 먼저 누르세요.</p>'
        : '') +
    '</div>';
  }

  /* ---------------- 선 긋기 땅따먹기 ---------------- */

  function dotsBoard(state) {
    const myTurn = state.status === 'playing' && state.turnPlayerId === state.youId;
    const turnName = (state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name;
    const colorOfId = function (id) {
      const p = state.players.find(function (x) { return x.id === id; });
      return p ? colorOf(p) : '#ccc';
    };

    const parts = [];
    const at = function (v) { return 7 + v * 21.5; };
    // 칸(땅)
    for (let y = 0; y < state.boxCount; y++) {
      for (let x = 0; x < state.boxCount; x++) {
        const owner = state.boxes[y][x];
        const me = owner && owner === state.youId;
        const pname = owner ? ((state.players.find(function (p) { return p.id === owner; }) || {}).name || '') : '';
        parts.push('<div class="mg-dots-box' + (owner ? ' is-owned' : '') + (me ? ' is-me' : '') + '"' +
          ' style="left:' + (at(x) + 1.2) + '%;top:' + (at(y) + 1.2) + '%;width:19.1%;height:19.1%' +
          (owner ? ';background:' + colorOfId(owner) : '') + '">' +
          (owner ? '<span class="mg-dots-owner">' + pname + '</span>' : '') +
          '</div>');
      }
    }
    // 점
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        parts.push('<span class="mg-dots-dot" style="left:' + at(x) + '%;top:' + at(y) + '%"></span>');
      }
    }
    // 가로 선
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.boxCount; x++) {
        const owner = state.hLines[y][x];
        const drawable = myTurn && !owner && state.status === 'playing';
        parts.push('<button class="mg-dots-line h' + (owner ? ' is-owned' : '') + '" data-action="mini.dotsLine" data-type="h" data-x="' + x + '" data-y="' + y + '"' +
          (drawable ? '' : ' disabled') + ' style="left:' + (at(x) + 1.2) + '%;top:' + at(y) + '%' +
          (owner ? ';background:' + colorOfId(owner) : '') + '"></button>');
      }
    }
    // 세로 선
    for (let y = 0; y < state.boxCount; y++) {
      for (let x = 0; x < state.size; x++) {
        const owner = state.vLines[y][x];
        const drawable = myTurn && !owner && state.status === 'playing';
        parts.push('<button class="mg-dots-line v' + (owner ? ' is-owned' : '') + '" data-action="mini.dotsLine" data-type="v" data-x="' + x + '" data-y="' + y + '"' +
          (drawable ? '' : ' disabled') + ' style="left:' + at(x) + '%;top:' + (at(y) + 1.2) + '%' +
          (owner ? ';background:' + colorOfId(owner) : '') + '"></button>');
      }
    }

    const scores = state.players.map(function (p) {
      return '<span class="mg-dots-score' + (p.isTurn ? ' is-turn' : '') + '">' +
        '<i style="background:' + colorOf(p) + '"></i>' + esc(p.name) + ' <b>' + p.score + '</b>칸</span>';
    }).join('');

    return '<div class="mg-board mg-dots">' +
      '<div class="mg-turn-bar ' + (myTurn ? 'is-me' : '') + '">' +
        (state.status === 'finished'
          ? '<span class="mg-turn-text">🏁 모든 땅을 나눴습니다. ' + esc((state.players.find(function (p) { return p.id === state.winnerId; }) || {}).name || '') + '님 우승!</span>'
          : '<span class="mg-turn-text">' + (myTurn ? '내 차례! 선을 그으세요.' : esc(turnName || '') + '님 차례…') + '</span>') +
        '<span class="mg-round-chip">' + state.claimed + '/' + state.totalBoxes + '칸</span>' +
      '</div>' +
      '<div class="mg-dots-stage"><div class="mg-dots-board">' + parts.join('') + '</div></div>' +
      '<div class="mg-dots-scores">' + scores + '</div>' +
      '<p class="hint">네 번째 선을 완성하면 그 칸이 내 땅이 되고 한 번 더 그을 수 있어요.</p>' +
    '</div>';
  }

  /* ---------------- 꼬리잡기 끝말잇기 ---------------- */

  const wordchainUI = { draft: '', turnNo: -1 };

  function wcHearts(n) {
    const out = [];
    for (let i = 0; i < 3; i++) out.push(i < n ? '❤️' : '🤍');
    return out.join('');
  }

  function wordchainBoard(state) {
    const myTurn = state.status === 'playing' && state.turnPlayerId === state.youId;
    const you = state.players.find(function (p) { return p.id === state.youId; });
    const turnName = (state.players.find(function (p) { return p.id === state.turnPlayerId; }) || {}).name;
    if (state.turnNo !== wordchainUI.turnNo) {
      wordchainUI.draft = '';
      wordchainUI.turnNo = state.turnNo;
    }
    const required = state.required;
    const prompt = required === null
      ? '첫 낱말을 자유롭게 말해 보세요!'
      : '“' + required + '”로 시작하는 낱말';

    let turnLine;
    if (state.status === 'finished') {
      turnLine = '🏁 게임 끝! ' + esc((state.players.find(function (p) { return p.id === state.winnerId; }) || {}).name || '') + '님 우승!';
    } else if (myTurn) {
      turnLine = '내 차례! ' + esc(prompt) + '을 입력하세요.';
    } else {
      turnLine = esc(turnName || '') + '님 차례… (' + esc(prompt) + ')';
    }

    const timer = state.status === 'playing' && state.deadline
      ? '<div class="mg-wc-timer" data-deadline="' + state.deadline + '" data-now="' + state.serverNow + '"' +
          ' data-total="' + (state.turnSeconds * 1000) + '" role="timer" aria-label="남은 시간">' +
          '<span class="mg-wc-timer-fill"></span><span class="mg-wc-timer-text">' + state.turnSeconds + '초</span></div>'
      : '';

    const input = state.status === 'playing' && myTurn
      ? '<div class="mg-wc-form">' +
          '<input id="mg-wc-input" class="input mg-wc-input" maxlength="10" autocomplete="off" ' +
            'placeholder="' + (required === null ? '예: 사과' : '‘' + esc(required) + '’로 시작하는 낱말') + '" ' +
            'value="' + esc(wordchainUI.draft) + '">' +
          '<button class="btn btn-primary" data-action="mini.wcSay">말하기</button>' +
        '</div>' +
        '<p class="hint mg-wc-hint">' +
          (required === null ? '2글자 이상 진짜 우리말 낱말이면 무엇이든 좋아요.' :
            '이 글자로 이을 수 있는 낱말이 <b>' + (state.optionsCount || 0) + '개</b> 있어요.') +
          (state.optionsCount === 0 && required !== null ? ' (이어 말할 낱말이 없어 곧 마무리돼요)' : '') +
        '</p>'
      : '';

    let notice = '';
    if (state.status === 'playing' && you && you.eliminated) {
      notice = '<div class="mg-wc-notice is-out">💥 탈락했어요. 친구들의 끝말잇기를 지켜봐 주세요.</div>';
    } else if (state.status === 'playing' && !myTurn) {
      notice = '<div class="mg-wc-notice">' + esc(turnName || '') + '님이 낱말을 고르는 중…</div>';
    }

    const chain = state.chain.slice(-10).reverse().map(function (row) {
      return '<li class="mg-wc-word' + (row.playerId === state.youId ? ' is-me' : '') + '">' +
        '<span class="mg-wc-word-text">' + esc(row.word) + '</span>' +
        '<span class="mg-wc-word-by">' + esc(row.name) + '</span></li>';
    }).join('') || '<li class="mg-wc-empty">아직 나온 낱말이 없어요. 첫 낱말을 기다려요!</li>';

    const players = state.players.map(function (p) {
      return '<div class="mg-wc-player' + (p.id === state.youId ? ' is-me' : '') +
        (p.isTurn ? ' is-turn' : '') + (p.eliminated ? ' is-out' : '') + '">' +
        playerHead(p, { badge: p.isTurn ? '차례' : '' }) +
        '<span class="mg-wc-hearts" aria-label="목숨 ' + p.lives + '개">' + wcHearts(p.lives) + '</span>' +
        '<span class="mg-wc-score">' + p.score + '개</span>' +
      '</div>';
    }).join('');

    return '<div class="mg-board mg-wordchain">' +
      '<div class="mg-turn-bar ' + (myTurn ? 'is-me' : '') + '">' +
        '<span class="mg-turn-text">' + turnLine + '</span>' +
        '<span class="mg-round-chip">' + state.turnNo + '/' + state.maxTurns + ' 낱말</span>' +
      '</div>' +
      timer +
      '<div class="mg-wc-stage">' +
        '<div class="mg-wc-target' + (required === null ? ' is-free' : '') + '">' +
          '<span class="mg-wc-target-label">' + (required === null ? '첫 낱말' : '이 글자로 시작') + '</span>' +
          '<span class="mg-wc-target-char">' + (required === null ? '🐍' : esc(required)) + '</span>' +
        '</div>' +
        '<div class="mg-wc-last">' +
          (state.chain.length
            ? '<span class="mg-wc-last-label">마지막 낱말</span><b>' + esc(state.chain[state.chain.length - 1].word) + '</b>' +
              '<span class="mg-wc-last-by">' + esc(state.chain[state.chain.length - 1].name) + '</span>'
            : '<span class="mg-wc-last-label">아직 없음</span>') +
        '</div>' +
      '</div>' +
      input +
      notice +
      '<ol class="mg-wc-chain">' + chain + '</ol>' +
      '<div class="mg-wc-players">' + players + '</div>' +
      '<p class="hint mg-wc-foot">사전에 있는 우리말 낱말 ' + state.dictionaryCount + '개 · 2글자 이상 · 이미 나온 낱말은 안 돼요.</p>' +
    '</div>';
  }

  BG.miniBoards = {
    SEAT_COLORS: SEAT_COLORS,
    colorOf: colorOf,
    streams: streamsBoard,
    gomoku: gomokuBoard,
    liar: liarBoard,
    yut: yutBoard,
    yutSvg: yutSvg,
    rummi: rummiBoard,
    oldmaid: oldmaidBoard,
    janggi: janggiBoard,
    onecard: onecardBoard,
    dots: dotsBoard,
    wordchain: wordchainBoard
  };

  /* ---------------- 새 게임 동작 ---------------- */

  function stateNow() {
    return BG.mini && BG.mini.currentState ? BG.mini.currentState() : null;
  }

  function rerender() {
    if (BG.mini && BG.mini.rerender) BG.mini.rerender();
  }

  function toast(text, kind) {
    BG.ui.toast(text, kind || 'error');
  }

  BG.actions['mini.rummiTile'] = function (el) {
    const id = el.getAttribute('data-id');
    if (!id) return;
    const idx = rummiUI.selected.indexOf(id);
    if (idx === -1) rummiUI.selected.push(id);
    else rummiUI.selected.splice(idx, 1);
    rerender();
  };

  BG.actions['mini.rummiMeld'] = function () {
    const state = stateNow();
    if (!state) return;
    const tiles = rummiUI.selected.map(function (id) { return handTileOf(state, id); }).filter(Boolean);
    if (tiles.length < 3) { toast('세트는 3장 이상 골라 주세요.'); return; }
    const check = window.Rummi && window.Rummi.validateSet(tiles);
    if (!check || !check.ok) { toast('세트 규칙에 맞지 않습니다. (같은 숫자 다른 색 3~4장 · 같은 색 연속 3장 이상)'); return; }
    rummiUI.pendingMelds.push(rummiUI.selected.slice());
    rummiUI.selected = [];
    rerender();
  };

  BG.actions['mini.rummiAdd'] = function (el) {
    const state = stateNow();
    if (!state) return;
    const setId = el.getAttribute('data-set');
    const set = (state.table || []).find(function (s) { return s.id === setId; });
    if (!set) return;
    if (rummiUI.selected.length === 0) { toast('붙일 타일을 먼저 골라 주세요.'); return; }
    const tiles = rummiUI.selected.map(function (id) { return handTileOf(state, id); }).filter(Boolean);
    const check = window.Rummi && window.Rummi.validateSet(set.tiles.concat(tiles));
    if (!check || !check.ok) { toast('이 세트에 붙이면 규칙에 맞지 않습니다.'); return; }
    rummiUI.pendingAdds.push({ setId: setId, tileIds: rummiUI.selected.slice() });
    rummiUI.selected = [];
    rerender();
  };

  /** 학생이 막혔을 때: 지금 손패에서 낼 수 있는 세트를 찾아 자동으로 담아 줍니다. */
  BG.actions['mini.rummiHelp'] = function () {
    const state = stateNow();
    if (!state) return;
    if (state.status !== 'playing' || state.turnPlayerId !== state.youId) {
      toast('내 차례에만 도움을 받을 수 있어요.');
      return;
    }
    const sets = window.Rummi && window.Rummi.findSets ? window.Rummi.findSets(state.hand || []) : [];
    const usable = sets.filter(function (set) {
      return window.Rummi.validateSet(set.tiles).ok;
    });
    if (!usable.length) {
      toast('지금 손패로 만들 수 있는 세트가 없어요. [한 장 뽑기]를 눌러 보세요.');
      return;
    }
    // 겹치지 않는 세트를 두 개까지 골라 담습니다. (처음 등록이면 기준 점수를 넘도록)
    const used = {};
    const picked = [];
    let sum = 0;
    usable.forEach(function (set) {
      if (picked.length >= 2) return;
      if (set.tiles.some(function (t) { return used[t.id]; })) return;
      picked.push(set);
      set.tiles.forEach(function (t) { used[t.id] = true; });
      sum += window.Rummi.pointsOf(set.tiles);
    });
    rummiUI.selected = [];
    rummiUI.pendingMelds = picked.map(function (set) {
      return set.tiles.map(function (t) { return t.id; });
    });
    rerender();
    if (!state.youMelded && sum < state.initialPoints) {
      toast('세트를 담았어요. ' + (state.initialPoints - sum) + '점 더 필요해요.', 'ok');
    } else {
      toast('낼 수 있는 세트 ' + picked.length + '개를 담았어요. [타일 내기]를 눌러 보세요!', 'ok');
    }
  };

  BG.actions['mini.rummiReset'] = function () {
    rummiUI.selected = [];
    rummiUI.pendingMelds = [];
    rummiUI.pendingAdds = [];
    rerender();
  };

  BG.actions['mini.rummiSubmit'] = function () {
    if (!BG.mini || !BG.mini.playAction) return;
    BG.mini.playAction('play', {
      melds: rummiUI.pendingMelds.map(function (group) { return { tileIds: group.slice() }; }),
      adds: rummiUI.pendingAdds.map(function (add) { return { setId: add.setId, tileIds: add.tileIds.slice() }; })
    });
  };

  BG.actions['mini.rummiDraw'] = function () {
    if (BG.mini && BG.mini.playAction) BG.mini.playAction('draw', {});
  };

  BG.actions['mini.omDraw'] = function (el) {
    const index = Number(el.getAttribute('data-index'));
    if (BG.mini && BG.mini.playAction) BG.mini.playAction('draw', { index: index });
  };

  BG.actions['mini.janggiCell'] = function (el) {
    const state = stateNow();
    if (!state || !BG.mini || !BG.mini.playAction) return;
    if (state.status !== 'playing' || state.turnPlayerId !== state.youId) return;
    const x = Number(el.getAttribute('data-x'));
    const y = Number(el.getAttribute('data-y'));
    const piece = state.board[y][x];
    const legal = (state.legalMoves || []).filter(function (m) {
      return janggiUI.selected && m.from.x === janggiUI.selected.x && m.from.y === janggiUI.selected.y;
    });
    const isTarget = legal.some(function (m) { return m.to.x === x && m.to.y === y; });
    if (janggiUI.selected && isTarget) {
      BG.mini.playAction('move', { from: janggiUI.selected, to: { x: x, y: y } });
      return;
    }
    if (piece && state.youSide && piece.side === state.youSide) {
      if (janggiUI.selected && janggiUI.selected.x === x && janggiUI.selected.y === y) janggiUI.selected = null;
      else janggiUI.selected = { x: x, y: y };
      rerender();
      return;
    }
    if (janggiUI.selected) {
      janggiUI.selected = null;
      rerender();
    }
  };

  BG.actions['mini.ocPlay'] = function (el) {
    const cardId = el.getAttribute('data-card');
    const state = stateNow();
    if (!cardId || !state) return;
    const card = (state.hand || []).find(function (c) { return c.id === cardId; });
    if (!card) return;
    if (window.OneCard && window.OneCard.isWildType && window.OneCard.isWildType(card)) {
      const colors = [
        { id: 'red', name: '빨강' }, { id: 'blue', name: '파랑' },
        { id: 'yellow', name: '노랑' }, { id: 'green', name: '초록' }
      ];
      BG.ui.modal(
        '<div class="mg-color-pick"><h2>🎨 어떤 색으로 바꿀까요?</h2><div class="mg-color-grid">' +
          colors.map(function (c) {
            return '<button class="btn mg-color-btn c-' + c.id + '" data-action="mini.ocWild" data-card="' + cardId + '" data-color="' + c.id + '">' + c.name + '</button>';
          }).join('') +
        '</div></div>'
      );
      return;
    }
    if (BG.mini && BG.mini.playAction) BG.mini.playAction('play', { cardId: cardId });
  };

  BG.actions['mini.ocWild'] = function (el) {
    const cardId = el.getAttribute('data-card');
    const color = el.getAttribute('data-color');
    BG.ui.closeModal();
    if (BG.mini && BG.mini.playAction) BG.mini.playAction('play', { cardId: cardId, color: color });
  };

  BG.actions['mini.ocDraw'] = function () {
    if (BG.mini && BG.mini.playAction) BG.mini.playAction('draw', {});
  };

  BG.actions['mini.ocSay'] = function () {
    if (BG.mini && BG.mini.playAction) BG.mini.playAction('say', {});
  };

  BG.actions['mini.dotsLine'] = function (el) {
    const type = el.getAttribute('data-type');
    const x = Number(el.getAttribute('data-x'));
    const y = Number(el.getAttribute('data-y'));
    if (BG.mini && BG.mini.playAction) BG.mini.playAction('line', { type: type, x: x, y: y });
  };

  /* ----- 꼬리잡기 끝말잇기 ----- */

  BG.actions['mini.wcSay'] = function () {
    const input = document.getElementById('mg-wc-input');
    const text = String(input ? input.value : '').trim();
    if (!text) {
      toast('낱말을 입력해 주세요.');
      if (input) input.focus();
      return;
    }
    wordchainUI.draft = text;
    if (BG.mini && BG.mini.playAction) BG.mini.playAction('say', { text: text });
  };

  /* 끝말잇기 입력칸: 다시 그려도 입력 중인 낱말이 지워지지 않게 기억합니다. */
  document.addEventListener('input', function (event) {
    const el = event.target;
    if (!el || el.id !== 'mg-wc-input') return;
    wordchainUI.draft = String(el.value || '');
  });

  BG.wordchainDraft = function () { return wordchainUI.draft; };
})();
