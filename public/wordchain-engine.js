/*
 * 꼬리잡기 끝말잇기 – 게임 엔진 (공용, UMD)
 * - 앞사람이 말한 낱말의 끝 글자로 시작하는 '진짜 우리말 명사'만 이어 말합니다.
 * - 서버에 정제된 우리말 명사 사전(약 3,000개)을 내장해, 사전에 없는 단어·1글자 단어·
 *   영문/숫자·이미 나온 단어는 받아 주지 않습니다.
 * - 다음 사람이 이어 말할 수 없는 '한방 단어'(예: 우라늄)는 미리 막습니다.
 * - 두음법칙(녀↔여, 리↔이, 라↔나)을 인정합니다.
 * - 한 사람당 목숨 3개, 차례 제한 시간(기본 20초)을 넘기면 목숨 1개를 잃습니다.
 *   마지막까지 살아남은 사람이 우승! (정해진 낱말 수를 채우면 많이 말한 사람이 우승)
 * - 서버(모둠 방)와 브라우저(AI 봇 연습)가 같은 규칙 코드를 사용합니다.
 *
 * 사전은 public/wordchain-words.js (scripts/build-wordchain-dict.js 가 생성)를 씁니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./wordchain-words.js'));
  } else {
    root.WordChain = factory(root.WordChainWords);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (WORD_MOD) {
  'use strict';

  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 5;
  const LIVES = 3;
  const TURN_SECONDS = 20;
  const TURN_CHOICES = [15, 20, 30];
  const MAX_TURNS = 40;
  const BOT_NAMES = ['꼬리봇 하나', '꼬리봇 둘리', '꼬리봇 세모', '꼬리봇 네모'];

  const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  /* ---------------- 사전 ---------------- */

  const WORDS = (WORD_MOD && WORD_MOD.words ? WORD_MOD.words : []).slice();
  const WORD_SET = new Set(WORDS);

  /** 한글 음절을 초성·중성·종성으로 나눕니다. */
  function splitSyllable(ch) {
    if (typeof ch !== 'string' || !ch.length) return null;
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return null;
    return {
      initial: INITIALS[Math.floor(code / 588)],
      vowel: Math.floor((code % 588) / 28),
      final: code % 28
    };
  }

  /**
   * 두음법칙을 적용한 '첫소리 묶음' 열쇠.
   * 첫소리 ㄴ·ㄹ·ㅇ 은 서로 바꿔 쓸 수 있으므로(녀↔여, 리↔이, 라↔나) 같은 묶음으로 봅니다.
   */
  function startKey(ch) {
    const part = splitSyllable(ch);
    if (!part) return null;
    const initial = (part.initial === 'ㄴ' || part.initial === 'ㄹ') ? 'ㅇ' : part.initial;
    return initial + ':' + part.vowel + ':' + part.final;
  }

  /** 두 글자가 두음법칙 안에서 같은 소리로 시작하는지 */
  function sameSound(a, b) {
    const ka = startKey(a);
    const kb = startKey(b);
    if (ka === null || kb === null) return String(a) === String(b);
    return ka === kb;
  }

  /** 첫 글자(두음 묶음)별 낱말 목록 */
  const INDEX = new Map();
  WORDS.forEach(function (word) {
    const key = startKey(word.charAt(0));
    if (!key) return;
    if (!INDEX.has(key)) INDEX.set(key, []);
    INDEX.get(key).push(word);
  });
  // 짧고 쉬운 낱말부터 보여 주기 위해 길이 순으로 정렬합니다.
  INDEX.forEach(function (list) {
    list.sort(function (a, b) {
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b, 'ko');
    });
  });

  function lastSyllable(word) {
    return word ? word.charAt(word.length - 1) : '';
  }

  /** 이 글자로 시작하는 낱말 중 아직 쓰지 않은 것 (두음법칙 포함) */
  function followers(syllable, used) {
    const key = startKey(syllable);
    if (!key) return [];
    const list = INDEX.get(key) || [];
    if (!used) return list.slice();
    return list.filter(function (word) { return !used.has(word); });
  }

  /** 이 낱말을 내면 다음 사람이 이어 말할 낱말이 남는가? (한방 단어 막기) */
  function leavesFollowUp(word, used) {
    const pool = followers(lastSyllable(word), used);
    return pool.length > 0;
  }

  /** 지금 낼 수 있는 낱말인가? (사전에 있고, 아직 안 나왔고, 다음 사람이 이어 말할 수 있고) */
  function isPlayable(word, used) {
    if (!WORD_SET.has(word)) return false;
    if (used && used.has(word)) return false;
    const nextUsed = used ? new Set(used) : new Set();
    nextUsed.add(word);
    return leavesFollowUp(word, nextUsed);
  }

  /** 이 글자로 시작해 지금 낼 수 있는 낱말 수 (화면 안내용) */
  function playableCount(syllable, used) {
    return followers(syllable, used).filter(function (word) {
      const nextUsed = used ? new Set(used) : new Set();
      nextUsed.add(word);
      return leavesFollowUp(word, nextUsed);
    }).length;
  }

  /* ---------------- 게임 ---------------- */

  function Game(players, options) {
    const opts = options || {};
    const extra = opts.options || {};
    const seconds = Number(extra.seconds || opts.seconds);
    this.turnSeconds = TURN_CHOICES.indexOf(seconds) !== -1 ? seconds : TURN_SECONDS;
    this.maxTurns = Math.max(6, Number(extra.maxTurns || opts.maxTurns) || MAX_TURNS);
    this.players = (players || []).slice(0, MAX_PLAYERS).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        number: p.number === undefined ? null : p.number,
        isBot: !!p.isBot,
        seat: i,
        lives: LIVES,
        eliminated: false,
        score: 0
      };
    });
    this.chain = [];
    this.used = new Set();
    this.turn = 0;
    this.turnNo = 0;
    this.status = 'playing';
    this.finishReason = null;
    this.winnerId = null;
    this.deadline = Date.now() + this.turnSeconds * 1000;
    this.startedAt = Date.now();
    this.seq = 0;
    this.log = [];
    this.pushLog('🐍 꼬리잡기 끝말잇기를 시작합니다. 첫 낱말은 자유롭게! (2글자 이상)');
    this.pushLog('차례마다 ' + this.turnSeconds + '초 안에 이어 말하세요. 목숨은 ' + LIVES + '개!');
  }

  Game.prototype.pushLog = function (text) {
    this.seq += 1;
    this.log.push({ seq: this.seq, text: text });
    if (this.log.length > 60) this.log.shift();
  };

  Game.prototype.playerById = function (id) {
    return this.players.find(function (p) { return p.id === id; }) || null;
  };

  Game.prototype.currentPlayer = function () {
    return this.players[this.turn] || null;
  };

  Game.prototype.requiredSyllable = function () {
    if (!this.chain.length) return null;
    return lastSyllable(this.chain[this.chain.length - 1].word);
  };

  Game.prototype.activePlayers = function () {
    return this.players.filter(function (p) { return !p.eliminated; });
  };

  Game.prototype.resetDeadline = function () {
    this.deadline = Date.now() + this.turnSeconds * 1000;
  };

  /** 다음 살아 있는 사람에게 차례를 넘깁니다. (없으면 그대로) */
  Game.prototype.nextTurn = function () {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (this.turn + step) % n;
      if (!this.players[idx].eliminated) {
        this.turn = idx;
        this.resetDeadline();
        return;
      }
    }
  };

  Game.prototype.finish = function (reason, winnerId) {
    if (this.status === 'finished') return;
    this.status = 'finished';
    this.finishReason = reason || 'done';
    if (winnerId !== undefined) this.winnerId = winnerId || null;
    if (!this.winnerId && reason !== 'closed_by_host') {
      const rows = this.ranking();
      this.winnerId = rows.length ? rows[0].id : null;
    }
    this.finishedAt = Date.now();
  };

  Game.prototype.finishGame = function (reason) {
    this.finish(reason || 'closed_by_host', null);
  };

  /** 살아 있는 사람이 한 명뿐이거나, 낱말 수를 다 채웠으면 끝냅니다. */
  Game.prototype.checkEnd = function () {
    if (this.status !== 'playing') return true;
    const active = this.activePlayers();
    if (active.length <= 1) {
      const last = active[0] || null;
      this.pushLog('🏆 ' + (last ? last.name : '') + '님이 마지막까지 살아남았습니다! 우승!');
      this.finish('last_survivor', last ? last.id : null);
      return true;
    }
    if (this.turnNo >= this.maxTurns) {
      const ranking = this.ranking();
      this.pushLog('🏁 ' + this.maxTurns + '개의 낱말을 이었습니다. 많이 말한 사람이 우승!');
      this.finish('max_turns', ranking[0] ? ranking[0].id : null);
      return true;
    }
    return false;
  };

  /** 지금 차례인 사람이 낼 수 있는 낱말이 하나도 없으면 게임을 마무리합니다. */
  Game.prototype.checkStuck = function () {
    if (this.status !== 'playing') return false;
    const current = this.currentPlayer();
    if (!current) return false;
    const required = this.requiredSyllable();
    const count = required === null ? 1 : playableCount(required, this.used);
    if (count === 0) {
      const ranking = this.ranking();
      this.pushLog('🏁 이어 말할 낱말이 더 없습니다. 지금까지 많이 말한 사람이 우승!');
      this.finish('no_words', ranking[0] ? ranking[0].id : null);
      return true;
    }
    return false;
  };

  /**
   * 낱말 잇기: payload = { text: '사과' }
   * 성공하면 { ok: true, word, required, next } 를 돌려줍니다.
   */
  Game.prototype.say = function (playerId, payload) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    if (player.eliminated) return { ok: false, reason: 'eliminated' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };

    const data = payload || {};
    const text = String(data.text === undefined || data.text === null ? '' : data.text).trim();
    if (!text) return { ok: false, reason: 'empty_word' };
    if (/\s/.test(text)) return { ok: false, reason: 'one_word_only' };
    if (!/^[가-힣]+$/.test(text)) return { ok: false, reason: 'hangul_only' };
    if (text.length < 2) return { ok: false, reason: 'too_short' };
    if (text.length > 10) return { ok: false, reason: 'too_long' };
    const required = this.requiredSyllable();
    if (required !== null && !sameSound(text.charAt(0), required)) {
      return { ok: false, reason: 'wrong_start', required: required };
    }
    if (!WORD_SET.has(text)) return { ok: false, reason: 'not_in_dictionary' };
    if (this.used.has(text)) return { ok: false, reason: 'duplicate' };
    if (!leavesFollowUp(text, new Set(this.used).add(text))) {
      return { ok: false, reason: 'last_word', word: text };
    }

    // 반영
    this.chain.push({ word: text, playerId: player.id, name: player.name, at: Date.now(), no: this.chain.length + 1 });
    this.used.add(text);
    player.score += 1;
    this.turnNo += 1;
    const nextRequired = lastSyllable(text);
    this.pushLog(player.name + '님: “' + text + '” → 다음 글자 “' + nextRequired + '”');

    this.nextTurn();
    const ended = this.checkEnd() || this.checkStuck();
    if (!ended) {
      const next = this.currentPlayer();
      if (next) this.pushLog(next.name + '님 차례입니다. (“' + nextRequired + '”로 시작하는 낱말)');
    }
    return { ok: true, word: text, next: nextRequired, finished: this.status === 'finished' };
  };

  /** 차례를 포기합니다. (시간 초과와 같은 벌: 목숨 1개) */
  Game.prototype.giveUp = function (playerId) {
    if (this.status !== 'playing') return { ok: false, reason: 'not_playing' };
    const player = this.playerById(playerId);
    if (!player) return { ok: false, reason: 'unknown_player' };
    const current = this.currentPlayer();
    if (!current || current.id !== playerId) return { ok: false, reason: 'not_your_turn' };
    return this.penalty(player, '차례를 넘겼습니다.');
  };

  /** 목숨 1개를 잃고 차례를 넘깁니다. 목숨이 다하면 탈락! */
  Game.prototype.penalty = function (player, why) {
    player.lives -= 1;
    if (player.lives <= 0) {
      player.lives = 0;
      player.eliminated = true;
      this.pushLog('💥 ' + player.name + '님 탈락! (' + why + ')');
    } else {
      this.pushLog('❤️ ' + player.name + '님이 목숨 1개를 잃었습니다. 남은 목숨 ' + player.lives + '개 (' + why + ')');
    }
    this.nextTurn();
    const ended = this.checkEnd() || this.checkStuck();
    return {
      ok: true,
      lostLife: true,
      lives: player.lives,
      eliminated: player.eliminated,
      finished: this.status === 'finished'
    };
  };

  /** 서버·화면에서 주기적으로 부릅니다. 제한 시간이 지났으면 벌을 줍니다. */
  Game.prototype.tick = function (now) {
    if (this.status !== 'playing') return null;
    const at = Number(now) || Date.now();
    if (!this.deadline || at < this.deadline) return null;
    const current = this.currentPlayer();
    if (!current) return null;
    const result = this.penalty(current, this.turnSeconds + '초 시간 초과');
    return Object.assign({ changed: true, playerId: current.id, timeout: true }, result);
  };

  Game.prototype.ranking = function () {
    const self = this;
    const rows = this.players.map(function (p) {
      let score = 0;
      if (self.winnerId === p.id) score = 10000;
      else if (!p.eliminated) score = 5000 + p.score * 10 + p.lives;
      else score = p.score * 10 + p.lives;
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        isBot: p.isBot,
        seat: p.seat,
        score: score,
        words: p.score,
        lives: p.lives,
        eliminated: p.eliminated,
        result: self.winnerId === p.id ? '우승 🎉'
          : p.eliminated ? '탈락 · ' + p.score + '개'
            : p.score + '개 이음'
      };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (b.words !== a.words) return b.words - a.words;
      return a.seat - b.seat;
    });
    rows.forEach(function (row, i) {
      if (i > 0 && rows[i - 1].score === row.score) row.rank = rows[i - 1].rank;
      else row.rank = i + 1;
    });
    return rows;
  };

  Game.prototype.stateFor = function (viewerId, now) {
    const self = this;
    const current = this.currentPlayer();
    const me = viewerId ? this.playerById(viewerId) : null;
    const required = this.requiredSyllable();
    return {
      gameId: 'wordchain',
      status: this.status,
      finishReason: this.finishReason,
      turnPlayerId: this.status === 'playing' && current ? current.id : null,
      youId: viewerId || null,
      youTurn: !!(this.status === 'playing' && current && viewerId && current.id === viewerId),
      youEliminated: me ? me.eliminated : false,
      required: required,
      optionsCount: required === null ? null : playableCount(required, this.used),
      chain: this.chain.slice(-24),
      chainCount: this.chain.length,
      turnNo: this.turnNo,
      maxTurns: this.maxTurns,
      usedCount: this.used.size,
      dictionaryCount: WORD_SET.size,
      turnSeconds: this.turnSeconds,
      deadline: this.status === 'playing' ? this.deadline : null,
      serverNow: Number(now) || Date.now(),
      winnerId: this.winnerId,
      players: this.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          isBot: p.isBot,
          seat: p.seat,
          lives: p.lives,
          eliminated: p.eliminated,
          score: p.score,
          isTurn: self.status === 'playing' && current && current.id === p.id
        };
      }),
      ranking: this.status === 'finished' ? this.ranking() : null,
      log: this.log.slice(-10)
    };
  };

  /* ---------------- AI 봇 ---------------- */

  function botWord(game) {
    const required = game.requiredSyllable();
    const pool = required === null
      ? WORDS.filter(function (word) { return isPlayable(word, game.used); })
      : followers(required, game.used).filter(function (word) { return isPlayable(word, game.used); });
    if (!pool.length) return null;
    // 쉬운(짧은) 낱말을 먼저 고르되, 가끔은 다양한 낱말을 고릅니다.
    pool.sort(function (a, b) {
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b, 'ko');
    });
    const shortlist = pool.slice(0, Math.max(1, Math.min(8, Math.ceil(pool.length / 2))));
    return shortlist[Math.floor(Math.random() * shortlist.length)];
  }

  function botAction(game) {
    const word = botWord(game);
    if (!word) return { action: 'giveUp', payload: {} };
    return { action: 'say', payload: { text: word } };
  }

  function BotDriver(game) {
    this.game = game;
  }

  BotDriver.prototype.tick = function () {
    const game = this.game;
    if (!game || game.status !== 'playing') return null;
    const player = game.currentPlayer();
    if (!player || !player.isBot || player.eliminated) return null;
    const action = botAction(game);
    return { playerId: player.id, action: action.action, payload: action.payload };
  };

  return {
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    LIVES: LIVES,
    TURN_SECONDS: TURN_SECONDS,
    TURN_CHOICES: TURN_CHOICES,
    MAX_TURNS: MAX_TURNS,
    BOT_NAMES: BOT_NAMES,
    WORDS: WORDS,
    WORD_COUNT: WORD_SET.size,
    splitSyllable: splitSyllable,
    startKey: startKey,
    sameSound: sameSound,
    followers: followers,
    leavesFollowUp: leavesFollowUp,
    isPlayable: isPlayable,
    playableCount: playableCount,
    isDictionaryWord: function (word) { return WORD_SET.has(word); },
    Game: Game,
    BotDriver: BotDriver,
    botAction: botAction,
    botWord: botWord
  };
});
