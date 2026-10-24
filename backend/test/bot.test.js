import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.BOT_DELAY_SCALE = '0'; // 봇이 지연 없이 바로 둔다
jest.setTimeout(90000);

let server, base, prisma, isRankedRoom;
const clients = [];
let seq = 0;

beforeAll(async () => {
  useTempDb();
  ({ prisma } = await import('../src/db.js'));
  const { createServer } = await import('../src/app.js');
  ({ isRankedRoom } = await import('../src/sockets.js'));
  ({ server } = createServer());
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  clients.forEach((c) => c.s.close());
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

const post = async (p, body) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function mk(name) {
  const username = `${name}${++seq}`;
  const r = await post('/api/auth/register', { username, password: 'pw1234' });
  const s = ioc(base, { auth: { token: r.token } });
  const c = { s, token: r.token, user: r.user, view: null, over: null, started: [], room: null, rooms: [] };
  s.on('game:start', (m) => { c.view = m.view; c.over = null; c.started.push(m); });
  s.on('game:frames', ({ frames }) => { c.view = frames.at(-1); });
  s.on('game:over', (o) => { c.over = o; });
  s.on('room:joined', ({ room }) => { c.roomId = room.id; c.room = room; });
  s.on('room:state', (st) => { c.room = st; });
  s.on('room:left', () => { c.room = null; c.roomId = null; });
  s.on('lobby:rooms', (l) => { c.rooms = l; });
  s.on('SYNC_BOARD_STATE', (p) => { c.sync = p; if (p.view) c.view = p.view; });
  s.on('game:frames-seen', () => {});
  await new Promise((res) => s.on('connect', res));
  clients.push(c);
  return c;
}

const dbUser = (id) => prisma.user.findUnique({ where: { id } });

/** 사람(들)만 무작위로 두고, 봇 차례는 서버가 알아서 두기를 기다린다. 모든 사람이 game:over 를 받을 때까지. */
async function playHumans(cs) {
  const by = Object.fromEntries(cs.map((c) => [c.user.id, c]));
  const t0 = Date.now();
  while (!cs.every((c) => c.over)) {
    if (Date.now() - t0 > 60000) throw new Error('timeout');
    const view = cs[0].view;
    const actor = view && by[view.turn];
    if (!actor || view.phase === 'ended' || view.phase === 'busy') { await sleep(5); continue; }
    const v = actor.view;
    let res;
    if (v.phase === 'gwang') res = await emit(actor.s, 'game:passGwang');
    else if (v.phase === 'chong') res = await emit(actor.s, 'game:passChongtong');
    else if (v.phase === 'play') {
      res = await emit(actor.s, 'game:play', { cardId: v.hand.length ? pick(v.hand) : null });
      if (!res.ok) res = await emit(actor.s, 'game:play', { cardId: null });
    } else if (v.phase === 'choose') res = await emit(actor.s, 'game:choose', { cardId: pick(v.choice.options) });
    else if (v.phase === 'gostop') res = await emit(actor.s, 'game:stop');
    else { await sleep(5); continue; }
    expect(res).toMatchObject({ ok: true });
    await sleep(2);
  }
  await sleep(200);
}

describe('AI 봇 계정', () => {
  test('봇 아이디는 가입/로그인 불가, 예약어 차단', async () => {
    const a = await mk('human');
    await emit(a.s, 'room:practice');
    await sleep(100);
    const bot = await prisma.user.findFirst({ where: { isBot: true } });
    expect(bot.username.startsWith('AI봇')).toBe(true);
    expect((await post('/api/auth/login', { username: bot.username, password: '!' })).error).toBeDefined();
    expect((await post('/api/auth/register', { username: 'AI봇99', password: 'pw1234' })).error).toBeDefined();
    const ranking = await (await fetch(`${base}/api/auth/ranking`)).json();
    expect(ranking.ranking.some((u) => u.username.startsWith('AI봇'))).toBe(false);
    await emit(a.s, 'room:leave');
  });

  test('ranked 판정: 사람 2명 이상일 때만 실전', () => {
    const h = { bot: false };
    const b = { bot: true };
    expect(isRankedRoom({ players: [h, b] })).toBe(false);
    expect(isRankedRoom({ players: [h, b, b] })).toBe(false); // 무한 자본 AI 에게서 머니를 캐지 못하게
    expect(isRankedRoom({ players: [h, h, b] })).toBe(true);
    expect(isRankedRoom({ players: [h, h, b, b] })).toBe(true);
    expect(isRankedRoom({ players: [h, h] })).toBe(true);
  });
});

describe('AI 1:1 연습 – 머니/전적 무변동', () => {
  test('연습 판 3번: 자동 시작, 끝까지 진행, 유저·봇 DB 모두 불변', async () => {
    const a = await mk('prac');
    const before = await dbUser(a.user.id);
    const gamesBefore = await prisma.game.count();
    const r = await emit(a.s, 'room:practice');
    expect(r.ok).toBe(true);
    await sleep(150);
    expect(a.view).not.toBeNull(); // 준비 누르지 않아도 바로 시작
    expect(a.started[0].ranked).toBe(false);
    expect(a.room.ranked).toBe(false);
    expect(a.room.players.filter((p) => p.bot).length).toBe(1);

    for (let g = 0; g < 3; g++) {
      if (g > 0) { a.over = null; a.view = null; await emit(a.s, 'room:ready'); await sleep(100); expect(a.view).not.toBeNull(); }
      await playHumans([a]);
      expect(a.over.ranked).toBe(false);
      expect(a.over.payout).toBeNull();
    }
    const after = await dbUser(a.user.id);
    expect(after).toMatchObject({ money: before.money, wins: before.wins, losses: before.losses });
    expect(await prisma.game.count()).toBe(gamesBefore);
    const bot = await dbUser(a.room.players.find((p) => p.bot).id);
    expect(bot).toMatchObject({ money: 0, wins: 0, losses: 0, isBot: true });
    await emit(a.s, 'room:leave');
  });

  test('연습 방에서 나가면 방이 사라지고 봇은 다른 방에서 다시 쓸 수 있다', async () => {
    const a = await mk('prac');
    await emit(a.s, 'room:practice');
    await sleep(100);
    const roomId = a.roomId;
    const botName = a.room.players.find((p) => p.bot).username;
    await emit(a.s, 'room:leave');
    await sleep(100);
    expect(a.rooms.some((x) => x.id === roomId)).toBe(false);
    const b = await mk('prac');
    await emit(b.s, 'room:practice');
    await sleep(100);
    expect(b.room.players.find((p) => p.bot).username).toBe(botName);
    await emit(b.s, 'room:leave');
  });

  test('이미 방에 있으면 연습 시작 불가 · 동시에 두 명이 시작해도 서로 다른 봇', async () => {
    const [a, b] = [await mk('prac'), await mk('prac')];
    const [r1, r2] = await Promise.all([emit(a.s, 'room:practice'), emit(b.s, 'room:practice')]);
    expect(r1.ok && r2.ok).toBe(true);
    await sleep(150);
    const ba = a.room.players.find((p) => p.bot);
    const bb = b.room.players.find((p) => p.bot);
    expect(ba.id).not.toBe(bb.id);
    expect((await emit(a.s, 'room:practice')).ok).toBe(false);
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });
});

describe('유저 2 + AI 1 – 실전 랭크', () => {
  test('유저 머니·전적은 정상 증감, 봇은 면제', async () => {
    const [a, b] = [await mk('rk'), await mk('rk')];
    expect((await emit(a.s, 'room:create', { name: 'ranked', bet: 100 })).ok).toBe(true);
    await sleep(50);
    expect((await emit(b.s, 'room:join', { roomId: a.roomId })).ok).toBe(true);
    // 방장이 아닌 사람은 봇을 못 넣는다
    expect((await emit(b.s, 'room:addBot')).ok).toBe(false);
    expect((await emit(a.s, 'room:addBot')).ok).toBe(true);
    await sleep(100);
    expect(a.room.players.length).toBe(3);
    expect(a.room.ranked).toBe(true);
    const bot = a.room.players.find((p) => p.bot);
    expect(bot.ready).toBe(true);

    let decisive = 0;
    let botNet = 0;
    for (let g = 0; g < 12 && decisive < 4; g++) {
      a.over = b.over = null; a.view = b.view = null;
      const before = [await dbUser(a.user.id), await dbUser(b.user.id)];
      await emit(a.s, 'room:ready');
      await emit(b.s, 'room:ready');
      await sleep(150);
      expect(a.view).not.toBeNull(); // 사람 둘만 준비하면 시작 (봇은 항상 준비)
      expect(a.started.at(-1).ranked).toBe(true);
      await playHumans([a, b]);
      expect(a.over.ranked).toBe(true);
      const after = [await dbUser(a.user.id), await dbUser(b.user.id)];
      const botRow = await dbUser(bot.id);
      expect(botRow).toMatchObject({ money: 0, wins: 0, losses: 0 });
      expect(after.every((u) => u.money >= 0)).toBe(true);
      const delta = after.map((u, i) => u.money - before[i].money);
      botNet -= delta[0] + delta[1];
      if (!a.over.result.draw) {
        decisive++;
        expect(a.over.payout.gameId).toBeDefined();
        expect(after[0].wins + after[0].losses + after[1].wins + after[1].losses)
          .toBeGreaterThan(before[0].wins + before[0].losses + before[1].wins + before[1].losses);
      }
    }
    expect(decisive).toBeGreaterThan(0);
    // 사람 머니는 봇과 주고받아 제로섬이 아니어도 된다 (봇 자본은 무한) — 단 봇 행은 그대로
    expect(Number.isFinite(botNet)).toBe(true);
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });

  test('4인(유저2+AI2)도 진행되고, 봇 제거/가득 참 처리', async () => {
    const [a, b] = [await mk('rk4'), await mk('rk4')];
    await emit(a.s, 'room:create', { name: 'four', bet: 100 });
    await sleep(50);
    await emit(b.s, 'room:join', { roomId: a.roomId });
    expect((await emit(a.s, 'room:addBot')).ok).toBe(true);
    expect((await emit(a.s, 'room:addBot')).ok).toBe(true);
    expect((await emit(a.s, 'room:addBot')).ok).toBe(false); // 가득 참
    await sleep(100);
    expect(a.room.players.length).toBe(4);
    await emit(a.s, 'room:ready');
    await emit(b.s, 'room:ready');
    await sleep(150);
    expect(a.view.active.length).toBe(3);
    await playHumans([a, b]);
    expect(a.over.ranked).toBe(true);
    expect((await emit(a.s, 'room:removeBot', {})).ok).toBe(true);
    expect(a.room.players.length).toBe(3);
    for (const c of [a, b]) await emit(c.s, 'room:leave');
  });

  test('유저 1명이 이탈하면 봇만 남은 방이 아니라 남은 유저에게 정산', async () => {
    const [a, b] = [await mk('lv'), await mk('lv')];
    await emit(a.s, 'room:create', { name: 'leave', bet: 100 });
    await sleep(50);
    await emit(b.s, 'room:join', { roomId: a.roomId });
    await emit(a.s, 'room:addBot');
    await sleep(80);
    await emit(a.s, 'room:ready');
    await emit(b.s, 'room:ready');
    await sleep(150);
    await emit(b.s, 'room:leave');
    await sleep(300);
    expect(a.over?.result.forfeit).toBe(true);
    expect(a.over.ranked).toBe(true); // 이탈 시점엔 유저 2명이었으므로 실전 정산
    await emit(a.s, 'room:leave');
  });
});

describe('타짜 이모트 매크로', () => {
  test('SEND_EMOTE → 같은 방 전원에게 BROADCAST_EMOTE, 목록 밖 문구·방 밖은 거부', async () => {
    const [a, b] = [await mk('em'), await mk('em')];
    const got = { a: [], b: [] };
    a.s.on('BROADCAST_EMOTE', (e) => got.a.push(e));
    b.s.on('BROADCAST_EMOTE', (e) => got.b.push(e));
    const outsider = await mk('em');
    const out = [];
    outsider.s.on('BROADCAST_EMOTE', (e) => out.push(e));
    expect((await emit(a.s, 'SEND_EMOTE', { text: '싸늘하다...' })).ok).toBe(false); // 방 밖
    await emit(a.s, 'room:create', { name: 'emote', bet: 100 });
    await sleep(50);
    await emit(b.s, 'room:join', { roomId: a.roomId });
    expect((await emit(a.s, 'SEND_EMOTE', { text: '묻고 더블로 가!' })).ok).toBe(true);
    expect((await emit(b.s, 'SEND_EMOTE', { text: '<img src=x onerror=alert(1)>' })).ok).toBe(false);
    await sleep(100);
    expect(got.a).toHaveLength(1);
    expect(got.b).toHaveLength(1);
    expect(got.b[0]).toMatchObject({ userId: a.user.id, text: '묻고 더블로 가!' });
    expect(out).toHaveLength(0);
    for (const c of [a, b]) await emit(c.s, 'room:leave');
  });
});

describe('관전(Spectator) 모드', () => {
  async function playingRoom(n = 3) {
    const cs = [];
    for (let i = 0; i < n; i++) cs.push(await mk('sp'));
    await emit(cs[0].s, 'room:create', { name: 'watch', bet: 100 });
    await sleep(50);
    for (const c of cs.slice(1)) await emit(c.s, 'room:join', { roomId: cs[0].roomId });
    for (const c of cs) await emit(c.s, 'room:ready');
    await sleep(200);
    return cs;
  }

  test('대기 중이고 자리가 있으면 관전 불가, 가득 찬 방/진행 중인 방은 관전 가능', async () => {
    const [a, b, c, d] = [await mk('sp'), await mk('sp'), await mk('sp'), await mk('sp')];
    const w = await mk('sp');
    await emit(a.s, 'room:create', { name: 'w', bet: 100 });
    await sleep(50);
    expect((await emit(w.s, 'room:spectate', { roomId: a.roomId })).ok).toBe(false); // 아직 자리 있음
    for (const x of [b, c, d]) await emit(x.s, 'room:join', { roomId: a.roomId });
    const r = await emit(w.s, 'room:spectate', { roomId: a.roomId }); // 4/4 가득
    expect(r.ok).toBe(true);
    await sleep(100);
    expect(w.sync.role).toBe('spectator');
    expect(w.room.spectators.map((x) => x.id)).toEqual([w.user.id]);
    expect(w.room.players.some((p) => p.id === w.user.id)).toBe(false);
    expect((await emit(w.s, 'room:ready')).ok).toBe(false);
    expect((await emit(w.s, 'room:spectate', { roomId: a.roomId })).ok).toBe(false); // 이미 참여 중
    await emit(w.s, 'room:leave');
    for (const x of [a, b, c, d]) await emit(x.s, 'room:leave');
  });

  test('관전자는 전체 상태를 받지만 손패는 없고, 조작·턴·정산에서 완전히 배제된다', async () => {
    const cs = await playingRoom(3);
    const s = await mk('spec');
    expect((await emit(s.s, 'room:spectate', { roomId: cs[0].roomId })).ok).toBe(true);
    await sleep(100);
    // 관전자 동기화: 손패 없음, 상대 손패 비노출, active 에 포함되지 않음
    const v = s.sync.view;
    expect(s.sync.role).toBe('spectator');
    expect(v.hand).toEqual([]);
    expect(v).not.toHaveProperty('hands');
    expect(v.active).not.toContain(s.user.id);
    expect(Object.keys(v.handCounts).length).toBe(3);
    expect(v.choice).toBeNull();

    // 모든 조작 이벤트 차단: 진행 상태가 그대로
    const turnBefore = cs.find((c) => c.view)?.view.turn;
    const hand = cs[0].view.hand[0];
    for (const [ev, p] of [['game:play', { cardId: hand }], ['game:play', { cardId: null }], ['game:choose', { cardId: 1 }], ['game:go'], ['game:stop'], ['game:sellGwang'], ['game:passGwang'], ['game:chongtong'], ['game:passChongtong']]) {
      const r = await emit(s.s, ev, p);
      expect(r.ok).toBe(false);
    }
    expect((await emit(s.s, 'SEND_EMOTE', { text: '싸늘하다...' })).ok).toBe(false);
    expect((await emit(s.s, 'room:addBot')).ok).toBe(false);
    expect((await emit(s.s, 'room:options', { opts: { bonus: true } })).ok).toBe(false);
    await sleep(100);
    expect(cs[0].view.turn).toBe(turnBefore);

    // 관전자도 진행 프레임을 계속 받는다
    let frames = 0;
    s.s.on('game:frames', ({ frames: f }) => { frames += f.length; expect(f[0].hand).toEqual([]); });
    const before = (await dbUser(s.user.id)).money;
    await playHumans(cs);
    expect(frames).toBeGreaterThan(0);
    // 정산에는 관전자가 없다
    expect(cs[0].over.result.payments.every((p) => p.from !== s.user.id && p.to !== s.user.id)).toBe(true);
    expect(cs[0].over.payout?.delta?.[s.user.id]).toBeUndefined();
    expect((await dbUser(s.user.id)).money).toBe(before);
    // 판이 끝나도 관전자는 방에 남고, 다음 판 참가자 명단(players)에는 들어가지 않는다
    expect(cs[0].room.spectators.length).toBe(1);
    expect(cs[0].room.players.length).toBe(3);
    for (const c of cs) await emit(c.s, 'room:ready');
    await sleep(200);
    expect(cs[0].view.active).not.toContain(s.user.id);
    await emit(s.s, 'room:leave');
    for (const c of cs) await emit(c.s, 'room:leave');
  });

  test('관전자가 나가도 판은 계속(기권 없음), 플레이어가 모두 나가면 관전자는 로비로', async () => {
    const cs = await playingRoom(2);
    const s = await mk('spec');
    await emit(s.s, 'room:spectate', { roomId: cs[0].roomId });
    await sleep(100);
    await emit(s.s, 'room:leave');
    await sleep(100);
    expect(cs[0].over).toBeNull(); // 기권 처리 안 됨
    expect(cs[0].room.spectators.length).toBe(0);
    await emit(s.s, 'room:spectate', { roomId: cs[0].roomId });
    await sleep(100);
    expect(s.room?.spectators.length).toBe(1);
    await emit(cs[0].s, 'room:leave');
    await emit(cs[1].s, 'room:leave');
    await sleep(300);
    expect(s.room).toBeNull(); // room:left 로 로비 복귀
    expect(s.rooms.every((r) => r.id !== cs[0].roomId)).toBe(true);
  });
});
