/*
 * 라이어 추리게임 – 게임 엔진 (공용, UMD)
 * - 3~6명. 한 명만 제시어를 모릅니다(라이어).
 * - 모두 한 번씩 힌트를 말한 뒤, 투표로 라이어를 찾습니다.
 * - 라이어가 지목되면 제시어를 맞힐 마지막 기회를 얻습니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Liar = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 6;
  const BOT_NAMES = ['수상한 너구리', '능청 봇', '힌트봇'];

  const CATEGORIES = [
    {
      id: 'food', name: '음식',
      words: [
        { word: '김치', hints: ['빨개요', '매워요', '밥이랑 먹어요'] },
        { word: '피자', hints: ['동그래요', '치즈가 늘어나요', '손으로 먹어요'] },
        { word: '아이스크림', hints: ['차가워요', '녹아요', '여름에 먹어요'] },
        { word: '라면', hints: ['후루룩 먹어요', '뜨거워요', '3분이면 돼요'] },
        { word: '떡볶이', hints: ['빨간 양념', '쫄깃해요', '분식집에서 팔아요'] },
        { word: '수박', hints: ['커요', '씨가 있어요', '여름 과일이에요'] }
      ]
    },
    {
      id: 'animal', name: '동물',
      words: [
        { word: '코끼리', hints: ['코가 길어요', '몸이 커요', '회색이에요'] },
        { word: '펭귄', hints: ['남극에 살아요', '헤엄을 잘해요', '뒤뚱뒤뚱'] },
        { word: '고양이', hints: ['야옹', '수염이 있어요', '집에서 키워요'] },
        { word: '사자', hints: ['갈기가 있어요', '동물의 왕', '사파리에 살아요'] },
        { word: '거북이', hints: ['느려요', '등껍질이 있어요', '오래 살아요'] },
        { word: '다람쥐', hints: ['도토리를 좋아해요', '나무를 잘 타요', '꼬리가 커요'] }
      ]
    },
    {
      id: 'school', name: '학교',
      words: [
        { word: '칠판', hints: ['앞에 있어요', '분필로 써요', '선생님이 써요'] },
        { word: '급식', hints: ['점심에 먹어요', '줄을 서요', '식판에 받아요'] },
        { word: '운동장', hints: ['넓어요', '뛰어 놀아요', '체육 시간에 가요'] },
        { word: '사물함', hints: ['물건을 넣어요', '교실 뒤에 있어요', '문이 있어요'] },
        { word: '알림장', hints: ['집에 가져가요', '숙제를 적어요', '부모님이 봐요'] },
        { word: '쉬는 시간', hints: ['10분이에요', '친구랑 놀아요', '종이 울려요'] }
      ]
    },
    {
      id: 'job', name: '직업',
      words: [
        { word: '소방관', hints: ['불을 꺼요', '빨간 차를 타요', '도와주는 일'] },
        { word: '요리사', hints: ['맛있는 걸 만들어요', '앞치마를 해요', '주방에 있어요'] },
        { word: '의사', hints: ['아픈 사람을 봐요', '하얀 가운', '병원에 있어요'] },
        { word: '축구선수', hints: ['공을 차요', '운동장에서 뛰어요', '유니폼을 입어요'] },
        { word: '선생님', hints: ['가르쳐요', '학교에 있어요', '칠판을 써요'] },
        { word: '우주비행사', hints: ['우주에 가요', '우주복을 입어요', '로켓을 타요'] }
      ]
    },
    {
      id: 'place', name: '장소',
      words: [
        { word: '도서관', hints: ['조용해요', '책이 많아요', '빌려요'] },
        { word: '놀이터', hints: ['미끄럼틀이 있어요', '밖에 있어요', '아이들이 놀아요'] },
        { word: '영화관', hints: ['어두워요', '큰 화면', '팝콘을 먹어요'] },
        { word: '마트', hints: ['물건을 사요', '카트를 밀어요', '계산대가 있어요'] },
        { word: '공항', hints: ['비행기를 타요', '가방을 부쳐요', '여권이 필요해요'] },
        { word: '미술관', hints: ['그림이 많아요', '조용히 봐요', '액자가 걸려 있어요'] }
      ]
    },
    {
      id: 'play', name: '놀이',
      words: [
        { word: '술래잡기', hints: ['뛰어요', '누가 술래야?', '운동장에서 해요'] },
        { word: '줄넘기', hints: ['폴짝폴짝', '줄이 있어요', '체육 시간에 해요'] },
        { word: '보드게임', hints: ['책상에서 해요', '주사위를 굴려요', '친구랑 해요'] },
        { word: '축구', hints: ['공을 차요', '골대가 있어요', '11명이 해요'] },
        { word: '숨바꼭질', hints: ['숨어요', '찾아요', '눈을 감아요'] },
        { word: '팽이치기', hints: ['돌아요', '줄로 쳐요', '겨울에 해요'] }
      ]
    }
  ];

  const LIAR_HINTS = [
    '음… 그거 있잖아요',
    '저는 자주 접해요',
    '다들 아실 거예요',
    '말하면 너무 쉬워져요',
    '좋아하는 편이에요',
    '주변에서 많이 봐요'
  ];

  function createRng(seed) {
    let s = (seed === undefined || seed === null ? Date.now() : seed) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const DIGIT_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
  function josa(value, withBatchim, withoutBatchim) {
    const text = String(value === undefined || value === null ? '' : value);
    if (!text) return withoutBatchim;
    const last = text.charAt(text.length - 1);
    if (last >= '0' && last <= '9') return DIGIT_BATCHIM[last] ? withBatchim : withoutBatchim;
    const code = last.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return withoutBatchim;
    return ((code - 0xac00) % 28) ? withBatchim : withoutBatchim;
  }

  function shuffled(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function categoryById(id) {
    return CATEGORIES.find(function (c) { return c.id === id; }) || null;
  }

  function Game(players, options) {
    const opts = options || {};
    this.rng = typeof opts.rng === 'function' ? opts.rng : createRng(opts.seed);
    this.players = (players || []).slice(0, MAX_PLAYERS).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        isLiar: false,
        votedFor: null,
        hint: null,
        score: 0
      };
    });
    const wanted = opts.category ? categoryById(opts.category) : null;
    this.category = wanted || CATEGORIES[Math.floor(this.rng() * CATEGORIES.length)];
    const pick = this.category.words[Math.floor(this.rng() * this.category.words.length)];
    this.secret = pick.word;
    this.hintTable = pick.hints;
    const liarIndex = Math.floor(this.rng() * this.players.length);
    this.players.forEach(function (p, i) { p.isLiar = i === liarIndex; });
    this.liarId = this.players[liarIndex] ? this.players[liarIndex].id : null;
    this.hintOrder = this.players.map(function (p) { return p.id; });
    this.hintIndex = 0;
    this.phase = 'hint';
    this.votes = {};
    this.accusedId = null;
    this.tally = null;
    this.guessOptions = [];
    this.guess = null;
    this.winnerIds = [];
    this.loserIds = [];
    this.status = 'playing';
    this.finishReason = null;
    this.seq = 0;
    this.log = [];
    this.pushLog('🕵️ 라이어 추리게임을 시작합니다. 주제는 「' + this.category.name + '」!');
    this.pushLog('모두 한 번씩 힌트를 말해 주세요.');
  }

  Game.prototype.pushLog = function (text) {
    this.seq += 1;
    this.log.push({ seq: this.seq, text: text });
    if (this.log.length > 60) this.log.shift();
  };

  Game.prototype.playerById = function (id) {
    return this.players.find(function (p) { return p.id === id; }) || null;
  };

  Game.prototype.currentHintPlayer = function () {
    while (this.hintIndex < this.hintOrder.length) {
      const player = this.playerById(this.hintOrder[this.hintIndex]);
      if (player && player.hint === null) return player;
      this.hintIndex += 1;
    }
    return null;
  };

  Game.prototype.voters = function () {
    return this.players;
  };

  Game.prototype.pendingVoters = function () {
    return this.players.filter(function (p) { return !p.votedFor; });
  };

  Game.prototype.hint = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    if (this.phase !== 'hint') return { ok: false, reason: 'wrong_phase' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentHintPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    if (player.hint !== null) return { ok: false, reason: 'already_hinted' };
    const text = String((payload && payload.text) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!text) return { ok: false, reason: 'empty_hint' };
    player.hint = text;
    this.pushLog(player.name + ' 힌트: “' + text + '”');
    this.hintIndex += 1;
    if (!this.currentHintPlayer()) {
      this.phase = 'vote';
      this.pushLog('힌트가 모두 끝났습니다. 라이어라고 생각하는 사람에게 투표해 주세요.');
    }
    return { ok: true };
  };

  Game.prototype.vote = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    if (this.phase !== 'vote') return { ok: false, reason: 'wrong_phase' };
    const voter = this.playerById(playerId);
    if (!voter) return { ok: false, reason: 'unknown_player' };
    if (voter.votedFor) return { ok: false, reason: 'already_voted' };
    const targetId = String((payload && payload.targetId) || '');
    const target = this.playerById(targetId);
    if (!target) return { ok: false, reason: 'unknown_target' };
    if (target.id === voter.id) return { ok: false, reason: 'self_vote' };
    voter.votedFor = target.id;
    this.votes[voter.id] = target.id;
    this.pushLog(voter.name + '님이 투표했습니다.');
    if (this.pendingVoters().length) return { ok: true };
    return this.tallyVotes();
  };

  Game.prototype.tallyVotes = function () {
    const counts = {};
    this.players.forEach(function (p) { counts[p.id] = 0; });
    Object.keys(this.votes).forEach(function (voterId) {
      const target = this.votes[voterId];
      if (counts[target] !== undefined) counts[target] += 1;
    }, this);
    let bestId = null;
    let bestCount = 0;
    let tie = false;
    Object.keys(counts).forEach(function (id) {
      const c = counts[id];
      if (c > bestCount) {
        bestCount = c;
        bestId = id;
        tie = false;
      } else if (c === bestCount && c > 0) {
        tie = true;
      }
    });
    this.tally = counts;
    if (!bestId || tie) {
      this.accusedId = null;
      this.pushLog('😵 표가 갈렸습니다. 아무도 지목되지 않아 라이어의 승리!');
      return this.finishWithLiarWin('no_catch');
    }
    this.accusedId = bestId;
    const accused = this.playerById(bestId);
    this.pushLog('🗳️ 가장 많은 표를 받은 사람: ' + accused.name + ' (' + bestCount + '표)');
    if (accused.isLiar) {
      this.phase = 'guess';
      const others = this.category.words
        .map(function (w) { return w.word; })
        .filter(function (w) { return w !== this.secret; }, this);
      const decoys = shuffled(others, this.rng).slice(0, 3);
      this.guessOptions = shuffled(decoys.concat([this.secret]), this.rng);
      this.pushLog('🎯 라이어가 지목되었습니다! 라이어가 제시어를 맞힐 마지막 기회를 가집니다.');
      return { ok: true, phase: 'guess' };
    }
    this.pushLog('😱 라이어가 아닌 사람을 지목했습니다. 라이어의 승리!');
    return this.finishWithLiarWin('wrong_accused');
  };

  Game.prototype.guessWord = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    if (this.phase !== 'guess') return { ok: false, reason: 'wrong_phase' };
    if (playerId !== this.liarId) return { ok: false, reason: 'not_liar' };
    const word = String((payload && payload.word) || '');
    if (this.guessOptions.indexOf(word) === -1) return { ok: false, reason: 'bad_word' };
    this.guess = word;
    if (word === this.secret) {
      this.pushLog('😈 라이어가 제시어 “' + this.secret + '”' + josa(this.secret, '을', '를') + ' 맞혔습니다! 라이어의 승리!');
      return this.finishWithLiarWin('guessed');
    }
    this.pushLog('🎉 라이어가 “' + word + '”라고 잘못 말했습니다. 시민들의 승리! (제시어: ' + this.secret + ')');
    return this.finishWithCivilianWin('wrong_guess');
  };

  Game.prototype.finishWithLiarWin = function (reason) {
    this.winnerIds = [this.liarId];
    this.loserIds = this.players.filter(function (p) { return !p.isLiar; }).map(function (p) { return p.id; });
    return this.finish(reason);
  };

  Game.prototype.finishWithCivilianWin = function (reason) {
    this.winnerIds = this.players.filter(function (p) { return !p.isLiar; }).map(function (p) { return p.id; });
    this.loserIds = [this.liarId];
    return this.finish(reason);
  };

  Game.prototype.finish = function (reason) {
    if (this.status === 'finished') return { ok: true };
    this.status = 'finished';
    this.finishReason = reason || 'done';
    this.phase = 'finished';
    this.players.forEach(function (p) {
      p.score = this.winnerIds.indexOf(p.id) !== -1 ? 1 : 0;
    }, this);
    const names = this.players.filter(function (p) { return this.winnerIds.indexOf(p.id) !== -1; }, this)
      .map(function (p) { return p.name; });
    this.pushLog('🏁 게임 끝! 승리: ' + names.join(', ') + ' · 제시어는 “' + this.secret + '” · 라이어는 ' +
      (this.playerById(this.liarId) || {}).name + '');
    return { ok: true };
  };

  /** 서버의 방장 '게임 종료'에서 사용 */
  Game.prototype.finishGame = function (reason) {
    if (this.status === 'finished') return;
    this.finishReason = reason || 'closed_by_host';
    this.status = 'finished';
    this.phase = 'finished';
  };

  Game.prototype.ranking = function () {
    const self = this;
    const rows = this.players.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        isBot: p.isBot,
        seat: p.seat,
        score: self.winnerIds.indexOf(p.id) !== -1 ? 1 : 0,
        result: self.winnerIds.indexOf(p.id) !== -1 ? '승리' : '패배'
      };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.seat - b.seat;
    });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId) {
    const self = this;
    const viewer = viewerId ? this.playerById(viewerId) : null;
    const isLiar = !!(viewer && viewer.isLiar);
    const reveal = this.status === 'finished';
    return {
      gameId: 'liar',
      phase: this.phase,
      status: this.status,
      finishReason: this.finishReason,
      category: { id: this.category.id, name: this.category.name },
      categories: CATEGORIES.map(function (c) { return { id: c.id, name: c.name }; }),
      secret: (reveal || !isLiar) ? this.secret : null,
      youAreLiar: isLiar,
      youId: viewerId || null,
      currentHintPlayerId: this.currentHintPlayer() ? this.currentHintPlayer().id : null,
      accusedId: this.accusedId,
      liarId: reveal ? this.liarId : null,
      guessOptions: (isLiar && this.phase === 'guess') ? this.guessOptions.slice() : [],
      guess: this.guess,
      tally: this.phase === 'finished' || this.phase === 'guess' ? this.tally : null,
      winnerIds: reveal ? this.winnerIds.slice() : [],
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          hint: p.hint,
          hasVoted: !!p.votedFor,
          isLiar: reveal ? p.isLiar : (viewer ? (p.id === viewer.id ? p.isLiar : null) : null),
          votes: self.tally ? self.tally[p.id] || 0 : null,
          isYou: !!(viewer && p.id === viewer.id),
          isTurn: !!(self.currentHintPlayer() && self.currentHintPlayer().id === p.id)
        };
      }),
      votes: this.phase === 'finished' || this.phase === 'guess' ? Object.assign({}, this.votes) : {},
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  function botHint(game, player) {
    let text;
    if (player.isLiar) {
      text = LIAR_HINTS[Math.floor(game.rng() * LIAR_HINTS.length)];
    } else {
      const table = game.hintTable;
      const used = game.players.filter(function (p) { return p.hint; }).map(function (p) { return p.hint; });
      const options = table.filter(function (h) { return used.indexOf(h) === -1; });
      const pool = options.length ? options : table;
      text = pool[Math.floor(game.rng() * pool.length)];
    }
    return { playerId: player.id, action: 'hint', payload: { text: text } };
  }

  function botVote(game, player) {
    // 봇은 라이어를 모릅니다. 힌트가 짧거나 애매한 사람을 살짝 의심합니다.
    const others = game.players.filter(function (p) { return p.id !== player.id; });
    const weights = others.map(function (p) {
      const hintLen = p.hint ? p.hint.length : 8;
      return Math.max(1, 12 - hintLen) + game.rng() * 4;
    });
    let total = weights.reduce(function (a, b) { return a + b; }, 0);
    let pick = game.rng() * total;
    let chosen = others[others.length - 1];
    for (let i = 0; i < others.length; i++) {
      pick -= weights[i];
      if (pick <= 0) { chosen = others[i]; break; }
    }
    return { playerId: player.id, action: 'vote', payload: { targetId: chosen.id } };
  }

  function BotDriver(game) {
    this.game = game;
  }

  BotDriver.prototype.tick = function () {
    const game = this.game;
    if (!game || game.status !== 'playing') return null;
    if (game.phase === 'hint') {
      const current = game.currentHintPlayer();
      if (current && current.isBot) return botHint(game, current);
      return null;
    }
    if (game.phase === 'vote') {
      const pending = game.pendingVoters().filter(function (p) { return p.isBot; });
      if (pending.length) return botVote(game, pending[0]);
      return null;
    }
    if (game.phase === 'guess') {
      const liar = game.playerById(game.liarId);
      if (liar && liar.isBot && game.guessOptions.length) {
        const word = game.guessOptions[Math.floor(game.rng() * game.guessOptions.length)];
        return { playerId: liar.id, action: 'guess', payload: { word: word } };
      }
      return null;
    }
    return null;
  };

  return {
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    BOT_NAMES: BOT_NAMES,
    CATEGORIES: CATEGORIES,
    LIAR_HINTS: LIAR_HINTS,
    createRng: createRng,
    josa: josa,
    categoryById: categoryById,
    Game: Game,
    BotDriver: BotDriver
  };
});
