/*
 * 숫자 줄세우기 – 서버 게임 모듈
 * 공용 엔진(public/streams-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const ST = require('../../public/streams-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  no_tile: '아직 숫자가 나오지 않았습니다.',
  already_done: '이번 숫자는 이미 놓았습니다.',
  bad_slot: '그 칸에는 놓을 수 없습니다. (왼쪽은 작게, 오른쪽은 크게) 반짝이는 칸을 눌러 주세요.',
  must_place: '놓을 수 있는 칸이 있습니다. 칸을 골라 주세요.',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'streams',
  title: '숫자 줄세우기',
  subtitle: '같은 타일을 각자 트랙에! 조커(★)와 함께 20칸을 채우고 가장 긴 줄이 이깁니다',
  emoji: '🎯',
  status: 'ready',
  mode: 'multi',
  grades: ['low', 'mid', 'high'],
  playersText: '1~4명 · 모둠당 4명',
  minPlayers: ST.MIN_PLAYERS,
  maxPlayers: ST.MAX_PLAYERS,
  groupCapacity: Math.min(Number(process.env.GROUP_CAPACITY || 4), ST.MAX_PLAYERS),
  groupCount: 6,
  botNames: ['숫자봇 셈이', '숫자봇 순서', '숫자봇 열이'],
  rules: [
    '1~30 숫자 타일과 만능 조커(★) 2장을 섞어, 그중 20장을 한 장씩 공개합니다.',
    '같은 타일을 모두가 동시에 자기 20칸 트랙의 빈칸에 하나씩 놓습니다.',
    '트랙은 왼쪽에서 오른쪽으로 커지게(오름차순) 놓는 것이 좋습니다.',
    '조커(★)는 어떤 숫자 사이에도 놓을 수 있고, 앞뒤 숫자를 이어 줍니다.',
    '오름차순에 맞는 칸이 없어도 남은 빈칸 하나에 반드시 놓아야 합니다. (그 자리에서 줄이 끊깁니다)',
    '20번의 차례로 20칸을 모두 채우면 끝납니다. 끊기지 않고 이어진 가장 긴 구간이 점수!',
    '요령: 가운데 칸에는 중간 숫자를 놓아 두면 나중 숫자를 놓기 쉬워요.'
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
    const game = new ST.Game(players, { rng: opts.rng, seed: opts.seed });
    drivers.set(game, new ST.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'place') return game.place(playerId, payload && payload.slot);
    if (action === 'skip') return game.skip(playerId);
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
    return {
      status: game.status,
      round: game.round,
      value: game.value,
      turnName: null,
      tableCount: game.round,
      winner: game.status === 'finished' && game.winnerId() ? (game.playerById(game.winnerId()) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          score: p.score,
          filled: p.filled,
          eliminated: false,
          isTurn: false
        };
      })
    };
  },

  reasonText(reason) {
    return REASON_TEXT[reason] || '요청을 처리할 수 없습니다.';
  }
};
