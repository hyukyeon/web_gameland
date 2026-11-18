import { Server } from 'socket.io';
import { prisma } from './db.js';
import { verifyToken, publicUser, displayName, avatarUrl, BOT_PREFIX } from './auth.js';
import { bus } from './events.js';
import { isEmoteFor } from './emotes.js';
import { settleGame, settleSeotda, settleOmok, settleYut, settleVegas, settleYacht, settleJanggi, recordSeotdaPractice, outcomesOf, recordPractice } from './settle.js';
import { SeotdaGame } from './seotda/SeotdaGame.js';
import { OmokGame } from './omok/OmokGame.js';
import { YutGame } from './yut/YutGame.js';
import { YutBot } from './yut/YutBot.js';
import { VegasGame } from './vegas/VegasGame.js';
import { VegasBot } from './vegas/VegasBot.js';
import { YachtGame } from './yacht/YachtGame.js';
import { YachtBot } from './yacht/YachtBot.js';
import { JanggiGame } from './janggi/JanggiGame.js';
import { JanggiBot } from './janggi/JanggiBot.js';
import { FORMATIONS as JANGGI_FORMATIONS } from './janggi/rules.js';
import { pickMove, analyze as analyzeMoves, closePool } from './omok/aiPool.js';
import * as metrics from './omok/metrics.js';
import { achievementById, titleText, recordOmokPractice } from './stats.js';
import { GostopGame } from './game/GostopGame.js';
import {
  parseLevel, pickPersona, personaByKey, botDisplayName, botAvatar, botLine,
  makeGostopBrain, makeSeotdaBrain, makeOmokBrain, proxyGostopBrain, proxySeotdaBrain, proxyOmokBrain, gostopReactions, seotdaReactions,
} from './bots.js';
import { BET_OPTIONS, BOT_DELAY_SCALE, RECONNECT_GRACE_MS, SEOTDA_TURN_MS, SEOTDA_REMATCH_MS, GOSTOP_TURN_MS, AUTO_AFTER_TIMEOUTS, SEOTDA_VOTE_MS, OMOK_TURN_MS, OMOK_TURN_CHOICES, OMOK_UNDO_LIMIT, OMOK_PRACTICE_UNDOS, OMOK_UNDO_ASK_MS, YUT_TURN_MS, VEGAS_TURN_MS, VEGAS_ROUND_MS, YACHT_TURN_MS, JANGGI_TURN_MS, JANGGI_SETUP_MS } from './config.js';

const MIN_MONEY_MULT = 10; // 입장하려면 판돈 × 10 이상 보유
const MAX_PLAYERS = 4;
const maxPlayersOf = (type) => (type === 'omok' || type === 'janggi' ? 2 : type === 'vegas' ? 5 : MAX_PLAYERS);
const ROOM_GAMES = ['seotda', 'omok', 'yut', 'vegas', 'yacht', 'janggi'];
const gameType = (g) => (ROOM_GAMES.includes(g) ? g : 'gostop');
const MAX_SPECTATORS = 8;
const GIRI_MS = 1800; // 판 시작 기리 연출 시간 (클라이언트와 맞춘다)
const OMOK_HINTS = 3; // 연습 판당 힌트 횟수
const OPTION_KEYS = ['bonus', 'ppeokPay', 'chongtong', 'ttibak', 'nagariCarry'];

/**
 * 실전(랭크) 여부: 사람이 2명 이상이면 머니/전적이 정상 반영된다. (유저2+AI1 = 실전)
 * AI 와 단둘이 하는 1:1 연습은 물론, 사람 1명 + AI 여럿도 연습으로 본다 — 무한 자본의 AI 에게서 머니를 캘 수 없게.
 */
const SEOTDA_BOT_STACK = 10_000_000; // AI 봇의 가상 잔액 (사실상 무한)
export const isRankedRoom = (room) => room.players.filter((p) => !p.bot).length >= 2;

const parseTurnSec = (v) => (OMOK_TURN_CHOICES.includes(Number(v)) ? Number(v) : OMOK_TURN_MS / 1000);
const parseOpts = (o) => Object.fromEntries(OPTION_KEYS.map((k) => [k, o?.[k] === true]));

