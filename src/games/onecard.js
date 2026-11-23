/*
 * 컬러 숫자 카드 – 서버 게임 모듈
 * 공용 엔진(public/onecard-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const OC = require('../../public/onecard-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  no_card: '내 손에 없는 카드입니다.',
  cannot_play: '같은 색이거나 같은 숫자(또는 같은 특수 카드)만 낼 수 있습니다.',
  need_color: '색 바꾸기 카드는 바꿀 색을 골라야 합니다.',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'onecard',
  title: '컬러 숫자 카드',
  subtitle: '같은 색·같은 숫자를 내고 손패를 먼저 0장으로!',
  emoji: '🎨',
  status: 'ready',
  mode: 'multi',
  grades: ['low', 'mid', 'high'],
  playersText: '2~5명 · 모둠당 4명',
  minPlayers: OC.MIN_PLAYERS,
  maxPlayers: OC.MAX_PLAYERS,
  groupCapacity: Math.min(Number(process.env.GROUP_CAPACITY || 4), OC.MAX_PLAYERS),
  groupCount: 6,
  botNames: OC.BOT_NAMES,
  rules: [
    '4색(빨강·파랑·노랑·초록) × 1~9 숫자 카드와 특수 카드(점프·방향전환·+2 공격), 색 바꾸기 4장으로 시작합니다.',
    '한 사람당 7장씩 나눠 받고, 바닥 카드와 같은 색이거나 같은 숫자(또는 같은 특수 카드)를 냅니다.',
    '점프: 다음 사람 차례를 건너뜁니다. 방향전환: 순서가 반대로 바뀝니다. (2명일 때는 점프처럼)',
    '+2 공격: 다음 사람이 2장을 뽑고 건너뜁니다.',
    '색 바꾸기: 아무 때나 낼 수 있고, 바꿀 색을 고릅니다.',
    '낼 카드가 없으면 더미에서 1장 뽑고 차례를 넘깁니다.',
    '손패를 먼저 0장으로 만든 사람이 우승! 남은 사람은 카드가 적은 순서로 순위를 정합니다.'
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
    const game = new OC.Game(players, { seed: opts.seed });
    drivers.set(game, new OC.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'play') return game.play(playerId, payload);
    if (action === 'draw') return game.draw(playerId);
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
          eliminated: false,
          isTurn: current && current.id === p.id && game.status === 'playing'
        };
      })
    };
  },

  reasonText(reason) {
    return REASON_TEXT[reason] || '요청을 처리할 수 없습니다.';
  }
};
