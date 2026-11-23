/*
 * 전통 장기 – 서버 게임 모듈
 * 공용 엔진(public/janggi-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const JG = require('../../public/janggi-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  bad_cell: '장기판 안의 칸을 골라 주세요.',
  empty_cell: '그 자리에 기물이 없습니다.',
  not_your_piece: '내 기물만 움직일 수 있습니다.',
  illegal_move: '그 자리로는 움직일 수 없습니다. (기물의 이동 규칙을 확인해 주세요)',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'janggi',
  title: '전통 장기',
  subtitle: '9×10 장기판 · 초와 한의 1:1 대결 · 궁을 잡으면 승리',
  emoji: '♟️',
  status: 'ready',
  mode: 'multi',
  grades: ['mid', 'high'],
  playersText: '2명 · 모둠당 2명',
  minPlayers: JG.MIN_PLAYERS,
  maxPlayers: JG.MAX_PLAYERS,
  groupCapacity: 2,
  groupCount: 6,
  botNames: JG.BOT_NAMES,
  rules: [
    '9×10 장기판에서 초(아래)가 먼저 두고, 한(위)이 이어서 둡니다.',
    '차는 가로·세로로 원하는 만큼, 포는 다리 하나를 넘어서만 움직이고 잡습니다. (포끼리는 잡지 못합니다)',
    '마는 날일자(하나 옆으로 간 뒤 대각선), 상은 밭전자(하나 옆으로 간 뒤 대각선 두 칸)로 움직입니다.',
    '사와 궁은 궁성(3×3) 안에서만, 졸·병은 앞이나 옆으로 한 칸씩 움직입니다.',
    '상대 궁을 잡으면 바로 승리! 상대가 둘 곳이 없어도(외통수) 승리합니다.',
    '내 궁이 공격받는 자리로는 움직일 수 없고, 두 궁이 마주 보게 두는 것도 안 됩니다.'
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
    const game = new JG.Game(players, { options: opts.options });
    drivers.set(game, new JG.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'move') return game.move(playerId, payload);
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
      tableCount: game.moves.length,
      winner: game.winnerId ? (game.playerById(game.winnerId) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          score: p.captured.length,
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
