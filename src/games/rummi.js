/*
 * 숫자 타일 러미 – 서버 게임 모듈
 * 공용 엔진(public/rummi-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const RM = require('../../public/rummi-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  empty_play: '낼 타일을 먼저 골라 주세요.',
  bad_set: '세트 규칙에 맞지 않습니다. (같은 숫자 다른 색 3~4장, 같은 색 연속 숫자 3장 이상)',
  bad_size: '세트는 3장 이상이어야 합니다.',
  dup_tile: '같은 타일을 두 번 쓸 수 없습니다.',
  no_tile: '내 패에 없는 타일입니다.',
  set_not_found: '테이블 세트를 찾을 수 없습니다.',
  joker_set: '규칙에 맞지 않습니다.',
  need_initial: '처음 등록은 한 차례에 기준 점수 이상 내야 합니다.',
  too_many_jokers: '조커는 한 세트에 1장까지 쓸 수 있습니다.',
  dup_color: '같은 숫자 세트는 색이 모두 달라야 합니다.',
  dup_value: '런에는 같은 숫자를 두 번 쓸 수 없습니다.',
  gap: '런은 끊기지 않게 이어져야 합니다.',
  mixed: '런은 모두 같은 색이어야 합니다.',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'rummi',
  title: '숫자 타일 러미',
  subtitle: '같은 숫자·연속 숫자 세트를 만들어 타일을 먼저 다 내세요',
  emoji: '🔢',
  status: 'ready',
  mode: 'multi',
  grades: ['mid', 'high'],
  playersText: '2~4명 · 모둠당 4명',
  minPlayers: RM.MIN_PLAYERS,
  maxPlayers: RM.MAX_PLAYERS,
  groupCapacity: Math.min(Number(process.env.GROUP_CAPACITY || 4), RM.MAX_PLAYERS),
  groupCount: 6,
  botNames: RM.BOT_NAMES,
  options: [
    {
      name: 'initialPoints',
      label: '처음 등록 점수',
      choices: [
        { value: 30, label: '30점 (기본)' },
        { value: 15, label: '15점 (수업용 간소화)' }
      ]
    }
  ],
  rules: [
    '타일은 1~13 × 4색(빨강·파랑·노랑·초록) + 조커 2장입니다.',
    '같은 숫자 세트: 같은 숫자 다른 색 3~4장을 모아 테이블에 냅니다.',
    '런: 같은 색 연속 숫자 3장 이상을 이어서 냅니다. (예: 초록 4·5·6)',
    '처음 등록은 한 차례에 낸 타일 합이 기준 점수(기본 30점) 이상이어야 합니다. 방장이 15점으로 쉽게 바꿀 수 있어요.',
    '조커는 한 세트에 1장까지, 어떤 빈자리든 대신할 수 있습니다.',
    '테이블 세트에 내 타일을 이어 붙일 수 있습니다.',
    '낼 타일이 없으면 더미에서 1장 뽑고 차례를 넘깁니다.',
    '내 패를 먼저 다 내면 우승! 더미가 비면 남은 타일 점수가 가장 낮은 사람이 우승입니다.'
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
    const game = new RM.Game(players, {
      seed: opts.seed,
      initialPoints: opts.initialPoints,
      options: opts.options
    });
    drivers.set(game, new RM.BotDriver(game));
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
      tableCount: game.table.length,
      winner: game.winnerId ? (game.playerById(game.winnerId) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          score: p.hand.length,
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
