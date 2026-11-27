/*
 * 꼬리잡기 끝말잇기 – 서버 게임 모듈
 * 공용 엔진(public/wordchain-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const WC = require('../../public/wordchain-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  eliminated: '탈락해서 낼 수 없습니다. 친구들의 게임을 지켜봐 주세요.',
  empty_word: '낱말을 입력해 주세요.',
  one_word_only: '한 낱말만 입력해 주세요. (띄어쓰기 없이)',
  hangul_only: '한글로 된 우리말 낱말만 입력할 수 있어요. (영문·숫자·특수문자 안 됨)',
  too_short: '2글자 이상인 낱말만 이을 수 있어요.',
  too_long: '10글자까지의 낱말만 이을 수 있어요.',
  wrong_start: '앞 낱말의 끝 글자로 시작해야 해요.',
  not_in_dictionary: '사전에 없는 낱말이에요. 진짜 우리말 낱말로 다시 말해 주세요.',
  duplicate: '이미 나온 낱말이에요. 다른 낱말을 말해 주세요.',
  last_word: '한방 단어는 사용할 수 없어요! 다음 사람이 이어 말할 수 있는 낱말로 다시 말해 주세요.'
};

module.exports = {
  id: 'wordchain',
  title: '꼬리잡기 끝말잇기',
  subtitle: '앞 낱말의 끝 글자로 진짜 우리말 낱말을 이어 말하세요',
  emoji: '🐍',
  status: 'ready',
  mode: 'multi',
  grades: ['low', 'mid', 'high'],
  playersText: '2~5명 · 모둠당 4명',
  minPlayers: WC.MIN_PLAYERS,
  maxPlayers: WC.MAX_PLAYERS,
  groupCapacity: Math.min(Number(process.env.GROUP_CAPACITY || 4), WC.MAX_PLAYERS),
  groupCount: 6,
  botNames: WC.BOT_NAMES,
  options: [
    {
      name: 'seconds',
      label: '차례 제한 시간',
      choices: [
        { value: 15, label: '15초 (빠르게)' },
        { value: 20, label: '20초 (기본)' },
        { value: 30, label: '30초 (느긋하게)' }
      ]
    }
  ],
  rules: [
    '앞사람이 말한 낱말의 마지막 글자로 시작하는 낱말을 이어 말합니다. (예: 사과 → 과자 → 자전거)',
    '진짜 우리말 낱말(사전에 있는 명사)만 쓸 수 있어요. 1글자·영문·숫자·이상한 신조어는 안 됩니다.',
    '두음법칙을 인정합니다. (녀↔여, 리↔이, 라↔나 — 예: “원리” 다음에 “이야기”)',
    '이미 나온 낱말은 다시 쓸 수 없어요.',
    '다음 사람이 이어 말할 수 없는 낱말(한방 단어, 예: 우라늄)은 낼 수 없어요.',
    '차례마다 제한 시간(기본 20초)이 있어요. 넘기면 목숨 1개를 잃습니다. 목숨은 3개!',
    '목숨을 다 잃으면 탈락! 마지막까지 살아남은 사람이 우승합니다.',
    '정해진 낱말 수(40개)를 다 이으면 가장 많이 말한 사람이 우승합니다.'
  ],

  defaultRooms() {
    const out = [];
    for (let i = 1; i <= this.groupCount; i++) {
      out.push({ code: String(i), name: i + '모둠', isGroup: true, capacity: this.groupCapacity, sort: i });
    }
    return out;
  },

  createGame(players, options) {
    const opts = options || {};
    const game = new WC.Game(players, {
      options: Object.assign({}, opts.options || {}, { seconds: opts.seconds || (opts.options || {}).seconds })
    });
    drivers.set(game, new WC.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'say') return game.say(playerId, payload);
    if (action === 'giveUp') return game.giveUp(playerId);
    return { ok: false, reason: 'unknown_action' };
  },

  botTick(game) {
    const driver = drivers.get(game);
    if (!driver) return null;
    return driver.tick();
  },

  /** 제한 시간 확인 (서버가 주기적으로 부릅니다) */
  tick(game, now) {
    if (!game || typeof game.tick !== 'function') return null;
    return game.tick(now);
  },

  serialize(game, viewerId) {
    return game.stateFor(viewerId, Date.now());
  },

  summary(game) {
    if (!game) {
      return { status: 'waiting', turnName: null, players: [], winner: null, lastEvent: null, tableCount: 0 };
    }
    const current = game.currentPlayer();
    return {
      status: game.status,
      turnName: current ? current.name : null,
      tableCount: game.chain.length,
      winner: game.winnerId ? (game.playerById(game.winnerId) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          score: p.score,
          eliminated: p.eliminated,
          isTurn: current && current.id === p.id && game.status === 'playing'
        };
      })
    };
  },

  reasonText(reason) {
    return REASON_TEXT[reason] || '요청을 처리할 수 없습니다.';
  }
};
