import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.BOT_DELAY_SCALE = '0.02';
process.env.YACHT_TURN_MS = '600';
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

async function mk(name = 'ya') {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  const s = ioc(base, { auth: { token: r.token }, forceNew: true });
  sockets.push(s);
  const c = { s, user: r.user, view: null, room: null, over: null, turns: [], emotes: [], sync: null };
  s.on('yacht:start', (m) => { c.view = m.view; c.over = null; });
  s.on('yacht:state', (m) => { c.view = m.view; });
  s.on('yacht:over', (o) => (c.over = o));
  s.on('TURN_START', (t) => c.turns.push(t));
  s.on('room:joined', ({ room }) => (c.room = room));
  s.on('room:state', (rm) => (c.room = rm));
  s.on('SYNC_BOARD_STATE', (p) => { c.sync = p; if (p.yacht) c.view = p.yacht; });
  s.on('BROADCAST_EMOTE', (e) => c.emotes.push(e));
  await new Promise((res) => s.on('connect', res));
  await sleep(40);
  return c;
}

const mine = (c) => c.user.id;

async function room(n) {
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(await mk());
  expect((await emit(cs[0].s, 'room:create', { game: 'yacht', bet: 100 })).ok).toBe(true);
  await until(() => cs[0].room);
  expect(cs[0].room.game).toBe('yacht');
  expect(cs[0].room.max).toBe(4);
  for (const c of cs.slice(1)) expect((await emit(c.s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(true);
  for (const c of cs) await emit(c.s, 'room:ready');
  await until(() => cs.every((c) => c.view));
  return cs;
}

/** 차례인 사람이 직접 한 단계: 안 굴렸으면 굴리고, 굴렸으면 점수가 가장 큰 빈 칸에 기록 */
async function act(cs) {
  const v = cs[0].view;
  if (!v || v.phase === 'ended') return false;
  const c = cs.find((x) => mine(x) === v.turn);
  let r;
  if (v.phase === 'roll') r = await emit(c.s, 'yacht:roll');
  else {
    const [cat] = Object.entries(v.options).sort((a, b) => b[1] - a[1])[0];
    r = await emit(c.s, 'yacht:score', { cat });
  }
  if (r.ok) await until(() => cs[0].view.seq !== v.seq, 3000).catch(() => {});
  return r.ok;
}

describe('요트 다이스 소켓', () => {
  test('두 사람: 차례 검증 → 굴리기 → 고정 → 다시 굴리기 → 기록 → 12라운드 끝까지 → 참가비 정산', async () => {
    const cs = await room(2);
    const [a, b] = cs;
    expect(a.view.phase).toBe('roll');
    expect(a.view.rounds).toBe(12);
    const turn = cs.find((c) => mine(c) === a.view.turn);
    const other = cs.find((c) => c !== turn);
    expect((await emit(other.s, 'yacht:roll')).ok).toBe(false);
    expect((await emit(turn.s, 'yacht:score', { cat: 'choice' })).ok).toBe(false); // 굴리기 전
    expect((await emit(turn.s, 'yacht:roll')).ok).toBe(true);
    await until(() => b.view.phase === 'decide');
    expect(b.view.dice.every((d) => d >= 1 && d <= 6)).toBe(true); // 굴린 결과는 모두에게 보인다
    const first = [...b.view.dice];
    // 고정은 다른 사람 화면에도 보인다
    expect((await emit(turn.s, 'yacht:hold', { held: [true, true, false, false, false] })).ok).toBe(true);
    await until(() => other.view.held[0] && other.view.held[1]);
    expect((await emit(other.s, 'yacht:hold', { held: [true, true, true, true, true] })).ok).toBe(false);
    // 고정 정보를 굴리기와 함께 보내도 된다
    expect((await emit(turn.s, 'yacht:roll', { held: [true, true, true, false, false] })).ok).toBe(true);
    await until(() => b.view.rollsLeft === 1);
    expect(b.view.dice.slice(0, 3)).toEqual(first.slice(0, 3));
    expect((await emit(turn.s, 'yacht:score', { cat: 'nope' })).ok).toBe(false);
    for (let i = 0; i < 300 && !a.over; i++) {
      if (!(await act(cs))) await sleep(30);
    }
    await until(() => a.over && b.over);
    expect(a.over.yacht).toBe(true);
    expect(a.over.ranked).toBe(true);
    const res = a.over.result;
    expect(res.turns).toBe(24);
    const [ua, ub] = [await row(mine(a)), await row(mine(b))];
    if (res.winners.length === 1) {
      const w = res.winners[0] === mine(a) ? ua : ub;
      const l = w === ua ? ub : ua;
      expect(w.money - 100000).toBe(100);
      expect(l.money - 100000).toBe(-100);
    } else expect(ua.money).toBe(100000);
    expect(await prisma.game.count({ where: { roomName: { startsWith: '[요트 다이스]' } } })).toBeGreaterThanOrEqual(1);
    await until(() => a.room.status === 'waiting');
    for (const c of cs) await emit(c.s, 'room:leave');
  });

  test('4명까지(5번째 거절), 관전자는 조작 불가, 전용 이모트, 재접속 동기화', async () => {
    const cs = [];
    for (let i = 0; i < 4; i++) cs.push(await mk());
    expect((await emit(cs[0].s, 'room:create', { game: 'yacht', bet: 100 })).ok).toBe(true);
    await until(() => cs[0].room);
    for (const c of cs.slice(1)) expect((await emit(c.s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(true);
    expect((await emit((await mk()).s, 'room:join', { roomId: cs[0].room.id })).ok).toBe(false);
    await emit(cs[3].s, 'room:leave');
    const three = cs.slice(0, 3);
    for (const c of three) await emit(c.s, 'room:ready');
    await until(() => three.every((c) => c.view));
    expect(Object.keys(three[0].view.sheets)).toHaveLength(3);
    const watcher = await mk();
    expect((await emit(watcher.s, 'room:spectate', { roomId: three[0].room.id })).ok).toBe(true);
    expect((await emit(watcher.s, 'yacht:roll')).ok).toBe(false);
    expect((await emit(three[0].s, 'SEND_EMOTE', { text: '요트다! ⛵' })).ok).toBe(true);
    expect((await emit(three[0].s, 'SEND_EMOTE', { text: '잭팟! 💰' })).ok).toBe(false);
    await until(() => three[1].emotes.length > 0);
    three[1].sync = null;
    three[1].s.emit('sync');
    await until(() => three[1].sync);
    expect(three[1].sync.yacht.pids).toHaveLength(3);
    for (const c of [...three, watcher]) await emit(c.s, 'room:leave');
  });

  test('AI 대전: AI 3명과 4인전, 사람이 가만히 있으면 시간 초과 → 자동 진행으로 끝까지 (연습이라 머니 그대로)', async () => {
    const c = await mk();
    expect((await emit(c.s, 'room:practice', { game: 'yacht', level: 'hard', bots: 3, bet: 500 })).ok).toBe(true);
    await until(() => c.view);
    expect(c.view.pids).toHaveLength(4);
    await until(() => c.over, 50000);
    expect(c.over.ranked).toBe(false);
    expect(c.over.result.turns).toBe(48);
    expect(c.turns.some((t) => t.game === 'yacht' && t.auto)).toBe(true);
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
