/*
 * 라이어 추리게임 – 서버 게임 모듈
 * 공용 엔진(public/liar-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const LM = require('../../public/liar-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  wrong_phase: '지금은 할 수 없습니다.',
  already_hinted: '이미 힌트를 말했습니다.',
  empty_hint: '힌트를 한 줄 적어 주세요.',
  already_voted: '이미 투표했습니다.',
  unknown_target: '그 사람에게는 투표할 수 없습니다.',
  self_vote: '자기 자신에게는 투표할 수 없습니다.',
  not_liar: '라이어만 제시어를 맞힐 수 있습니다.',
  bad_word: '보기 중에서 골라 주세요.',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'liar',
  title: '라이어 추리게임',
  subtitle: '제시어를 모르는 한 명을 힌트와 투표로 찾아내세요',
  emoji: '🕵️',
  status: 'ready',
  mode: 'multi',
  grades: ['mid', 'high'],
  playersText: '3~6명 · 모둠당 6명',
  minPlayers: LM.MIN_PLAYERS,
  maxPlayers: LM.MAX_PLAYERS,
  groupCapacity: 6,
  groupCount: 6,
  botNames: LM.BOT_NAMES,
  categories: LM.CATEGORIES.map(function (c) { return { id: c.id, name: c.name }; }),
  rules: [
    '3명 이상이 모이면 시작합니다. 한 명만 제시어를 모르는 라이어입니다.',
    '시민들은 같은 제시어를 보고, 라이어는 주제만 압니다.',
    '순서대로 한 사람씩 힌트를 한 줄씩 말합니다. (제시어를 그대로 말하면 안 돼요)',
    '힌트가 한 바퀴 돌면, 라이어라고 생각하는 사람에게 투표합니다.',
    '가장 많은 표를 받은 사람이 라이어면 → 라이어가 제시어를 맞힐 마지막 기회!',
    '라이어가 아닌 사람이 지목되거나 표가 갈리면 라이어의 승리입니다.',
    '라이어가 제시어를 맞히면 라이어 승리, 틀리면 시민들 승리!'
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
    const game = new LM.Game(players, {
      rng: opts.rng,
      seed: opts.seed,
      category: opts.category || (opts.options && opts.options.category)
    });
    drivers.set(game, new LM.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'hint') return game.hint(playerId, payload);
    if (action === 'vote') return game.vote(playerId, payload);
    if (action === 'guess') return game.guessWord(playerId, payload);
    return { ok: false, reason: 'unknown_action' };
  },

  botTick(game) {
    const driver = drivers.get(game);
    if (!driver) return null;
    return driver.tick();
  },

  serialize(game, viewerId) {
    return game.stateFor(viewerId);
  },

  summary(game) {
    if (!game) {
      return { status: 'waiting', turnName: null, players: [], winner: null, lastEvent: null, tableCount: 0 };
    }
    const current = game.currentHintPlayer();
    return {
      status: game.status,
      phase: game.phase,
      turnName: current ? current.name : null,
      tableCount: game.players.filter(function (p) { return p.hint; }).length,
      winner: game.winnerIds.length
        ? game.players.filter(function (p) { return game.winnerIds.indexOf(p.id) !== -1; })
          .map(function (p) { return p.name; }).join(', ')
        : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          hasHint: p.hint !== null,
          eliminated: false,
          isTurn: current ? current.id === p.id : false
        };
      })
    };
  },

  reasonText(reason) {
    return REASON_TEXT[reason] || '요청을 처리할 수 없습니다.';
  }
};
