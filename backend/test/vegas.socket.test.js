import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.BOT_DELAY_SCALE = '0.02';
process.env.VEGAS_TURN_MS = '600';
process.env.VEGAS_ROUND_MS = '60';
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

async function mk(name = 'lv') {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  const s = ioc(base, { auth: { token: r.token }, forceNew: true });
  sockets.push(s);
  const c = { s, user: r.user, view: null, room: null, over: null, turns: [], emotes: [], sync: null };
  s.on('vegas:start', (m) => { c.view = m.view; c.over = null; });
  s.on('vegas:state', (m) => { c.view = m.view; });
  s.on('vegas:over', (o) => (c.over = o));
  s.on('TURN_START', (t) => c.turns.push(t));
  s.on('room:joined', ({ room }) => (c.room = room));
  s.on('room:state', (rm) => (c.room = rm));
  s.on('SYNC_BOARD_STATE', (p) => { c.sync = p; if (p.vegas) c.view = p.vegas; });
  s.on('BROADCAST_EMOTE', (e) => c.emotes.push(e));
  await new Promise((res) => s.on('connect', res));
  await sleep(40);
  return c;
}

const mine = (c) => c.user.id;

async function room(n) {
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(await mk());
  expect((await emit(cs[0].s, 'room:create', { game: 'vegas', bet: 100 })).ok).toBe(true);
  await until(() => cs[0].room);
  expect(cs[0].room.game).toBe('vegas');
  expect(cs[0].room.max).toBe(5);
  for (const c of cs.slice(1)) expect((await emit(c.s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(true);
  for (const c of cs) await emit(c.s, 'room:ready');
  await until(() => cs.every((c) => c.view));
  return cs;
}

/** 차례인 사람이 직접 한 단계 (굴리기 → 첫 번째 눈 놓기) */
async function act(cs) {
  const v = cs[0].view;
  if (!v || (v.phase !== 'roll' && v.phase !== 'place')) return false;
  const c = cs.find((x) => mine(x) === v.turn);
  const r = v.phase === 'roll' ? await emit(c.s, 'vegas:roll') : await emit(c.s, 'vegas:place', { value: v.legal[0] });
  if (r.ok) await until(() => cs[0].view.seq !== v.seq || cs[0].view.phase !== v.phase, 3000).catch(() => {});
  return r.ok;
}

describe('라스베가스 소켓', () => {
  test('두 사람: 차례 검증 → 굴리기 → 놓기 → 4라운드 끝까지 → 참가비 정산', async () => {
    const cs = await room(2);
    const [a, b] = cs;
    expect(a.view.phase).toBe('roll');
    expect(a.view.neutralPer).toBe(4);
    const turn = cs.find((c) => mine(c) === a.view.turn);
    const other = cs.find((c) => c !== turn);
    expect((await emit(other.s, 'vegas:roll')).ok).toBe(false);
    expect((await emit(turn.s, 'vegas:place', { value: 1 })).ok).toBe(false); // 굴리기 전
    expect((await emit(turn.s, 'vegas:roll')).ok).toBe(true);
    await until(() => a.view.phase === 'place' && b.view.roll);
    expect(b.view.roll.own).toHaveLength(8); // 굴린 결과는 모두에게 보인다
    expect((await emit(turn.s, 'vegas:place', { value: 9 })).ok).toBe(false);
    // 끝까지 직접 둔다
    for (let i = 0; i < 400 && !a.over; i++) {
      if (!(await act(cs))) await sleep(30);
    }
    await until(() => a.over && b.over);
    expect(a.over.vegas).toBe(true);
    expect(a.over.ranked).toBe(true);
    const res = a.over.result;
    expect(res.rounds).toBe(4);
    const [ua, ub] = [await row(mine(a)), await row(mine(b))];
    const start = 100000;
    if (res.winners.length === 1) {
      const w = res.winners[0] === mine(a) ? ua : ub;
      const l = w === ua ? ub : ua;
      expect(w.money - start).toBe(100);
      expect(l.money - start).toBe(-100);
    } else {
      expect(ua.money).toBe(start);
      expect(ub.money).toBe(start);
    }
    const games = await prisma.game.findMany({ where: { roomName: { startsWith: '[라스베가스]' } } });
    expect(games.length).toBeGreaterThanOrEqual(1);
    // 대기실로 돌아왔다
    await until(() => a.room.status === 'waiting');
    for (const c of cs) await emit(c.s, 'room:leave');
  });

  test('5명까지 입장(6번째 거절), 3인은 흰 주사위 2개, 관전자는 조작 불가, 전용 이모트', async () => {
    const cs = [];
    for (let i = 0; i < 5; i++) cs.push(await mk());
    expect((await emit(cs[0].s, 'room:create', { game: 'vegas', bet: 100 })).ok).toBe(true);
    await until(() => cs[0].room);
    for (const c of cs.slice(1)) expect((await emit(c.s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(true);
    const sixth = await mk();
    expect((await emit(sixth.s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(false);
    // 둘 나가고 3인으로 시작
    await emit(cs[3].s, 'room:leave');
    await emit(cs[4].s, 'room:leave');
    const three = cs.slice(0, 3);
    for (const c of three) await emit(c.s, 'room:ready');
    await until(() => three.every((c) => c.view));
    expect(three[0].view.neutralPer).toBe(2);
    expect(three[0].view.dice[mine(three[0])]).toEqual({ own: 8, neutral: 2 });
    const watcher = await mk();
    expect((await emit(watcher.s, 'room:spectate', { roomId: three[0].room.id })).ok).toBe(true);
    expect((await emit(watcher.s, 'vegas:roll')).ok).toBe(false);
    expect((await emit(three[0].s, 'SEND_EMOTE', { text: '잭팟! 💰' })).ok).toBe(true);
    expect((await emit(three[0].s, 'SEND_EMOTE', { text: '윷이다! 🎉' })).ok).toBe(false); // 다른 게임 이모트
    await until(() => three[1].emotes.length > 0);
    // 재접속 동기화에 라스베가스 상태
    three[1].sync = null;
    three[1].s.emit('sync');
    await until(() => three[1].sync);
    expect(three[1].sync.vegas.pids).toHaveLength(3);
    expect(three[1].sync.role).toBe('player');
    for (const c of [...three, watcher]) await emit(c.s, 'room:leave');
  });

  test('AI 대전: AI 4명과 5인전, 사람이 가만히 있으면 시간 초과 → 자동 진행으로 끝까지 (연습이라 머니 그대로)', async () => {
    const c = await mk();
    expect((await emit(c.s, 'room:practice', { game: 'vegas', level: 'hard', bots: 4, bet: 500 })).ok).toBe(true);
    await until(() => c.view);
    expect(c.view.pids).toHaveLength(5);
    expect(c.view.neutralPer).toBe(0);
    await until(() => c.over, 45000);
    expect(c.over.ranked).toBe(false);
    expect(c.over.result.rounds).toBe(4);
    expect(c.turns.some((t) => t.game === 'vegas' && t.auto)).toBe(true);
    expect((await row(mine(c))).money).toBe(100000);
    await emit(c.s, 'room:leave');
  });

  test('기권: 2인 판에서 나가면 남은 사람이 이긴다', async () => {
    const [a, b] = await room(2);
    await emit(a.s, 'room:leave');
    await until(() => b.over);
    expect(b.over.result.kind).toBe('forfeit');
    expect(b.over.result.winners).toEqual([mine(b)]);
    expect((await row(mine(b))).money).toBe(100100);
    await emit(b.s, 'room:leave');
  });
});
