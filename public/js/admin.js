/*
 * 제작자 전용 통계 페이지 (#/admin)
 * - 교사 개설 암호(예: easy 또는 TEACHER_CREATE_CODE)를 넣어야만 열립니다.
 * - 학생 첫 화면에는 보이지 않고, 교사용(#/teacher) 화면 아래 작은 링크로만 들어갑니다.
 */
(function () {
  'use strict';
  const BG = window.BG;
  const esc = BG.ui.escape;

  const S = {
    code: '',
    data: null,
    loading: false,
    error: ''
  };

  function storedCode() {
    return BG.session.get('bg.adminCode', '') || '';
  }

  function screenName() {
    return document.body.dataset.screen || '';
  }

  function fmtTime(ms) {
    if (!ms) return '-';
    const d = new Date(ms);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function loginHtml() {
    return '<div class="entry-top"><a class="back-link" href="#/teacher">← 교사용 화면</a>' +
        '<span class="spacer"></span><span class="badge">📊 제작자 전용</span></div>' +
      '<div class="panel center-panel admin-login">' +
        '<div class="mg-head-emoji">📊</div>' +
        '<h1 class="entry-title">제작자 통계</h1>' +
        '<p class="page-sub">전체 반 수, 총 플레이 횟수, 게임별 인기 순위를 볼 수 있습니다.<br>' +
          '교사 개설 암호를 넣어 주세요. (학생에게는 보이지 않습니다)</p>' +
        '<div class="row" style="justify-content:center">' +
          '<input id="admin-code" class="input" type="password" maxlength="40" placeholder="교사 개설 암호" autocomplete="off" style="max-width:220px">' +
          '<button class="btn btn-primary" data-action="admin.login">들어가기</button>' +
        '</div>' +
        (S.error ? '<p class="admin-error">' + esc(S.error) + '</p>' : '') +
        '<p class="hint" style="margin-top:12px">' +
          (BG.net.connected ? '서버 연결됨' : '서버에 연결되지 않았습니다. Render 주소에서 열어 주세요.') +
        '</p>' +
      '</div>';
  }

  function totalsHtml(data) {
    const t = data.totals || {};
    const cards = [
      { label: '전체 반', value: t.classes || 0, emoji: '🏫' },
      { label: '학생 수', value: t.students || 0, emoji: '👥' },
      { label: '총 플레이', value: t.plays || 0, emoji: '🎮' },
      { label: '누적 포인트', value: t.points || 0, emoji: '⭐' },
      { label: '지금 방', value: t.openRooms || 0, emoji: '🚪' },
      { label: '진행 중', value: t.playingRooms || 0, emoji: '🔥' }
    ];
    return '<div class="admin-totals">' + cards.map(function (c) {
      return '<div class="admin-total"><span class="admin-total-emoji">' + c.emoji + '</span>' +
        '<b>' + c.value + '</b><span>' + c.label + '</span></div>';
    }).join('') + '</div>';
  }

  function gamesHtml(data) {
    const games = data.games || [];
    const max = games.reduce(function (m, g) { return Math.max(m, g.plays || 0); }, 1) || 1;
    return '<div class="panel">' +
      '<div class="panel-title">🏆 게임별 인기 순위 <span class="hint">끝난 판 수</span></div>' +
      (games.length
        ? '<ul class="admin-game-list">' + games.map(function (g, i) {
          const pct = Math.round((g.plays || 0) / max * 100);
          return '<li class="admin-game-row">' +
            '<span class="admin-rank">' + (i + 1) + '</span>' +
            '<span class="admin-game-emoji">' + g.emoji + '</span>' +
            '<span class="admin-game-name">' + esc(g.title) + (g.mode === 'solo' ? ' <span class="grade-badge solo">1인용</span>' : '') + '</span>' +
            '<span class="admin-bar"><i style="width:' + pct + '%"></i></span>' +
            '<b class="admin-play-count">' + (g.plays || 0) + '판</b>' +
          '</li>';
        }).join('') + '</ul>'
        : '<p class="hint">아직 끝난 게임이 없습니다.</p>') +
    '</div>';
  }

  function classesHtml(data) {
    const classes = data.classes || [];
    return '<div class="panel">' +
      '<div class="panel-title">🏫 반별 현황</div>' +
      (classes.length
        ? '<div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>반 코드</th><th>반 이름</th><th>학생</th><th>플레이</th><th>포인트</th><th>만든 날</th></tr></thead><tbody>' +
          classes.map(function (c) {
            return '<tr><td class="mono">' + esc(c.code) + '</td>' +
              '<td>' + esc(c.name) + '</td>' +
              '<td>' + (c.students || 0) + '</td>' +
              '<td>' + (c.plays || 0) + '</td>' +
              '<td>' + (c.points || 0) + '</td>' +
              '<td class="hint">' + esc(fmtTime(c.createdAt)) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="hint">아직 만든 반이 없습니다.</p>') +
    '</div>';
  }

  function dashboardHtml(data) {
    return '<div class="entry-top"><a class="back-link" href="#/teacher">← 교사용 화면</a>' +
        '<span class="spacer"></span>' +
        '<span class="badge">📊 제작자 전용</span>' +
        '<button class="btn btn-sm" data-action="admin.refresh">🔄 새로고침</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="admin.logout">나가기</button></div>' +
      '<section class="portal-hero admin-hero">' +
        '<div class="portal-kicker">보드게임천국 운영 현황</div>' +
        '<h1 class="portal-title">제작자 <em>통계</em></h1>' +
        '<p class="portal-sub">' + esc(fmtTime(data.updatedAt)) + ' 기준 · 저장 방식: ' +
          esc(data.persistence || 'memory') + '</p>' +
      '</section>' +
      totalsHtml(data) +
      '<div class="admin-columns">' + gamesHtml(data) + classesHtml(data) + '</div>';
  }

  function render() {
    if (!S.data) {
      BG.ui.screen(loginHtml(), 'admin');
      BG.net.connect();
      return;
    }
    BG.ui.screen(dashboardHtml(S.data), 'admin');
  }

  BG.actions['admin.login'] = function () {
    const el = document.getElementById('admin-code');
    const code = String(el ? el.value : '').trim();
    if (!code) {
      S.error = '암호를 입력해 주세요.';
      render();
      return;
    }
    if (!BG.net.connected) {
      BG.net.connect();
    }
    S.loading = true;
    S.error = '';
    S.code = code;
    BG.net.send({ t: 'adminStats', code: code });
  };

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    const el = event.target;
    if (!el || el.id !== 'admin-code') return;
    event.preventDefault();
    BG.actions['admin.login']();
  });

  BG.actions['admin.refresh'] = function () {
    if (!S.code) return;
    BG.net.send({ t: 'adminStats', code: S.code });
  };

  BG.actions['admin.logout'] = function () {
    S.code = '';
    S.data = null;
    S.error = '';
    BG.session.remove('bg.adminCode');
    render();
  };

  BG.net.on('admin_stats', function (msg) {
    if (screenName() !== 'admin') return;
    if (msg && msg.ok) {
      S.data = msg.data;
      S.error = '';
      S.loading = false;
      BG.session.set('bg.adminCode', S.code);
      render();
      return;
    }
    S.loading = false;
    S.data = null;
    S.error = (msg && msg.error === 'too_many_tries')
      ? '암호를 여러 번 틀렸습니다. 잠시 후 다시 시도해 주세요.'
      : '암호가 맞지 않습니다. 교사 개설 암호를 확인해 주세요.';
    render();
  });

  BG.net.on('open', function () {
    if (screenName() !== 'admin' || !S.code) return;
    BG.net.send({ t: 'adminStats', code: S.code });
  });

  BG.router.add(/^\/admin$/, 'admin', function () {
    render();
    BG.net.connect();
    const saved = storedCode();
    if (saved && !S.data && !S.code) {
      S.code = saved;
      BG.net.send({ t: 'adminStats', code: saved });
    }
  });
})();
