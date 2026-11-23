/*
 * 모둠 보드게임 허브 – HTTP 정적 서버 + WebSocket 방 서버
 *
 * - 게임 로직은 src/games/<game>.js 모듈이 담당하고, 이 파일은 방/좌석/관전/전송만 처리합니다.
 * - 그래서 새 게임을 추가해도 이 서버 코드는 거의 고치지 않습니다.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const games = require('./src/games');

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sanitizeNickname(raw) {
  const text = String(raw === undefined || raw === null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 12);
}

function createHub(options) {
  const settings = {
    groupCapacity: Number((options && options.groupCapacity) || process.env.GROUP_CAPACITY || 4),
    maxBots: 4,
    overviewInterval: 150
  };

  const rooms = new Map();       // `${gameId}:${code}` -> room
  const connections = new Set(); // 모든 ws
  const overviewSubs = new Set(); // 교사 관전(요약 구독)
  let overviewTimer = null;
  let seq = 0;
  const nextId = function () { return ++seq; };

  /* ---------------- 방 ---------------- */

  function roomKey(gameId, code) {
    return gameId + ':' + String(code).toUpperCase();
  }

  function newRoom(gameModule, spec) {
    return {
      key: roomKey(gameModule.id, spec.code),
      gameId: gameModule.id,
      gameModule: gameModule,
      code: String(spec.code).toUpperCase(),
      name: spec.name,
      isGroup: !!spec.isGroup,
      capacity: spec.capacity || gameModule.maxPlayers,
      sort: spec.sort || 0,
      seats: [],
      spectators: new Set(),
      hostId: null,
      game: null,
      endWhenTwo: false,
      botTimer: null,
      lastEvent: '대기 중',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: null
    };
  }

  function initRooms() {
    for (const gameModule of games.playable) {
      for (const spec of gameModule.defaultRooms()) {
        if (gameModule.id === 'halligalli') spec.capacity = settings.groupCapacity;
        const room = newRoom(gameModule, spec);
        rooms.set(room.key, room);
      }
    }
  }

  function getRoom(gameId, code) {
    if (!gameId || code === undefined || code === null) return null;
    return rooms.get(roomKey(gameId, code)) || null;
  }

  function generateCode(gameId) {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      const bytes = crypto.randomBytes(4);
      for (let i = 0; i < 4; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      if (!getRoom(gameId, code)) return code;
    }
    return 'R' + Date.now().toString(36).slice(-3).toUpperCase();
  }

  function createCustomRoom(gameModule, hostName) {
    const code = generateCode(gameModule.id);
    const room = newRoom(gameModule, {
      code: code,
      name: hostName + '의 방',
      isGroup: false,
      capacity: gameModule.maxPlayers,
      sort: 100
    });
    rooms.set(room.key, room);
    return room;
  }

  function deleteRoom(room) {
    stopBotLoop(room);
    rooms.delete(room.key);
  }

  function stopBotLoop(room) {
    if (room.botTimer) {
      clearInterval(room.botTimer);
      room.botTimer = null;
    }
  }

  function ensureBotLoop(room) {
    if (room.botTimer) return;
    const game = room.game;
    if (!game || game.status !== 'playing') return;
    if (!game.players.some(function (p) { return p.isBot && !p.eliminated; })) return;

    room.botTimer = setInterval(function () {
      const current = room.game;
      if (!current || current.status !== 'playing') {
        stopBotLoop(room);
        return;
      }
      const action = room.gameModule.botTick(current, Date.now());
      if (!action) return;
      const result = room.gameModule.applyAction(current, action.playerId, action.action, null, Date.now());
      if (result && result.ok) {
        const last = current.log[current.log.length - 1];
        touch(room, last ? last.text : null);
        broadcastRoom(room);
      }
      if (current.status !== 'playing') stopBotLoop(room);
    }, 120);
    if (room.botTimer.unref) room.botTimer.unref();
  }

  function touch(room, text) {
    room.updatedAt = Date.now();
    if (text) room.lastEvent = text;
    scheduleOverview();
  }

  /* ---------------- 상태 직렬화 ---------------- */

  function roomStateFor(room, viewerId, role) {
    const game = room.game;
    const summary = room.gameModule.summary(game);
    return {
      gameId: room.gameId,
      gameTitle: room.gameModule.title,
      code: room.code,
      name: room.name,
      isGroup: room.isGroup,
      capacity: room.capacity,
      status: game ? game.status : 'waiting',
      hostId: room.hostId,
      endWhenTwo: room.endWhenTwo,
      youId: viewerId || null,
      role: role || 'lobby',
      youAreHost: !!viewerId && viewerId === room.hostId,
      canStart: room.seats.length >= room.gameModule.minPlayers,
      seats: room.seats.map(function (s) {
        return {
          id: s.id,
          name: s.name,
          ready: s.ready,
          isBot: s.isBot,
          connected: s.connected,
          autoPilot: !!s.autoPilot,
          isHost: s.id === room.hostId
        };
      }),
      game: game ? room.gameModule.serialize(game, viewerId) : null,
      summary: summary,
      lastEvent: room.lastEvent,
      rules: room.gameModule.rules || [],
      minPlayers: room.gameModule.minPlayers,
      maxPlayers: room.gameModule.maxPlayers,
      finishedAt: room.finishedAt
    };
  }

  function roomsOverview(gameId) {
    const out = [];
    for (const room of rooms.values()) {
      if (gameId && room.gameId !== gameId) continue;
      const summary = room.gameModule.summary(room.game);
      const humans = room.seats.filter(function (s) { return !s.isBot; });
      const bots = room.seats.filter(function (s) { return s.isBot; });
      out.push({
        gameId: room.gameId,
        code: room.code,
        name: room.name,
        isGroup: room.isGroup,
        capacity: room.capacity,
        sort: room.sort,
        status: room.game ? room.game.status : 'waiting',
        playerCount: room.seats.length,
        humanCount: humans.length,
        botCount: bots.length,
        connectedCount: humans.filter(function (s) { return s.connected; }).length,
        seats: room.seats.map(function (s) {
          return {
            id: s.id,
            name: s.name,
            ready: s.ready,
            isBot: s.isBot,
            connected: s.connected,
            autoPilot: !!s.autoPilot,
            isHost: s.id === room.hostId
          };
        }),
        players: summary.players,
        turnName: summary.turnName,
        winner: summary.winner,
        tableCount: summary.tableCount,
        lastEvent: summary.lastEvent || room.lastEvent,
        updatedAt: room.updatedAt,
        createdAt: room.createdAt
      });
    }
    out.sort(function (a, b) {
      if (a.isGroup !== b.isGroup) return a.isGroup ? -1 : 1;
      if (a.isGroup) return a.sort - b.sort;
      return b.createdAt - a.createdAt;
    });
    return out;
  }

  /* ---------------- 전송 ---------------- */

  function send(ws, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      /* 연결이 끊긴 경우 무시 */
    }
  }

  function sendError(ws, message, code) {
    send(ws, { t: 'error', message: message, code: code || null });
  }

  function broadcastRoom(room) {
    for (const seat of room.seats) {
      if (seat.ws) send(seat.ws, { t: 'room', room: roomStateFor(room, seat.id, 'player') });
    }
    for (const ws of room.spectators) {
      send(ws, { t: 'room', room: roomStateFor(room, null, 'spectator') });
    }
    scheduleOverview();
  }

  function scheduleOverview() {
    if (overviewTimer) return;
    overviewTimer = setTimeout(function () {
      overviewTimer = null;
      broadcastOverview();
    }, settings.overviewInterval);
    if (overviewTimer.unref) overviewTimer.unref();
  }

  function broadcastOverview() {
    const list = roomsOverview();
    for (const ws of connections) {
      if (ws.meta.room && ws.meta.role === 'player') continue;
      send(ws, { t: 'rooms', rooms: list });
    }
  }

  /* ---------------- 좌석 관리 ---------------- */

  function findSeatByToken(room, token) {
    if (!room || !token) return null;
    return room.seats.find(function (s) { return s.token === token; }) || null;
  }

  function removeSeat(room, seat) {
    room.seats = room.seats.filter(function (s) { return s.id !== seat.id; });
    if (room.hostId === seat.id) {
      const next = room.seats.find(function (s) { return !s.isBot && s.connected; }) || room.seats[0];
      room.hostId = next ? next.id : null;
    }
    if (!room.seats.length && !room.isGroup) {
      deleteRoom(room);
    }
  }

  function resetLobby(room) {
    stopBotLoop(room);
    room.game = null;
    room.endWhenTwo = false;
    room.seats = room.seats.filter(function (s) { return s.connected && !s.isBot; });
    room.seats.forEach(function (s) { s.ready = false; });
    if (!room.seats.some(function (s) { return s.id === room.hostId; })) {
      room.hostId = room.seats[0] ? room.seats[0].id : null;
    }
    room.lastEvent = '대기 중';
  }

  function attachSeat(ws, room, seat) {
    if (seat.ws && seat.ws !== ws && seat.ws.readyState === WebSocket.OPEN) {
      send(seat.ws, { t: 'error', message: '다른 창에서 접속했습니다. 이 창은 종료됩니다.', code: 'replaced' });
      try { seat.ws.close(4001, 'replaced'); } catch (err) { /* ignore */ }
    }
    seat.ws = ws;
    seat.connected = true;
    seat.autoPilot = false;
    ws.meta.room = room;
    ws.meta.seat = seat;
    ws.meta.role = 'player';
    if (room.game) {
      const gp = room.game.playerById(seat.id);
      if (gp) gp.isBot = false;
      if (room.game.status === 'playing') ensureBotLoop(room);
    }
  }

  function joinRoom(ws, msg) {
    const gameModule = games.get(msg.gameId);
    if (!gameModule || gameModule.status !== 'ready') {
      return sendError(ws, '플레이할 수 없는 게임입니다.', 'bad_game');
    }
    if (ws.meta.room) return sendError(ws, '이미 방에 있습니다.', 'already_in_room');

    const room = getRoom(gameModule.id, msg.code);
    if (!room) return sendError(ws, '방을 찾을 수 없습니다. 모둠 번호를 확인해 주세요.', 'no_room');

    const name = sanitizeNickname(msg.nickname);
    if (!name) return sendError(ws, '닉네임을 입력해 주세요.', 'no_name');

    if (room.game && room.game.status === 'playing') {
      return sendError(ws, '이미 게임이 진행 중인 방입니다. 끝난 뒤에 입장해 주세요.', 'playing');
    }
    if (room.game && room.game.status === 'finished') {
      resetLobby(room);
      broadcastRoom(room);
    }
    if (room.seats.length >= room.capacity) {
      return sendError(ws, '방이 가득 찼습니다. (' + room.capacity + '명)', 'full');
    }
    if (room.seats.some(function (s) { return s.name === name; })) {
      return sendError(ws, '같은 닉네임이 이미 사용 중입니다. 다른 이름을 써 주세요.', 'dup_name');
    }

    const seat = {
      id: 'p' + nextId(),
      token: crypto.randomBytes(12).toString('hex'),
      name: name,
      ready: false,
      isBot: false,
      ws: null,
      connected: true,
      autoPilot: false
    };
    room.seats.push(seat);
    if (!room.hostId) room.hostId = seat.id;
    attachSeat(ws, room, seat);
    send(ws, { t: 'joined', gameId: room.gameId, code: room.code, token: seat.token, playerId: seat.id });
    touch(room, name + '님이 ' + room.name + '에 입장했습니다.');
    broadcastRoom(room);
    broadcastOverview();
  }

  function resumeSeat(ws, msg) {
    const gameModule = games.get(msg.gameId);
    if (!gameModule) return sendError(ws, '플레이할 수 없는 게임입니다.', 'bad_game');
    const room = getRoom(gameModule.id, msg.code);
    if (!room) return sendError(ws, '이전 방을 찾을 수 없습니다.', 'no_room');
    const seat = findSeatByToken(room, msg.token);
    if (!seat) return sendError(ws, '이전 자리를 찾을 수 없습니다. 다시 입장해 주세요.', 'no_seat');
    attachSeat(ws, room, seat);
    send(ws, { t: 'joined', gameId: room.gameId, code: room.code, token: seat.token, playerId: seat.id, resumed: true });
    touch(room, seat.name + '님이 다시 접속했습니다.');
    broadcastRoom(room);
    broadcastOverview();
  }

  function createRoomFor(ws, msg) {
    const gameModule = games.get(msg.gameId);
    if (!gameModule || gameModule.status !== 'ready') {
      return sendError(ws, '플레이할 수 없는 게임입니다.', 'bad_game');
    }
    if (ws.meta.room) return sendError(ws, '이미 방에 있습니다.', 'already_in_room');
    const name = sanitizeNickname(msg.nickname);
    if (!name) return sendError(ws, '닉네임을 입력해 주세요.', 'no_name');

    const room = createCustomRoom(gameModule, name);
    const seat = {
      id: 'p' + nextId(),
      token: crypto.randomBytes(12).toString('hex'),
      name: name,
      ready: true,
      isBot: false,
      ws: null,
      connected: true,
      autoPilot: false
    };
    room.seats.push(seat);
    room.hostId = seat.id;
    attachSeat(ws, room, seat);
    send(ws, { t: 'joined', gameId: room.gameId, code: room.code, token: seat.token, playerId: seat.id, created: true });
    touch(room, name + '님이 방을 만들었습니다.');
    broadcastRoom(room);
    broadcastOverview();
  }

  function startGame(ws, room, seat) {
    if (!seat) return sendError(ws, '관전자는 게임을 시작할 수 없습니다.', 'spectator');
    if (seat.id !== room.hostId) return sendError(ws, '방장만 게임을 시작할 수 있습니다.', 'not_host');
    if (room.game && room.game.status === 'playing') return sendError(ws, '이미 진행 중입니다.', 'playing');
    if (room.seats.length < room.gameModule.minPlayers) {
      return sendError(ws, '최소 ' + room.gameModule.minPlayers + '명이 필요합니다. 봇을 추가해 보세요.', 'few_players');
    }
    const humans = room.seats.filter(function (s) { return !s.isBot && s.connected; });
    // 이미 끝난 판을 다시 시작할 때는 준비 상태를 다시 묻지 않습니다.
    const isRestart = !!(room.game && room.game.status === 'finished');
    const notReady = isRestart ? [] : humans.filter(function (s) { return !s.ready && s.id !== room.hostId; });
    if (notReady.length) {
      return sendError(ws, notReady.map(function (s) { return s.name; }).join(', ') + '님이 아직 준비 중입니다.', 'not_ready');
    }

    stopBotLoop(room);
    room.game = room.gameModule.createGame(
      room.seats.map(function (s) { return { id: s.id, name: s.name, isBot: s.isBot }; }),
      { endWhenTwo: room.endWhenTwo }
    );
    room.finishedAt = null;
    room.seats.forEach(function (s) { s.ready = false; });
    const last = room.game.log[room.game.log.length - 1];
    touch(room, last ? last.text : '게임을 시작했습니다.');
    ensureBotLoop(room);
    broadcastRoom(room);
    broadcastOverview();
  }

  /* ---------------- 연결 해제 ---------------- */

  function detach(ws) {
    connections.delete(ws);
    overviewSubs.delete(ws);
    const room = ws.meta.room;
    const seat = ws.meta.seat;

    if (room) {
      room.spectators.delete(ws);
      if (seat && seat.ws === ws) {
        seat.ws = null;
        seat.connected = false;
        if (room.game && room.game.status === 'playing') {
          seat.autoPilot = true;
          const gp = room.game.playerById(seat.id);
          if (gp) gp.isBot = true;
          ensureBotLoop(room);
          touch(room, seat.name + '님 연결이 끊겨 자동 플레이로 전환합니다.');
        } else {
          removeSeat(room, seat);
        }
        broadcastRoom(room);
      }
      ws.meta.room = null;
      ws.meta.seat = null;
    }
    ws.meta.role = 'closed';
    scheduleOverview();
  }

  function leaveRoom(ws) {
    const room = ws.meta.room;
    const seat = ws.meta.seat;
    if (!room) {
      send(ws, { t: 'left' });
      return;
    }
    room.spectators.delete(ws);
    if (seat) {
      if (room.game && room.game.status === 'playing') {
        // 게임 중 나가면 자동 플레이로 남겨 두고 관전 자리만 해제
        seat.autoPilot = true;
        seat.connected = false;
        if (seat.ws === ws) seat.ws = null;
        const gp = room.game.playerById(seat.id);
        if (gp) gp.isBot = true;
        ensureBotLoop(room);
        touch(room, seat.name + '님이 나갔습니다. 자동 플레이로 계속합니다.');
      } else {
        removeSeat(room, seat);
      }
    }
    ws.meta.room = null;
    ws.meta.seat = null;
    ws.meta.role = 'lobby';
    send(ws, { t: 'left' });
    if (rooms.has(room.key)) broadcastRoom(room);
    scheduleOverview();
  }

  /* ---------------- 메시지 처리 ---------------- */

  function handleMessage(ws, msg) {
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'hello': {
        send(ws, { t: 'welcome', games: games.list(), rooms: roomsOverview(), serverTime: Date.now() });
        return;
      }
      case 'overview': {
        overviewSubs.add(ws);
        if (!ws.meta.room) ws.meta.role = 'teacher';
        send(ws, { t: 'rooms', gameId: msg.gameId || null, rooms: roomsOverview(msg.gameId) });
        return;
      }
      case 'join':
        return joinRoom(ws, msg);
      case 'resume':
        return resumeSeat(ws, msg);
      case 'create':
        return createRoomFor(ws, msg);
      case 'leave':
        return leaveRoom(ws);
      case 'spectate': {
        const gameModule = games.get(msg.gameId);
        if (!gameModule) return sendError(ws, '플레이할 수 없는 게임입니다.', 'bad_game');
        const room = getRoom(gameModule.id, msg.code);
        if (!room) return sendError(ws, '방을 찾을 수 없습니다.', 'no_room');
        if (ws.meta.room && ws.meta.room !== room) leaveRoom(ws);
        room.spectators.add(ws);
        ws.meta.room = room;
        ws.meta.seat = null;
        ws.meta.role = 'spectator';
        send(ws, { t: 'spectating', gameId: room.gameId, code: room.code, name: room.name });
        send(ws, { t: 'room', room: roomStateFor(room, null, 'spectator') });
        return;
      }
      case 'stopSpectate': {
        const room = ws.meta.room;
        if (room) room.spectators.delete(ws);
        ws.meta.room = null;
        ws.meta.role = 'lobby';
        send(ws, { t: 'left' });
        return;
      }
      case 'ready': {
        const room = ws.meta.room;
        const seat = ws.meta.seat;
        if (!room || !seat) return sendError(ws, '방에 입장해야 합니다.', 'no_room');
        if (room.game && room.game.status === 'playing') return sendError(ws, '이미 게임이 시작되었습니다.', 'playing');
        seat.ready = !!msg.ready;
        broadcastRoom(room);
        return;
      }
      case 'start': {
        const room = ws.meta.room;
        if (!room) return sendError(ws, '방에 입장해야 합니다.', 'no_room');
        return startGame(ws, room, ws.meta.seat);
      }
      case 'option': {
        const room = ws.meta.room;
        const seat = ws.meta.seat;
        if (!room || !seat) return sendError(ws, '방에 입장해야 합니다.', 'no_room');
        if (seat.id !== room.hostId) return sendError(ws, '방장만 설정을 바꿀 수 있습니다.', 'not_host');
        if (room.game && room.game.status === 'playing') return sendError(ws, '게임 중에는 바꿀 수 없습니다.', 'playing');
        room.endWhenTwo = !!msg.endWhenTwo;
        broadcastRoom(room);
        return;
      }
      case 'addBot': {
        const room = ws.meta.room;
        const seat = ws.meta.seat;
        if (!room || !seat) return sendError(ws, '방에 입장해야 합니다.', 'no_room');
        if (seat.id !== room.hostId) return sendError(ws, '방장만 봇을 추가할 수 있습니다.', 'not_host');
        if (room.game && room.game.status === 'playing') return sendError(ws, '게임 중에는 봇을 추가할 수 없습니다.', 'playing');
        if (room.seats.length >= room.capacity) return sendError(ws, '인원이 가득 찼습니다.', 'full');
        const used = new Set(room.seats.map(function (s) { return s.name; }));
        const HG = require('./public/engine.js');
        const botName = HG.BOT_NAMES.find(function (n) { return !used.has(n); }) || ('봇' + room.seats.length);
        room.seats.push({
          id: 'b' + nextId(),
          token: null,
          name: botName,
          ready: true,
          isBot: true,
          ws: null,
          connected: true,
          autoPilot: true
        });
        touch(room, botName + ' 봇을 추가했습니다.');
        broadcastRoom(room);
        broadcastOverview();
        return;
      }
      case 'removeBot': {
        const room = ws.meta.room;
        const seat = ws.meta.seat;
        if (!room || !seat) return sendError(ws, '방에 입장해야 합니다.', 'no_room');
        if (seat.id !== room.hostId) return sendError(ws, '방장만 봇을 내보낼 수 있습니다.', 'not_host');
        if (room.game && room.game.status === 'playing') return sendError(ws, '게임 중에는 봇을 내보낼 수 없습니다.', 'playing');
        for (let i = room.seats.length - 1; i >= 0; i--) {
          if (room.seats[i].isBot) { room.seats.splice(i, 1); break; }
        }
        broadcastRoom(room);
        broadcastOverview();
        return;
      }
      case 'action': {
        const room = ws.meta.room;
        const seat = ws.meta.seat;
        if (!room) return sendError(ws, '방에 입장해야 합니다.', 'no_room');
        if (!seat) return sendError(ws, '관전자는 게임에 참여할 수 없습니다.', 'spectator');
        if (!room.game) return sendError(ws, '게임이 시작되지 않았습니다.', 'no_game');
        const result = room.gameModule.applyAction(room.game, seat.id, msg.action, msg.payload, Date.now());
        if (!result || !result.ok) {
          return send(ws, {
            t: 'action_result',
            ok: false,
            reason: result ? result.reason : 'unknown',
            message: room.gameModule.reasonText(result ? result.reason : 'unknown')
          });
        }
        const last = room.game.log[room.game.log.length - 1];
        touch(room, last ? last.text : null);
        if (room.game.status !== 'playing') {
          room.finishedAt = Date.now();
          stopBotLoop(room);
        }
        broadcastRoom(room);
        broadcastOverview();
        return;
      }
      case 'ping':
        return send(ws, { t: 'pong', now: Date.now() });
      default:
        return;
    }
  }

  /* ---------------- HTTP ---------------- */

  function serveStatic(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (err) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }));
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, function (err, data) {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }

  const httpServer = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', function (ws) {
    ws.meta = { role: 'lobby', room: null, seat: null, id: 'c' + nextId() };
    ws.isAlive = true;
    connections.add(ws);
    send(ws, { t: 'welcome', games: games.list(), rooms: roomsOverview(), serverTime: Date.now() });

    ws.on('pong', function () { ws.isAlive = true; });
    ws.on('message', function (raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (err) {
        return;
      }
      try {
        handleMessage(ws, msg);
      } catch (err) {
        console.error('[hub] 메시지 처리 오류:', err);
        sendError(ws, '서버에서 오류가 발생했습니다.', 'server_error');
      }
    });
    ws.on('close', function () { detach(ws); });
    ws.on('error', function () { detach(ws); });
  });

  const heartbeat = setInterval(function () {
    wss.clients.forEach(function (ws) {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch (err) { /* ignore */ }
    });
  }, 30000);
  if (heartbeat.unref) heartbeat.unref();

  initRooms();

  /* ---------------- 공개 API ---------------- */

  function start(port, host) {
    const listenPort = port === undefined ? Number(process.env.PORT || 3000) : port;
    const listenHost = host || process.env.HOST || '0.0.0.0';
    return new Promise(function (resolve, reject) {
      httpServer.once('error', reject);
      httpServer.listen(listenPort, listenHost, function () {
        const actual = httpServer.address();
        resolve({ port: actual.port, host: listenHost, urls: lanUrls(actual.port) });
      });
    });
  }

  function close() {
    clearInterval(heartbeat);
    if (overviewTimer) clearTimeout(overviewTimer);
    for (const room of rooms.values()) stopBotLoop(room);
    return new Promise(function (resolve) {
      for (const client of wss.clients) {
        try { client.terminate(); } catch (err) { /* ignore */ }
      }
      wss.close(function () {
        httpServer.close(function () { resolve(); });
      });
    });
  }

  return {
    httpServer: httpServer,
    wss: wss,
    rooms: rooms,
    settings: settings,
    start: start,
    close: close,
    roomsOverview: roomsOverview,
    getRoom: getRoom
  };
}

function lanUrls(port) {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push('http://' + info.address + ':' + port);
      }
    }
  }
  return urls;
}

module.exports = { createHub: createHub, lanUrls: lanUrls };

/* 직접 실행: node server.js */
if (require.main === module) {
  const hub = createHub();
  hub.start().then(function (info) {
    const port = info.port;
    console.log('');
    console.log('  🔔  모둠 보드게임 서버가 시작되었습니다.');
    console.log('');
    console.log('  내 컴퓨터 :  http://localhost:' + port);
    for (const url of info.urls) {
      console.log('  같은 와이파이(모둠원) :  ' + url);
    }
    console.log('');
    console.log('  교사 관전 :  /#/halligalli/teacher  (또는 사이트 첫 화면에서 [교사 관전])');
    console.log('  종료하려면 Ctrl+C');
    console.log('');
  }).catch(function (err) {
    console.error('서버를 시작할 수 없습니다:', err.message);
    process.exit(1);
  });

  const shutdown = function () {
    console.log('\n서버를 종료합니다...');
    hub.close().then(function () { process.exit(0); });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
