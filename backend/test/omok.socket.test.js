import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.BOT_DELAY_SCALE = '0.02';
process.env.OMOK_TURN_MS = '600';
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

async function mk(name = 'om') {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  const s = ioc(base, { auth: { token: r.token }, forceNew: true });
  sockets.push(s);
  const c = { s, user: r.user, view: null, room: null, over: null, turns: [], emotes: [] };
  s.on('omok:start', (m) => { c.view = m.view; c.over = null; });
  s.on('omok:state', (m) => { c.view = m.view; });
  s.on('omok:over', (o) => (c.over = o));
  s.on('TURN_START', (t) => c.turns.push(t));
  s.on('room:joined', ({ room }) => (c.room = room));
  s.on('room:state', (rm) => (c.room = rm));
  s.on('SYNC_BOARD_STATE', (p) => { if (p.omok) c.view = p.omok; });
  s.on('BROADCAST_EMOTE', (e) => c.emotes.push(e));
  await new Promise((res) => s.on('connect', res));
  await sleep(40);
  return c;
}

const mine = (c) => c.user.id;
async function twoPlayerRoom() {
  const a = await mk('omA');
  const b = await mk('omB');
  expect((await emit(a.s, 'room:create', { game: 'omok', bet: 100 })).ok).toBe(true);
  await until(() => a.room);
  expect(a.room.game).toBe('omok');
  expect(a.room.max).toBe(2);
  expect((await emit(b.s, 'room:join', { roomId: a.room.id })).ok).toBe(true);
  const c = await mk('omC');
  expect((await emit(c.s, 'room:join', { roomId: a.room.id })).ok).toBe(false); // 3번째는 입장 불가
  await emit(a.s, 'room:ready');
  await emit(b.s, 'room:ready');
  await until(() => a.view && b.view);
  return { a, b };
}

describe('오목 소켓', () => {
  test('두 사람 대국: 턴 검증 → 5목 승리 → 참가비 정산', async () => {
    const { a, b } = await twoPlayerRoom();
    const byId = { [mine(a)]: a, [mine(b)]: b };
    const black = byId[a.view.black];
    const white = byId[a.view.white];
    expect(a.view.turn).toBe(mine(black));
    expect((await emit(white.s, 'omok:place', { x: 0, y: 0 })).ok).toBe(false); // 내 차례 아님
    expect((await emit(black.s, 'omok:place', { x: 99, y: 0 })).ok).toBe(false);
    expect((await emit(black.s, 'omok:place', { x: 7, y: 7 })).ok).toBe(true);
    expect((await emit(black.s, 'omok:place', { x: 7, y: 8 })).ok).toBe(false); // 연속 착수 불가
    expect((await emit(white.s, 'omok:place', { x: 7, y: 7 })).ok).toBe(false); // 이미 돌이 있음
    const before = { b: (await row(mine(black))).money, w: (await row(mine(white))).money };
    // 흑 가로 5목 (y=0), 백은 y=5 에 흩뿌림
    for (let i = 0; i < 4; i++) {
      await until(() => black.view.turn === mine(white));
      expect((await emit(white.s, 'omok:place', { x: i, y: 5 })).ok).toBe(true);
      await until(() => black.view.turn === mine(black));
      expect((await emit(black.s, 'omok:place', { x: i, y: 0 })).ok).toBe(true);
    }
    await until(() => black.view.turn === mine(white));
    expect((await emit(white.s, 'omok:place', { x: 9, y: 9 })).ok).toBe(true);
    await until(() => black.view.turn === mine(black));
    expect((await emit(black.s, 'omok:place', { x: 4, y: 0 })).ok).toBe(true);
    await until(() => a.over && b.over);
    expect(a.over.result).toMatchObject({ winner: mine(black), kind: 'five' });
    expect(a.over.ranked).toBe(true);
    expect((await row(mine(black))).money).toBe(before.b + 100);
    expect((await row(mine(white))).money).toBe(before.w - 100);
    // 끝난 뒤엔 착수 불가, 다시 준비하면 새 판(진 사람이 흑)
    expect((await emit(white.s, 'omok:place', { x: 1, y: 1 })).ok).toBe(false);
    await emit(a.s, 'room:ready');
    await emit(b.s, 'room:ready');
    await until(() => a.view.moveCount === 0 && a.view.phase === 'playing');
    expect(a.view.black).toBe(mine(white));
  });

  test('시간 초과: AI 가 한 수 대신 둔다', async () => {
    const { a, b } = await twoPlayerRoom();
    const first = a.view.turn === mine(a) ? a : b;
    await until(() => first.view.moveCount >= 1, 5000); // 600ms 뒤 AI 대행
    expect(first.view.last.pid).toBe(mine(first));
  });

  test('도중 퇴장(기권) → 상대 승리', async () => {
    const { a, b } = await twoPlayerRoom();
    await emit(a.s, 'room:leave');
    await until(() => b.over);
    expect(b.over.result).toMatchObject({ winner: mine(b), kind: 'forfeit' });
  });

  test('AI 연습: 판돈·전적 무변동, 봇이 응수한다', async () => {
    const a = await mk('omP');
    const money = (await row(mine(a))).money;
    expect((await emit(a.s, 'room:practice', { game: 'omok', level: 'hard', bet: 500 })).ok).toBe(true);
    await until(() => a.view);
    expect(a.room.ranked).toBe(false);
    const myTurn = () => a.view.turn === mine(a);
    await until(myTurn, 8000);
    const n0 = a.view.moveCount;
    const [fx, fy] = a.view.board[7][7] === 0 ? [7, 7] : [8, 8]; // 봇이 흑이면 이미 중앙에 둠
    expect((await emit(a.s, 'omok:place', { x: fx, y: fy })).ok).toBe(true);
    await until(() => a.view.moveCount >= n0 + 2 && myTurn(), 8000);
    expect(a.view.board.flat().filter(Boolean).length).toBe(a.view.moveCount);
    await emit(a.s, 'room:leave');
    expect((await row(mine(a))).money).toBe(money);
  });

  test('재접속하면 오목판을 그대로 복원한다', async () => {
    const { a, b } = await twoPlayerRoom();
    const first = a.view.turn === mine(a) ? a : b;
    await emit(first.s, 'omok:place', { x: 7, y: 7 });
    await until(() => a.view.moveCount === 1);
    const token = ioc(base, { auth: { token: (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: first.user.username, password: 'pw1234' }) })).json()).token }, forceNew: true });
    sockets.push(token);
    const snap = await new Promise((res) => token.on('SYNC_BOARD_STATE', (p) => p.omok && res(p.omok)));
    expect(snap.board[7][7]).not.toBe(0);
    expect(snap.moveCount).toBe(1);
  });
});

