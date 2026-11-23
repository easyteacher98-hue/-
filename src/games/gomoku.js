/*
 * 오목 – 서버 게임 모듈
 * 공용 엔진(public/gomoku-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const GM = require('../../public/gomoku-engine.js');

const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  bad_cell: '오목판 안의 칸을 골라 주세요.',
  occupied: '이미 돌이 있는 자리입니다.',
  forbidden: '흑은 이 자리에 둘 수 없습니다. (금수: 6목·4-4·3-3)',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'gomoku',
  title: '오목',
  subtitle: '15x15 오목판 1:1 대결 · 5목을 먼저 만들면 승리',
  emoji: '⚫',
  status: 'ready',
  mode: 'multi',
  grades: ['mid', 'high'],
  playersText: '2명 · 모둠당 2명',
  minPlayers: GM.MIN_PLAYERS,
  maxPlayers: GM.MAX_PLAYERS,
  groupCapacity: 2,
  groupCount: 6,
  botNames: GM.BOT_NAMES,
  rules: [
    '2명이 번갈아 오목판(15x15)에 돌을 놓습니다. 흑이 먼저 시작합니다.',
    '가로·세로·대각선 어느 방향으로든 5개를 먼저 이으면 승리합니다.',
    '흑은 금수(6목 이상, 4-4, 3-3)를 둘 수 없습니다. 백은 자유롭게 둡니다.',
    '판이 가득 차면 무승부입니다.',
    'AI 봇과 혼자 연습할 수 있고, 모둠방에서는 친구와 대결하고 다른 친구가 관전할 수 있습니다.'
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
    const game = new GM.Game(players, { forbidden: opts.forbidden });
    drivers.set(game, new GM.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'play') return game.play(playerId, payload);
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
          stone: p.stone,
          eliminated: false,
          isTurn: p === current && game.status === 'playing'
        };
      })
    };
  },

  reasonText(reason) {
    return REASON_TEXT[reason] || '요청을 처리할 수 없습니다.';
  }
};
