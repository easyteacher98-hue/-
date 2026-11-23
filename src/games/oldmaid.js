/*
 * 도둑잡기 – 서버 게임 모듈
 * 공용 엔진(public/oldmaid-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const OM = require('../../public/oldmaid-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  no_target: '카드를 뽑을 앞사람이 없습니다.',
  empty_hand: '앞사람의 패가 비어 있습니다.',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'oldmaid',
  title: '도둑잡기',
  subtitle: '짝 카드를 맞춰 버리고, 도둑 카드를 남기지 마세요',
  emoji: '🃏',
  status: 'ready',
  mode: 'multi',
  grades: ['low', 'mid', 'high'],
  playersText: '2~5명 · 모둠당 4명',
  minPlayers: OM.MIN_PLAYERS,
  maxPlayers: OM.MAX_PLAYERS,
  groupCapacity: Math.min(Number(process.env.GROUP_CAPACITY || 4), OM.MAX_PLAYERS),
  groupCount: 6,
  botNames: OM.BOT_NAMES,
  rules: [
    '동물 짝 카드 12쌍(24장)과 도둑 카드 1장, 모두 25장으로 시작합니다.',
    '카드를 나눠 받으면 같은 그림 짝은 바로 자동으로 버립니다.',
    '내 차례에는 앞사람(왼쪽 친구)의 패에서 1장을 뽑습니다.',
    '뽑은 카드가 내 패의 카드와 짝이 맞으면 두 장을 버립니다.',
    '손패를 먼저 다 털어낸 사람이 1등! 마지막까지 도둑 카드를 들고 있는 사람이 꼴찌입니다.',
    '2명이면 서로의 패에서 번갈아 뽑습니다.'
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
    const game = new OM.Game(players, { seed: opts.seed });
    drivers.set(game, new OM.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'draw') return game.draw(playerId, payload);
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
    const current = game.currentPlayer();
    return {
      status: game.status,
      turnName: current ? current.name : null,
      tableCount: game.moves,
      winner: game.winnerId ? (game.playerById(game.winnerId) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          score: p.hand.length,
          finishedCount: p.discarded,
          eliminated: p.finished,
          isTurn: current && current.id === p.id && game.status === 'playing'
        };
      })
    };
  },

  reasonText(reason) {
    return REASON_TEXT[reason] || '요청을 처리할 수 없습니다.';
  }
};
