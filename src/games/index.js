/*
 * 보드게임 허브 – 게임 레지스트리
 *
 * 새 게임을 추가하는 방법
 *   1) public/<game>-engine.js 에 규칙 엔진(UMD)을 만든다. (서버·브라우저 공용)
 *   2) src/games/<game>.js 에 표준 인터페이스 래퍼를 만든다.
 *   3) 이 파일의 registry 배열에 등록한다.
 *   4) public/js/minigames.js 의 GAMES 목록과 public/js/portal.js 의 카드에 추가한다.
 *
 * 표준 인터페이스
 *   id, title, subtitle, emoji, status('ready'|'coming'), minPlayers, maxPlayers,
 *   defaultRooms(), createGame(players, options), applyAction(game, playerId, action, payload, now),
 *   botTick(game, now), serialize(game, viewerId), summary(game), reasonText(reason)
 */
'use strict';

const halligalli = require('./halligalli');
const bluemarble = require('./bluemarble');
const streams = require('./streams');
const gomoku = require('./gomoku');
const liar = require('./liar');
const yut = require('./yut');
const rummi = require('./rummi');
const oldmaid = require('./oldmaid');
const janggi = require('./janggi');
const onecard = require('./onecard');
const dots = require('./dots');

const registry = [halligalli, bluemarble, streams, gomoku, liar, yut, rummi, oldmaid, janggi, onecard, dots];

// 방을 만들지 않는 1인용 게임 (화면에서 바로 즐기고, 최고점·포인트만 서버에 남깁니다)
const soloGames = [
  {
    id: 'puzzle',
    title: '1인용 미니 퍼즐',
    subtitle: '2048과 짝맞추기로 머리를 식히는 1인용 퍼즐',
    emoji: '🧩',
    status: 'ready',
    mode: 'solo',
    grades: ['low', 'mid', 'high'],
    playersText: '1명 · 혼자서',
    minPlayers: 1,
    maxPlayers: 1
  },
  {
    id: 'sudoku',
    title: '1인용 스도쿠',
    subtitle: '4×4 · 6×6 · 9×9 난이도별 스도쿠로 혼자서 머리를 쓰는 퍼즐',
    emoji: '🔢',
    status: 'ready',
    mode: 'solo',
    grades: ['low', 'mid', 'high'],
    playersText: '1명 · 혼자서',
    minPlayers: 1,
    maxPlayers: 1
  }
];

// 아직 구현되지 않은 게임: 목록에는 보이지만 방/서버 로직은 없음
const planned = [];

function summaryOf(g) {
  return {
    id: g.id,
    title: g.title,
    subtitle: g.subtitle,
    emoji: g.emoji,
    status: g.status,
    mode: g.mode || 'multi',
    grades: g.grades || [],
    playersText: g.playersText || '',
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    groupCapacity: g.groupCapacity,
    groupCount: g.groupCount,
    categories: g.categories || null,
    rules: g.rules
  };
}

function list() {
  return registry.map(summaryOf)
    .concat(soloGames.map(summaryOf))
    .concat(planned.map(function (g) {
      return { id: g.id, title: g.title, subtitle: g.subtitle, emoji: g.emoji, status: g.status };
    }));
}

function get(id) {
  return registry.find(function (g) { return g.id === id; }) || null;
}

function solo(id) {
  return soloGames.find(function (g) { return g.id === id; }) || null;
}

module.exports = { list: list, get: get, solo: solo, playable: registry, soloGames: soloGames };
