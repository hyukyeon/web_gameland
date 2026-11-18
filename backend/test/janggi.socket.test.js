import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.BOT_DELAY_SCALE = '0.02';
process.env.JANGGI_TURN_MS = '600';
process.env.JANGGI_SETUP_MS = '400';
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
async function until(fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(15);
  }
  throw new Error('timeout');
}

async function mk(name = 'jg') {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  const s = ioc(base, { auth: { token: r.token }, forceNew: true });
  sockets.push(s);
  const c = { s, user: r.user, view: null, room: null, over: null, turns: [], emotes: [], sync: null, moves: [] };
  s.on('janggi:start', (m) => { c.view = m.view; c.over = null; });
  s.on('janggi:state', (m) => { c.view = m.view; c.moves.push(m.move); });
  s.on('janggi:over', (o) => (c.over = o));
  s.on('TURN_START', (t) => c.turns.push(t));
  s.on('room:joined', ({ room }) => (c.room = room));
  s.on('room:state', (rm) => (c.room = rm));
  s.on('SYNC_BOARD_STATE', (p) => { c.sync = p; if (p.janggi) c.view = p.janggi.view; });
  s.on('BROADCAST_EMOTE', (e) => c.emotes.push(e));
  await new Promise((res) => s.on('connect', res));
  await sleep(40);
  return c;
}

const mine = (c) => c.user.id;

async function room(n) {
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(await mk());
  expect((await emit(cs[0].s, 'room:create', { game: 'janggi', bet: 100 })).ok).toBe(true);
  await until(() => cs[0].room);
  expect(cs[0].room.game).toBe('janggi');
  expect(cs[0].room.max).toBe(2);
  for (const c of cs.slice(1)) expect((await emit(c.s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(true);
  for (const c of cs) await emit(c.s, 'room:ready');
  await until(() => cs.every((c) => c.view));
  return cs;
}

const byId = (cs, id) => cs.find((c) => mine(c) === id);

describe('장기 소켓', () => {
  test('두 사람: 상차림 → 초 먼저 → 차례·관전 검증 → 기권으로 끝 → 참가비 정산 → 다음 판은 초·한 바꿈', async () => {
    const cs = await room(2);
    const [a] = cs;
    expect(a.view.phase).toBe('setup');
    const cho = byId(cs, a.view.pids[0]);
    const han = byId(cs, a.view.pids[1]);
    expect(mine(cho)).toBe(mine(cs[0])); // 첫 판은 방장이 초
    expect((await emit(cho.s, 'janggi:move', { from: 0, to: 1 })).ok).toBe(false); // 상차림 전
    expect((await emit(cho.s, 'janggi:setup', { formation: '없는것' })).ok).toBe(false);
    expect((await emit(cho.s, 'janggi:setup', { formation: '마상상마' })).ok).toBe(true);
    expect((await emit(han.s, 'janggi:setup', { formation: '상마마상' })).ok).toBe(true);
    await until(() => a.view.phase === 'playing');
    expect(a.view.formation).toEqual({ cho: '마상상마', han: '상마마상' });
    expect(a.view.turn).toBe(mine(cho));
    const m = a.view.legal[0];
    expect((await emit(han.s, 'janggi:move', m)).ok).toBe(false); // 한은 아직
    expect((await emit(cho.s, 'janggi:move', { from: m.from, to: 89 })).ok).toBe(false); // 둘 수 없는 수
    expect((await emit(cho.s, 'janggi:move', m)).ok).toBe(true);
    await until(() => a.view.turn === mine(han));
    expect(a.moves.at(-1)).toMatchObject({ from: m.from, to: m.to, side: 'cho' });
    expect((await emit(han.s, 'janggi:pass')).ok).toBe(true); // 한수 쉼
    await until(() => a.view.turn === mine(cho));
    expect((await emit(cho.s, 'janggi:resign')).ok).toBe(true);
    await until(() => cho.over && han.over);
    expect(han.over.janggi).toBe(true);
    expect(han.over.result).toMatchObject({ winner: mine(han), kind: 'resign' });
    expect((await row(mine(han))).money).toBe(100100);
    expect((await row(mine(cho))).money).toBe(99900);
    expect(await prisma.game.count({ where: { roomName: { startsWith: '[장기]' } } })).toBeGreaterThanOrEqual(1);
    // 다음 판: 초·한 바꿈
    await until(() => a.room.status === 'waiting');
    for (const c of cs) c.view = null;
    for (const c of cs) await emit(c.s, 'room:ready');
    await until(() => cs.every((c) => c.view));
    expect(a.view.pids[0]).toBe(mine(han));
    for (const c of cs) await emit(c.s, 'room:leave');
  });

  test('2명까지(3번째 거절), 관전자는 조작 불가, 전용 이모트, 상차림 시간 초과 → 기본 상차림, 재접속 동기화', async () => {
    const cs = await room(2);
    expect((await emit((await mk()).s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(false);
    const watcher = await mk();
    expect((await emit(watcher.s, 'room:spectate', { roomId: cs[0].room.id })).ok).toBe(true);
    expect((await emit(watcher.s, 'janggi:setup', { formation: '마상마상' })).ok).toBe(false);
    expect((await emit(cs[0].s, 'SEND_EMOTE', { text: '장군!' })).ok).toBe(true);
    expect((await emit(cs[0].s, 'SEND_EMOTE', { text: '요트다! ⛵' })).ok).toBe(false);
    await until(() => cs[1].emotes.length > 0);
    await until(() => cs[0].view.phase === 'playing'); // 아무도 안 골라도 시간이 지나면 시작
    expect(cs[0].view.formation).toEqual({ cho: '마상마상', han: '마상마상' });
    cs[1].sync = null;
    cs[1].s.emit('sync');
    await until(() => cs[1].sync);
    expect(cs[1].sync.janggi.view.phase).toBe('playing');
    for (const c of [...cs, watcher]) await emit(c.s, 'room:leave');
  });

  test('AI 대전: 사람이 가만히 있으면 시간 초과 → AI 대행 → 자동 진행으로 끝까지 (연습이라 머니 그대로)', async () => {
    const c = await mk();
    expect((await emit(c.s, 'room:practice', { game: 'janggi', level: 'easy', bots: 3, bet: 500 })).ok).toBe(true);
    await until(() => c.view);
    expect(c.view.pids).toHaveLength(2); // 장기는 1:1 — AI 는 한 명
    await until(() => c.over, 55000);
    expect(c.over.ranked).toBe(false);
    expect(['checkmate', 'bikjang', 'passes', 'limit']).toContain(c.over.result.kind);
    expect(c.turns.some((t) => t.game === 'janggi' && t.auto)).toBe(true);
    expect((await row(mine(c))).money).toBe(100000);
    await emit(c.s, 'room:leave');
  });
});
