/*
 * 선 긋기 땅따먹기 – 서버 게임 모듈
 * 공용 엔진(public/dots-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const DT = require('../../public/dots-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  bad_line: '보드 안의 선을 골라 주세요.',
  taken: '이미 그어진 선입니다.',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'dots',
  title: '선 긋기 땅따먹기',
  subtitle: '선을 그어 사각형을 완성하면 내 땅! 가장 많은 땅을 차지하세요',
  emoji: '✏️',
  status: 'ready',
  mode: 'multi',
  grades: ['low', 'mid'],
  playersText: '2~4명 · 모둠당 4명',
  minPlayers: DT.MIN_PLAYERS,
  maxPlayers: DT.MAX_PLAYERS,
  groupCapacity: Math.min(Number(process.env.GROUP_CAPACITY || 4), DT.MAX_PLAYERS),
  groupCount: 6,
  botNames: DT.BOT_NAMES,
  rules: [
    '5×5 점(4×4 칸) 보드에서 번갈아 선을 하나씩 긋습니다.',
    '사각형의 네 번째 선을 완성하면 그 칸이 내 땅이 되고, 한 번 더 그을 수 있습니다.',
    '땅을 먹지 못하면 다음 사람에게 차례가 넘어갑니다.',
    '16칸을 모두 나누면 끝! 가장 많은 땅을 가진 사람이 우승합니다.',
    '요령: 상대에게 3면이 열린 칸을 만들어 주지 마세요.'
  ],

  defaultRooms() {
    const out = [];
    for (let i = 1; i <= this.groupCount; i++) {
      out.push({ code: String(i), name: i + '모둠', isGroup: true, capacity: this.groupCapacity, sort: i });
    }
    return out;
  },

  createGame(players, options) {
    const game = new DT.Game(players, options || {});
    drivers.set(game, new DT.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'line') return game.line(playerId, payload);
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
      tableCount: game.claimed,
      winner: game.winnerId ? (game.playerById(game.winnerId) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          score: p.score,
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