describe('오목 힌트·복기 분석·적응형 연습 (A7~A9)', () => {
  test('연습 판 힌트: 내 차례에만, 판당 3번, 합법 수를 알려 준다', async () => {
    const a = await mk('omH');
    expect((await emit(a.s, 'room:practice', { game: 'omok', level: 'hard', bet: 100 })).ok).toBe(true);
    await until(() => a.view);
    await until(() => a.view.turn === mine(a), 8000);
    const h = await emit(a.s, 'omok:hint');
    expect(h.ok).toBe(true);
    expect(h.left).toBe(2);
    expect(a.view.board[h.y][h.x]).toBe(0);
    expect((await emit(a.s, 'omok:hint')).left).toBe(1);
    expect((await emit(a.s, 'omok:hint')).left).toBe(0);
    const no = await emit(a.s, 'omok:hint');
    expect(no.ok).toBe(false);
    expect(no.error).toMatch(/모두/);
    await emit(a.s, 'room:leave');
  });

  test('실전(사람 2명)에서는 힌트가 거절된다', async () => {
    const { a, b } = await twoPlayerRoom();
    const first = a.view.turn === mine(a) ? a : b;
    const r = await emit(first.s, 'omok:hint');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/연습/);
  });

  test('적응형 연습: level auto + skill → 봇에 adaptive/skill 이 실린다', async () => {
    const a = await mk('omA2');
    expect((await emit(a.s, 'room:practice', { game: 'omok', level: 'auto', skill: 0.9, bet: 100 })).ok).toBe(true);
    await until(() => a.room?.players.some((p) => p.bot));
    const bot = a.room.players.find((p) => p.bot);
    expect(bot).toMatchObject({ adaptive: true, skill: 0.9, level: 'hard' });
    await emit(a.s, 'room:leave');
  });

  test('복기 분석: 결과의 수순을 보내면 실수를 짚어 준다 / 잘못된 기록은 거절', async () => {
    const a = await mk('omN');
    // 흑이 4목을 만들었는데 백이 막지 않은 기록
    const moves = [[7, 7], [7, 8], [8, 7], [8, 8], [9, 7], [3, 3], [10, 7], [3, 4], [11, 7]];
    const r = await emit(a.s, 'omok:analyze', { moves });
    expect(r.ok).toBe(true);
    expect(r.analysis.summary.white.blunders).toBeGreaterThanOrEqual(1);
    expect(r.analysis.rows.every((x) => x.n >= 2)).toBe(true);
    expect((await emit(a.s, 'omok:analyze', { moves: [[7, 7], [7, 7]] })).ok).toBe(false); // 같은 자리
    expect((await emit(a.s, 'omok:analyze', { moves: 'x' })).ok).toBe(false);
    expect((await emit(a.s, 'omok:analyze', { moves: Array(300).fill([0, 0]) })).ok).toBe(false);
  });
});
