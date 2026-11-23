/*
 * 전국여행 마블 (3D) – 서버 게임 모듈
 * 공용 엔진(public/bluemarble-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const BM = require('../../public/bluemarble-engine.js');

// 게임 인스턴스별 봇 드라이버 (게임이 끝나면 함께 사라짐)
const drivers = new WeakMap();

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  bankrupt: '이미 파산한 플레이어입니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  decide_first: '먼저 매입하거나 건너뛰기를 선택해 주세요.',
  wrong_phase: '지금은 할 수 없습니다.',
  nothing_to_buy: '지금 매입할 도시가 없습니다.',
  nothing_to_build: '지금 건설할 도시가 없습니다.',
  nothing_to_skip: '건너뛸 선택이 없습니다.',
  already_owned: '이미 주인이 있는 도시입니다.',
  not_owner: '내 도시가 아닙니다.',
  max_level: '이미 호텔까지 지었습니다.',
  not_enough_cash: '돈이 부족합니다.',
  not_on_island: '무인도에 있지 않습니다.',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'bluemarble',
  title: '전국여행 마블',
  subtitle: '주사위를 굴려 도시를 사고 건물을 세우는 3D 보드게임',
  emoji: '🎲',
  status: 'ready',
  minPlayers: BM.MIN_PLAYERS,
  maxPlayers: BM.MAX_PLAYERS,
  groupCapacity: Math.min(Number(process.env.GROUP_CAPACITY || 4), BM.MAX_PLAYERS),
  groupCount: 6,
  botNames: BM.BOT_NAMES,
  rules: [
    '2~4명이 순서대로 주사위 2개를 굴려 말을 옮깁니다.',
    '출발지를 지나면 월급 20만원을 받습니다.',
    '도시 칸에 멈추면 값을 내고 그 도시를 살 수 있습니다.',
    '내 도시에 다시 멈추면 별장 → 빌딩 → 호텔로 한 단계씩 올릴 수 있습니다.',
    '다른 사람 도시에 멈추면 건물 단계에 따라 통행료를 그 주인에게 냅니다.',
    '더블이 나오면 한 번 더 굴리고, 3연속 더블이면 무인도로 갑니다.',
    '무인도에서는 더블이 나오면 탈출, 3번 실패하면 보석금 15만원을 냅니다.',
    '황금열쇠 칸에서는 카드를 뽑아 보너스·세금·이동 이벤트를 겪습니다.',
    '15라운드가 지나면 총자산(현금+도시+건물) 순위로 우승을 가립니다. 한 명만 남아도 끝납니다.'
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
    const game = new BM.Game(players, { maxRounds: opts.maxRounds, rng: opts.rng });
    drivers.set(game, new BM.BotDriver(game, { level: opts.botLevel || 'normal' }));
    return game;
  },

  applyAction(game, playerId, action, payload, now) {
    if (action === 'roll') return game.roll(playerId, now);
    if (action === 'buy') return game.buy(playerId);
    if (action === 'build') return game.build(playerId);
    if (action === 'skip') return game.skip(playerId);
    if (action === 'payBail') return game.payBail(playerId);
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
    const current = game.currentPlayer();
    return {
      status: game.status,
      round: Math.min(game.round, game.maxRounds),
      maxRounds: game.maxRounds,
      turnName: current ? current.name : null,
      tableCount: game.owner.filter(Boolean).length,
      winner: game.winnerId ? (game.playerById(game.winnerId) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          cash: p.cash,
          pos: p.pos,
          bankrupt: p.bankrupt,
          eliminated: p.bankrupt,
          properties: game.propertiesOf(p.id).length,
          totalAsset: game.totalAsset(p),
          isTurn: p === current && game.status === 'playing'
        };
      })
    };
  },

  reasonText(reason) {
    return REASON_TEXT[reason] || '요청을 처리할 수 없습니다.';
  }
};
