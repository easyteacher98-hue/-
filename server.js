/*
 * 보드게임천국 허브 – HTTP 정적 서버 + WebSocket 반/방 서버
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

/* 반(교실) 코드는 헷갈리는 글자(0/O, 1/I)를 뺀 4~8자입니다. */
const CLASS_CODE_LENGTH = 5;
const DEFAULT_CLASS_CODE = 'DEMO';
const DEFAULT_CLASS_NAME = '연습 교실';
const CLASS_STORE_VERSION = 1;

function sanitizeNickname(raw) {
  const text = String(raw === undefined || raw === null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 12);
}

function sanitizeClassCode(raw) {
  return String(raw === undefined || raw === null ? '' : raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

function sanitizeClassName(raw) {
  return String(raw === undefined || raw === null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

/** 교사 PIN: 숫자 4~8자리 */
function sanitizePin(raw) {
  const text = String(raw === undefined || raw === null ? '' : raw).replace(/[^0-9]/g, '');
  return text.length >= 4 && text.length <= 8 ? text : '';
}

/** 출석번호: 숫자만, 1~99 */
function sanitizeNumber(raw) {
  const text = String(raw === undefined || raw === null ? '' : raw).trim();
  if (!/^[0-9]{1,2}$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  return n;
}

function numberName(n) {
  return n + '번';
}

function randomClassCode() {
  let code = '';
  const bytes = crypto.randomBytes(CLASS_CODE_LENGTH);
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  if (!ba.length || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function createHub(options) {
  const opts = options || {};
  const settings = {
    groupCapacity: Number(opts.groupCapacity || process.env.GROUP_CAPACITY || 4),
    maxBots: 4,
    overviewInterval: 150,
    // 반 목록을 파일에 남겨 서버가 다시 켜져도 우리 반 링크가 살아 있게 합니다.
    storePath: opts.store === false
      ? null
      : (opts.storePath || process.env.CLASS_STORE || path.join(__dirname, 'data', 'classes.json'))
  };

  const rooms = new Map();        // `${classCode}|${gameId}:${code}` -> room
  const classes = new Map();      // 반 코드 -> { code, name, pinHash, pinSalt, createdAt }
  const classTokens = new Map();  // 반 코드 -> Set(교사 토큰)
  const classScores = new Map();  // 반 코드 -> Map(번호 -> { number, plays, wins, points })
  const connections = new Set();  // 모든 ws
  const overviewSubs = new Set(); // 교사 관전(요약 구독)
  let overviewTimer = null;
  let seq = 0;
  const nextId = function () { return ++seq; };

  /* ---------------- 반(교실) ---------------- */

  function makeClass(spec) {
    const salt = crypto.randomBytes(16).toString('hex');
    return {
      code: spec.code,
      name: spec.name,
      pinned: !!spec.pinned,
      pinSalt: spec.pinSalt || salt,
      pinHash: spec.pinHash || hashPin(spec.pin, spec.pinSalt || salt),
      createdAt: spec.createdAt || Date.now()
    };
  }

  function classInfo(cls) {
    return {
      code: cls.code,
      name: cls.name,
      linkPath: classLinkPath(cls.code),
      createdAt: cls.createdAt
    };
  }

  function classLinkPath(code) {
    return '/?class=' + code;
  }

  function getClass(code) {
    const key = sanitizeClassCode(code);
    if (!key) return null;
    return classes.get(key) || null;
  }

  /** 반 코드에 쓸 수 있는지 (없으면 새로 만들 수 있음) */
  function classCodeTaken(code) {
    return classes.has(code);
  }

  function newTeacherToken(cls) {
    const token = crypto.randomBytes(18).toString('hex');
    if (!classTokens.has(cls.code)) classTokens.set(cls.code, new Set());
    const set = classTokens.get(cls.code);
    set.add(token);
    // 최근 토큰 30개만 남깁니다. (오래된 탭은 다시 PIN을 넣으면 됩니다)
    while (set.size > 30) set.delete(set.values().next().value);
    return token;
  }

  function isTeacherToken(cls, token) {
    const set = classTokens.get(cls.code);
    return !!(set && token && set.has(String(token)));
  }

  /** 기본 '연습 교실'은 PIN 없이 열려 있습니다. (직접 주소로 들어오는 혼자 연습용) */
  function canTeach(ws, classCode) {
    const code = sanitizeClassCode(classCode) || DEFAULT_CLASS_CODE;
    if (code === DEFAULT_CLASS_CODE) return true;
    return !!(ws.meta.teacher && ws.meta.classCode === code);
  }

  /* ---------------- 우리 반 누적 기록 (승수 · 포인트) ----------------
   * 서버가 다시 켜지면 초기화됩니다. (학생 브라우저에도 내 기록을 따로 저장해 둡니다)
   * 봇은 집계하지 않고, 출석번호(number)가 있는 사람만 쌓입니다.
   */

  const POINTS_BY_RANK = { 1: 100, 2: 50, 3: 30 };
  const POINTS_OTHER = 10;

  function pointsForRank(rank) {
    return POINTS_BY_RANK[rank] || POINTS_OTHER;
  }

  function scoreMap(classCode) {
    const code = sanitizeClassCode(classCode) || DEFAULT_CLASS_CODE;
    let map = classScores.get(code);
    if (!map) {
      map = new Map();
      classScores.set(code, map);
    }
    return map;
  }

  function classScoreList(classCode) {
    const out = [];
    for (const rec of scoreMap(classCode).values()) out.push(Object.assign({}, rec));
    out.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.number - b.number;
    });
    return out.map(function (rec, i) { return Object.assign({ rank: i + 1 }, rec); });
  }

  /** 한 판이 끝났을 때 순위대로 승수·포인트를 적립하고 결과 메시지를 돌려줍니다. */
  function recordGameResult(room) {
    const game = room.game;
    if (!game || game.status !== 'finished' || room.resultRecorded) return null;
    if (game.finishReason === 'closed_by_host') {
      room.resultRecorded = true;
      return null;
    }
    room.resultRecorded = true;

    const ranking = game.ranking();
    const map = scoreMap(room.classCode);
    const points = {};
    const won = [];

    ranking.forEach(function (row) {
      if (row.isBot || row.number === null || row.number === undefined) return;
      const gain = pointsForRank(row.rank);
      let rec = map.get(row.number);
      if (!rec) rec = { number: row.number, plays: 0, wins: 0, points: 0 };
      rec.plays += 1;
      rec.points += gain;
      if (row.rank === 1) {
        rec.wins += 1;
        won.push(row.number);
      }
      map.set(row.number, rec);
      points[row.number] = gain;
    });

    return {
      t: 'game_result',
      classCode: room.classCode,
      gameId: room.gameId,
      code: room.code,
      roomName: room.name,
      ranking: ranking,
      points: points,
      winners: won,
      stats: classScoreList(room.classCode),
      recordedAt: Date.now()
    };
  }

  function sendClassResult(room, payload) {
    if (!payload) return;
    for (const seat of room.seats) {
      if (seat.ws) send(seat.ws, payload);
    }
    for (const ws of room.spectators) send(ws, payload);
    // 같은 반의 다른 화면(교사 관전 대시보드·포털)에도 새 랭킹을 알립니다.
    for (const ws of connections) {
      if (ws.meta.classCode !== room.classCode) continue;
      if (ws.meta.room === room) continue;
      send(ws, payload);
    }
  }

  function classStoreLoad() {
    if (!settings.storePath) return;
    let raw;
    try {
      raw = fs.readFileSync(settings.storePath, 'utf8');
    } catch (err) {
      return;
    }
    try {
      const data = JSON.parse(raw);
      for (const item of (data && data.classes) || []) {
        const code = sanitizeClassCode(item.code);
        if (!code || code === DEFAULT_CLASS_CODE) continue;
        if (!item.pinHash || !item.pinSalt) continue;
        classes.set(code, makeClass({
          code: code,
          name: sanitizeClassName(item.name) || code + ' 반',
          pinned: true,
          pinSalt: String(item.pinSalt),
          pinHash: String(item.pinHash),
          createdAt: Number(item.createdAt) || Date.now()
        }));
      }
    } catch (err) {
      console.error('[hub] 반 목록 파일을 읽지 못했습니다:', err.message);
    }
  }

  function classStoreSave() {
    if (!settings.storePath) return;
    const list = [];
    for (const cls of classes.values()) {
      if (cls.code === DEFAULT_CLASS_CODE) continue;
      list.push({
        code: cls.code,
        name: cls.name,
        pinSalt: cls.pinSalt,
        pinHash: cls.pinHash,
        createdAt: cls.createdAt
      });
    }
    const dir = path.dirname(settings.storePath);
    const tmp = settings.storePath + '.' + process.pid + '.tmp';
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify({ version: CLASS_STORE_VERSION, classes: list }, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, settings.storePath);
    } catch (err) {
      console.error('[hub] 반 목록을 저장하지 못했습니다:', err.message);
      try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    }
  }

  /** 반 하나에 1~6모둠 방을 만듭니다. 이미 있으면 그대로 둡니다. */
  function initClassRooms(classCode) {
    for (const gameModule of games.playable) {
      for (const spec of gameModule.defaultRooms()) {
        if (gameModule.id === 'halligalli') spec.capacity = settings.groupCapacity;
        const room = newRoom(gameModule, Object.assign({ classCode: classCode }, spec));
        if (!rooms.has(room.key)) rooms.set(room.key, room);
      }
    }
  }

  /* ---------------- 방 ---------------- */

  function roomKey(gameId, code, classCode) {
    return (sanitizeClassCode(classCode) || DEFAULT_CLASS_CODE) + '|' + gameId + ':' + String(code).toUpperCase();
  }

  function newRoom(gameModule, spec) {
    return {
      key: roomKey(gameModule.id, spec.code, spec.classCode),
      classCode: sanitizeClassCode(spec.classCode) || DEFAULT_CLASS_CODE,
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
      resultRecorded: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: null
    };
  }

  function initRooms() {
    classes.set(DEFAULT_CLASS_CODE, makeClass({
      code: DEFAULT_CLASS_CODE,
      name: DEFAULT_CLASS_NAME,
      pin: '0000',
      pinned: false
    }));
    classStoreLoad();
    initClassRooms(DEFAULT_CLASS_CODE);
    for (const code of classes.keys()) {
      if (code !== DEFAULT_CLASS_CODE) initClassRooms(code);
    }
  }

  function getRoom(gameId, code, classCode) {
    if (!gameId || code === undefined || code === null) return null;
    return rooms.get(roomKey(gameId, code, classCode)) || null;
  }

  function generateRoomCode(gameId, classCode) {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      const bytes = crypto.randomBytes(4);
      for (let i = 0; i < 4; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      if (!getRoom(gameId, code, classCode)) return code;
    }
    return 'R' + Date.now().toString(36).slice(-3).toUpperCase();
  }

  function createCustomRoom(gameModule, hostName, classCode) {
    const code = generateRoomCode(gameModule.id, classCode);
    const room = newRoom(gameModule, {
      classCode: classCode,
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
        if (current.status !== 'playing') sendClassResult(room, recordGameResult(room));
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
      classCode: room.classCode,
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
          number: s.number === undefined ? null : s.number,
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

  function roomsOverview(gameId, classCode) {
    const out = [];
    const onlyClass = sanitizeClassCode(classCode) || DEFAULT_CLASS_CODE;
    for (const room of rooms.values()) {
      if (room.classCode !== onlyClass) continue;
      if (gameId && room.gameId !== gameId) continue;
      const summary = room.gameModule.summary(room.game);
      const humans = room.seats.filter(function (s) { return !s.isBot; });
      const bots = room.seats.filter(function (s) { return s.isBot; });
      out.push({
        gameId: room.gameId,
        classCode: room.classCode,
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
            number: s.number === undefined ? null : s.number,
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
    // 연결마다 자기 반의 방만 보냅니다. (다른 반과 섞이지 않게)
    for (const ws of connections) {
      if (ws.meta.room && ws.meta.role === 'player') continue;
      const list = roomsOverview(null, ws.meta.classCode || DEFAULT_CLASS_CODE);
      send(ws, { t: 'rooms', classCode: ws.meta.classCode || DEFAULT_CLASS_CODE, rooms: list });
    }
  }

  /* ---------------- 좌석 관리 ---------------- */

  function findSeatByToken(room, token) {
    if (!room || !token) return null;
    return room.seats.find(function (s) { return s.token === token; }) || null;
  }

  function humanSeats(room) {
    return room.seats.filter(function (s) { return !s.isBot; });
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

  /**
   * 방을 대기 상태로 되돌립니다.
   * options.keepBots      : 봇 자리를 남길지 (방장의 '게임 종료'는 봇을 남겨 바로 다시 시작할 수 있게)
   * options.keepOffline   : 연결이 끊긴 사람 자리도 남길지
   */
  function resetToWaiting(room, options) {
    const opts = options || {};
    stopBotLoop(room);
    room.game = null;
    room.endWhenTwo = false;
    room.finishedAt = null;
    room.resultRecorded = false;
    room.seats = room.seats.filter(function (s) {
      if (opts.dropHumans) return !!opts.keepBots && s.isBot;
      if (s.isBot) return !!opts.keepBots;
      return !!opts.keepOffline || s.connected;
    });
    room.seats.forEach(function (s) { s.ready = !!s.isBot; });
    if (!room.seats.some(function (s) { return s.id === room.hostId; })) {
      room.hostId = room.seats.length ? room.seats[0].id : null;
    }
    room.lastEvent = '대기 중';
    if (!room.seats.length && !room.isGroup) {
      deleteRoom(room);
      return false;
    }
    return true;
  }

  function resetLobby(room) {
    return resetToWaiting(room, {});
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

    const classCode = resolveClassFor(ws, msg.classCode);
    if (!classCode) return sendError(ws, '반 코드를 확인해 주세요.', 'no_class');

    const room = getRoom(gameModule.id, msg.code, classCode);
    if (!room) return sendError(ws, '방을 찾을 수 없습니다. 모둠 번호를 확인해 주세요.', 'no_room');

    // 번호(출석번호)로 입장합니다. (예전 닉네임 방식은 내부 테스트용으로만 허용)
    const hasNumberField = msg.number !== undefined && msg.number !== null && String(msg.number).trim() !== '';
    const number = hasNumberField ? sanitizeNumber(msg.number) : null;
    if (hasNumberField && number === null) {
      return sendError(ws, '번호는 1~99 사이 숫자로 입력해 주세요.', 'bad_number');
    }
    const name = number !== null ? numberName(number) : sanitizeNickname(msg.nickname);
    if (!name) return sendError(ws, '출석번호를 입력해 주세요.', 'no_name');

    if (room.game && room.game.status === 'playing') {
      return sendError(ws, '이미 게임이 진행 중인 방입니다. 끝난 뒤에 입장해 주세요.', 'playing');
    }
    if (room.game && room.game.status === 'finished') {
      if (!resetLobby(room)) {
        return sendError(ws, '방을 찾을 수 없습니다. 모둠 번호를 확인해 주세요.', 'no_room');
      }
      broadcastRoom(room);
    }
    if (room.seats.length >= room.capacity) {
      return sendError(ws, '방이 가득 찼습니다. (' + room.capacity + '명)', 'full');
    }
    if (number !== null && room.seats.some(function (s) { return s.number === number; })) {
      return sendError(ws, number + '번은 이미 이 방에 들어와 있습니다. 번호를 확인해 주세요.', 'dup_number');
    }
    if (number === null && room.seats.some(function (s) { return s.name === name; })) {
      return sendError(ws, '같은 닉네임이 이미 사용 중입니다. 다른 이름을 써 주세요.', 'dup_name');
    }

    const seat = {
      id: 'p' + nextId(),
      token: crypto.randomBytes(12).toString('hex'),
      number: number,
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
    send(ws, { t: 'joined', gameId: room.gameId, classCode: room.classCode, code: room.code, token: seat.token, playerId: seat.id, number: seat.number, name: seat.name });
    touch(room, name + '님이 ' + room.name + '에 입장했습니다.');
    broadcastRoom(room);
    broadcastOverview();
  }

  /** 연결이 들어온 반을 정합니다. (연결에 묶인 반이 있으면 그것만 허용) */
  function resolveClassFor(ws, requested) {
    const wanted = sanitizeClassCode(requested);
    const bound = ws.meta.classCode;
    if (bound) {
      if (wanted && wanted !== bound) return null;
      return bound;
    }
    if (!wanted) return DEFAULT_CLASS_CODE;
    const cls = classes.get(wanted);
    if (!cls) return null;
    ws.meta.classCode = wanted;
    return wanted;
  }

  function resumeSeat(ws, msg) {
    const gameModule = games.get(msg.gameId);
    if (!gameModule) return sendError(ws, '플레이할 수 없는 게임입니다.', 'bad_game');
    const classCode = resolveClassFor(ws, msg.classCode) || DEFAULT_CLASS_CODE;
    const room = getRoom(gameModule.id, msg.code, classCode);
    if (!room) return sendError(ws, '이전 방을 찾을 수 없습니다.', 'no_room');
    const seat = findSeatByToken(room, msg.token);
    if (!seat) return sendError(ws, '이전 자리를 찾을 수 없습니다. 다시 입장해 주세요.', 'no_seat');
    attachSeat(ws, room, seat);
    send(ws, { t: 'joined', gameId: room.gameId, classCode: room.classCode, code: room.code, token: seat.token, playerId: seat.id, number: seat.number, name: seat.name, resumed: true });
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
    const classCode = resolveClassFor(ws, msg.classCode);
    if (!classCode) return sendError(ws, '반 코드를 확인해 주세요.', 'no_class');
    const number = msg.number !== undefined ? sanitizeNumber(msg.number) : null;
    const name = number !== null ? numberName(number) : sanitizeNickname(msg.nickname);
    if (!name) return sendError(ws, '출석번호를 입력해 주세요.', 'no_name');

    const room = createCustomRoom(gameModule, name, classCode);
    const seat = {
      id: 'p' + nextId(),
      token: crypto.randomBytes(12).toString('hex'),
      number: number,
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
    send(ws, { t: 'joined', gameId: room.gameId, classCode: room.classCode, code: room.code, token: seat.token, playerId: seat.id, number: seat.number, name: seat.name, created: true });
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
      room.seats.map(function (s) { return { id: s.id, name: s.name, number: s.number, isBot: s.isBot }; }),
      { endWhenTwo: room.endWhenTwo }
    );
    room.finishedAt = null;
    room.resultRecorded = false;
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

  /**
   * 학생이 스스로 방을 나갈 때 (연결이 끊긴 것과 다릅니다).
   * - 자리를 실제로 정리하고, 게임 중이면 그 자리는 자동 플레이로 바뀌어 남은 사람들의 게임이 이어집니다.
   * - 사람이 한 명도 남지 않으면(봇만 남으면) 모둠 방을 대기 상태(0/인원)로 되돌립니다.
   */
  function leaveRoom(ws) {
    const room = ws.meta.room;
    const seat = ws.meta.seat;
    if (!room) {
      send(ws, { t: 'left' });
      return;
    }
    room.spectators.delete(ws);
    const wasPlaying = !!(room.game && room.game.status === 'playing');
    if (seat) {
      const name = seat.name;
      room.seats = room.seats.filter(function (s) { return s.id !== seat.id; });
      if (wasPlaying) {
        const gp = room.game.playerById(seat.id);
        if (gp) gp.isBot = true;
        ensureBotLoop(room);
      }
      if (room.hostId === seat.id) {
        const next = room.seats.find(function (s) { return !s.isBot; }) || room.seats[0] || null;
        room.hostId = next ? next.id : null;
      }
      touch(room, name + '님이 나갔습니다.');
      if (humanSeats(room).length === 0) {
        // 사람이 모두 나갔으니 봇만 남은 방을 대기 상태로 초기화합니다.
        resetToWaiting(room, {});
        if (rooms.has(room.key)) room.lastEvent = '사람이 모두 나가 대기 상태로 초기화했습니다.';
      }
    }
    ws.meta.room = null;
    ws.meta.seat = null;
    ws.meta.role = 'lobby';
    send(ws, { t: 'left' });
    if (rooms.has(room.key)) broadcastRoom(room);
    broadcastOverview();
  }

  /* ---------------- 반 생성 · 입장 ---------------- */

  /**
   * 우리 반 만들기: 반 이름 + 교사 PIN → 반 코드와 우리 반 전용 링크를 발급합니다.
   * PIN은 해시로만 저장하고, 응답에 담지 않습니다.
   */
  function createClassFor(ws, msg) {
    const name = sanitizeClassName(msg.name);
    if (!name) return sendError(ws, '반 이름을 입력해 주세요. (예: 3학년 2반)', 'bad_class_name');
    const pin = sanitizePin(msg.pin);
    if (!pin) return sendError(ws, '교사 비밀번호는 숫자 4~8자리로 정해 주세요.', 'bad_pin');

    let code = sanitizeClassCode(msg.code);
    if (code && code.length < 4) return sendError(ws, '반 코드는 4~8자로 정해 주세요.', 'bad_class_code');
    if (!code) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const candidate = randomClassCode();
        if (!classCodeTaken(candidate)) { code = candidate; break; }
      }
      if (!code) code = 'C' + Date.now().toString(36).toUpperCase().slice(-6);
    }
    if (code === DEFAULT_CLASS_CODE) return sendError(ws, '이미 쓰고 있는 코드입니다. 다른 코드를 정해 주세요.', 'class_exists');
    if (classCodeTaken(code)) return sendError(ws, '이미 누군가 쓰고 있는 반 코드입니다. 다른 코드를 정해 주세요.', 'class_exists');

    const cls = makeClass({ code: code, name: name, pin: pin, pinned: true });
    classes.set(code, cls);
    initClassRooms(code);
    classStoreSave();

    ws.meta.teacher = true;
    ws.meta.classCode = code;
    const token = newTeacherToken(cls);
    ws.meta.teacherToken = token;

    send(ws, {
      t: 'class_created',
      class: classInfo(cls),
      teacherToken: token,
      code: cls.code,
      name: cls.name,
      link: classLinkPath(cls.code)
    });
    send(ws, { t: 'rooms', classCode: cls.code, rooms: roomsOverview(null, cls.code) });
    send(ws, { t: 'class_stats', classCode: cls.code, stats: classScoreList(cls.code) });
    broadcastOverview();
  }

  /** 반 코드 확인 (학생 입장 전 존재 여부) — 이름만 돌려주고 PIN 정보는 주지 않습니다. */
  function classInfoFor(ws, msg) {
    const cls = getClass(msg.code);
    if (!cls) return send(ws, { t: 'class_info', code: sanitizeClassCode(msg.code), exists: false, name: null });
    send(ws, { t: 'class_info', code: cls.code, exists: true, name: cls.name, linkPath: classLinkPath(cls.code) });
  }

  /** 학생: 반 코드로 입장 → 그 반의 게임 선택 포털로 */
  function enterClassFor(ws, msg) {
    const cls = getClass(msg.code);
    if (!cls) return sendError(ws, '그 반 코드를 찾을 수 없습니다. 선생님께 링크를 다시 받아 주세요.', 'no_class');
    ws.meta.classCode = cls.code;
    send(ws, { t: 'class_entered', class: classInfo(cls) });
    send(ws, { t: 'rooms', classCode: cls.code, rooms: roomsOverview(null, cls.code) });
    send(ws, { t: 'class_stats', classCode: cls.code, stats: classScoreList(cls.code) });
  }

  /** 선생님 확인: 반 코드 + PIN (또는 이전에 받은 교사 토큰) → 교사 기능 사용 가능 */
  function authClassFor(ws, msg) {
    const cls = getClass(msg.code);
    if (!cls) return sendError(ws, '그 반 코드를 찾을 수 없습니다.', 'no_class');
    if (ws.meta.failedPin >= 6) {
      return sendError(ws, '비밀번호를 여러 번 틀렸습니다. 잠시 후 다시 시도해 주세요.', 'too_many_tries');
    }
    let ok = false;
    if (msg.token && isTeacherToken(cls, msg.token)) ok = true;
    const pin = sanitizePin(msg.pin);
    if (!ok && pin) {
      ok = safeEqualHex(hashPin(pin, cls.pinSalt), cls.pinHash);
      if (!ok) ws.meta.failedPin = (ws.meta.failedPin || 0) + 1;
    }
    if (!ok) return sendError(ws, '교사 비밀번호가 맞지 않습니다.', 'bad_pin');

    ws.meta.failedPin = 0;
    ws.meta.teacher = true;
    ws.meta.classCode = cls.code;
    const token = newTeacherToken(cls);
    ws.meta.teacherToken = token;
    send(ws, { t: 'class_auth_ok', class: classInfo(cls), teacherToken: token });
    send(ws, { t: 'rooms', classCode: cls.code, rooms: roomsOverview(null, cls.code) });
    send(ws, { t: 'class_stats', classCode: cls.code, stats: classScoreList(cls.code) });
  }

  /** 방장이 '게임 종료'를 눌렀을 때 → 대기실로 돌아갑니다. */
  function endGame(ws, room, seat) {
    if (!seat) return sendError(ws, '관전자는 게임을 종료할 수 없습니다.', 'spectator');
    if (seat.id !== room.hostId) return sendError(ws, '방장만 게임을 종료할 수 있습니다.', 'not_host');
    if (!room.game) return sendError(ws, '진행 중인 게임이 없습니다.', 'no_game');
    if (room.game.status === 'playing') room.game.finishGame('closed_by_host');
    resetToWaiting(room, { keepBots: true });
    if (!rooms.has(room.key)) {
      broadcastOverview();
      return send(ws, { t: 'left' });
    }
    room.lastEvent = '방장이 게임을 종료했습니다. 대기실로 돌아왔습니다.';
    broadcastRoom(room);
    broadcastOverview();
    send(ws, { t: 'action_result', ok: true, message: '게임을 종료하고 대기실로 돌아왔습니다.' });
  }

  /** 교사 관전 화면에서 막힌 방을 초기화합니다. (참가자는 내보내고 대기 상태로) */
  function resetRoomByTeacher(ws, msg) {
    const gameModule = games.get(msg.gameId || 'halligalli');
    if (!gameModule) return sendError(ws, '플레이할 수 없는 게임입니다.', 'bad_game');
    if (ws.meta.seat) return sendError(ws, '참가 중인 학생은 방을 초기화할 수 없습니다.', 'not_teacher');
    const classCode = resolveClassFor(ws, msg.classCode);
    if (!classCode) return sendError(ws, '반 코드를 확인해 주세요.', 'no_class');
    if (!canTeach(ws, classCode)) {
      return sendError(ws, '교사 비밀번호(PIN)로 인증한 뒤에 방을 초기화할 수 있습니다.', 'teacher_auth_required');
    }
    const room = getRoom(gameModule.id, msg.code, classCode);
    if (!room) return sendError(ws, '방을 찾을 수 없습니다.', 'no_room');

    const removedSeats = room.seats.slice();
    resetToWaiting(room, { dropHumans: true });
    for (const seat of removedSeats) {
      if (seat.ws && seat.ws !== ws) {
        send(seat.ws, {
          t: 'room_reset',
          gameId: room.gameId,
          code: room.code,
          name: room.name,
          message: '선생님이 ' + room.name + ' 방을 초기화했습니다.'
        });
        seat.ws.meta.room = null;
        seat.ws.meta.seat = null;
        seat.ws.meta.role = 'lobby';
      }
    }
    if (rooms.has(room.key)) {
      room.lastEvent = '선생님이 방을 초기화했습니다.';
      broadcastRoom(room);
    }
    broadcastOverview();
    send(ws, { t: 'room_reset', self: true, gameId: room.gameId, code: room.code, name: room.name, message: room.name + ' 방을 초기화했습니다.' });
  }

  /* ---------------- 메시지 처리 ---------------- */

  function handleMessage(ws, msg) {
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'hello': {
        send(ws, { t: 'welcome', games: games.list(), rooms: roomsOverview(), serverTime: Date.now() });
        return;
      }
      case 'classCreate':
        return createClassFor(ws, msg);
      case 'classStats': {
        const code = resolveClassFor(ws, msg.code) || DEFAULT_CLASS_CODE;
        send(ws, { t: 'class_stats', classCode: code, stats: classScoreList(code), serverTime: Date.now() });
        return;
      }
      case 'classInfo':
        return classInfoFor(ws, msg);
      case 'classEnter':
        return enterClassFor(ws, msg);
      case 'classAuth':
        return authClassFor(ws, msg);
      case 'overview': {
        overviewSubs.add(ws);
        if (!ws.meta.room) ws.meta.role = 'teacher';
        const code = resolveClassFor(ws, msg.classCode) || DEFAULT_CLASS_CODE;
        const list = roomsOverview(msg.gameId || null, code);
        send(ws, { t: 'rooms', gameId: msg.gameId || null, classCode: code, rooms: list });
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
      case 'endGame': {
        const room = ws.meta.room;
        if (!room) return sendError(ws, '방에 입장해야 합니다.', 'no_room');
        return endGame(ws, room, ws.meta.seat);
      }
      case 'resetRoom':
        return resetRoomByTeacher(ws, msg);
      case 'spectate': {
        const gameModule = games.get(msg.gameId);
        if (!gameModule) return sendError(ws, '플레이할 수 없는 게임입니다.', 'bad_game');
        const classCode = resolveClassFor(ws, msg.classCode);
        if (!classCode) return sendError(ws, '반 코드를 확인해 주세요.', 'no_class');
        if (!canTeach(ws, classCode)) {
          return sendError(ws, '교사 비밀번호(PIN)로 인증한 뒤에 관전할 수 있습니다.', 'teacher_auth_required');
        }
        const room = getRoom(gameModule.id, msg.code, classCode);
        if (!room) return sendError(ws, '방을 찾을 수 없습니다.', 'no_room');
        if (ws.meta.room && ws.meta.room !== room) leaveRoom(ws);
        room.spectators.add(ws);
        ws.meta.room = room;
        ws.meta.seat = null;
        ws.meta.role = 'spectator';
        send(ws, { t: 'spectating', gameId: room.gameId, classCode: room.classCode, code: room.code, name: room.name });
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
          number: null,
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
          sendClassResult(room, recordGameResult(room));
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
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, classes: classes.size, uptime: Math.round(process.uptime()) }));
      return;
    }
    // 우리 반 코드가 살아 있는지 한눈에 확인할 때 쓰는 읽기 전용 API (PIN 정보는 내보내지 않음)
    const classMatch = /^\/api\/classes\/([A-Za-z0-9]{4,8})$/.exec(pathname);
    if (classMatch) {
      const cls = getClass(classMatch[1]);
      res.writeHead(cls ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(cls
        ? { ok: true, class: { code: cls.code, name: cls.name, linkPath: classLinkPath(cls.code) } }
        : { ok: false, error: 'no_class' }));
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
    ws.meta = {
      role: 'lobby',
      room: null,
      seat: null,
      classCode: null,
      teacher: false,
      teacherToken: null,
      failedPin: 0,
      id: 'c' + nextId()
    };
    ws.isAlive = true;
    connections.add(ws);
    send(ws, {
      t: 'welcome',
      games: games.list(),
      rooms: roomsOverview(null, DEFAULT_CLASS_CODE),
      classCode: DEFAULT_CLASS_CODE,
      serverTime: Date.now()
    });

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
    classes: classes,
    settings: settings,
    start: start,
    close: close,
    roomsOverview: roomsOverview,
    getRoom: getRoom,
    getClass: getClass,
    isTeacherToken: isTeacherToken,
    classScores: classScoreList
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
    console.log('  🔔  보드게임천국 서버가 시작되었습니다.');
    console.log('');
    console.log('  내 컴퓨터 :  http://localhost:' + port);
    for (const url of info.urls) {
      console.log('  같은 와이파이(모둠원) :  ' + url);
    }
    console.log('');
    console.log('  첫 화면   :  ' + (info.urls[0] || 'http://localhost:' + port) + '  → [👩‍🏫 우리 반 만들기]');
    console.log('  교사 관전 :  사이트 첫 화면 또는 우리 반 링크 → [👩‍🏫 선생님 모드] (교사 PIN 필요)');
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