export function attachSockets(httpServer, corsOrigin) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin } });
  httpServer.on('close', closePool); // AI 계산 스레드 정리

  const online = new Map(); // userId -> socket
  const rooms = new Map(); // roomId -> room
  const userRoom = new Map(); // userId -> roomId
  const lobbyChat = [];
  const analyzing = new Set(); // 복기 분석 중인 유저
  let roomSeq = 1;

  const clean = (t, max = 200) => (typeof t === 'string' ? t.trim().slice(0, max) : '');
  const ack = (cb, payload) => typeof cb === 'function' && cb(payload);
  const isCardId = (v) => Number.isInteger(v) && v >= 0 && v <= 50; // 0~47 + 보너스 48~50

  // ---------- 브로드캐스트 ----------
  const roomSummary = (r) => ({
    id: r.id,
    game: r.type,
    name: r.name,
    bet: r.bet,
    status: r.status,
    count: r.players.length,
    spectators: r.spectators.length,
    max: maxPlayersOf(r.type),
    opts: r.opts,
    ...(r.type === 'omok' ? { turnSec: r.turnSec } : {}),
    players: r.players.map((p) => p.username),
  });
  const broadcastRooms = () => io.to('lobby').emit('lobby:rooms', [...rooms.values()].map(roomSummary));
  const roomState = (r) => ({
    id: r.id,
    game: r.type,
    name: r.name,
    bet: r.bet,
    status: r.status,
    hostId: r.hostId,
    max: maxPlayersOf(r.type),
    opts: r.opts,
    ...(r.type === 'omok' ? { turnSec: r.turnSec } : {}),
    ranked: isRankedRoom(r),
    spectators: r.spectators.map((p) => ({ id: p.id, username: p.username, avatar: p.avatar ?? null, title: p.title ?? null, online: p.online })),
    players: r.players.map((p) => ({ id: p.id, username: p.username, avatar: p.avatar ?? null, title: p.title ?? null, ready: p.ready, online: p.online, offlineAt: p.offlineAt ?? null, bot: !!p.bot, auto: !!p.auto, ...(p.bot ? { level: p.level, style: p.style, ...(p.adaptive ? { adaptive: true, skill: p.skill } : {}) } : {}) })),
  });
  const emitRoom = (r) => io.to(`room:${r.id}`).emit('room:state', roomState(r));

  /** 사람은 준비 해제, AI 봇은 항상 준비 상태 */
  const resetReady = (room) => room.players.forEach((p) => (p.ready = !!p.bot));

  const playerOf = (room, pid) => room.players.find((p) => p.id === pid);
  /** AI 가 대신 둘 사람: 봇, 연결이 끊긴 사람, 자동 진행 중인 사람(직접 켰거나 시간 초과 반복) */
  const isProxied = (room, pid) => {
    const p = playerOf(room, pid);
    return !p || p.bot || !p.online || !!p.auto;
  };
  const sysChat = (room, text) => io.to(`room:${room.id}`).emit('room:chat', { system: true, text, ts: Date.now() });

  /** 이 자리의 두뇌. 봇은 난이도·성향대로, 자리를 비운 사람은 가장 강한 두뇌로 대신 둔다. 한 판 동안 유지(카운팅 기억). */
  function brainFor(room, pid, game) {
    room.brains ??= new Map();
    const key = `${game}:${pid}`;
    if (!room.brains.has(key)) {
      const p = playerOf(room, pid);
      const cfg = { level: p?.level, style: p?.style, strength: p?.skill ?? null };
      const make = { seotda: makeSeotdaBrain, omok: makeOmokBrain, gostop: makeGostopBrain };
      const proxy = { seotda: proxySeotdaBrain, omok: proxyOmokBrain, gostop: proxyGostopBrain };
      room.brains.set(key, p?.bot ? make[game](pid, cfg) : proxy[game](pid));
    }
    return room.brains.get(key);
  }

  /** 봇 계정 하나를 이 방의 개성 있는 플레이어로 만든다 (방에서 안 쓰는 개성 중 무작위) */
  function botPlayer(room, u, level) {
    const persona = pickPersona(room.players.filter((p) => p.bot).map((p) => p.persona));
    return { id: u.id, username: botDisplayName(persona), avatar: botAvatar(persona), ready: true, online: true, bot: true, level: parseLevel(level), persona: persona.key, style: persona.style };
  }

  // ---------- 봇 말풍선 (상황별 반응) ----------
  const BOT_TALK_COOLDOWN_MS = 6000;
  /** 봇이 상황에 맞는 대사를 말풍선으로 (개성별 수다 정도 · 봇마다 쿨다운) */
  function botSay(room, pid, situation, delayMs = 0, { force = false } = {}) {
    const p = playerOf(room, pid);
    if (!p?.bot) return;
    const persona = personaByKey(p.persona);
    room.botTalk ??= new Map();
    const now = Date.now();
    if (now + delayMs - (room.botTalk.get(pid) ?? 0) < BOT_TALK_COOLDOWN_MS * BOT_DELAY_SCALE) return;
    const big = ['win', 'lose', 'draw'].includes(situation);
    if (!force && Math.random() > persona.chatty * (big ? 1 : 0.55)) return;
    const text = botLine(persona, situation);
    if (!text) return;
    room.botTalk.set(pid, now + delayMs);
    const t = setTimeout(() => {
      if (rooms.get(room.id) !== room || !playerOf(room, pid)) return;
      io.to(`room:${room.id}`).emit('BROADCAST_EMOTE', { userId: pid, name: p.username, text, ts: Date.now(), bot: true });
    }, delayMs);
    t.unref?.();
  }
  const botIdsOf = (room) => room.players.filter((p) => p.bot).map((p) => p.id);

  /** 시간 초과 기록: 연속 AUTO_AFTER_TIMEOUTS 번이면 자동 진행으로 전환 */
  function noteTimeout(room, pid) {
    const p = playerOf(room, pid);
    if (!p || p.bot) return;
    p.timeouts = (p.timeouts ?? 0) + 1;
    if (p.timeouts >= AUTO_AFTER_TIMEOUTS && !p.auto) {
      p.auto = true;
      sysChat(room, `🤖 ${p.username}님이 연속으로 시간을 초과해 AI 자동 진행으로 전환합니다.`);
      emitRoom(room);
    } else {
      sysChat(room, `⏰ ${p.username}님 시간 초과 — AI가 대신 진행합니다.`);
    }
  }

  /** 판이 끝난 뒤: 자동 진행 해제, 유예 시간이 지난(끊긴 채인) 사람 퇴장 */
  function afterGame(room) {
    let changed = false;
    for (const p of room.players) {
      if (p.bot) continue;
      changed ||= !!p.auto;
      p.auto = false;
      p.timeouts = 0;
    }
    if (changed) emitRoom(room);
    for (const p of room.players.filter((x) => x.leaveAfterGame && !x.online)) leaveRoom(p.id, { forfeit: false });
  }

  /** 지금 이 사람 차례라면 차례 처리를 다시 건다 (끊김/복귀/자동 진행 전환 시) */
  function resumeTurn(room, pid) {
    const g = room.game;
    if (!g || g.turn !== pid) return;
    if (room.type === 'seotda') {
      if (g.phase === 'betting') startSeotdaTurn(room);
    } else if (room.type === 'omok') {
      if (g.phase === 'playing') startOmokTurn(room);
    } else if (room.type === 'yut') {
      if (g.phase !== 'ended') startYutTurn(room);
    } else if (room.type === 'vegas') {
      if (g.phase === 'roll' || g.phase === 'place') startVegasTurn(room);
    } else if (room.type === 'yacht') {
      if (g.phase !== 'ended') startYachtTurn(room);
    } else if (room.type === 'janggi') {
      if (g.phase === 'playing') startJanggiTurn(room);
    } else scheduleTurn(room, null);
  }

  /** 새로 달성한 업적 알림 */
  function announceUnlocked(room, unlocked) {
    for (const p of room.players) {
      const ids = unlocked?.[p.id];
      if (!ids?.length) continue;
      bus.emit('profile', p.id); // 대표 칭호 갱신을 방 상태에 반영
      online.get(p.id)?.emit('achievement:unlocked', { achievements: ids.map((id) => achievementById(id)).map(({ id, emoji, name, desc }) => ({ id, emoji, name, desc })) });
    }
  }

  const newRoom = (host, name, bet, opts, type = 'gostop') => ({
    id: roomSeq++,
    type, // 'gostop' | 'seotda' | 'omok' | 'yut' | 'vegas' | 'yacht' | 'janggi'
    name,
    bet,
    hostId: host.id,
    status: 'waiting',
    players: [{ id: host.id, username: displayName(host), avatar: avatarUrl(host), title: titleText(host), ready: false, online: true }],
    spectators: [], // 관전자: 턴/정산 대상(players, pids)에 절대 들어가지 않는다
    opts: Object.fromEntries(Object.entries(opts ?? {}).filter(([k]) => k !== 'turnSec')),
    game: null,
    chat: [],
    timers: new Map(),
    first: null,
    turnSec: type === 'omok' ? parseTurnSec(opts?.turnSec) : undefined, // 오목: 수당 제한 시간(초)
    lastRest: null,
    carry: 1,
  });

  const pushUser = async (uid) => {
    const s = online.get(uid);
    if (!s) return;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (u) s.emit('me:update', publicUser(u));
  };

  function emitFrames(room, frames, event = 'game:frames') {
    const pids = room.game.pids;
    for (const p of room.players) {
      const s = online.get(p.id);
      if (s) s.emit(event, { frames: frames.map((f) => GostopGame.viewOf(f, p.id, pids)) });
    }
    for (const sp of room.spectators) {
      const s = online.get(sp.id);
      if (s) s.emit(event, { frames: frames.map((f) => GostopGame.viewOf(f, sp.id, pids)) });
    }
  }

  // ---------- 게임 진행 ----------
  async function handleGameResult(room, game, frames) {
    emitFrames(room, frames);
    // 봇 반응: 해당 장면이 화면에 재생될 즈음 말풍선
    for (const r of gostopReactions(frames, botIdsOf(room))) botSay(room, r.pid, r.situation, replayMs(frames.slice(0, r.frameIndex + 1)) * BOT_DELAY_SCALE);
    if (game.phase !== 'ended') return scheduleTurn(room, frames);
    const res = game.result;
    const pids = game.pids;
    room.status = 'waiting';
    room.game = null;
    resetReady(room);
    // 봇/차례 타이머만 정리 (끊긴 유저의 재접속 유예 타이머는 유지해야 한다)
    for (const k of ['bot', 'turn']) {
      clearTimeout(room.timers.get(k));
      room.timers.delete(k);
    }
    // 다음 판: 이긴 사람이 선, 나가리면 선 유지 + 이월, 4인은 쉬던 사람 교대
    if (res.winner != null && room.players.some((p) => p.id === res.winner)) room.first = res.winner;
    room.lastRest = game.rest ?? room.lastRest;
    room.carry = res.nagari && room.opts.nagariCarry ? 2 : 1;

    const ranked = isRankedRoom(room);
    let payout = null;
    let unlocked = {};
    try {
      payout = await settleGame({ roomName: room.name, betPerPt: room.bet, pids, result: res, ranked });
      // 연습 판은 머니/전적 무변동 — botWins 와 업적만 별도로 반영
      unlocked = ranked ? payout?.unlocked ?? {} : await recordPractice({ pids, result: res, outcome: outcomesOf(res, pids) });
    } catch (e) {
      console.error('settle failed', e);
      io.to(`room:${room.id}`).emit('room:chat', { system: true, text: '정산 중 오류가 발생했습니다.', ts: Date.now() });
    }
    const overPayload = { result: res, payout, bet: room.bet, ranked };
    io.to(`room:${room.id}`).emit('game:over', overPayload);
    for (const bid of botIdsOf(room)) {
      if (!pids.includes(bid)) continue;
      botSay(room, bid, res.draw || res.winner == null ? 'draw' : res.winner === bid ? 'win' : 'lose', (replayMs(frames) + 600) * BOT_DELAY_SCALE);
    }
    // 연결이 끊겨 있던 사람은 돌아왔을 때 결과를 볼 수 있게 보관
    for (const p of room.players) if (!p.bot && !p.online) p.missedOver = overPayload;
    for (const p of room.players) pushUser(p.id);
    announceUnlocked(room, unlocked);
    emitRoom(room);
    broadcastRooms();
    afterGame(room);
  }

  function clearTimers(room) {
    for (const t of room.timers.values()) clearTimeout(t);
    room.timers.clear();
  }

  /** 4인일 때 쉬는 사람: 직전에 쉬었던 사람 다음 자리부터, 연속으로 쉬지 않게 고른다 */
  function pickRest(room, first) {
    const ids = room.players.map((p) => p.id);
    if (ids.length < 4) return undefined;
    const start = ids.indexOf(room.lastRest) + 1; // lastRest 가 없으면 0부터
    for (let i = 0; i < ids.length; i++) {
      const c = ids[(start + i) % ids.length];
      if (c !== first && c !== room.lastRest) return c;
    }
    return undefined;
  }

  function startGame(room) {
    if (room.type === 'seotda') return startSeotda(room);
    if (room.type === 'omok') return startOmok(room);
    if (room.type === 'yut') return startYut(room);
    if (room.type === 'vegas') return startVegas(room);
    if (room.type === 'yacht') return startYacht(room);
    if (room.type === 'janggi') return startJanggi(room);
    room.status = 'playing';
    room.brains = new Map(); // 새 판: 봇의 카운팅 기억 초기화
    const ids = room.players.map((p) => p.id);
    let flips = null;
    if (!ids.includes(room.first)) {
      const d = GostopGame.decideFirst(ids);
      room.first = d.first;
      flips = d.flips;
    }
    const { bonus, ppeokPay, chongtong, ttibak } = room.opts;
    room.game = new GostopGame(ids, {
      firstPlayer: room.first,
      rest: pickRest(room, room.first),
      bonus,
      ppeokPay,
      chongtong,
      ttibak,
      carry: room.carry,
    });
    // 기리(패 떼기): 선의 바로 앞 사람이 섞인 패를 뗀다 (연출용 — 서버 셔플 결과는 그대로)
    const act = room.game.active;
    const f0 = act.includes(room.first) ? room.first : act[0];
    const cutter = act[(act.indexOf(f0) - 1 + act.length) % act.length] ?? null;
    for (const p of room.players) {
      online.get(p.id)?.emit('game:start', { view: room.game.view(p.id), first: room.first, flips, cutter, ranked: isRankedRoom(room) });
    }
    for (const sp of room.spectators) {
      online.get(sp.id)?.emit('game:start', { view: room.game.view(sp.id), first: room.first, flips, cutter, ranked: isRankedRoom(room), spectator: true });
    }
    emitRoom(room);
    broadcastRooms();
    scheduleTurn(room, null, (flips ? 3500 : 1500) + GIRI_MS);
  }

  // ---------- AI 봇 ----------
  const BOT_PHASES = ['chong', 'gwang', 'play', 'choose', 'gostop', 'shodang'];
  const replayMs = (frames) => (frames ?? []).reduce((sum, f) => sum + (f.banner ? 1100 : 650), 0);

  /** 비어 있는 봇 더미 계정을 하나 잡아 이 방에 예약한다 (동시 요청에도 같은 봇이 겹치지 않게 userRoom 에 바로 기록) */
  async function acquireBot(roomId) {
    for (let i = 1; i <= 30; i++) {
      const name = `${BOT_PREFIX}${i}`;
      try {
        let u = await prisma.user.findUnique({ where: { username: name } });
        if (u && !u.isBot) continue;
        if (!u) u = await prisma.user.create({ data: { username: name, passwordHash: '!', money: 0, isBot: true } });
        if (userRoom.has(u.id)) continue;
        userRoom.set(u.id, roomId);
        return u;
      } catch {
        // 동시에 같은 이름을 만든 경우 다음 번호로
      }
    }
    return null;
  }

  function dropBots(room) {
    for (const p of room.players) if (p.bot) userRoom.delete(p.id);
  }

  function applyBotAction(game, id, a) {
    switch (a.type) {
      case 'play': return game.play(id, a.cardId, { shake: a.shake === true });
      case 'choose': return game.choose(id, a.cardId);
      case 'go': return game.callGo(id);
      case 'stop': return game.callStop(id);
      case 'sellGwang': return game.sellGwang(id);
      case 'passGwang': return game.passGwang(id);
      case 'chongtong': return game.callChongtong(id);
      case 'passChongtong': return game.passChongtong(id);
      case 'shodang': return game.callShodang(id);
      case 'shodangAnswer': return game.answerShodang(id, a.accept === true);
      default: return { ok: false };
    }
  }

  /** AI 판단이 거부되더라도 게임이 멈추지 않도록 가장 안전한 행동으로 대체 */
  function botFallback(game, id, view) {
    switch (view.phase) {
      case 'play': {
        const r = view.hand.length ? game.play(id, view.hand[0]) : { ok: false };
        return r.ok ? r : game.play(id, null);
      }
      case 'choose': return game.choose(id, view.choice.options[0]);
      case 'gostop': return game.callStop(id);
      case 'gwang': return game.passGwang(id);
      case 'chong': return game.passChongtong(id);
      case 'shodang': return game.answerShodang(id, true);
      default: return { ok: false };
    }
  }

  /**
   * 고스톱 차례 진행.
   *  - AI 가 둘 차례(봇·연결 끊김·자동 진행)면 클라이언트가 직전 프레임을 재생할 시간을 기다린 뒤 대신 둔다.
   *  - 사람 차례면 제한 시간(GOSTOP_TURN_MS)을 걸고, 넘기면 AI 가 한 수 대신 둔다. 연속으로 넘기면 자동 진행 전환.
   */
  function scheduleTurn(room, frames, extraMs = 0) {
    const game = room.game;
    for (const k of ['bot', 'turn']) {
      clearTimeout(room.timers.get(k));
      room.timers.delete(k);
    }
    if (!game || !BOT_PHASES.includes(game.phase)) return;
    const pid = game.turn;
    const replay = replayMs(frames) + extraMs;
    if (isProxied(room, pid)) {
      io.to(`room:${room.id}`).emit('TURN_START', { game: 'gostop', userId: pid, deadlineAt: null, auto: true });
      room.timers.set('bot', setTimeout(() => runBot(room, game, pid), (replay + 700) * BOT_DELAY_SCALE));
      return;
    }
    const deadlineAt = Date.now() + replay + GOSTOP_TURN_MS;
    io.to(`room:${room.id}`).emit('TURN_START', { game: 'gostop', userId: pid, deadlineAt, auto: false });
    const t = setTimeout(() => {
      room.timers.delete('turn');
      if (room.game !== game || game.turn !== pid || !BOT_PHASES.includes(game.phase)) return;
      noteTimeout(room, pid);
      runBot(room, game, pid);
    }, replay + GOSTOP_TURN_MS);
    t.unref?.();
    room.timers.set('turn', t);
  }

  async function runBot(room, game, botId) {
    room.timers.delete('bot');
    if (room.game !== game || game.turn !== botId) return;
    const view = game.view(botId);
    // 한 판 동안 같은 두뇌를 유지해 카드 카운팅 기억을 이어간다
    const act = brainFor(room, botId, 'gostop').decide(view);
    let r = act ? applyBotAction(game, botId, act) : { ok: false };
    if (!r.ok) r = botFallback(game, botId, view);
    if (!r.ok) return console.error('bot action failed', view.phase, act, r.error);
    await handleGameResult(room, game, r.frames);
  }

  // ---------- 섯다 ----------
  const viewers = (room) => [...room.players, ...room.spectators];
  const emitSeotdaState = (room, event = null) => {
    for (const v of viewers(room)) online.get(v.id)?.emit('seotda:state', { view: room.game.view(v.id), event });
  };

  function clearSeotdaTimer(room) {
    for (const k of ['seotda', 'seotda-bot']) {
      clearTimeout(room.timers.get(k));
      room.timers.delete(k);
    }
  }

  /** AI 가 둘 차례(봇·끊김·자동 진행)면 잠깐 생각한 뒤 행동한다. 판단이 실패하면 체크/다이로 안전하게 넘긴다. */
  function scheduleSeotdaBot(room, game) {
    const pid = game.turn;
    if (!isProxied(room, pid)) return;
    const bot = { id: pid };
    const wait = (900 + Math.random() * 1100) * BOT_DELAY_SCALE;
    const t = setTimeout(() => {
      room.timers.delete('seotda-bot');
      if (room.game !== game || game.turn !== bot.id || game.phase !== 'betting') return;
      let r = { ok: false };
      try {
        r = game.act(bot.id, brainFor(room, bot.id, 'seotda').decide(game.view(bot.id)));
      } catch (e) {
        console.error('seotda bot error', e);
      }
      if (!r.ok) r = game.timeoutAction();
      if (r.ok) handleSeotdaEvents(room, game, r.events);
    }, wait);
    t.unref?.();
    room.timers.set('seotda-bot', t);
  }

  /** 현재 차례의 제한 시간 시작. 시간이 지나면 체크 가능할 땐 체크, 아니면 다이. */
  function startSeotdaTurn(room) {
    const game = room.game;
    clearSeotdaTimer(room);
    if (!game || game.phase !== 'betting') return;
    const who = game.turn;
    const auto = isProxied(room, who);
    const deadlineAt = auto ? null : Date.now() + SEOTDA_TURN_MS;
    io.to(`room:${room.id}`).emit('TURN_START', { game: 'seotda', userId: who, deadlineAt, auto, pot: game.pot, currentBet: game.currentBet, toCall: game.currentBet - game.bet[who] });
    if (auto) return scheduleSeotdaBot(room, game);
    const t = setTimeout(() => {
      if (room.game !== game || game.turn !== who || game.phase !== 'betting') return;
      noteTimeout(room, who);
      const r = game.timeoutAction();
      if (r.ok) handleSeotdaEvents(room, game, r.events);
    }, SEOTDA_TURN_MS);
    t.unref?.();
    room.timers.set('seotda', t);
    return undefined;
  }

  /** 판이 끝났을 때: 쇼다운 공개 → (재경기면 팟 이월 후 새 판 / 아니면 정산) */
  async function handleSeotdaEvents(room, game, events) {
    if (room.game !== game) return;
    const last = events.filter((e) => e.type === 'action').at(-1) ?? null;
    emitSeotdaState(room, last);
    for (const r of seotdaReactions(events, botIdsOf(room))) botSay(room, r.pid, r.situation, 500 * BOT_DELAY_SCALE);
    if (game.phase === 'betting') return startSeotdaTurn(room);
    clearSeotdaTimer(room);
    const res = game.result;
    io.to(`room:${room.id}`).emit('SHOW_DOWN', { result: res, pot: res.pot, winners: res.winners, rematch: res.rematch, round: res.round });
    if (res.rematch) {
      const args = game.rematchArgs();
      const t = setTimeout(() => room.game === game && startSeotda(room, args), SEOTDA_REMATCH_MS);
      t.unref?.();
      room.timers.set('seotda-next', t);
      return undefined;
    }
    if (res.tie) return startTieVote(room, game);
    return finishSeotda(room, game);
  }

  /** 정산 (동점 투표가 거절됐을 때도 여기로) */
  async function finishSeotda(room, game) {
    if (room.game !== game) return;
    const res = game.result;
    const pids = Object.keys(res.net).map(Number); // 묻고 더블 이전 판에서 진 사람도 포함
    room.status = 'waiting';
    room.game = null;
    room.tieVote = null;
    resetReady(room);
    if (res.winners.length && room.players.some((p) => p.id === res.winners[0])) room.first = res.winners[0]; // 이긴 사람이 다음 판 선
    const ranked = isRankedRoom(room);
    const info = game.statsInfo();
    let payout = null;
    let unlocked = {};
    try {
      if (ranked) {
        payout = await settleSeotda({ roomName: room.name, ante: room.bet, pids, result: res, ranked, info });
        unlocked = payout?.unlocked ?? {};
      } else unlocked = await recordSeotdaPractice({ pids, result: res, info });
    } catch (e) {
      console.error('seotda settle failed', e);
      sysChat(room, '정산 중 오류가 발생했습니다.');
    }
    io.to(`room:${room.id}`).emit('seotda:over', { result: res, payout, ante: room.bet, ranked });
    // 결과 공개 연출(순차 뒤집기)이 끝날 즈음
    for (const bid of botIdsOf(room)) if (pids.includes(bid)) botSay(room, bid, res.winners.includes(bid) ? 'win' : 'lose', 2500 * BOT_DELAY_SCALE);
    for (const p of room.players) pushUser(p.id);
    announceUnlocked(room, unlocked);
    emitRoom(room);
    broadcastRooms();
    afterGame(room);
  }

  // ----- 섯다 동점: 묻고 더블 투표 -----
  const tieVotePayload = (v) => (v ? { pids: v.pids, votes: v.votes, deadlineAt: v.deadlineAt, ante: v.ante } : null);
  const emitTieVote = (room) => io.to(`room:${room.id}`).emit('seotda:tieVote', tieVotePayload(room.tieVote));

  /** 동점자 전원이 동의해야 동점자끼리 판돈 2배로 다시 붙는다. 봇은 60% 확률로 동의, 본인 의사를 물을 수 없는 사람(끊김·자동)은 거절. */
  function startTieVote(room, game) {
    const vote = { game, pids: game.result.tie, votes: {}, deadlineAt: Date.now() + SEOTDA_VOTE_MS, ante: game.ante * 2 };
    room.tieVote = vote;
    for (const pid of vote.pids) {
      const p = playerOf(room, pid);
      if (p?.bot) vote.votes[pid] = Math.random() < 0.6;
      else if (!p || !p.online || p.auto) vote.votes[pid] = false;
    }
    const t = setTimeout(() => resolveTieVote(room, vote, false), SEOTDA_VOTE_MS);
    t.unref?.();
    room.timers.set('seotda-vote', t);
    emitTieVote(room);
    return checkTieVote(room, vote);
  }

  function checkTieVote(room, vote) {
    const vals = vote.pids.map((p) => vote.votes[p]);
    if (vals.some((v) => v === false)) return resolveTieVote(room, vote, false);
    if (vals.every((v) => v === true)) return resolveTieVote(room, vote, true);
    return undefined;
  }

  function resolveTieVote(room, vote, agreed) {
    if (room.tieVote !== vote) return undefined;
    clearTimeout(room.timers.get('seotda-vote'));
    room.timers.delete('seotda-vote');
    room.tieVote = null;
    io.to(`room:${room.id}`).emit('seotda:tieVote', null);
    io.to(`room:${room.id}`).emit('seotda:tieResult', { agreed, pids: vote.pids, votes: vote.votes, ante: vote.ante });
    if (!agreed) {
      sysChat(room, '동점 — 팟을 나눠 가집니다.');
      return finishSeotda(room, vote.game);
    }
    sysChat(room, `💰 묻고 더블! 동점자끼리 판돈 ${vote.ante.toLocaleString('ko-KR')}원으로 다시 붙습니다.`);
    const args = vote.game.doubleArgs();
    const t = setTimeout(() => room.game === vote.game && startSeotda(room, args), SEOTDA_REMATCH_MS);
    t.unref?.();
    room.timers.set('seotda-next', t);
    return undefined;
  }

  async function startSeotda(room, rematch = null) {
    try {
      room.status = 'playing';
      // 재경기는 이전 판 참가자 그대로 (재경기 대기 중 나간 사람의 낸 돈도 팟/정산에 남아야 하므로)
      const ids = rematch?.pids ?? room.players.map((p) => p.id);
      if (!rematch) {
        const users = await prisma.user.findMany({ where: { id: { in: ids } } });
        // AI 봇은 자본금이 무한(큰 가상 잔액), 연습 판은 머니가 적어도 할 수 있게 최소 칩을 보장
        const ranked = isRankedRoom(room);
        room.seotdaBalances = Object.fromEntries(users.map((u) => [u.id, u.isBot ? SEOTDA_BOT_STACK : ranked ? u.money : Math.max(u.money, room.bet * 50)]));
        room.brains = new Map();
      }
      const dealer = ids.includes(room.first) ? room.first : ids[0];
      const { pids: _drop, kind: _kind, ...rest } = rematch ?? {};
      room.game = new SeotdaGame(ids, { ante: room.bet, balances: room.seotdaBalances, dealer, ...rest });
      const game = room.game;
      for (const v of viewers(room)) online.get(v.id)?.emit('seotda:start', { view: game.view(v.id), round: game.round, rematch: !!rematch, kind: rematch?.kind ?? null, double: game.double, ranked: isRankedRoom(room) });
      emitRoom(room);
      broadcastRooms();
      // 방에 없는 사람은 시작과 동시에 다이 처리
      const events = [];
      for (const id of ids) if (!room.players.some((p) => p.id === id)) events.push(...(game.forfeit(id).events ?? []));
      // 전원 올인(참가비만으로)이면 생성과 동시에 쇼다운이 끝나 있다
      if (events.length || game.phase === 'ended') await handleSeotdaEvents(room, game, events);
      else startSeotdaTurn(room);
    } catch (e) {
      console.error('startSeotda failed', e);
      room.status = 'waiting';
      room.game = null;
      resetReady(room);
      emitRoom(room);
    }
  }

  // ---------- 오목 ----------
  function clearOmokTimer(room) {
    for (const k of ['omok', 'omok-bot']) {
      clearTimeout(room.timers.get(k));
      room.timers.delete(k);
    }
  }

  const omokPlay = (room, game, who, x, y) => {
    const r = game.place(who, x, y);
    if (r.ok) handleOmokMove(room, game, r.move);
    return r;
  };

  const omokCfg = (room, pid) => {
    const p = playerOf(room, pid);
    return p?.bot ? { level: p.level, style: p.style, strength: p.skill ?? null } : { level: 'hard' };
  };
  const omokTurnMs = (room) => (room.turnSec ?? OMOK_TURN_MS / 1000) * 1000;

  /** AI 가 둘 차례(봇·끊김·자동 진행)면 계산 스레드에서 한 수를 구해 둔다. 판단이 불법수면 합법인 아무 칸으로 넘긴다. */
  async function aiMove(room, game, who) {
    if (room.aiBusy) return;
    room.aiBusy = true;
    let r = { ok: false };
    try {
      const t0 = performance.now();
      const [x, y] = await pickMove(game.moves.map((m) => [m.x, m.y]), omokCfg(room, who));
      metrics.noteAi(performance.now() - t0);
      if (rooms.get(room.id) !== room || room.game !== game || game.turn !== who || game.phase !== 'playing') return; // 계산하는 동안 상황이 바뀜 (착수/무르기/종료/방 폐쇄)
      r = omokPlay(room, game, who, x, y);
    } catch (e) {
      console.error('omok bot error', e);
    } finally {
      room.aiBusy = false;
    }
    if (rooms.get(room.id) !== room || room.game !== game || game.turn !== who || game.phase !== 'playing') return;
    if (!r.ok) {
      for (let y = 0; y < game.board.length && !r.ok; y++)
        for (let x = 0; x < game.board.length && !r.ok; x++) if (game.board[y][x] === 0) r = omokPlay(room, game, who, x, y);
    }
    if (!r.ok) game.forfeit(who) && handleOmokMove(room, game, null);
  }

  function startOmokTurn(room) {
    const game = room.game;
    clearOmokTimer(room);
    if (!game || game.phase !== 'playing' || rooms.get(room.id) !== room) return; // 닫힌 방에는 타이머를 걸지 않는다
    const who = game.turn;
    const auto = isProxied(room, who);
    const turnMs = omokTurnMs(room);
    const deadlineAt = auto ? null : Date.now() + turnMs;
    io.to(`room:${room.id}`).emit('TURN_START', { game: 'omok', userId: who, deadlineAt, auto });
    if (auto) {
      const t = setTimeout(() => {
        room.timers.delete('omok-bot');
        if (room.game === game && game.turn === who && game.phase === 'playing') aiMove(room, game, who);
      }, (500 + Math.random() * 700) * BOT_DELAY_SCALE);
      t.unref?.();
      room.timers.set('omok-bot', t);
      return;
    }
    metrics.noteTurn();
    const t = setTimeout(() => {
      if (room.game !== game || game.turn !== who || game.phase !== 'playing') return;
      noteTimeout(room, who);
      metrics.noteTimeout();
      aiMove(room, game, who);
    }, turnMs);
    t.unref?.();
    room.timers.set('omok', t);
  }

  /** 착수 후: 상태 방송 → (끝났으면 정산 / 아니면 다음 차례) */
  function handleOmokMove(room, game, move) {
    cancelUndoAsk(room, 'expired');
    for (const v of viewers(room)) online.get(v.id)?.emit('omok:state', { view: game.view(), move });
    if (game.phase === 'ended') {
      clearOmokTimer(room);
      return finishOmok(room, game);
    }
    return startOmokTurn(room);
  }

  async function finishOmok(room, game) {
    if (room.game !== game) return;
    const res = game.result;
    const pids = game.pids;
    room.status = 'waiting';
    room.game = null;
    room.brains = room.hintsUsed = room.undosUsed = room.lastRid = room.undoAsk = null; // 판이 끝나면 판 단위 상태를 비운다 (Q4)
    resetReady(room);
    if (res.winner != null) room.first = game.opponent(res.winner); // 진 사람이 다음 판 흑(선공)
    const ranked = isRankedRoom(room);
    let payout = null;
    let unlocked = {};
    metrics.noteGame({ ranked, kind: res.kind, moves: game.moves.length });
    cancelUndoAsk(room, 'expired');
    try {
      if (ranked) {
        payout = await settleOmok({ roomName: room.name, ante: room.bet, pids, result: res, ranked });
        unlocked = payout?.unlocked ?? {};
      } else {
        const outcome = Object.fromEntries(pids.map((p) => [p, res.winner == null ? 'draw' : p === res.winner ? 'win' : 'lose']));
        unlocked = await recordOmokPractice({ pids, moves: game.moves.length, outcome });
      }
    } catch (e) {
      console.error('omok settle failed', e);
      sysChat(room, '정산 중 오류가 발생했습니다.');
    }
    const overPayload = { result: res, payout, ante: room.bet, ranked, black: game.black, white: game.white, moves: game.moves.map((m) => [m.x, m.y]) };
    io.to(`room:${room.id}`).emit('omok:over', overPayload);
    for (const bid of botIdsOf(room)) if (pids.includes(bid)) botSay(room, bid, res.winner == null ? 'draw' : res.winner === bid ? 'win' : 'lose', 900 * BOT_DELAY_SCALE);
    for (const p of room.players) if (!p.bot && !p.online) p.missedOver = overPayload;
    for (const p of room.players) pushUser(p.id);
    announceUnlocked(room, unlocked);
    emitRoom(room);
    broadcastRooms();
    afterGame(room);
  }

  // ---------- 오목 무르기 ----------
  /** 대기 중인 무르기 요청을 취소하고 알린다 (상대가 응답하기 전에 수가 놓이거나 판이 끝난 경우) */
  function cancelUndoAsk(room, state) {
    const ask = room.undoAsk;
    if (!ask) return;
    room.undoAsk = null;
    clearTimeout(room.timers.get('omok-undo'));
    room.timers.delete('omok-undo');
    io.to(`room:${room.id}`).emit('omok:undo', { state, from: ask.from });
  }

  /** 무르기 실행: 되돌리고 방송한 뒤 차례를 다시 시작 */
  function doUndo(room, game, pid) {
    const r = game.undo(pid);
    if (!r.ok) return r;
    metrics.noteUndo('granted');
    cancelUndoAsk(room, 'expired');
    clearOmokTimer(room);
    io.to(`room:${room.id}`).emit('omok:undo', { state: 'granted', from: pid });
    for (const v of viewers(room)) online.get(v.id)?.emit('omok:state', { view: game.view(), move: null, undone: true });
    startOmokTurn(room);
    return r;
  }

  function startOmok(room) {
    room.status = 'playing';
    room.brains = new Map();
    const ids = room.players.map((p) => p.id);
    const first = ids.includes(room.first) ? room.first : ids[Math.floor(Math.random() * ids.length)];
    room.game = new OmokGame(ids, { ante: room.bet, first });
    room.hintsUsed = new Map();
    room.undosUsed = new Map();
    room.undoAsk = null;
    room.lastRid = new Map();
    for (const v of viewers(room)) online.get(v.id)?.emit('omok:start', { view: room.game.view(), ranked: isRankedRoom(room) });
    emitRoom(room);
    broadcastRooms();
    startOmokTurn(room);
  }


  // ---------- 윷놀이 ----------
  function clearYutTimer(room) {
    for (const k of ['yut', 'yut-bot']) {
      clearTimeout(room.timers.get(k));
      room.timers.delete(k);
    }
  }

  const yutBot = (room, pid) => {
    room.yutBots ??= new Map();
    if (!room.yutBots.has(pid)) {
      const p = playerOf(room, pid);
      room.yutBots.set(pid, new YutBot({ level: p?.bot ? p.level : 'hard' }));
    }
    return room.yutBots.get(pid);
  };

  /** 서버가 대신 한 단계: 던지기 단계면 던지고, 이동 단계면 AI 가 고른 수를 둔다 */
  function yutAuto(room, game, who) {
    if (room.game !== game || game.turn !== who || game.phase === 'ended') return;
    if (game.phase === 'throw') {
      const r = game.throw(who);
      if (r.ok) handleYut(room, game);
      return;
    }
    const m = yutBot(room, who).decide(game);
    const r = m ? game.move(who, m.pieceId, m.index) : { ok: false };
    if (r.ok) handleYut(room, game);
  }

  function startYutTurn(room) {
    const game = room.game;
    clearYutTimer(room);
    if (!game || game.phase === 'ended' || rooms.get(room.id) !== room) return;
    const who = game.turn;
    const auto = isProxied(room, who);
    const deadlineAt = auto ? null : Date.now() + YUT_TURN_MS;
    io.to(`room:${room.id}`).emit('TURN_START', { game: 'yut', userId: who, deadlineAt, auto, phase: game.phase });
    if (auto) {
      const t = setTimeout(() => {
        room.timers.delete('yut-bot');
        yutAuto(room, game, who);
      }, (700 + Math.random() * 600) * BOT_DELAY_SCALE);
      t.unref?.();
      room.timers.set('yut-bot', t);
      return;
    }
    const phase = game.phase;
    const t = setTimeout(() => {
      if (room.game !== game || game.turn !== who || game.phase !== phase) return;
      noteTimeout(room, who);
      yutAuto(room, game, who);
    }, YUT_TURN_MS);
    t.unref?.();
    room.timers.set('yut', t);
  }

  /** 던지기·이동 뒤: 상태 방송 → (끝났으면 정산 / 아니면 다음 단계). 연출이 끝날 시간을 두고 봇이 움직인다 */
  function handleYut(room, game) {
    for (const v of viewers(room)) online.get(v.id)?.emit('yut:state', { view: game.view() });
    if (game.phase === 'ended') {
      clearYutTimer(room);
      return finishYut(room, game);
    }
    return startYutTurn(room);
  }

  async function finishYut(room, game) {
    if (room.game !== game) return;
    const res = game.result;
    const pids = game.pids;
    room.status = 'waiting';
    room.game = null;
    room.yutBots = null;
    resetReady(room);
    const ranked = isRankedRoom(room);
    let payout = null;
    try {
      if (ranked) payout = await settleYut({ roomName: room.name, ante: room.bet, pids, result: res });
    } catch (e) {
      console.error('yut settle failed', e);
      sysChat(room, '정산 중 오류가 발생했습니다.');
    }
    const overPayload = { result: res, payout, ante: room.bet, ranked, teams: game.team };
    io.to(`room:${room.id}`).emit('yut:over', overPayload);
    for (const bid of botIdsOf(room)) if (pids.includes(bid)) botSay(room, bid, res.winners.includes(bid) ? 'win' : 'lose', 900 * BOT_DELAY_SCALE);
    for (const p of room.players) if (!p.bot && !p.online) p.missedOver = overPayload;
    for (const p of room.players) pushUser(p.id);
    emitRoom(room);
    broadcastRooms();
    afterGame(room);
  }

  /** 퇴장(기권) 처리 결과: 팀이 끝났으면 정산, 아니면 이어서 */
  function afterYutForfeit(room, game, uid, r) {
    if (r.ended) return handleYut(room, game);
    for (const v of viewers(room)) online.get(v.id)?.emit('yut:state', { view: game.view() });
    return startYutTurn(room);
  }

  function startYut(room) {
    room.status = 'playing';
    room.yutBots = new Map();
    const ids = room.players.map((p) => p.id);
    // 방 순서대로 청·홍 번갈아. 이긴 쪽의 선이 아니라 던져서 정하지 않고 방장이 먼저 (단순화)
    room.game = new YutGame(ids, { ante: room.bet, first: ids.includes(room.first) ? room.first : ids[0] });
    for (const v of viewers(room)) online.get(v.id)?.emit('yut:start', { view: room.game.view(), ranked: isRankedRoom(room) });
    emitRoom(room);
    broadcastRooms();
    startYutTurn(room);
  }

  // ---------- 라스베가스 ----------
  function clearVegasTimer(room) {
    for (const k of ['vegas', 'vegas-bot', 'vegas-round']) {
      clearTimeout(room.timers.get(k));
      room.timers.delete(k);
    }
  }

  const vegasBot = (room, pid) => {
    room.vegasBots ??= new Map();
    if (!room.vegasBots.has(pid)) {
      const p = playerOf(room, pid);
      room.vegasBots.set(pid, new VegasBot({ level: p?.bot ? p.level : 'hard' }));
    }
    return room.vegasBots.get(pid);
  };

  /** 서버가 대신 한 단계: 굴리기 단계면 굴리고, 놓기 단계면 AI 가 고른 눈을 놓는다 */
  function vegasAuto(room, game, who) {
    if (room.game !== game || game.turn !== who || (game.phase !== 'roll' && game.phase !== 'place')) return;
    const r = game.phase === 'roll' ? game.rollDice(who) : game.place(who, vegasBot(room, who).decide(game, who));
    if (r.ok) handleVegas(room, game);
  }

  function startVegasTurn(room) {
    const game = room.game;
    clearVegasTimer(room);
    if (!game || game.phase === 'ended' || rooms.get(room.id) !== room) return;
    if (game.phase === 'roundEnd') {
      // 라운드 정산 화면을 보여 준 뒤 다음 라운드
      const t = setTimeout(() => {
        room.timers.delete('vegas-round');
        if (room.game !== game || !game.nextRound().ok) return;
        handleVegas(room, game);
      }, VEGAS_ROUND_MS);
      t.unref?.();
      room.timers.set('vegas-round', t);
      return;
    }
    const who = game.turn;
    const auto = isProxied(room, who);
    const deadlineAt = auto ? null : Date.now() + VEGAS_TURN_MS;
    io.to(`room:${room.id}`).emit('TURN_START', { game: 'vegas', userId: who, deadlineAt, auto, phase: game.phase });
    if (auto) {
      // 놓기는 굴린 주사위 연출을 볼 시간을 두고
      const wait = game.phase === 'roll' ? 600 + Math.random() * 400 : 1500 + Math.random() * 500;
      const t = setTimeout(() => {
        room.timers.delete('vegas-bot');
        vegasAuto(room, game, who);
      }, wait * BOT_DELAY_SCALE);
      t.unref?.();
      room.timers.set('vegas-bot', t);
      return;
    }
    const phase = game.phase;
    const t = setTimeout(() => {
      if (room.game !== game || game.turn !== who || game.phase !== phase) return;
      noteTimeout(room, who);
      vegasAuto(room, game, who);
    }, VEGAS_TURN_MS);
    t.unref?.();
    room.timers.set('vegas', t);
  }

  /** 굴리기·놓기·라운드 전환·기권 뒤: 상태 방송 → (끝났으면 정산 / 아니면 다음 단계) */
  function handleVegas(room, game) {
    for (const v of viewers(room)) online.get(v.id)?.emit('vegas:state', { view: game.view() });
    if (game.phase === 'ended') {
      clearVegasTimer(room);
      return finishVegas(room, game);
    }
    return startVegasTurn(room);
  }

  async function finishVegas(room, game) {
    if (room.game !== game) return;
    const res = game.result;
    const pids = game.pids;
    room.status = 'waiting';
    room.game = null;
    room.vegasBots = null;
    // 다음 판은 다음 자리가 선
    const ids = room.players.map((p) => p.id);
    room.first = ids[(ids.indexOf(pids[game.firstIdx]) + 1) % ids.length] ?? ids[0];
    resetReady(room);
    const ranked = isRankedRoom(room);
    let payout = null;
    try {
      if (ranked) payout = await settleVegas({ roomName: room.name, ante: room.bet, pids, result: res });
    } catch (e) {
      console.error('vegas settle failed', e);
      sysChat(room, '정산 중 오류가 발생했습니다.');
    }
    const overPayload = { result: res, payout, ante: room.bet, ranked, vegas: true };
    io.to(`room:${room.id}`).emit('vegas:over', overPayload);
    for (const bid of botIdsOf(room)) if (pids.includes(bid)) botSay(room, bid, res.winners.includes(bid) ? 'win' : 'lose', 900 * BOT_DELAY_SCALE);
    for (const p of room.players) if (!p.bot && !p.online) p.missedOver = overPayload;
    for (const p of room.players) pushUser(p.id);
    emitRoom(room);
    broadcastRooms();
    afterGame(room);
  }

  function startVegas(room) {
    room.status = 'playing';
    room.vegasBots = new Map();
    const ids = room.players.map((p) => p.id);
    room.game = new VegasGame(ids, { ante: room.bet, first: ids.includes(room.first) ? room.first : ids[0] });
    for (const v of viewers(room)) online.get(v.id)?.emit('vegas:start', { view: room.game.view(), ranked: isRankedRoom(room) });
    emitRoom(room);
    broadcastRooms();
    startVegasTurn(room);
  }

  // ---------- 요트 다이스 ----------
  function clearYachtTimer(room) {
    for (const k of ['yacht', 'yacht-bot']) {
      clearTimeout(room.timers.get(k));
      room.timers.delete(k);
    }
  }

  const yachtBot = (room, pid) => {
    room.yachtBots ??= new Map();
    if (!room.yachtBots.has(pid)) {
      const p = playerOf(room, pid);
      room.yachtBots.set(pid, new YachtBot({ level: p?.bot ? p.level : 'hard' }));
    }
    return room.yachtBots.get(pid);
  };

  /** 서버가 대신 한 단계: AI 가 고른 행동(굴리기 — 고정 표시 포함 — 또는 기록) */
  function yachtAuto(room, game, who) {
    if (room.game !== game || game.turn !== who || game.phase === 'ended') return;
    const a = yachtBot(room, who).decide(game, who);
    let r;
    if (a.type === 'roll') {
      if (a.held) game.hold(who, a.held);
      r = game.roll(who);
    } else r = game.score(who, a.cat);
    if (r.ok) handleYacht(room, game);
  }

  function startYachtTurn(room) {
    const game = room.game;
    clearYachtTimer(room);
    if (!game || game.phase === 'ended' || rooms.get(room.id) !== room) return;
    const who = game.turn;
    const auto = isProxied(room, who);
    const deadlineAt = auto ? null : Date.now() + YACHT_TURN_MS;
    io.to(`room:${room.id}`).emit('TURN_START', { game: 'yacht', userId: who, deadlineAt, auto, phase: game.phase });
    if (auto) {
      // 굴린 주사위를 볼 시간을 두고
      const wait = game.phase === 'roll' ? 700 + Math.random() * 400 : 1300 + Math.random() * 500;
      const t = setTimeout(() => {
        room.timers.delete('yacht-bot');
        yachtAuto(room, game, who);
      }, wait * BOT_DELAY_SCALE);
      t.unref?.();
      room.timers.set('yacht-bot', t);
      return;
    }
    const seq = game.seq;
    const t = setTimeout(() => {
      if (room.game !== game || game.turn !== who || game.seq !== seq) return;
      noteTimeout(room, who);
      yachtAuto(room, game, who);
    }, YACHT_TURN_MS);
    t.unref?.();
    room.timers.set('yacht', t);
  }

  /** 굴리기·고정·기록·기권 뒤: 상태 방송 → (끝났으면 정산 / 아니면 다음 단계). 고정만 바꾼 경우는 타이머를 다시 걸지 않는다 */
  function handleYacht(room, game, { restart = true } = {}) {
    for (const v of viewers(room)) online.get(v.id)?.emit('yacht:state', { view: game.view() });
    if (game.phase === 'ended') {
      clearYachtTimer(room);
      return finishYacht(room, game);
    }
    return restart ? startYachtTurn(room) : undefined;
  }

  async function finishYacht(room, game) {
    if (room.game !== game) return;
    const res = game.result;
    const pids = game.pids;
    room.status = 'waiting';
    room.game = null;
    room.yachtBots = null;
    const ids = room.players.map((p) => p.id);
    room.first = ids[(ids.indexOf(pids[game.firstIdx]) + 1) % ids.length] ?? ids[0]; // 다음 판은 다음 자리가 먼저
    resetReady(room);
    const ranked = isRankedRoom(room);
    let payout = null;
    try {
      if (ranked) payout = await settleYacht({ roomName: room.name, ante: room.bet, pids, result: res });
    } catch (e) {
      console.error('yacht settle failed', e);
      sysChat(room, '정산 중 오류가 발생했습니다.');
    }
    const overPayload = { result: res, payout, ante: room.bet, ranked, yacht: true };
    io.to(`room:${room.id}`).emit('yacht:over', overPayload);
    for (const bid of botIdsOf(room)) if (pids.includes(bid)) botSay(room, bid, res.winners.includes(bid) ? 'win' : 'lose', 900 * BOT_DELAY_SCALE);
    for (const p of room.players) if (!p.bot && !p.online) p.missedOver = overPayload;
    for (const p of room.players) pushUser(p.id);
    emitRoom(room);
    broadcastRooms();
    afterGame(room);
  }

  function startYacht(room) {
    room.status = 'playing';
    room.yachtBots = new Map();
    const ids = room.players.map((p) => p.id);
    room.game = new YachtGame(ids, { ante: room.bet, first: ids.includes(room.first) ? room.first : ids[0] });
    for (const v of viewers(room)) online.get(v.id)?.emit('yacht:start', { view: room.game.view(), ranked: isRankedRoom(room) });
    emitRoom(room);
    broadcastRooms();
    startYachtTurn(room);
  }

  // ---------- 장기 ----------
  function clearJanggiTimer(room) {
    for (const k of ['janggi', 'janggi-bot', 'janggi-setup']) {
      clearTimeout(room.timers.get(k));
      room.timers.delete(k);
    }
  }

  const janggiBot = (room, pid) => {
    room.janggiBots ??= new Map();
    if (!room.janggiBots.has(pid)) {
      const p = playerOf(room, pid);
      room.janggiBots.set(pid, new JanggiBot({ level: p?.bot ? p.level : 'hard' }));
    }
    return room.janggiBots.get(pid);
  };

  const janggiState = (room, game, move = null) => {
    const payload = { view: game.view(), move, setupDeadline: room.janggiSetupAt ?? null };
    for (const v of viewers(room)) online.get(v.id)?.emit('janggi:state', payload);
  };

  /** 서버가 대신 한 수 (둘 수가 없으면 한수 쉼) */
  function janggiAuto(room, game, who) {
    if (room.game !== game || game.turn !== who || game.phase !== 'playing') return;
    const side = game.side[who];
    const m = janggiBot(room, who).decide(game.board, side, { bikjangBy: game.bikjangBy });
    const r = m ? game.move(who, m.from, m.to) : game.pass(who);
    if (r.ok) handleJanggi(room, game, r.move);
  }

  function startJanggiTurn(room) {
    const game = room.game;
    clearJanggiTimer(room);
    if (!game || game.phase !== 'playing' || rooms.get(room.id) !== room) return;
    const who = game.turn;
    const auto = isProxied(room, who);
    const deadlineAt = auto ? null : Date.now() + JANGGI_TURN_MS;
    io.to(`room:${room.id}`).emit('TURN_START', { game: 'janggi', userId: who, deadlineAt, auto });
    if (auto) {
      const t = setTimeout(() => {
        room.timers.delete('janggi-bot');
        janggiAuto(room, game, who);
      }, (500 + Math.random() * 500) * BOT_DELAY_SCALE);
      t.unref?.();
      room.timers.set('janggi-bot', t);
      return;
    }
    const seq = game.seq;
    const t = setTimeout(() => {
      if (room.game !== game || game.turn !== who || game.seq !== seq) return;
      noteTimeout(room, who);
      janggiAuto(room, game, who);
    }, JANGGI_TURN_MS);
    t.unref?.();
    room.timers.set('janggi', t);
  }

  /** 착수·한수 쉼·상차림·기권 뒤: 상태 방송 → (끝났으면 정산 / 아니면 다음 차례) */
  function handleJanggi(room, game, move = null) {
    janggiState(room, game, move);
    if (game.phase === 'ended') {
      clearJanggiTimer(room);
      return finishJanggi(room, game);
    }
    if (game.phase === 'playing') return startJanggiTurn(room);
    return undefined;
  }

  async function finishJanggi(room, game) {
    if (room.game !== game) return;
    const res = game.result;
    const pids = game.pids;
    room.status = 'waiting';
    room.game = null;
    room.janggiBots = null;
    room.janggiSetupAt = null;
    // 다음 판은 초·한을 바꾼다
    room.janggiCho = pids[1];
    resetReady(room);
    const ranked = isRankedRoom(room);
    let payout = null;
    try {
      if (ranked) payout = await settleJanggi({ roomName: room.name, ante: room.bet, pids, result: res });
    } catch (e) {
      console.error('janggi settle failed', e);
      sysChat(room, '정산 중 오류가 발생했습니다.');
    }
    const overPayload = { result: res, payout, ante: room.bet, ranked, janggi: true };
    io.to(`room:${room.id}`).emit('janggi:over', overPayload);
    for (const bid of botIdsOf(room)) if (pids.includes(bid)) botSay(room, bid, res.winner === bid ? 'win' : 'lose', 900 * BOT_DELAY_SCALE);
    for (const p of room.players) if (!p.bot && !p.online) p.missedOver = overPayload;
    for (const p of room.players) pushUser(p.id);
    emitRoom(room);
    broadcastRooms();
    afterGame(room);
  }

  function startJanggi(room) {
    room.status = 'playing';
    room.janggiBots = new Map();
    const ids = room.players.map((p) => p.id);
    const cho = ids.includes(room.janggiCho) ? room.janggiCho : ids[0]; // 첫 판은 방장이 초, 다음 판부터 번갈아
    const han = ids.find((id) => id !== cho);
    const game = new JanggiGame({ cho, han, ante: room.bet });
    room.game = game;
    room.janggiSetupAt = Date.now() + JANGGI_SETUP_MS;
    for (const v of viewers(room)) online.get(v.id)?.emit('janggi:start', { view: game.view(), ranked: isRankedRoom(room), setupDeadline: room.janggiSetupAt });
    emitRoom(room);
    broadcastRooms();
    // 상차림: AI 는 바로 고르고(무작위), 사람은 제한 시간 안에. 시간이 지나면 안 고른 쪽은 기본 상차림
    for (const pid of game.pids) {
      if (!playerOf(room, pid)?.bot) continue;
      const t = setTimeout(() => {
        if (room.game !== game || game.phase !== 'setup') return;
        game.setup(pid, JANGGI_FORMATIONS[Math.floor(Math.random() * JANGGI_FORMATIONS.length)]);
        handleJanggi(room, game);
      }, (400 + Math.random() * 600) * BOT_DELAY_SCALE);
      t.unref?.();
    }
    const t = setTimeout(() => {
      room.timers.delete('janggi-setup');
      if (room.game !== game || game.phase !== 'setup') return;
      game.setupDefaults();
      handleJanggi(room, game);
    }, JANGGI_SETUP_MS);
    t.unref?.();
    room.timers.set('janggi-setup', t);
  }

  function withGame(socket, cb, fn) {
    const uid = socket.data.user.id;
    const room = rooms.get(userRoom.get(uid));
    if (!room || !room.game || room.type !== 'gostop') return ack(cb, { ok: false, error: '진행 중인 게임이 없습니다.' });
    // 관전자의 카드 제출/고·스톱 등 모든 조작은 무시한다 (엔진 호출 자체를 하지 않음)
    if (!room.players.some((p) => p.id === uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' });
    const game = room.game;
    const r = fn(game, uid);
    if (!r.ok) return ack(cb, r);
    playerOf(room, uid).timeouts = 0;
    ack(cb, { ok: true });
    return handleGameResult(room, game, r.frames);
  }

  // ---------- 방 입퇴장 ----------
  function joinRoomChannel(socket, room) {
    socket.leave('lobby');
    socket.join(`room:${room.id}`);
  }

  async function leaveRoom(uid, { forfeit = true } = {}) {
    const room = rooms.get(userRoom.get(uid));
    if (!room) return;
    const socket = online.get(uid);
    if (room.spectators.some((p) => p.id === uid)) {
      // 관전자 퇴장: 게임/정산에는 영향 없음
      room.spectators = room.spectators.filter((p) => p.id !== uid);
      userRoom.delete(uid);
      const t0 = room.timers.get(uid);
      if (t0) clearTimeout(t0);
      room.timers.delete(uid);
      if (socket) {
        socket.leave(`room:${room.id}`);
        socket.join('lobby');
      }
      emitRoom(room);
      broadcastRooms();
      return;
    }
    if (room.tieVote?.pids.includes(uid)) {
      room.tieVote.votes[uid] = false; // 투표 중 나가면 거절
      await checkTieVote(room, room.tieVote);
    }
    if (room.game && forfeit) {
      const game = room.game;
      const r = game.forfeit(uid);
      if (r.ok) await (room.type === 'seotda' ? handleSeotdaEvents(room, game, r.events) : room.type === 'omok' ? handleOmokMove(room, game, null) : room.type === 'yut' ? afterYutForfeit(room, game, uid, r) : room.type === 'vegas' ? handleVegas(room, game) : room.type === 'yacht' ? handleYacht(room, game) : room.type === 'janggi' ? handleJanggi(room, game) : handleGameResult(room, game, r.frames));
    }
    const leaver = room.players.find((p) => p.id === uid);
    room.players = room.players.filter((p) => p.id !== uid);
    userRoom.delete(uid);
    const t = room.timers.get(uid);
    if (t) clearTimeout(t);
    room.timers.delete(uid);
    if (socket) {
      socket.leave(`room:${room.id}`);
      socket.join('lobby');
    }
    if (!room.players.some((p) => !p.bot)) {
      // 사람이 없으면 방을 닫고 봇을 돌려보낸다 (남은 관전자도 로비로)
      for (const sp of room.spectators) {
        userRoom.delete(sp.id);
        const ss = online.get(sp.id);
        if (ss) {
          ss.leave(`room:${room.id}`);
          ss.join('lobby');
          ss.emit('room:left');
        }
      }
      dropBots(room);
      clearTimers(room);
      rooms.delete(room.id);
    } else {
      if (room.hostId === uid) room.hostId = room.players.find((p) => !p.bot).id;
      resetReady(room);
      io.to(`room:${room.id}`).emit('room:chat', { system: true, text: `${leaver?.username ?? '상대'}님이 방을 나갔습니다.`, ts: Date.now() });
      emitRoom(room);
    }
    broadcastRooms();
  }

  /** 재접속 유예 시간 초과: 판이 진행 중이면 AI 가 끝까지 대신 두고 판이 끝나면 퇴장, 아니면 바로 퇴장 */
  function graceExpired(uid) {
    const room = rooms.get(userRoom.get(uid));
    if (!room) return undefined;
    room.timers.delete(uid);
    const me = playerOf(room, uid);
    if (me && room.game) {
      me.leaveAfterGame = true;
      sysChat(room, `${me.username}님은 이번 판이 끝나면 퇴장 처리됩니다. (AI가 대신 진행 중)`);
      return undefined;
    }
    return leaveRoom(uid);
  }

  /** 재접속/새로고침/복귀 시 클라이언트 상태를 서버 기준으로 통째로 덮어쓰는 스냅샷 */
  function syncPayload(uid) {
    const room = rooms.get(userRoom.get(uid));
    if (!room) return { room: null, chat: [], view: null, seotda: null, omok: null, yut: null, vegas: null, yacht: null, janggi: null, tieVote: null, over: null, ranked: null, role: null };
    const me = room.players.find((p) => p.id === uid);
    const over = me?.missedOver ?? null;
    if (me) me.missedOver = null;
    return {
      room: roomState(room),
      chat: room.chat,
      view: room.game && room.type === 'gostop' ? room.game.view(uid) : null,
      seotda: room.game && room.type === 'seotda' ? room.game.view(uid) : null,
      omok: room.game && room.type === 'omok' ? room.game.view() : null,
      yut: room.game && room.type === 'yut' ? room.game.view() : null,
      vegas: room.game && room.type === 'vegas' ? room.game.view() : null,
      yacht: room.game && room.type === 'yacht' ? room.game.view() : null,
      janggi: room.game && room.type === 'janggi' ? { view: room.game.view(), setupDeadline: room.janggiSetupAt ?? null } : null,
      tieVote: tieVotePayload(room.tieVote),
      over,
      ranked: isRankedRoom(room),
      role: me ? 'player' : 'spectator',
      serverTime: Date.now(),
    };
  }

  const sendSync = (socket) => {
    const uid = socket.data.user.id;
    const p = syncPayload(uid);
    socket.emit('SYNC_BOARD_STATE', p);
    if (!p.room) {
      socket.emit('lobby:rooms', [...rooms.values()].map(roomSummary));
      socket.emit('lobby:history', lobbyChat);
    }
  };

  // ---------- 소켓 연결 ----------
  io.use(async (socket, next) => {
    const uid = verifyToken(socket.handshake.auth?.token);
    if (!uid) return next(new Error('unauthorized'));
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user || user.isBot) return next(new Error('unauthorized'));
    socket.data.user = { id: user.id, username: user.username, name: displayName(user) };
    return next();
  });

  io.on('connection', (socket) => {
    const { id: uid, username } = socket.data.user; // username: 로그인 아이디, 화면 표시는 socket.data.user.name
    const prev = online.get(uid);
    if (prev) {
      prev.emit('kicked', '다른 곳에서 로그인되었습니다.');
      prev.disconnect(true);
    }
    online.set(uid, socket);
    pushUser(uid);

    // 재접속: 방(과 진행 중인 판)이 남아 있으면 유예 타이머를 풀고 전체 상태를 내려준다
    const existing = rooms.get(userRoom.get(uid));
    if (existing) {
      const me = existing.players.find((p) => p.id === uid) ?? existing.spectators.find((p) => p.id === uid);
      const wasOffline = !me.online;
      me.online = true;
      me.offlineAt = null;
      me.leaveAfterGame = false;
      me.auto = false; // 돌아오면 AI 대행을 넘겨받는다
      me.timeouts = 0;
      const t = existing.timers.get(uid);
      if (t) clearTimeout(t);
      existing.timers.delete(uid);
      joinRoomChannel(socket, existing);
      if (wasOffline) {
        io.to(`room:${existing.id}`).emit('room:chat', { system: true, text: `${me.username}님이 다시 연결되었습니다.`, ts: Date.now() });
        io.to(`room:${existing.id}`).emit('player:online', { userId: uid });
      }
      sendSync(socket);
      emitRoom(existing);
      resumeTurn(existing, uid);
    } else {
      socket.join('lobby');
      sendSync(socket);
    }

    // 클라이언트가 앱으로 돌아왔을 때(화면 켜짐/탭 전환) 놓친 상태를 다시 받아가는 요청
    socket.on('sync', (_p, cb) => {
      sendSync(socket);
      ack(cb, { ok: true });
    });

    const rate = { n: 0, t: 0 };
    const chatOk = () => {
      const now = Date.now();
      if (now - rate.t > 3000) {
        rate.t = now;
        rate.n = 0;
      }
      return ++rate.n <= 6;
    };

    socket.on('lobby:chat', (payload) => {
      const text = clean(payload?.text);
      if (!text || !chatOk() || userRoom.has(uid)) return;
      const msg = { user: socket.data.user.name, text, ts: Date.now() };
      lobbyChat.push(msg);
      if (lobbyChat.length > 50) lobbyChat.shift();
      io.to('lobby').emit('lobby:chat', msg);
    });

    socket.on('room:create', async (payload, cb) => {
      if (userRoom.has(uid)) return ack(cb, { ok: false, error: '이미 방에 참여 중입니다.' });
      const name = clean(payload?.name, 20) || `${socket.data.user.name}의 방`;
      const bet = Number(payload?.bet);
      if (!BET_OPTIONS.includes(bet)) return ack(cb, { ok: false, error: '판돈이 올바르지 않습니다.' });
      const u = await prisma.user.findUnique({ where: { id: uid } });
      if (u.money < bet * MIN_MONEY_MULT)
        return ack(cb, { ok: false, error: `머니가 부족합니다. (최소 ${bet * MIN_MONEY_MULT})` });
      const type = gameType(payload?.game);
      const room = newRoom(u, name, bet, { ...parseOpts(type === 'gostop' ? payload?.opts : {}), ...(type === 'omok' ? { turnSec: payload?.turnSec } : {}) }, type);
      rooms.set(room.id, room);
      userRoom.set(uid, room.id);
      joinRoomChannel(socket, room);
      socket.emit('room:joined', { room: roomState(room), chat: room.chat });
      broadcastRooms();
      return ack(cb, { ok: true });
    });

    socket.on('room:join', async (payload, cb) => {
      if (userRoom.has(uid)) return ack(cb, { ok: false, error: '이미 방에 참여 중입니다.' });
      const room = rooms.get(Number(payload?.roomId));
      if (!room) return ack(cb, { ok: false, error: '존재하지 않는 방입니다.' });
      if (room.players.length >= maxPlayersOf(room.type) || room.status !== 'waiting') return ack(cb, { ok: false, error: '입장할 수 없는 방입니다.' });
      const u = await prisma.user.findUnique({ where: { id: uid } });
      if (u.money < room.bet * MIN_MONEY_MULT)
        return ack(cb, { ok: false, error: `머니가 부족합니다. (최소 ${room.bet * MIN_MONEY_MULT})` });
      room.players.push({ id: uid, username: displayName(u), avatar: avatarUrl(u), title: titleText(u), ready: false, online: true });
      userRoom.set(uid, room.id);
      joinRoomChannel(socket, room);
      socket.emit('room:joined', { room: roomState(room), chat: room.chat });
      io.to(`room:${room.id}`).emit('room:chat', { system: true, text: `${displayName(u)}님이 입장했습니다.`, ts: Date.now() });
      emitRoom(room);
      broadcastRooms();
      return ack(cb, { ok: true });
    });

    // 가득 찼거나 진행 중인 방을 관전자로 입장
    socket.on('room:spectate', async (payload, cb) => {
      if (userRoom.has(uid)) return ack(cb, { ok: false, error: '이미 방에 참여 중입니다.' });
      const room = rooms.get(Number(payload?.roomId));
      if (!room) return ack(cb, { ok: false, error: '존재하지 않는 방입니다.' });
      if (room.status === 'waiting' && room.players.length < maxPlayersOf(room.type))
        return ack(cb, { ok: false, error: '참가할 수 있는 방입니다. 관전은 가득 찼거나 진행 중인 방만 가능합니다.' });
      if (room.spectators.length >= MAX_SPECTATORS) return ack(cb, { ok: false, error: '관전 인원이 가득 찼습니다.' });
      const u = await prisma.user.findUnique({ where: { id: uid } });
      if (userRoom.has(uid) || !rooms.has(room.id)) return ack(cb, { ok: false, error: '입장할 수 없습니다.' });
      room.spectators.push({ id: uid, username: displayName(u), avatar: avatarUrl(u), title: titleText(u), online: true });
      userRoom.set(uid, room.id);
      joinRoomChannel(socket, room);
      io.to(`room:${room.id}`).emit('room:chat', { system: true, text: `👁️ ${displayName(u)}님이 관전을 시작했습니다.`, ts: Date.now() });
      sendSync(socket);
      emitRoom(room);
      broadcastRooms();
      return ack(cb, { ok: true });
    });

    socket.on('room:leave', async (_p, cb) => {
      await leaveRoom(uid);
      socket.emit('room:left');
      socket.emit('lobby:history', lobbyChat);
      socket.emit('lobby:rooms', [...rooms.values()].map(roomSummary));
      ack(cb, { ok: true });
    });

    socket.on('room:options', (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.status !== 'waiting' || room.hostId !== uid) return ack(cb, { ok: false, error: '방장만 변경할 수 있습니다.' });
      room.opts = parseOpts(payload?.opts);
      resetReady(room);
      emitRoom(room);
      broadcastRooms();
      return ack(cb, { ok: true });
    });

    socket.on('room:ready', async (_p, cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.status !== 'waiting') return ack(cb, { ok: false });
      const me = room.players.find((p) => p.id === uid);
      if (!me) return ack(cb, { ok: false, error: '관전자는 준비할 수 없습니다.' });
      me.ready = !me.ready;
      emitRoom(room);
      if (room.players.length >= 2 && room.players.every((p) => p.ready)) {
        room.status = 'starting'; // await 중 중복 시작 방지
        let users;
        try {
          users = await prisma.user.findMany({ where: { id: { in: room.players.map((p) => p.id) } } });
        } catch (e) {
          console.error('ready check failed', e);
          room.status = 'waiting';
          resetReady(room);
          emitRoom(room);
          return ack(cb, { ok: false, error: '시작 중 오류가 발생했습니다.' });
        }
        const poor = users.find((u) => !u.isBot && u.money < room.bet * MIN_MONEY_MULT);
        if (poor || room.players.length < 2 || !room.players.every((p) => p.ready)) {
          room.status = 'waiting';
          resetReady(room);
          if (poor)
            io.to(`room:${room.id}`).emit('room:chat', {
              system: true,
              text: `${displayName(poor)}님의 머니가 부족해 시작할 수 없습니다.`,
              ts: Date.now(),
            });
          emitRoom(room);
          return ack(cb, { ok: true });
        }
        try {
          startGame(room);
        } catch (e) {
          console.error('startGame failed', e);
          room.status = 'waiting';
          room.game = null;
          resetReady(room);
          emitRoom(room);
          return ack(cb, { ok: false, error: '게임을 시작하지 못했습니다.' });
        }
      }
      return ack(cb, { ok: true });
    });

    // ----- AI 봇 -----
    // 로비 'AI 대전': 난이도·AI 상대 수(bots)를 골라 봇들과 바로 시작 (사람 1명이라 연습 — 머니/전적 무변동)
    socket.on('room:practice', async (payload, cb) => {
      if (userRoom.has(uid)) return ack(cb, { ok: false, error: '이미 방에 참여 중입니다.' });
      const me = await prisma.user.findUnique({ where: { id: uid } });
      const type = gameType(payload?.game);
      // 연습 판돈은 고를 수 있다 (머니에는 영향 없음 — 결과 화면의 금액 체감용)
      const bet = BET_OPTIONS.includes(Number(payload?.bet)) ? Number(payload.bet) : BET_OPTIONS[0];
      const room = newRoom(me, `${displayName(me)}의 AI 연습`, bet, { ...parseOpts(payload?.opts), ...(type === 'omok' ? { turnSec: payload?.turnSec } : {}) }, type);
      rooms.set(room.id, room);
      userRoom.set(uid, room.id);
      // AI 상대 수: 1 ~ (최대 인원 - 1). 오목은 1:1 고정
      const count = Math.min(maxPlayersOf(type) - 1, Math.max(1, Math.floor(Number(payload?.bots)) || 1));
      // 적응형(오목): level 'auto' + 클라이언트가 기억한 실력(skill 0.1~1) → 연속 강도 봇
      const adaptive = type === 'omok' && payload?.level === 'auto';
      const skill = Math.min(1, Math.max(0.1, Number(payload?.skill) || 0.5));
      for (let i = 0; i < count; i++) {
        const bot = await acquireBot(room.id);
        if (!bot) {
          room.players.filter((p) => p.bot).forEach((p) => userRoom.delete(p.id));
          rooms.delete(room.id);
          userRoom.delete(uid);
          return ack(cb, { ok: false, error: 'AI 봇을 준비하지 못했습니다.' });
        }
        const bp = botPlayer(room, bot, adaptive ? (skill < 0.35 ? 'easy' : skill < 0.75 ? 'normal' : 'hard') : payload?.level);
        if (adaptive) Object.assign(bp, { adaptive: true, skill });
        room.players.push(bp);
      }
      room.players[0].ready = true;
      joinRoomChannel(socket, room);
      socket.emit('room:joined', { room: roomState(room), chat: room.chat });
      ack(cb, { ok: true });
      startGame(room);
      return undefined;
    });

    // 대기방 'AI 봇 추가' (방장). 사람 2명 + 봇은 실전, 사람 1명 + 봇은 연습.
    socket.on('room:addBot', async (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.status !== 'waiting' || room.hostId !== uid) return ack(cb, { ok: false, error: '방장만 대기 중에 추가할 수 있습니다.' });
      if (room.players.length >= maxPlayersOf(room.type)) return ack(cb, { ok: false, error: '방이 가득 찼습니다.' });
      const bot = await acquireBot(room.id);
      if (!bot) return ack(cb, { ok: false, error: 'AI 봇을 준비하지 못했습니다.' });
      if (!rooms.has(room.id) || room.status !== 'waiting' || room.players.length >= maxPlayersOf(room.type)) {
        userRoom.delete(bot.id);
        return ack(cb, { ok: false, error: '봇을 추가할 수 없는 상태입니다.' });
      }
      const bp = botPlayer(room, bot, payload?.level);
      room.players.push(bp);
      resetReady(room);
      io.to(`room:${room.id}`).emit('room:chat', { system: true, text: `${bp.username}이(가) 참가했습니다.`, ts: Date.now() });
      emitRoom(room);
      broadcastRooms();
      return ack(cb, { ok: true });
    });

    socket.on('room:removeBot', (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.status !== 'waiting' || room.hostId !== uid) return ack(cb, { ok: false, error: '방장만 변경할 수 있습니다.' });
      const bot = room.players.find((p) => p.bot && (payload?.botId == null || p.id === payload.botId));
      if (!bot) return ack(cb, { ok: false, error: '제거할 봇이 없습니다.' });
      room.players = room.players.filter((p) => p !== bot);
      userRoom.delete(bot.id);
      resetReady(room);
      emitRoom(room);
      broadcastRooms();
      return ack(cb, { ok: true });
    });

    // 타짜 감정표현 매크로 → 같은 방 전원에게 즉시 방송
    socket.on('SEND_EMOTE', (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      const text = typeof payload?.text === 'string' ? payload.text : '';
      if (!room || !room.players.some((p) => p.id === uid) || !isEmoteFor(room.type ?? 'gostop', text)) return ack(cb, { ok: false, error: '보낼 수 없는 표현입니다.' });
      if (!chatOk()) return ack(cb, { ok: false, error: '너무 빠르게 보내고 있습니다.' });
      io.to(`room:${room.id}`).emit('BROADCAST_EMOTE', { userId: uid, name: socket.data.user.name, text, ts: Date.now() });
      return ack(cb, { ok: true });
    });

    socket.on('room:chat', (payload) => {
      const room = rooms.get(userRoom.get(uid));
      const text = clean(payload?.text);
      if (!room || !text || !chatOk()) return;
      const msg = { user: socket.data.user.name, userId: uid, text, ts: Date.now() };
      room.chat.push(msg);
      if (room.chat.length > 100) room.chat.shift();
      io.to(`room:${room.id}`).emit('room:chat', msg);
    });

    // ----- 게임 액션 -----
    socket.on('game:play', (payload, cb) => {
      const cardId = payload?.cardId ?? null;
      if (cardId !== null && !isCardId(cardId)) return ack(cb, { ok: false, error: '잘못된 요청입니다.' });
      return withGame(socket, cb, (g, id) => g.play(id, cardId, { shake: payload?.shake === true }));
    });
    socket.on('game:choose', (payload, cb) => {
      if (!isCardId(payload?.cardId)) return ack(cb, { ok: false, error: '잘못된 요청입니다.' });
      return withGame(socket, cb, (g, id) => g.choose(id, payload.cardId));
    });
    // 섯다 베팅 행동: die | call | half | bbing | ddadang
    socket.on('seotda:act', (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.type !== 'seotda' || !room.game) return ack(cb, { ok: false, error: '진행 중인 섯다가 없습니다.' });
      if (!room.players.some((p) => p.id === uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' });
      const game = room.game;
      const action = typeof payload?.action === 'string' ? payload.action : '';
      const r = game.act(uid, action);
      if (!r.ok) return ack(cb, r);
      playerOf(room, uid).timeouts = 0;
      ack(cb, { ok: true });
      return handleSeotdaEvents(room, game, r.events);
    });
    // 묻고 더블 투표 (동점자만)
    socket.on('seotda:tieVote', (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      const vote = room?.tieVote;
      if (!vote || !vote.pids.includes(uid)) return ack(cb, { ok: false, error: '투표할 수 없습니다.' });
      if (vote.votes[uid] != null) return ack(cb, { ok: false, error: '이미 투표했습니다.' });
      vote.votes[uid] = payload?.agree === true;
      ack(cb, { ok: true });
      emitTieVote(room);
      return checkTieVote(room, vote);
    });
    // 윷놀이: 던지기 / 말 이동
    const yutRoom = (cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.type !== 'yut' || !room.game) return ack(cb, { ok: false, error: '진행 중인 윷놀이가 없습니다.' }) && null;
      if (!room.players.some((p) => p.id === uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' }) && null;
      return room;
    };
    socket.on('yut:throw', (_p, cb) => {
      const room = yutRoom(cb);
      if (!room) return undefined;
      const game = room.game;
      const r = game.throw(uid);
      if (!r.ok) return ack(cb, r);
      playerOf(room, uid).timeouts = 0;
      ack(cb, { ok: true });
      return handleYut(room, game);
    });
    socket.on('yut:move', (payload, cb) => {
      const room = yutRoom(cb);
      if (!room) return undefined;
      const game = room.game;
      const r = game.move(uid, Number(payload?.pieceId), Number(payload?.index));
      if (!r.ok) return ack(cb, r);
      playerOf(room, uid).timeouts = 0;
      ack(cb, { ok: true });
      return handleYut(room, game);
    });
    // 라스베가스: 굴리기 / 놓기
    const vegasRoom = (cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.type !== 'vegas' || !room.game) return ack(cb, { ok: false, error: '진행 중인 라스베가스가 없습니다.' }) && null;
      if (!room.players.some((p) => p.id === uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' }) && null;
      return room;
    };
    socket.on('vegas:roll', (_p, cb) => {
      const room = vegasRoom(cb);
      if (!room) return undefined;
      const game = room.game;
      const r = game.rollDice(uid);
      if (!r.ok) return ack(cb, r);
      playerOf(room, uid).timeouts = 0;
      ack(cb, { ok: true });
      return handleVegas(room, game);
    });
    socket.on('vegas:place', (payload, cb) => {
      const room = vegasRoom(cb);
      if (!room) return undefined;
      const game = room.game;
      const r = game.place(uid, Number(payload?.value));
      if (!r.ok) return ack(cb, r);
      playerOf(room, uid).timeouts = 0;
      ack(cb, { ok: true });
      return handleVegas(room, game);
    });
    // 요트 다이스: 고정 / 굴리기 / 기록
    const yachtRoom = (cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.type !== 'yacht' || !room.game) return ack(cb, { ok: false, error: '진행 중인 요트 다이스가 없습니다.' }) && null;
      if (!room.players.some((p) => p.id === uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' }) && null;
      return room;
    };
    const yachtAct = (fn, opts) => (payload, cb) => {
      const room = yachtRoom(cb);
      if (!room) return undefined;
      const game = room.game;
      const r = fn(game, payload);
      if (!r.ok) return ack(cb, r);
      playerOf(room, uid).timeouts = 0;
      ack(cb, { ok: true });
      return handleYacht(room, game, opts);
    };
    socket.on('yacht:hold', yachtAct((g, p) => g.hold(uid, p?.held), { restart: false }));
    socket.on('yacht:roll', yachtAct((g, p) => {
      // 고정 정보를 같이 보내면 반영하고 굴린다 (따로 yacht:hold 를 먼저 보내도 된다)
      if (Array.isArray(p?.held) && g.phase === 'decide') {
        const h = g.hold(uid, p.held);
        if (!h.ok) return h;
      }
      return g.roll(uid);
    }));
    socket.on('yacht:score', yachtAct((g, p) => g.score(uid, String(p?.cat ?? ''))));
    // 장기: 상차림 / 착수 / 한수 쉼 / 기권
    const janggiAct = (fn) => (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.type !== 'janggi' || !room.game) return ack(cb, { ok: false, error: '진행 중인 장기가 없습니다.' });
      if (!room.players.some((p) => p.id === uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' });
      const game = room.game;
      const r = fn(game, payload);
      if (!r.ok) return ack(cb, r);
      playerOf(room, uid).timeouts = 0;
      ack(cb, { ok: true });
      return handleJanggi(room, game, r.move ?? null);
    };
    socket.on('janggi:setup', janggiAct((g, p) => g.setup(uid, String(p?.formation ?? ''))));
    socket.on('janggi:move', janggiAct((g, p) => g.move(uid, Number(p?.from), Number(p?.to))));
    socket.on('janggi:pass', janggiAct((g) => g.pass(uid)));
    socket.on('janggi:resign', janggiAct((g) => g.resign(uid)));
    // 오목 착수
    socket.on('omok:place', (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      if (!room || room.type !== 'omok' || !room.game) return ack(cb, { ok: false, error: '진행 중인 오목이 없습니다.' });
      if (!room.players.some((p) => p.id === uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' });
      const game = room.game;
      // 같은 요청 id 가 다시 오면(불안정한 네트워크의 재전송) 한 번만 처리하고 같은 성공 응답을 돌려준다
      const rid = typeof payload?.rid === 'string' ? payload.rid.slice(0, 40) : null;
      if (rid && room.lastRid?.get(uid) === rid) return ack(cb, { ok: true, dup: true });
      const r = game.place(uid, payload?.x, payload?.y);
      if (!r.ok) return ack(cb, r);
      if (rid) room.lastRid.set(uid, rid);
      playerOf(room, uid).timeouts = 0;
      ack(cb, { ok: true });
      return handleOmokMove(room, game, r.move);
    });
    // 오목 기권 (나가기와 달리 방에 남는다)
    socket.on('omok:resign', (_p, cb) => {
      const room = rooms.get(userRoom.get(uid));
      const game = room?.game;
      if (!room || room.type !== 'omok' || !game || game.phase !== 'playing') return ack(cb, { ok: false, error: '진행 중인 오목이 없습니다.' });
      if (!game.pids.includes(uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' });
      const r = game.forfeit(uid);
      if (!r.ok) return ack(cb, { ok: false });
      ack(cb, { ok: true });
      return handleOmokMove(room, game, null);
    });
    // 오목 무르기: AI 연습은 바로(판당 3번), 실전은 상대에게 요청(사람당 판당 2번, 15초 안에 응답)
    socket.on('omok:undo', (_p, cb) => {
      const room = rooms.get(userRoom.get(uid));
      const game = room?.game;
      if (!room || room.type !== 'omok' || !game || game.phase !== 'playing') return ack(cb, { ok: false, error: '진행 중인 오목이 없습니다.' });
      if (!game.pids.includes(uid)) return ack(cb, { ok: false, error: '관전자는 조작할 수 없습니다.' });
      if (!game.moves.some((m) => m.pid === uid)) return ack(cb, { ok: false, error: '아직 둔 수가 없어요.' });
      if (room.undoAsk) return ack(cb, { ok: false, error: '이미 무르기를 요청한 상태예요.' });
      const used = room.undosUsed.get(uid) ?? 0;
      const opp = game.opponent(uid);
      const practice = !isRankedRoom(room);
      const limit = practice ? OMOK_PRACTICE_UNDOS : OMOK_UNDO_LIMIT;
      if (used >= limit) return ack(cb, { ok: false, error: `무르기는 한 판에 ${limit}번까지예요.` });
      metrics.noteUndo('asked');
      room.undosUsed.set(uid, used + 1);
      if (practice) {
        ack(cb, { ok: true, left: limit - used - 1 });
        return doUndo(room, game, uid);
      }
      if (isProxied(room, opp)) {
        metrics.noteUndo('declined');
        io.to(`room:${room.id}`).emit('omok:undo', { state: 'declined', from: uid });
        return ack(cb, { ok: false, error: '상대가 자리에 없어 무르기를 받을 수 없어요.' });
      }
      room.undoAsk = { from: uid };
      const t = setTimeout(() => {
        room.timers.delete('omok-undo');
        if (room.undoAsk?.from === uid) {
          metrics.noteUndo('declined');
          cancelUndoAsk(room, 'declined');
        }
      }, OMOK_UNDO_ASK_MS);
      t.unref?.();
      room.timers.set('omok-undo', t);
      io.to(`room:${room.id}`).emit('omok:undo', { state: 'ask', from: uid, deadlineAt: Date.now() + OMOK_UNDO_ASK_MS });
      return ack(cb, { ok: true, left: limit - used - 1 });
    });
    socket.on('omok:undoReply', (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      const game = room?.game;
      const ask = room?.undoAsk;
      if (!room || room.type !== 'omok' || !game || game.phase !== 'playing' || !ask) return ack(cb, { ok: false, error: '응답할 무르기 요청이 없어요.' });
      if (ask.from === uid || !game.pids.includes(uid)) return ack(cb, { ok: false, error: '응답할 수 없어요.' });
      ack(cb, { ok: true });
      if (payload?.accept === true) return doUndo(room, game, ask.from);
      metrics.noteUndo('declined');
      return cancelUndoAsk(room, 'declined');
    });
    // 오목 힌트(연습 판 전용, 판당 3번): 내 차례에 어려움 AI 가 고른 수를 알려 준다
    socket.on('omok:hint', (_p, cb) => {
      const room = rooms.get(userRoom.get(uid));
      const game = room?.game;
      if (!room || room.type !== 'omok' || !game || game.phase !== 'playing') return ack(cb, { ok: false, error: '진행 중인 오목이 없습니다.' });
      if (!game.pids.includes(uid)) return ack(cb, { ok: false, error: '관전자는 쓸 수 없습니다.' });
      if (isRankedRoom(room)) return ack(cb, { ok: false, error: '힌트는 AI 연습 판에서만 쓸 수 있어요.' });
      if (game.turn !== uid) return ack(cb, { ok: false, error: '내 차례에만 쓸 수 있어요.' });
      const used = room.hintsUsed?.get(uid) ?? 0;
      if (used >= OMOK_HINTS) return ack(cb, { ok: false, error: '이번 판 힌트를 모두 썼어요.' });
      room.hintsUsed.set(uid, used + 1); // 계산 중 중복 요청으로 횟수를 우회하지 못하게 먼저 센다
      pickMove(game.moves.map((m) => [m.x, m.y]), { level: 'hard' }).then(([x, y]) => ack(cb, { ok: true, x, y, left: OMOK_HINTS - used - 1 }), () => {
        room.hintsUsed.set(uid, used);
        ack(cb, { ok: false, error: '힌트를 계산하지 못했어요.' });
      });
      return undefined;
    });
    // 오목 복기 분석: 끝난 판의 수순(클라이언트가 결과 창에서 보냄)을 AI 가 분석. 동시에 한 건만.
    socket.on('omok:analyze', async (payload, cb) => {
      const moves = payload?.moves;
      if (!Array.isArray(moves) || !moves.length || moves.length > 225 || !moves.every((m) => Array.isArray(m) && m.length === 2 && Number.isInteger(m[0]) && Number.isInteger(m[1])))
        return ack(cb, { ok: false, error: '잘못된 기록입니다.' });
      const replay = new OmokGame([1, 2]);
      for (const [x, y] of moves) if (!replay.place(replay.turn, x, y).ok) return ack(cb, { ok: false, error: '규칙에 맞지 않는 기록입니다.' });
      if (analyzing.has(uid)) return ack(cb, { ok: false, error: '이미 분석 중입니다.' });
      analyzing.add(uid);
      try {
        return ack(cb, { ok: true, analysis: await analyzeMoves(moves) });
      } catch (e) {
        console.error('omok analyze failed', e);
        return ack(cb, { ok: false, error: '분석 중 오류가 발생했습니다.' });
      } finally {
        analyzing.delete(uid);
      }
    });
    // AI 자동 진행 켜기/끄기 (본인)
    socket.on('room:auto', (payload, cb) => {
      const room = rooms.get(userRoom.get(uid));
      const me = room && playerOf(room, uid);
      if (!me) return ack(cb, { ok: false, error: '참가 중인 방이 없습니다.' });
      me.auto = payload?.on === true;
      me.timeouts = 0;
      emitRoom(room);
      resumeTurn(room, uid);
      return ack(cb, { ok: true });
    });
    socket.on('game:sellGwang', (_p, cb) => withGame(socket, cb, (g, id) => g.sellGwang(id)));
    socket.on('game:passGwang', (_p, cb) => withGame(socket, cb, (g, id) => g.passGwang(id)));
    socket.on('game:chongtong', (_p, cb) => withGame(socket, cb, (g, id) => g.callChongtong(id)));
    socket.on('game:passChongtong', (_p, cb) => withGame(socket, cb, (g, id) => g.passChongtong(id)));
    socket.on('game:gukjin', (payload, cb) => {
      const uid = socket.data.user.id;
      const room = rooms.get(userRoom.get(uid));
      if (!room?.game || room.type !== 'gostop' || !room.players.some((p) => p.id === uid)) return ack(cb, { ok: false, error: '진행 중인 게임이 없습니다.' });
      const r = room.game.setGukjin(uid, payload?.mode);
      if (!r.ok) return ack(cb, r);
      ack(cb, { ok: true });
      emitFrames(room, r.frames);
    });
    socket.on('game:go', (_p, cb) => withGame(socket, cb, (g, id) => g.callGo(id)));
    socket.on('game:stop', (_p, cb) => withGame(socket, cb, (g, id) => g.callStop(id)));
    socket.on('game:shodang', (_p, cb) => withGame(socket, cb, (g, id) => g.callShodang(id)));
    socket.on('game:shodangAnswer', (payload, cb) => withGame(socket, cb, (g, id) => g.answerShodang(id, payload?.accept === true)));

    socket.on('disconnect', () => {
      if (online.get(uid) !== socket) return; // 다른 접속으로 대체된 경우
      online.delete(uid);
      const room = rooms.get(userRoom.get(uid));
      if (!room) return;
      const me = room.players.find((p) => p.id === uid) ?? room.spectators.find((p) => p.id === uid);
      me.online = false;
      me.offlineAt = Date.now();
      // 즉시 퇴장시키지 않고 유예 시간 동안 자리를 지킨다. 진행 중인 판은 AI 가 대신 두고, 초과하면 판이 끝난 뒤 퇴장.
      const timer = setTimeout(() => graceExpired(uid), RECONNECT_GRACE_MS);
      timer.unref?.();
      room.timers.set(uid, timer);
      io.to(`room:${room.id}`).emit('room:chat', {
        system: true,
        text: `${me.username}님의 연결이 끊겼습니다. 재접속을 대기합니다(${Math.round(RECONNECT_GRACE_MS / 1000)}초)${room.game && room.players.includes(me) ? ' — 그동안 AI가 대신 둡니다' : ''}`,
        ts: Date.now(),
      });
      io.to(`room:${room.id}`).emit('player:offline', { userId: uid, graceMs: RECONNECT_GRACE_MS, at: me.offlineAt });
      emitRoom(room);
      if (room.tieVote?.pids.includes(uid) && room.tieVote.votes[uid] == null) {
        room.tieVote.votes[uid] = false;
        emitTieVote(room);
        checkTieVote(room, room.tieVote);
      }
      resumeTurn(room, uid); // 지금 내 차례였다면 AI 가 이어받는다
    });
  });

  // 닉네임/아바타 변경(REST) → 접속 정보·방 상태에 즉시 반영
  const onProfile = async (uid) => {
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return;
    const s = online.get(uid);
    if (s) s.data.user.name = displayName(u);
    const room = rooms.get(userRoom.get(uid));
    const me = room?.players.find((p) => p.id === uid) ?? room?.spectators.find((p) => p.id === uid);
    if (me) {
      me.username = displayName(u);
      me.avatar = avatarUrl(u);
      me.title = titleText(u);
      emitRoom(room);
    }
    broadcastRooms();
    pushUser(uid);
  };
  bus.on('profile', onProfile);
  httpServer.on('close', () => bus.off('profile', onProfile));

  /** 첫 화면용 공개 현황: 접속자 수(봇 제외)와 게임별 열린 방·진행 중인 판 수 (개인 정보 없음) */
  io.summary = () => {
    const games = Object.fromEntries(['gostop', ...ROOM_GAMES].map((g) => [g, { rooms: 0, playing: 0 }]));
    for (const r of rooms.values()) {
      const g = games[r.type ?? 'gostop'];
      if (!g) continue;
      g.rooms++;
      if (r.status !== 'waiting') g.playing++;
    }
    return { online: [...online.keys()].filter((id) => id > 0).length, games };
  };

  return io;
}
