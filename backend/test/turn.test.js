import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.GOSTOP_TURN_MS = '500';
process.env.BOT_DELAY_SCALE = '0.05';
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
async function mk() {
  const username = `tt${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  const s = ioc(base, { auth: { token: r.token }, forceNew: true });
  sockets.push(s);
  const c = { s, user: r.user, room: null, turns: [], chat: [], frames: 0, over: null, start: null };
  s.on('room:joined', ({ room }) => (c.room = room));
  s.on('room:state', (x) => (c.room = x));
  s.on('TURN_START', (t) => c.turns.push({ ...t, at: Date.now() }));
  s.on('room:chat', (m) => c.chat.push(m));
  s.on('game:start', (m) => (c.start = m));
  s.on('game:frames', () => c.frames++);
  s.on('game:over', (o) => (c.over = o));
  await new Promise((res) => s.on('connect', res));
  await sleep(40);
  return c;
}
const until = async (fn, ms) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) return false;
    await sleep(40);
  }
  return true;
};

describe('고스톱 차례 제한 시간 / AI 대행', () => {
  test('판 시작 시 기리 담당(cutter) 과 제한 시간이 내려온다', async () => {
    const a = await mk();
    const b = await mk();
    await emit(a.s, 'room:create', { name: 't', bet: 100 });
    await emit(b.s, 'room:join', { roomId: a.room.id });
    await emit(a.s, 'room:ready');
    await emit(b.s, 'room:ready');
    await until(() => a.turns.length > 0, 3000);
    expect([a.user.id, b.user.id]).toContain(a.start.cutter);
    const t = a.turns[0];
    expect(t.auto).toBe(false);
    // 기리 연출 + 시작 대기 + 제한 시간
    expect(t.deadlineAt - t.at).toBeGreaterThan(1800 + 1500 + 400);

    // 아무도 두지 않으면: 시간 초과 → AI 가 한 수 → 같은 사람이 연속으로 넘기면 자동 진행
    const ok = await until(() => a.room.players.some((p) => p.auto), 25000);
    expect(ok).toBe(true);
    expect(a.chat.some((m) => m.system && m.text.includes('시간 초과'))).toBe(true);
    expect(a.chat.some((m) => m.system && m.text.includes('자동 진행으로 전환'))).toBe(true);
    expect(a.frames).toBeGreaterThan(0); // AI 가 대신 둬서 판이 진행됨
    const autoId = a.room.players.find((p) => p.auto).id;
    const who = autoId === a.user.id ? a : b;
    // 자동 진행 중인 사람의 차례는 제한 시간 없이 AI 가 바로 둔다
    await until(() => a.turns.some((x) => x.userId === autoId && x.auto), 15000);
    expect(a.turns.filter((x) => x.userId === autoId && x.auto).every((x) => x.deadlineAt == null)).toBe(true);
    // 본인이 끄면 다시 직접 한다
    expect((await emit(who.s, 'room:auto', { on: false })).ok).toBe(true);
    await sleep(100);
    expect(a.room.players.find((p) => p.id === autoId).auto).toBe(false);
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });

  test('자동 진행을 직접 켜면 AI 가 끝까지 두고, 판이 끝나면 자동 진행은 꺼진다', async () => {
    const a = await mk();
    await emit(a.s, 'room:practice');
    expect((await emit(a.s, 'room:auto', { on: true })).ok).toBe(true);
    const ended = await until(() => a.over, 50000);
    expect(ended).toBe(true);
    await sleep(100);
    expect(a.room.players.find((p) => p.id === a.user.id).auto).toBe(false);
    await emit(a.s, 'room:leave');
  });
});
