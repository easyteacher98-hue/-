/*
 * 전통 윷놀이 – 서버 게임 모듈
 * 공용 엔진(public/yut-engine.js)을 감싸서 '보드게임 허브' 표준 인터페이스로 노출합니다.
 */
'use strict';

const YT = require('../../public/yut-engine.js');

const drivers = new WeakMap();
// 봇이 쉬는 시간 (ms) — 던진 뒤에는 윷가락 연출, 옮긴 뒤에는 말이 걷는 연출만큼
const paces = new WeakMap();
const BOT_THROW_MS = 1500;
const BOT_MOVE_MS = 1450;

const REASON_TEXT = {
  not_playing: '게임이 진행 중이 아닙니다.',
  unknown_player: '플레이어를 찾을 수 없습니다.',
  not_your_turn: '아직 내 차례가 아닙니다.',
  wrong_phase: '지금은 할 수 없습니다.',
  throw_first: '먼저 윷가락을 던져 주세요.',
  unknown_piece: '옮길 말을 골라 주세요.',
  cannot_go_back: '보드 위의 말만 빽도로 옮길 수 있습니다.',
  unknown_action: '할 수 없는 동작입니다.'
};

module.exports = {
  id: 'yut',
  title: '전통 윷놀이',
  subtitle: '도·개·걸·윷·모! 말을 업고 잡으며 먼저 완주하세요',
  emoji: '🪵',
  status: 'ready',
  mode: 'multi',
  grades: ['low', 'mid', 'high'],
  playersText: '2~4명 · 모둠당 4명',
  minPlayers: YT.MIN_PLAYERS,
  maxPlayers: YT.MAX_PLAYERS,
  groupCapacity: Math.min(Number(process.env.GROUP_CAPACITY || 4), YT.MAX_PLAYERS),
  groupCount: 6,
  botNames: YT.BOT_NAMES,
  rules: [
    '윷가락 4개를 던져 나온 결과만큼 말을 옮깁니다. (도 1 · 개 2 · 걸 3 · 윷 4 · 모 5 · 빽도 한 칸 뒤로)',
    '윷이나 모가 나오면 한 번 더 던집니다.',
    '내 말이 있는 자리에 다른 내 말이 오면 업어서 함께 움직입니다.',
    '상대 말이 있는 자리에 내 말이 오면 상대 말을 잡아 출발점으로 보내고, 한 번 더 던집니다.',
    '모서리(5·10번 자리)에 정확히 멈추면 지름길로 갑니다.',
    '말이 모두 완주하면 우승! 말 개수는 방장이 2~4개로 정할 수 있습니다.'
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
    const game = new YT.Game(players, {
      rng: opts.rng,
      seed: opts.seed,
      pieces: opts.pieces || (opts.options && opts.options.pieces)
    });
    drivers.set(game, new YT.BotDriver(game));
    return game;
  },

  applyAction(game, playerId, action, payload) {
    if (action === 'throw') return game.throwYut(playerId);
    if (action === 'move') return game.move(playerId, payload && payload.pieceId);
    return { ok: false, reason: 'unknown_action' };
  },

  botTick(game, now) {
    const driver = drivers.get(game);
    if (!driver) return null;
    // 윷가락이 떨어지고 말이 한 칸씩 걷는 장면을 다 보여 준 뒤에 봇이 다음 동작을 합니다.
    const t = typeof now === 'number' ? now : Date.now();
    const pace = paces.get(game);
    if (pace && t - pace.at < pace.wait) return null;
    const action = driver.tick();
    if (!action) return null;
    paces.set(game, { at: t, wait: action.action === 'throw' ? BOT_THROW_MS : BOT_MOVE_MS });
    return action;
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
      phase: game.phase,
      turnName: current ? current.name : null,
      tableCount: game.phase === 'move' && game.throwInfo ? game.throwInfo.steps : 0,
      winner: game.winnerId ? (game.playerById(game.winnerId) || {}).name || null : null,
      lastEvent: game.log.length ? game.log[game.log.length - 1].text : null,
      players: game.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          number: p.number === undefined ? null : p.number,
          isBot: p.isBot,
          finishedCount: p.pieces.filter(function (piece) { return piece.finished; }).length,
          pieces: p.pieces.length,
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
