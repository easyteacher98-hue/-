/*
 * 1인용 미니 퍼즐 – 2048 & 짝맞추기
 * - 반 코드로 들어온 학생이 짝을 기다리거나 혼자 연습할 때 바로 즐기는 1인용 화면입니다.
 * - 최고점은 이 기기에 반·출석번호별로 저장하고, 서버에 연결되어 있으면 우리 반 포인트도 조금 쌓입니다.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const esc = BG.ui.escape;

  const PAIRS_EMOJI = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍑', '🍉', '🥝'];
  const SIZE = 4;

  const S = {
    mode: null,
    board: null,
    score: 0,
    over: false,
    won: false,
    continueAfterWin: false,
    best: 0,
    sentKey: '',
    pairs: {
      cards: [],
      open: [],
      matched: 0,
      moves: 0,
      startedAt: 0,
      locked: false,
      timer: null
    }
  };

  function bestKey(kind) {
    return 'bg.puzzle.' + kind + '.' + (BG.cleanClassCode(BG.state.classCode) || '-') + '.' + (BG.state.number || '-');
  }

  function getBest(kind) {
    const raw = BG.storage.get(bestKey(kind), 0);
    return Number(raw) || 0;
  }

  function setBest(kind, score) {
    if (score > getBest(kind)) BG.storage.set(bestKey(kind), score);
  }

  function myLabel() {
    return BG.studentLabel(BG.state.number, BG.state.name);
  }

  function reportScore(kind, score) {
    const number = Number(BG.state.number);
    if (!number || !BG.state.classCode) return;
    const key = kind + ':' + score + ':' + Date.now();
    if (S.sentKey === key) return;
    S.sentKey = key;
    if (!BG.net.connected) BG.net.connect();
    BG.net.send({
      t: 'soloResult',
      gameId: 'puzzle',
      classCode: BG.state.classCode,
      number: number,
      studentName: BG.state.name || '',
      score: Math.round(score)
    });
  }

  /* ---------------- 2048 ---------------- */

  function emptyBoard() {
    const board = [];
    for (let y = 0; y < SIZE; y++) {
      const row = [];
      for (let x = 0; x < SIZE; x++) row.push(0);
      board.push(row);
    }
    return board;
  }

  function emptyCells(board) {
    const out = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) if (!board[y][x]) out.push({ x: x, y: y });
    }
    return out;
  }

  function addTile(board) {
    const cells = emptyCells(board);
    if (!cells.length) return;
    const cell = cells[Math.floor(Math.random() * cells.length)];
    board[cell.y][cell.x] = Math.random() < 0.9 ? 2 : 4;
  }

  function cloneBoard(board) {
    return board.map(function (row) { return row.slice(); });
  }

  function slideLine(line) {
    const values = line.filter(function (v) { return v !== 0; });
    const out = [];
    let gained = 0;
    for (let i = 0; i < values.length; i++) {
      if (i + 1 < values.length && values[i] === values[i + 1]) {
        const merged = values[i] * 2;
        out.push(merged);
        gained += merged;
        i += 1;
      } else {
        out.push(values[i]);
      }
    }
    while (out.length < SIZE) out.push(0);
    return { line: out, gained: gained };
  }

  function moveBoard(board, dir) {
    let next = cloneBoard(board);
    let gained = 0;
    let moved = false;

    if (dir === 'left' || dir === 'right') {
      for (let y = 0; y < SIZE; y++) {
        let line = board[y].slice();
        if (dir === 'right') line.reverse();
        const result = slideLine(line);
        let out = result.line;
        gained += result.gained;
        if (dir === 'right') out = out.slice().reverse();
        for (let x = 0; x < SIZE; x++) {
          next[y][x] = out[x];
          if (next[y][x] !== board[y][x]) moved = true;
        }
      }
    } else {
      for (let x = 0; x < SIZE; x++) {
        let line = [];
        for (let y = 0; y < SIZE; y++) line.push(board[y][x]);
        if (dir === 'down') line.reverse();
        const result = slideLine(line);
        let out = result.line;
        gained += result.gained;
        if (dir === 'down') out = out.slice().reverse();
        for (let y = 0; y < SIZE; y++) {
          next[y][x] = out[y];
          if (next[y][x] !== board[y][x]) moved = true;
        }
      }
    }
    return { board: next, gained: gained, moved: moved };
  }

  function hasMoves(board) {
    if (emptyCells(board).length) return true;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = board[y][x];
        if (x + 1 < SIZE && board[y][x + 1] === v) return true;
        if (y + 1 < SIZE && board[y + 1][x] === v) return true;
      }
    }
    return false;
  }

  function newGame() {
    S.board = emptyBoard();
    S.score = 0;
    S.over = false;
    S.won = false;
    S.continueAfterWin = false;
    S.sentKey = '';
    addTile(S.board);
    addTile(S.board);
    renderPuzzle();
  }

  function step(dir) {
    if (!S.board || S.over) return;
    const result = moveBoard(S.board, dir);
    if (!result.moved) return;
    S.board = result.board;
    S.score += result.gained;
    addTile(S.board);
    let max = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) max = Math.max(max, S.board[y][x]);
    }
    if (max >= 2048 && !S.won) {
      S.won = true;
      setBest('2048', S.score);
      reportScore('2048', S.score);
    }
    if (!hasMoves(S.board)) {
      S.over = true;
      setBest('2048', S.score);
      reportScore('2048', S.score);
    }
    renderPuzzle();
    if (S.won && !S.continueAfterWin) {
      BG.ui.modal(
        '<h2>🎉 2048 달성!</h2>' +
        '<p>점수 <b>' + S.score + '</b>점 · 최고점 <b>' + getBest('2048') + '</b>점</p>' +
        '<div class="row" style="justify-content:center;margin-top:14px">' +
          '<button class="btn btn-primary" data-action="puzzle.continue">계속하기</button>' +
          '<button class="btn" data-action="puzzle.restart">새 게임</button>' +
        '</div>'
      );
    } else if (S.over) {
      BG.ui.modal(
        '<h2>더 옮길 수 없어요</h2>' +
        '<p>점수 <b>' + S.score + '</b>점 · 최고점 <b>' + getBest('2048') + '</b>점</p>' +
        '<div class="row" style="justify-content:center;margin-top:14px">' +
          '<button class="btn btn-primary" data-action="puzzle.restart">한 번 더</button>' +
          '<button class="btn" data-action="ui.closeModal">닫기</button>' +
        '</div>'
      );
    }
  }

  function tileClass(value) {
    if (!value) return 'pz-empty';
    if (value <= 2048) return 'v' + value;
    return 'v-big';
  }

  function board2048Html() {
    const cells = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = S.board[y][x];
        cells.push('<div class="pz-tile ' + tileClass(v) + '">' + (v ? v : '') + '</div>');
      }
    }
    return '<div class="pz-2048-grid" id="pz-2048">' + cells.join('') + '</div>';
  }

  /* ---------------- 짝맞추기 ---------------- */

  function dealPairs() {
    const deck = [];
    PAIRS_EMOJI.forEach(function (emoji, i) {
      deck.push({ id: i, emoji: emoji });
      deck.push({ id: i, emoji: emoji });
    });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    S.pairs = {
      cards: deck.map(function (card) { return { id: card.id, emoji: card.emoji, open: false, matched: false }; }),
      open: [],
      matched: 0,
      moves: 0,
      startedAt: Date.now(),
      locked: false,
      timer: null
    };
  }

  function flip(index) {
    const st = S.pairs;
    if (st.locked) return;
    const card = st.cards[index];
    if (!card || card.open || card.matched) return;
    card.open = true;
    st.open.push(index);
    if (st.open.length === 2) {
      st.moves += 1;
      const a = st.cards[st.open[0]];
      const b = st.cards[st.open[1]];
      if (a.id === b.id) {
        a.matched = true;
        b.matched = true;
        st.open = [];
        st.matched += 1;
        if (st.matched === PAIRS_EMOJI.length) finishPairs();
        renderPuzzle();
      } else {
        st.locked = true;
        renderPuzzle();
        setTimeout(function () {
          a.open = false;
          b.open = false;
          st.open = [];
          st.locked = false;
          renderPuzzle();
        }, 700);
      }
      return;
    }
    renderPuzzle();
  }

  function pairsScore() {
    const st = S.pairs;
    const seconds = Math.max(1, Math.round((Date.now() - st.startedAt) / 1000));
    return Math.max(50, 1000 - (st.moves - 8) * 25 - seconds * 3);
  }

  function finishPairs() {
    const score = pairsScore();
    setBest('pairs', score);
    reportScore('pairs', score);
    setTimeout(function () {
      BG.ui.modal(
        '<h2>🎉 짝을 모두 찾았어요!</h2>' +
        '<p>시도 <b>' + S.pairs.moves + '</b>번 · 점수 <b>' + score + '</b>점<br>최고점 <b>' + getBest('pairs') + '</b>점</p>' +
        '<div class="row" style="justify-content:center;margin-top:14px">' +
          '<button class="btn btn-primary" data-action="puzzle.deal">한 번 더</button>' +
          '<button class="btn" data-action="ui.closeModal">닫기</button>' +
        '</div>'
      );
    }, 250);
  }

  function pairsHtml() {
    const st = S.pairs;
    const cards = st.cards.map(function (card, i) {
      const shown = card.open || card.matched;
      return '<button class="pz-card' + (shown ? ' is-open' : '') + (card.matched ? ' is-matched' : '') + '" ' +
        'data-action="puzzle.flip" data-index="' + i + '" aria-label="' + (shown ? card.emoji : '뒤집힌 카드') + '">' +
        (shown ? card.emoji : '❓') + '</button>';
    }).join('');
    return '<div class="pz-pairs-head">' +
        '<span class="pz-stat">시도 <b>' + st.moves + '</b>번</span>' +
        '<span class="pz-stat">찾은 짝 <b>' + st.matched + '</b>/' + PAIRS_EMOJI.length + '</span>' +
        '<span class="pz-stat">최고점 <b>' + getBest('pairs') + '</b></span>' +
      '</div>' +
      '<div class="pz-pairs-grid">' + cards + '</div>';
  }

  /* ---------------- 화면 ---------------- */

  function puzzleHomeHtml() {
    return '<div class="entry-top"><a class="back-link" href="#/class/' + esc(BG.state.classCode) + '">← 게임 선택</a>' +
        '<span class="spacer"></span><span class="badge">🧩 1인용</span></div>' +
      '<section class="portal-hero pz-hero">' +
        '<div class="portal-kicker">1인용 미니 퍼즐</div>' +
        '<h1 class="portal-title">머리 <em>쉬어가기</em></h1>' +
        '<p class="portal-sub">짝을 기다리거나 혼자 연습할 때 바로 즐겨요. 최고점은 이 기기에 저장되고, 서버에 연결되면 우리 반 포인트도 조금 쌓여요.</p>' +
        '<p class="hint">내 기록: <b>' + esc(myLabel()) + '</b> · 2048 최고 <b>' + getBest('2048') + '</b>점 · 짝맞추기 최고 <b>' + getBest('pairs') + '</b>점</p>' +
      '</section>' +
      '<div class="pz-choice">' +
        '<a class="pz-choice-card" href="#/puzzle/2048">' +
          '<span class="pz-choice-emoji">🔢</span>' +
          '<span class="pz-choice-title">2048</span>' +
          '<span class="pz-choice-desc">같은 숫자를 합쳐 2048을 만들어 보세요. 방향키·스와이프로 움직입니다.</span>' +
        '</a>' +
        '<a class="pz-choice-card" href="#/puzzle/pairs">' +
          '<span class="pz-choice-emoji">🃏</span>' +
          '<span class="pz-choice-title">짝맞추기</span>' +
          '<span class="pz-choice-desc">뒤집힌 카드에서 같은 과일 짝을 찾아요. 적은 시도로 찾을수록 점수가 높아요.</span>' +
        '</a>' +
      '</div>' +
      '<div class="portal-foot"><span>' +
        (BG.net.connected ? '서버 연결됨 — 최고점이 우리 반 포인트에 반영돼요.' : '서버 연결 없이도 퍼즐은 그대로 즐길 수 있어요.') +
      '</span></div>';
  }

  function renderPuzzle() {
    if (S.mode === '2048') {
      BG.ui.screen(
        '<div class="entry-top"><a class="back-link" href="#/puzzle">← 퍼즐 선택</a>' +
          '<span class="spacer"></span><span class="badge">🔢 2048</span></div>' +
        '<div class="pz-head">' +
          '<div><h1 class="entry-title">🔢 2048</h1>' +
            '<p class="page-sub">방향키 · WASD · 화면을 밀어서 움직여요.</p></div>' +
          '<div class="pz-scoreboard">' +
            '<span class="pz-score"><small>점수</small><b>' + S.score + '</b></span>' +
            '<span class="pz-score"><small>최고</small><b>' + getBest('2048') + '</b></span>' +
          '</div>' +
        '</div>' +
        '<div class="pz-2048-wrap">' + board2048Html() + '</div>' +
        '<div class="row" style="justify-content:center;margin-top:14px;gap:8px">' +
          '<button class="btn" data-action="puzzle.restart">🔁 새 게임</button>' +
          '<button class="btn btn-ghost" data-action="puzzle.help">❓ 규칙</button>' +
        '</div>',
        'puzzle.2048'
      );
      bindSwipe();
      return;
    }
    if (S.mode === 'pairs') {
      BG.ui.screen(
        '<div class="entry-top"><a class="back-link" href="#/puzzle">← 퍼즐 선택</a>' +
          '<span class="spacer"></span><span class="badge">🃏 짝맞추기</span></div>' +
        '<div class="pz-head"><div><h1 class="entry-title">🃏 짝맞추기</h1>' +
          '<p class="page-sub">같은 과일 카드 2장을 찾으면 사라져요. 적은 시도·짧은 시간일수록 점수가 높아요.</p></div></div>' +
        '<div class="pz-pairs-wrap">' + pairsHtml() + '</div>' +
        '<div class="row" style="justify-content:center;margin-top:14px">' +
          '<button class="btn" data-action="puzzle.deal">🔁 새로 섞기</button>' +
        '</div>',
        'puzzle.pairs'
      );
      return;
    }
    BG.ui.screen(puzzleHomeHtml(), 'puzzle');
  }

  function bindSwipe() {
    const el = document.getElementById('pz-2048');
    if (!el) return;
    let sx = 0;
    let sy = 0;
    let active = false;
    el.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      active = true;
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!active) return;
      active = false;
      const touch = (e.changedTouches && e.changedTouches[0]) || null;
      if (!touch) return;
      const dx = touch.clientX - sx;
      const dy = touch.clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });
  }

  /* ---------------- 동작 ---------------- */

  BG.actions['puzzle.restart'] = function () {
    BG.ui.closeModal();
    S.won = false;
    newGame();
  };

  BG.actions['puzzle.continue'] = function () {
    S.continueAfterWin = true;
    BG.ui.closeModal();
    renderPuzzle();
  };

  BG.actions['puzzle.deal'] = function () {
    BG.ui.closeModal();
    dealPairs();
    renderPuzzle();
  };

  BG.actions['puzzle.flip'] = function (el) {
    flip(Number(el.getAttribute('data-index')));
  };

  BG.actions['puzzle.help'] = function () {
    BG.ui.modal(
      '<h2>🔢 2048 규칙</h2>' +
      '<ol class="rules-list">' +
        '<li>방향키(또는 스와이프)로 모든 숫자를 그 방향으로 밀어요.</li>' +
        '<li>같은 숫자 두 개가 만나면 하나로 합쳐집니다.</li>' +
        '<li>빈 칸이 없거나 더 못 움직이면 끝나요.</li>' +
        '<li>2048을 만들면 이겨요! 계속해서 더 큰 숫자에 도전할 수 있어요.</li>' +
      '</ol>' +
      '<button class="btn btn-primary btn-block" data-action="ui.closeModal" style="margin-top:14px">확인</button>'
    );
  };

  /* ---------------- 키 입력 · 라우트 ---------------- */

  BG.keyHandlers = BG.keyHandlers || [];
  BG.keyHandlers.push(function (event) {
    if (screenName() !== 'puzzle.2048') return false;
    const map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down'
    };
    const dir = map[event.key];
    if (!dir) return false;
    step(dir);
    return true;
  });

  function screenName() {
    return document.body.dataset.screen || '';
  }

  BG.router.add(/^\/puzzle$/, 'puzzle', function () {
    renderPuzzle();
    BG.net.connect();
  });

  BG.router.add(/^\/puzzle\/2048$/, 'puzzle.2048', function () {
    S.mode = '2048';
    if (!S.board) newGame();
    else renderPuzzle();
  });

  BG.router.add(/^\/puzzle\/pairs$/, 'puzzle.pairs', function () {
    S.mode = 'pairs';
    if (!S.pairs.cards.length) dealPairs();
    renderPuzzle();
  });

  BG.miniPuzzle = {
    S: S,
    moveBoard: moveBoard,
    slideLine: slideLine,
    hasMoves: hasMoves,
    newGame: newGame,
    step: step,
    render: renderPuzzle
  };
})();
