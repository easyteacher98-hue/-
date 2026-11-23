/*
 * 할리갈리 – 서버 게임 모듈
 * 공용 엔진(public/engine.js)을 감싸서 '보드게임 허브'가 쓰는 표준 인터페이스로 노출합니다.
 *
 * 새 게임을 추가하려면 이 파일과 같은 형태의 모듈을 만들어 games/index.js 에 등록하면 됩니다.
 */
'use strict';

const HG = require('../../public/engine.js');

// 게임 인스턴스별 봇 드라이버 (게임이 끝나면 함께 사라짐)
const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  eliminated: '탈락한 플레이어입니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  empty_deck: '낼 카드가 없습니다.',
  bell_locked: '방금 종을 쳤습니다. 잠시만 기다려 주세요.',
  unknown_action: '할 수 없는 동작입니다.',
  wrong_phase: '지금은 할 수 없습니다.'
};

module.exports = {
  id: 'halligalli',
  title: '할리갈리',
  subtitle: '과일이 정확히 5개가 되는 순간, 종을 쳐라!',
  emoji: '🔔',
  status: 'ready',
  minPlayers: HG.MIN_PLAYERS,
  maxPlayers: HG.MAX_PLAYERS,
  groupCapacity: Number(process.env.GROUP_CAPACITY || 4),
  groupCount: 6,
  rules: [
    '카드 56장을 인원수대로 똑같이 나눠 가집니다.',
    '자기 차례에 자기 덱 맨 위 카드를 자기 앞에 1장 뒤집어 놓습니다.',
    '테이블에 보이는 모든 맨 위 카드의 과일을 세어, 어떤 과일이든 정확히 5개가 되면 종을 칩니다.',
    '가장 먼저 종을 친 사람이 테이블에 공개된 카드를 모두 가져갑니다.',
    '5개가 아닌데 종을 치면 다른 모든 플레이어에게 내 카드 1장씩 건네줍니다.',
    '카드가 모두 떨어지면 탈락, 마지막까지 남은 사람이 우승!'
  ],

  /** 기본 제공 방: 1모둠 ~ 6모둠 */
  defaultRooms() {
    const out = [];
    for (let i = 1; i <= this.groupCount; i++) {
      out.push({ code: String(i), name: i + '모둠', isGroup: true, capacity: this.groupCapacity, sort: i });
    }
    return out;
  },

  createGame(players, options) {
    const opts = options || {};
    const game = new HG.Game(players, { endWhenTwo: opts.endWhenTwo, rng: opts.rng });
    drivers.set(game, new HG.BotDriver(game, { level: opts.botLevel || 'normal' }));
    return game;
  },

  applyAction(game, playerId, action, payload, now) {
    if (action === 'flip') return game.flip(playerId, now);
    if (action === 'ring') return game.ring(playerId, now);
    return { ok: false, reason: 'unknown_action' };
  },

  botTick(game, now) {
    const driver = drivers.get(game);
    if (!driver) return null;
    return driver.tick(now);
  },

  serialize(game, viewerId) {
    return game.stateFor(viewerId);
  },

  /** 교사 관전 대시보드용 요약 */
  summary(game) {
    if (!game) {
      return { status: 'waiting', turnName: null, players: [], winner: null, lastEvent: null, tableCount: 0 };
    }
    const current = game.players[game.turn];
    return {
      status: game.status,
      turnName: current ? current.name : null,
      tableCount: game.tableCardCount(),
      winner: game.winnerId ? (game.playerById(game.winnerId) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          isBot: p.isBot,
          deckCount: p.deck.length,
          totalCards: p.deck.length + p.pile.length,
          eliminated: p.eliminated,
          isTurn: p === current && game.status === 'playing'
        };
      })
    };
  },

  reasonText(reason) {
    return REASON_TEXT[reason] || '요청을 처리할 수 없습니다.';
  }
};
