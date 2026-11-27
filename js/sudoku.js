/*
 * 1인용 스도쿠 – 화면
 * - 4×4(저학년) · 6×6(중학년) · 9×9(고학년)
 * - 메모·힌트·오답 표시, 최고 점수는 이 기기에 저장하고 서버에 연결되어 있으면 우리 반 포인트도 쌓입니다.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const esc = BG.ui.escape;

  const SIZES = [4, 6, 9];
  const SIZE_INFO = {
    4: { title: '4×4', grade: '저학년', emoji: '🟢', desc: '숫자 1~4를 가로·세로·네 칸 상자에 한 번씩' },
    6: { title: '6×6', grade: '중학년', emoji: '🟡', desc: '숫자 1~6을 가로·세로·여섯 칸 상자에 한 번씩' },
    9: { title: '9×9', grade: '고학년', emoji: '🔴', desc: '숫자 1~9를 가로·세로·아홉 칸 상자에 한 번씩' }
  };

  const S = {
    size: 0,
    game: null,
    selected: null,
    notes: false,
    timer: null,
    sentKey: '',
    toastShown: false
  };

  function screenName() {
    return document.body.dataset.screen || '';
  }

  function myLabel() {
    return BG.studentLabel(BG.state.number, BG.state.name);
  }

  function bestKey(size) {
    return 'bg.sudoku.best.' + size + '.' + (BG.cleanClassCode(BG.state.classCode) || '-') + '.' + (BG.state.number || '-');
  }

  function getBest(size) {
    return Number(BG.storage.get(bestKey(size), 0)) || 0;
  }

  function setBest(size, score) {
    if (score > getBest(size)) BG.storage.set(bestKey(size), score);
  }

  function reportScore(size, score) {
    const number = Number(BG.state.number);
    if (!number || !BG.state.classCode) return;
    const key = size + ':' + score;
    if (S.sentKey === key) return;
    S.sentKey = key;
    if (!BG.net.connected) BG.net.connect();
    BG.net.send({
      t: 'soloResult',
      gameId: 'sudoku',
      classCode: BG.state.classCode,
      number: number,
      studentName: BG.state.name || '',
      score: Math.round(score)
    });
  }

  function stopTimer() {
    if (S.timer) {
      clearInterval(S.timer);
      S.timer = null;
    }
  }

  function timeText(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------------- 메뉴 ---------------- */

  function menuHtml() {
    const cards = SIZES.map(function (size) {
      const info = SIZE_INFO[size];
      const best = getBest(size);
      return '<a class="sd-size-card" href="#/sudoku/' + size + '">' +
        '<div class="sd-size-emoji">' + info.emoji + '</div>' +
        '<div class="sd-size-title">' + info.title + ' <span class="grade-badge g-' + (size === 4 ? 'low' : size === 6 ? 'mid' : 'high') + '">' + info.grade + '</span></div>' +
        '<div class="sd-size-desc">' + esc(info.desc) + '</div>' +
        '<div class="sd-size-best">최고 점수 <b>' + (best ? best + '점' : '아직 없음') + '</b></div>' +
        '<span class="btn btn-primary btn-sm">시작하기 →</span>' +
      '</a>';
    }).join('');

    BG.ui.screen(
      '<div class="entry-top">' +
        '<a class="back-link" href="#/class/' + esc(BG.state.classCode || '') + '">← 게임 선택</a>' +
        '<span class="spacer"></span>' +
        '<span class="badge">' + esc(BG.className() || '연습') + '</span>' +
      '</div>' +
      '<section class="portal-hero sd-hero">' +
        '<div class="portal-kicker">1인용 퍼즐</div>' +
        '<h1 class="portal-title">1인용 <em>스도쿠</em></h1>' +
        '<p class="portal-sub">난이도를 고르면 <b>해답이 하나뿐인</b> 퍼즐을 새로 만들어 드려요.<br>' +
          '메모·힌트를 쓰고, 시간 안에 풀면 우리 반 포인트도 쌓입니다.</p>' +
      '</section>' +
      '<div class="sd-size-grid">' + cards + '</div>' +
      '<section class="panel" style="margin-top:18px">' +
        '<div class="panel-title">📖 하는 방법</div>' +
        '<ol class="rules-list">' +
          '<li>빈 칸을 누르고 아래 숫자를 누르면 채워집니다.</li>' +
          '<li>가로줄·세로줄·상자 안에서 같은 숫자가 겹치면 빨갛게 표시됩니다.</li>' +
          '<li><b>메모</b>를 켜면 작은 후보 숫자를 적을 수 있어요.</li>' +
          '<li>막히면 <b>힌트</b>를 쓸 수 있지만 점수가 조금 줄어요.</li>' +
          '<li>모두 채우면 점수와 함께 최고 기록이 저장됩니다. (빠를수록·힌트를 적게 쓸수록 높은 점수)</li>' +
        '</ol>' +
      '</section>' +
      '<div class="portal-foot">' +
        '<span><span class="conn-dot ' + (BG.net.connected ? 'on' : '') + '"></span>' +
          (BG.net.connected ? '실시간 서버 연결됨 — 포인트가 우리 반에 쌓입니다' : '서버 연결 없음 — 혼자서도 그대로 즐길 수 있어요') + '</span>' +
      '</div>',
      'sudoku'
    );
  }

  /* ---------------- 게임 화면 ---------------- */

  function boxClasses(size, x, y) {
    const box = window.Sudoku.BOX[size];
    const cls = [];
    if ((x + 1) % box.w === 0 && x + 1 < size) cls.push('br');
    if ((y + 1) % box.h === 0 && y + 1 < size) cls.push('bb');
    return cls.join(' ');
  }

  function gridHtml(state) {
    const size = state.size;
    const conflict = {};
    (state.conflicts || []).forEach(function (c) { conflict[c.x + ',' + c.y] = true; });
    const sel = S.selected;
    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const value = state.grid[y][x];
        const fixed = !!state.puzzle[y][x];
        const notes = (state.notes && state.notes[y][x]) || [];
        const sameLine = sel && (sel.x === x || sel.y === y);
        const isSel = sel && sel.x === x && sel.y === y;
        let cls = 'sd-cell' + (fixed ? ' is-fixed' : '') + (conflict[x + ',' + y] ? ' is-bad' : '') +
          (isSel ? ' is-selected' : sameLine ? ' is-line' : '');
        const boxCls = boxClasses(size, x, y);
        if (boxCls) cls += ' ' + boxCls;
        const noteHtml = notes.length
          ? '<span class="sd-notes">' + notes.map(function (n) { return '<i>' + n + '</i>'; }).join('') + '</span>'
          : '';
        cells.push('<button class="' + cls + '" data-action="sudoku.cell" data-x="' + x + '" data-y="' + y + '"' +
          ' aria-label="' + (y + 1) + '행 ' + (x + 1) + '열 ' + (value ? value : '빈칸') + '">' +
          (value ? '<span class="sd-value">' + value + '</span>' : noteHtml) + '</button>');
      }
    }
    return '<div class="sd-grid size-' + size + '" style="--sd-cols:' + size + '">' + cells.join('') + '</div>';
  }

  function padHtml(state) {
    const buttons = [];
    for (let n = 1; n <= state.size; n++) {
      buttons.push('<button class="sd-num" data-action="sudoku.num" data-n="' + n + '">' + n + '</button>');
    }
    buttons.push('<button class="sd-num sd-erase" data-action="sudoku.num" data-n="0" aria-label="지우기">⌫</button>');
    return '<div class="sd-pad" style="--sd-pad-cols:' + Math.min(state.size + 1, 5) + '">' + buttons.join('') + '</div>';
  }

  function renderGame() {
    const game = S.game;
    if (!game) { BG.navigate('/sudoku'); return; }
    const state = game.stateFor();
    const left = state.grid.reduce(function (sum, row) {
      return sum + row.filter(function (v, x) { return !v; }).length;
    }, 0);
    const usedHints = state.hintsUsed;

    BG.ui.screen(
      '<div class="entry-top">' +
        '<a class="back-link" href="#/sudoku">← 난이도 선택</a>' +
        '<span class="spacer"></span>' +
        '<span class="badge">' + SIZE_INFO[state.size].title + ' · ' + SIZE_INFO[state.size].grade + '</span>' +
      '</div>' +
      '<div class="sd-head">' +
        '<div class="sd-head-info">' +
          '<span class="sd-chip">⏱ <b id="sd-timer">' + timeText(state.seconds) + '</b></span>' +
          '<span class="sd-chip">💡 힌트 <b>' + usedHints + '</b></span>' +
          '<span class="sd-chip">❌ 오답 <b>' + state.mistakes + '</b></span>' +
          '<span class="sd-chip">🏅 최고 <b>' + getBest(state.size) + '</b>점</span>' +
        '</div>' +
        '<div class="sd-head-tools">' +
          '<button class="btn btn-sm ' + (S.notes ? 'btn-gold' : 'btn-ghost') + '" data-action="sudoku.notes" aria-pressed="' + (S.notes ? 'true' : 'false') + '">✏️ 메모 ' + (S.notes ? '켜짐' : '꺼짐') + '</button>' +
          '<button class="btn btn-sm btn-ghost" data-action="sudoku.hint">💡 힌트</button>' +
          '<button class="btn btn-sm btn-ghost" data-action="sudoku.restart">🔄 새 퍼즐</button>' +
        '</div>' +
      '</div>' +
      '<div class="sd-stage">' +
        '<div class="sd-board">' + gridHtml(state) + '</div>' +
        '<div class="sd-side">' +
          padHtml(state) +
          '<div class="sd-status">남은 칸 <b>' + left + '</b>개' +
            (state.status === 'finished' ? ' · <b class="sd-done">완성! 🎉</b>' : '') + '</div>' +
          '<p class="hint">' + (S.notes ? '메모 모드: 숫자를 누르면 작은 후보 숫자로 적힙니다.' : '칸을 누르고 숫자를 누르세요. 같은 숫자를 다시 누르면 지워집니다.') + '</p>' +
          '<div class="panel sd-me">' + (BG.avatars ? BG.avatars.html({ number: BG.state.number, name: myLabel() }, 'xs') : '') + ' <b>' + esc(myLabel()) + '</b></div>' +
        '</div>' +
      '</div>',
      'sudoku.' + state.size
    );
  }

  function updateTimer() {
    if (!S.game || screenName().indexOf('sudoku.') !== 0) { stopTimer(); return; }
    const el = document.getElementById('sd-timer');
    if (el) el.textContent = timeText(S.game.elapsedSeconds());
  }

  function startTimer() {
    stopTimer();
    S.timer = setInterval(updateTimer, 1000);
  }

  function startGame(size) {
    const game = new window.Sudoku.Game(size, { seed: Date.now() % 1000000 });
    S.size = size;
    S.game = game;
    S.selected = null;
    S.notes = false;
    S.sentKey = '';
    S.toastShown = false;
    startTimer();
    renderGame();
  }

  function finishGame() {
    const game = S.game;
    if (!game || S.toastShown) return;
    S.toastShown = true;
    stopTimer();
    const score = game.score();
    setBest(game.size, score);
    reportScore(game.size, score);
    renderGame();
    BG.ui.modal(
      '<div class="mg-result">' +
        '<div class="mg-result-emoji">🎉</div>' +
        '<h2>스도쿠 완성!</h2>' +
        '<p>기록 <b>' + timeText(game.elapsedSeconds()) + '</b> · 힌트 <b>' + game.hintsUsed + '</b>번 · 오답 <b>' + game.mistakes + '</b>번</p>' +
        '<p style="font-size:20px">점수 <b>' + score + '점</b></p>' +
        '<p class="hint">최고 점수 ' + getBest(game.size) + '점 · 우리 반 포인트도 조금 쌓였어요.</p>' +
        '<div class="row" style="justify-content:center;margin-top:14px">' +
          '<button class="btn btn-primary" data-action="sudoku.again" data-size="' + game.size + '">새 퍼즐 풀기</button>' +
          '<button class="btn" data-action="sudoku.menu">난이도 선택</button>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------------- 동작 ---------------- */

  BG.actions['sudoku.cell'] = function (el) {
    const x = Number(el.getAttribute('data-x'));
    const y = Number(el.getAttribute('data-y'));
    S.selected = { x: x, y: y };
    renderGame();
  };

  BG.actions['sudoku.num'] = function (el) {
    if (!S.game) return;
    const n = Number(el.getAttribute('data-n'));
    const state = S.game.stateFor();
    if (!S.selected) {
      BG.ui.toast('먼저 칸을 골라 주세요.', 'error');
      return;
    }
    const cell = S.selected;
    if (state.puzzle[cell.y][cell.x]) {
      BG.ui.toast('처음부터 주어진 숫자입니다.', 'error');
      return;
    }
    if (S.notes) {
      if (n === 0) { S.game.clear(cell.x, cell.y); renderGame(); return; }
      S.game.toggleNote(cell.x, cell.y, n);
      renderGame();
      return;
    }
    if (state.grid[cell.y][cell.x] === n) {
      S.game.clear(cell.x, cell.y);
      renderGame();
      return;
    }
    const result = S.game.set(cell.x, cell.y, n);
    if (!result.ok) {
      BG.ui.toast('여기에는 숫자를 넣을 수 없습니다.', 'error');
      return;
    }
    if (result.complete) { finishGame(); return; }
    renderGame();
  };

  BG.actions['sudoku.notes'] = function () {
    S.notes = !S.notes;
    renderGame();
  };

  BG.actions['sudoku.hint'] = function () {
    if (!S.game) return;
    const result = S.game.hint();
    if (!result.ok) return;
    if (result.complete) { finishGame(); return; }
    renderGame();
    if (result.cell) S.selected = result.cell;
  };

  BG.actions['sudoku.restart'] = function () {
    if (S.game) startGame(S.game.size);
  };

  BG.actions['sudoku.menu'] = function () {
    BG.ui.closeModal();
    BG.navigate('/sudoku');
  };

  BG.actions['sudoku.again'] = function (el) {
    BG.ui.closeModal();
    startGame(Number(el.getAttribute('data-size')) || 4);
  };

  /* ---------------- 키 입력 · 라우트 ---------------- */

  BG.keyHandlers = BG.keyHandlers || [];
  BG.keyHandlers.push(function (event) {
    if (screenName().indexOf('sudoku.') !== 0 || !S.game) return false;
    const state = S.game.stateFor();
    if (event.key === 'Backspace' || event.key === 'Delete') {
      if (S.selected && !state.puzzle[S.selected.y][S.selected.x]) {
        S.game.clear(S.selected.x, S.selected.y);
        renderGame();
        return true;
      }
      return false;
    }
    if (/^[1-9]$/.test(event.key)) {
      const n = Number(event.key);
      if (n > state.size) return false;
      if (!S.selected) return false;
      const el = { getAttribute: function () { return String(n === 0 ? 0 : n); } };
      BG.actions['sudoku.num'](el);
      return true;
    }
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (move) {
      const base = S.selected || { x: 0, y: 0 };
      S.selected = {
        x: Math.min(state.size - 1, Math.max(0, base.x + move[0])),
        y: Math.min(state.size - 1, Math.max(0, base.y + move[1]))
      };
      renderGame();
      return true;
    }
    return false;
  });

  BG.router.add(/^\/sudoku$/, 'sudoku', function () {
    stopTimer();
    S.game = null;
    menuHtml();
    BG.net.connect();
  });

  [4, 6, 9].forEach(function (size) {
    BG.router.add(new RegExp('^/sudoku/' + size + '$'), 'sudoku.' + size, function () {
      if (!S.game || S.game.status === 'finished' || S.game.size !== size) startGame(size);
      else { renderGame(); startTimer(); }
    });
  });

  BG.sudoku = {
    S: S,
    startGame: startGame,
    render: renderGame,
    getBest: getBest
  };
})();
