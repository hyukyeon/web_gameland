import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.BOT_DELAY_SCALE = '0.02';
process.env.YUT_TURN_MS = '700';
jest.setTimeout(60000);

let server, base, prisma;
const sockets = [];
let seq = 0;

beforeAll(async () => {
  useTempDb();
  ({ prisma } = await import('../src/db.js'));
  const { createServer } = await import('../src/app.js');
  ({ server } = createServer());
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const row = (id) => prisma.user.findUnique({ where: { id } });
async function until(fn, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(15);
  }
  throw new Error('timeout');
}

async function mk(name = 'yt') {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  const s = ioc(base, { auth: { token: r.token }, forceNew: true });
  sockets.push(s);
  const c = { s, user: r.user, view: null, room: null, over: null, turns: [], emotes: [] };
  s.on('yut:start', (m) => { c.view = m.view; c.over = null; });
  s.on('yut:state', (m) => { c.view = m.view; });
  s.on('yut:over', (o) => (c.over = o));
  s.on('TURN_START', (t) => c.turns.push(t));
  s.on('room:joined', ({ room }) => (c.room = room));
  s.on('room:state', (rm) => (c.room = rm));
  s.on('SYNC_BOARD_STATE', (p) => { if (p.yut) c.view = p.yut; });
  s.on('BROADCAST_EMOTE', (e) => c.emotes.push(e));
  await new Promise((res) => s.on('connect', res));
  await sleep(40);
  return c;
}

const mine = (c) => c.user.id;
const byTurn = (cs, view) => cs.find((c) => mine(c) === view.turn);

async function room(n, extra = {}) {
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(await mk('yt'));
  expect((await emit(cs[0].s, 'room:create', { game: 'yut', bet: 100 })).ok).toBe(true);
  await until(() => cs[0].room);
  expect(cs[0].room.game).toBe('yut');
  expect(cs[0].room.max).toBe(4);
  for (const c of cs.slice(1)) expect((await emit(c.s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(true);
  if (n === 4) expect((await emit((await mk('yt')).s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(false); // 5번째는 입장 불가
  for (const c of cs) await emit(c.s, 'room:ready');
  await until(() => cs.every((c) => c.view));
  return cs;
}

describe('윷놀이 소켓', () => {
  test('두 사람 대국: 차례 검증 → 던지기 → 이동 → 끝까지 → 참가비 정산', async () => {
    const cs = await room(2);
    const [a, b] = cs;
    expect(a.view.phase).toBe('throw');
    const me = byTurn(cs, a.view);
    const other = cs.find((c) => c !== me);
    expect((await emit(other.s, 'yut:throw')).ok).toBe(false); // 내 차례 아님
    expect((await emit(me.s, 'yut:move', { pieceId: 0, index: 0 })).ok).toBe(false); // 아직 안 던짐
    const before = Object.fromEntries(await Promise.all(cs.map(async (c) => [mine(c), (await row(mine(c))).money])));
    // 끝날 때까지 서로 번갈아 (서버 시간 초과 AI 가 아니라 클라이언트 입장에서 직접)
    let guard = 0;
    while (!a.over && guard++ < 3000) {
      const v = a.view;
      const who = byTurn(cs, v);
      if (v.phase === 'throw') await emit(who.s, 'yut:throw');
      else if (v.phase === 'move') {
        const m = v.legal[0];
        const r = await emit(who.s, 'yut:move', { pieceId: m.pieceId, index: m.index });
        expect(r.ok).toBe(true);
      }
      await sleep(3);
    }
    await until(() => a.over && b.over);
    expect(a.over.result.kind).toBe('finish');
    expect(a.over.ranked).toBe(true);
    const win = a.over.result.winners[0];
    const lose = a.over.result.losers[0];
    expect((await row(win)).money).toBe(before[win] + 100);
    expect((await row(lose)).money).toBe(before[lose] - 100);
    expect((await emit(me.s, 'yut:throw')).ok).toBe(false); // 끝난 뒤엔 불가
  });

  test('시간 초과: AI 가 대신 던진다', async () => {
    const cs = await room(2);
    const first = byTurn(cs, cs[0].view);
    await until(() => first.view.lastThrow || first.view.turns > 1, 5000);
    expect(first.view.lastThrow).toBeTruthy();
  });

  test('2:2 — 같은 팀 두 명이 번갈아 던지고, 한 명이 나가도 팀이 계속한다', async () => {
    const cs = await room(4);
    const teams = cs[0].view.team;
    expect(Object.values(teams).filter((t) => t === 0)).toHaveLength(2);
    const leaver = cs[2]; // 방 순서 3번째 = 청팀 두 번째
    await emit(leaver.s, 'room:leave');
    await sleep(100);
    expect(cs[0].over).toBeNull();
    expect(cs[0].view.gone).toContain(mine(leaver));
    // 팀 전원(청)이 나가면 홍팀 승리
    await emit(cs[0].s, 'room:leave');
    await until(() => cs[1].over);
    expect(cs[1].over.result).toMatchObject({ kind: 'forfeit', winnerTeam: 1 });
  });

  test('도중 퇴장(기권) → 상대 승리 · 정산', async () => {
    const cs = await room(2);
    const [a, b] = cs;
    await emit(a.s, 'room:leave');
    await until(() => b.over);
    expect(b.over.result).toMatchObject({ kind: 'forfeit', winners: [mine(b)] });
  });

  test('AI 연습: 판돈 무변동, 봇이 이어서 던진다', async () => {
    const a = await mk('ytP');
    const money = (await row(mine(a))).money;
    expect((await emit(a.s, 'room:practice', { game: 'yut', level: 'hard', bet: 500 })).ok).toBe(true);
    await until(() => a.view);
    expect(a.room.ranked).toBe(false);
    let guard = 0;
    while (!a.over && guard++ < 4000) {
      const v = a.view;
      if (v.turn === mine(a)) {
        if (v.phase === 'throw') await emit(a.s, 'yut:throw');
        else if (v.phase === 'move') await emit(a.s, 'yut:move', { pieceId: v.legal[0].pieceId, index: v.legal[0].index });
      }
      await sleep(3);
    }
    await until(() => a.over, 20000);
    expect(a.over.ranked).toBe(false);
    expect((await row(mine(a))).money).toBe(money);
  });

  test('재접속하면 윷판을 그대로 복원한다', async () => {
    const cs = await room(2);
    const first = byTurn(cs, cs[0].view);
    await emit(first.s, 'yut:throw');
    await until(() => cs[0].view.lastThrow);
    const login = await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: first.user.username, password: 'pw1234' }) })).json();
    const s2 = ioc(base, { auth: { token: login.token }, forceNew: true });
    sockets.push(s2);
    const snap = await new Promise((res) => s2.on('SYNC_BOARD_STATE', (p) => p.yut && res(p.yut)));
    expect(snap.pieces).toHaveLength(8);
    expect(snap.lastThrow).toBeTruthy();
  });
});
