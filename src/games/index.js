/*
 * 보드게임 허브 – 게임 레지스트리
 *
 * 새 게임을 추가하는 방법
 *   1) src/games/<game>.js 에 표준 인터페이스(아래 halligalli.js 참고)를 구현한 모듈을 만든다.
 *   2) 이 파일의 배열에 등록한다.
 *   3) public/js/<game>.js 에 화면을 만들고 public/js/portal.js 목록에 카드를 추가한다.
 *
 * 표준 인터페이스
 *   id, title, subtitle, emoji, status('ready'|'coming'), minPlayers, maxPlayers,
 *   defaultRooms(), createGame(players, options), applyAction(game, playerId, action, payload, now),
 *   botTick(game, now), serialize(game, viewerId), summary(game), reasonText(reason)
 */
'use strict';

const halligalli = require('./halligalli');
const bluemarble = require('./bluemarble');

const registry = [halligalli, bluemarble];

// 아직 구현되지 않은 게임: 목록에는 보이지만 방/서버 로직은 없음
const planned = [
  {
    id: 'yutnori',
    title: '윷놀이',
    subtitle: '모둠 대항 윷놀이 (준비 중)',
    emoji: '🎲',
    status: 'coming'
  }
];

function list() {
  return registry.map(function (g) {
    return {
      id: g.id,
      title: g.title,
      subtitle: g.subtitle,
      emoji: g.emoji,
      status: g.status,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      groupCapacity: g.groupCapacity,
      rules: g.rules
    };
  }).concat(planned.map(function (g) {
    return { id: g.id, title: g.title, subtitle: g.subtitle, emoji: g.emoji, status: g.status };
  }));
}

function get(id) {
  return registry.find(function (g) { return g.id === id; }) || null;
}

module.exports = { list: list, get: get, playable: registry };
