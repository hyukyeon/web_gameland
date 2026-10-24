import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';
import { OmokGame } from '../src/omok/OmokGame.js';
import { forbiddenReason, newBoard } from '../src/omok/rules.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.BOT_DELAY_SCALE = '0.02';
process.env.OMOK_TURN_MS = '30000';
jest.setTimeout(60000);

describe('OmokGame: 무르기·뷰', () => {
  const g = () => new OmokGame([1, 2], { ante: 100, first: 1 });
  test('무르기: 내 마지막 수(상대가 뒤에 뒀으면 상대 수까지)를 되돌리고 내 차례가 된다', () => {
    const game = g();
    game.place(1, 7, 7);
    game.place(2, 7, 8);
    game.place(1, 8, 7);
    expect(game.undo(1)).toMatchObject({ ok: true, removed: 1 }); // 흑이 둔 직후 → 자기 수만
    expect(game.turn).toBe(1);
    expect(game.board[7][8]).toBe(0);
    game.place(1, 9, 9);
    game.place(2, 5, 5);
    expect(game.undo(1)).toMatchObject({ ok: true, removed: 2 }); // 백이 응수한 뒤 → 둘 다
    expect(game.turn).toBe(1);
    expect(game.moves).toHaveLength(2);
    expect(game.board[9][9]).toBe(0);
    expect(game.board[5][5]).toBe(0);
  });
  test('둔 수가 없거나 끝난 판은 무를 수 없다', () => {
    const game = g();
    expect(game.undo(2).ok).toBe(false);
    game.forfeit(1);
    expect(game.undo(1).ok).toBe(false);
  });
  test('무르면 금지수 캐시도 갱신된다', () => {
    const game = g();
    for (const [x, y] of [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]) game.board[y][x] = 1;
    game.moves.push({ x: 0, y: 0, pid: 2, color: 2 }, { x: 1, y: 0, pid: 1, color: 1 }, { x: 2, y: 0, pid: 2, color: 2 }); // 흑 차례가 되도록 가짜 이력
    game.turn = 1;
    game.cache = null;
    expect(game.view().forbidden.some(([x, y]) => x === 7 && y === 7)).toBe(true);
    game.turn = 2;
    game.cache = null;
    expect(game.view().forbidden).toEqual([]); // 백 차례엔 표시할 금지수가 없다
  });
  test('view: 수순·위협·결과의 수/소요 시간', () => {
    const game = g();
    game.place(1, 7, 7);
    game.place(2, 0, 0);
    expect(game.view().moves).toEqual([[7, 7], [0, 0]]);
    for (const [pid, x, y] of [[1, 8, 7], [2, 0, 1], [1, 9, 7], [2, 0, 2], [1, 10, 7], [2, 0, 3]]) game.place(pid, x, y);
    expect(game.view().threats.some((t) => t.color === 1 && t.kind === 'four')).toBe(true);
    game.place(1, 11, 7);
    expect(game.result).toMatchObject({ winner: 1, kind: 'five', moveCount: 9 });
    expect(game.result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(game.view().threats).toEqual([]);
  });
  test('쌍사(4-4)는 금지, 4-3 은 허용, 5목 완성은 4-4 여도 허용', () => {
    const b = newBoard();
    for (const [x, y] of [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]) b[y][x] = 1;
    expect(forbiddenReason(b, 7, 7)).toMatch(/쌍사/);
    const c = newBoard();
    for (const [x, y] of [[4, 7], [5, 7], [6, 7], [7, 5], [7, 6]]) c[y][x] = 1; // 가로 4 + 세로 열린 3
    expect(forbiddenReason(c, 7, 7)).toBeNull();
    const d = newBoard();
    for (const [x, y] of [[3, 7], [4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]) d[y][x] = 1; // (7,7) 가로 5목 + 세로 4
    expect(forbiddenReason(d, 7, 7)).toBeNull();
  });
  test('열린 4 하나는 쌍사가 아니다', () => {
    const b = newBoard();
    for (const x of [5, 6, 7]) b[7][x] = 1;
    expect(forbiddenReason(b, 8, 7)).toBeNull();
  });
});

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
async function mk(name = 'of') {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  const s = ioc(base, { auth: { token: r.token }, forceNew: true });
  sockets.push(s);
  const c = { s, token: r.token, user: r.user, view: null, room: null, over: null, undo: [], emotes: [], unlocked: [] };
  s.on('omok:start', (m) => { c.view = m.view; c.over = null; });
  s.on('omok:state', (m) => { c.view = m.view; });
  s.on('omok:over', (o) => (c.over = o));
  s.on('omok:undo', (u) => c.undo.push(u));
  s.on('room:joined', ({ room }) => (c.room = room));
  s.on('room:state', (rm) => (c.room = rm));
  s.on('BROADCAST_EMOTE', (e) => c.emotes.push(e));
  s.on('achievement:unlocked', (a) => c.unlocked.push(...a.achievements.map((x) => x.id)));
  await new Promise((res) => s.on('connect', res));
  await sleep(40);
  return c;
}
const id = (c) => c.user.id;
async function pair(opts = {}) {
  const a = await mk('ofA');
  const b = await mk('ofB');
  expect((await emit(a.s, 'room:create', { game: 'omok', bet: 100, ...opts })).ok).toBe(true);
  await until(() => a.room);
  expect((await emit(b.s, 'room:join', { roomId: a.room.id })).ok).toBe(true);
  await emit(a.s, 'room:ready');
  await emit(b.s, 'room:ready');
  await until(() => a.view && b.view);
  const byId = { [id(a)]: a, [id(b)]: b };
  return { a, b, black: byId[a.view.black], white: byId[a.view.white] };
}
const waitTurn = (c, who) => until(() => c.view.turn === id(who));

describe('오목 소켓: 무르기·기권·중복 방지·시간 설정 (C3·C7·C9)', () => {
  test('방 만들 때 고른 수당 시간(10/30/60초)이 방 정보에 실리고, 이상한 값은 기본값', async () => {
    const a = await mk('ofT');
    expect((await emit(a.s, 'room:create', { game: 'omok', bet: 100, turnSec: 10 })).ok).toBe(true);
    await until(() => a.room);
    expect(a.room.turnSec).toBe(10);
    expect(a.room.opts.turnSec).toBeUndefined();
    await emit(a.s, 'room:leave');
    const b = await mk('ofT');
    await emit(b.s, 'room:create', { game: 'omok', bet: 100, turnSec: 7 });
    await until(() => b.room);
    expect(b.room.turnSec).toBe(30);
  });

  test('수당 10초 방: TURN_START 의 마감이 약 10초', async () => {
    const { black } = await pair({ turnSec: 10 });
    const t = await new Promise((res) => {
      black.s.once('TURN_START', res);
      emit(black.s, 'omok:place', { x: 7, y: 7 });
    });
    expect(t.deadlineAt - Date.now()).toBeLessThanOrEqual(10100);
    expect(t.deadlineAt - Date.now()).toBeGreaterThan(8000);
  });

  test('요청 id 가 같은 착수가 다시 오면 한 번만 둔다', async () => {
    const { black, white } = await pair();
    const r1 = await emit(black.s, 'omok:place', { x: 7, y: 7, rid: 'r-1' });
    expect(r1.ok).toBe(true);
    const r2 = await emit(black.s, 'omok:place', { x: 7, y: 7, rid: 'r-1' });
    expect(r2).toMatchObject({ ok: true, dup: true });
    await waitTurn(white, white);
    expect(white.view.moveCount).toBe(1);
    // 다른 id 로 같은 자리는 거절 (차례도 아님)
    expect((await emit(black.s, 'omok:place', { x: 7, y: 7, rid: 'r-2' })).ok).toBe(false);
  });

  test('기권: 방에 남은 채로 상대가 이긴다', async () => {
    const { black, white } = await pair();
    expect((await emit(black.s, 'omok:resign')).ok).toBe(true);
    await until(() => white.over);
    expect(white.over.result).toMatchObject({ winner: id(white), kind: 'forfeit' });
    await sleep(50);
    expect(white.room.players).toHaveLength(2); // 나가지 않았다
    expect((await emit(black.s, 'omok:resign')).ok).toBe(false);
  });

  test('실전 무르기: 요청 → 상대 수락 → 되돌려지고 내 차례', async () => {
    const { black, white } = await pair();
    await emit(black.s, 'omok:place', { x: 7, y: 7 });
    await waitTurn(white, white);
    await emit(white.s, 'omok:place', { x: 7, y: 8 });
    await waitTurn(black, black);
    expect((await emit(white.s, 'omok:undoReply', { accept: true })).ok).toBe(false); // 요청이 없다
    const ask = await emit(black.s, 'omok:undo');
    expect(ask).toMatchObject({ ok: true, left: 1 });
    await until(() => white.undo.some((u) => u.state === 'ask' && u.from === id(black)));
    expect((await emit(black.s, 'omok:undo')).ok).toBe(false); // 이미 요청 중
    expect((await emit(black.s, 'omok:undoReply', { accept: true })).ok).toBe(false); // 본인은 응답 불가
    expect((await emit(white.s, 'omok:undoReply', { accept: true })).ok).toBe(true);
    await until(() => black.view.moveCount === 0);
    expect(black.view.turn).toBe(id(black));
    expect(black.undo.at(-1).state).toBe('granted');
    await emit(black.s, 'omok:place', { x: 6, y: 6 }); // 다시 둘 수 있다
    await until(() => white.view.moveCount === 1);
  });

  test('실전 무르기: 둔 수가 없으면 거절 / 상대가 거절하면 그대로 / 요청 중 착수하면 취소 / 사람당 2번까지', async () => {
    const { black, white } = await pair();
    await emit(black.s, 'omok:place', { x: 7, y: 7 });
    await waitTurn(white, white);
    expect(await emit(white.s, 'omok:undo')).toMatchObject({ ok: false, error: expect.stringMatching(/둔 수/) });
    await emit(white.s, 'omok:place', { x: 7, y: 8 });
    await waitTurn(black, black);
    // 1) 거절
    expect((await emit(black.s, 'omok:undo')).ok).toBe(true);
    await until(() => white.undo.some((u) => u.state === 'ask'));
    expect((await emit(white.s, 'omok:undoReply', { accept: false })).ok).toBe(true);
    await until(() => black.undo.some((u) => u.state === 'declined'));
    expect(black.view.moveCount).toBe(2);
    // 2) 요청한 뒤 내가 그냥 두면 요청은 취소된다
    black.undo.length = 0;
    expect((await emit(black.s, 'omok:undo')).ok).toBe(true);
    await emit(black.s, 'omok:place', { x: 8, y: 8 });
    await until(() => black.undo.some((u) => u.state === 'expired'));
    expect((await emit(white.s, 'omok:undoReply', { accept: true })).ok).toBe(false);
    // 3) 2번을 썼으니 세 번째는 거절
    await waitTurn(white, white);
    await emit(white.s, 'omok:place', { x: 9, y: 9 });
    await waitTurn(black, black);
    const third = await emit(black.s, 'omok:undo');
    expect(third.ok).toBe(false);
    expect(third.error).toMatch(/2번/);
  });

  test('AI 연습 무르기: 바로 되돌리고 판당 3번까지', async () => {
    const a = await mk('ofP');
    expect((await emit(a.s, 'room:practice', { game: 'omok', level: 'easy', bet: 100 })).ok).toBe(true);
    await until(() => a.view);
    for (let n = 0; n < 3; n++) {
      await until(() => a.view.turn === id(a), 8000);
      const before = a.view.moveCount;
      expect((await emit(a.s, 'omok:place', { x: 1 + n * 4, y: 13 })).ok).toBe(true);
      await until(() => a.view.moveCount >= before + 2 && a.view.turn === id(a), 8000);
      const u = await emit(a.s, 'omok:undo');
      expect(u).toMatchObject({ ok: true, left: 2 - n });
      await until(() => a.view.moveCount === before, 3000);
      expect(a.view.turn).toBe(id(a));
    }
    await until(() => a.view.turn === id(a), 8000);
    expect((await emit(a.s, 'omok:place', { x: 13, y: 13 })).ok).toBe(true);
    await until(() => a.view.turn === id(a) && a.view.moveCount >= 2, 8000);
    const no = await emit(a.s, 'omok:undo');
    expect(no.ok).toBe(false);
    expect(no.error).toMatch(/3번/);
    await emit(a.s, 'room:leave');
  });

  test('관전자는 무르기·기권을 할 수 없다', async () => {
    const { a, black } = await pair();
    const sp = await mk('ofS');
    await emit(sp.s, 'room:spectate', { roomId: a.room.id });
    await sleep(80);
    expect((await emit(sp.s, 'omok:undo')).ok).toBe(false);
    expect((await emit(sp.s, 'omok:resign')).ok).toBe(false);
    void black;
  });

  test('오목 전용 이모티콘만 오목 방에서 보낼 수 있다', async () => {
    const { black } = await pair();
    expect((await emit(black.s, 'SEND_EMOTE', { text: '좋은 수네요 👍' })).ok).toBe(true);
    expect((await emit(black.s, 'SEND_EMOTE', { text: '아무말' })).ok).toBe(false);
    const g = await mk('ofG');
    await emit(g.s, 'room:create', { game: 'seotda', bet: 100 });
    await until(() => g.room);
    expect((await emit(g.s, 'SEND_EMOTE', { text: '좋은 수네요 👍' })).ok).toBe(false); // 섯다 방에선 불가
  });
});

describe('오목 방 정리 (Q4)', () => {
  test('연습 판에서 나가 방이 닫히면 AI 가 혼자 계속 두지 않는다', async () => {
    const a = await mk('ofQ');
    await emit(a.s, 'room:practice', { game: 'omok', level: 'hard', bet: 100 });
    await until(() => a.view);
    await emit(a.s, 'room:leave');
    await sleep(300); // 계산 중이던 수가 끝날 시간
    const snap = async () => (await (await fetch(`${base}/api/metrics/omok`)).json()).ai.moves;
    const n0 = await snap();
    await sleep(800);
    expect(await snap()).toBe(n0);
  });
});

describe('오목 전적·업적·랭킹·지표 (C5·Q5)', () => {
  async function finishFive(black, white) {
    for (let i = 0; i < 4; i++) {
      await waitTurn(black, black);
      expect((await emit(black.s, 'omok:place', { x: i, y: 0 })).ok).toBe(true);
      await waitTurn(white, white);
      expect((await emit(white.s, 'omok:place', { x: i, y: 5 })).ok).toBe(true);
    }
    await waitTurn(black, black);
    expect((await emit(black.s, 'omok:place', { x: 4, y: 0 })).ok).toBe(true);
    await until(() => black.over && white.over);
  }

  test('실전 승패가 ogWins/ogLosses/연승에 쌓이고 첫 승 업적이 열린다', async () => {
    const { a, b, black, white } = await pair();
    await finishFive(black, white);
    const w = await row(id(black));
    const l = await row(id(white));
    expect(w).toMatchObject({ ogGames: 1, ogWins: 1, ogLosses: 0, ogStreak: 1, ogBestStreak: 1, ogFastWin: 9 });
    expect(l).toMatchObject({ ogGames: 1, ogWins: 0, ogLosses: 1, ogStreak: 0 });
    expect(JSON.parse(w.achievements)).toContain('og_first');
    await until(() => black.unlocked.includes('og_first'));
    expect(white.unlocked).not.toContain('og_first');
    // 고스톱/섯다 전적은 그대로
    expect(w).toMatchObject({ wins: 0, losses: 0, sdWins: 0 });
    void a; void b;
  });

  test('3연승 업적 · 패배하면 연승 초기화', async () => {
    const { a, b } = await pair();
    const byId = { [id(a)]: a, [id(b)]: b };
    let winnerId = null;
    for (let g = 0; g < 3; g++) {
      if (g > 0) {
        await emit(a.s, 'room:ready');
        await emit(b.s, 'room:ready');
        await until(() => a.view.moveCount === 0 && a.view.phase === 'playing' && !a.over);
      }
      // 같은 사람이 이기도록: 진 사람이 다음 판 흑이므로, 이길 사람이 백일 땐 흑이 5목을 못 만들게 하고 백이 5목
      const black = byId[a.view.black];
      const white = byId[a.view.white];
      winnerId ??= id(black);
      const win = byId[winnerId];
      const lose = win === black ? white : black;
      for (let i = 0; i < 4; i++) {
        const [p1, p2] = [black, white];
        await waitTurn(p1, p1);
        expect((await emit(p1.s, 'omok:place', win === p1 ? { x: i, y: 0 } : { x: i, y: 14 })).ok).toBe(true);
        await waitTurn(p2, p2);
        expect((await emit(p2.s, 'omok:place', win === p2 ? { x: i, y: 0 + 2 } : { x: i, y: 12 })).ok).toBe(true);
      }
      await waitTurn(black, black);
      if (win === black) await emit(black.s, 'omok:place', { x: 4, y: 0 });
      else {
        await emit(black.s, 'omok:place', { x: 9, y: 9 });
        await waitTurn(white, white);
        await emit(white.s, 'omok:place', { x: 4, y: 2 });
      }
      await until(() => a.over && b.over && a.over.result.winner === id(win));
      a.over = null;
      b.over = null;
      void lose;
    }
    const w = await row(winnerId);
    expect(w).toMatchObject({ ogWins: 3, ogStreak: 3, ogBestStreak: 3 });
    expect(JSON.parse(w.achievements)).toEqual(expect.arrayContaining(['og_first', 'og_streak3']));
  });

  test('AI 연습: 전적은 그대로, AI 승리(ogBotWins)만 센다', async () => {
    const a = await mk('ofB');
    await emit(a.s, 'room:practice', { game: 'omok', level: 'easy', bet: 100 });
    await until(() => a.view);
    await emit(a.s, 'omok:resign'); // 졌다 → AI 승리는 안 오른다
    await until(() => a.over);
    expect(await row(id(a))).toMatchObject({ ogGames: 0, ogWins: 0, ogLosses: 0, ogBotWins: 0 });
    await emit(a.s, 'room:leave');
  });

  test('랭킹 ?game=omok: 승수순, 승이 없으면 제외', async () => {
    const r = await (await fetch(`${base}/api/auth/ranking?game=omok`)).json();
    expect(r.game).toBe('omok');
    expect(r.ranking.length).toBeGreaterThan(0);
    expect(r.ranking.every((u) => u.ogWins > 0)).toBe(true);
    const wins = r.ranking.map((u) => u.ogWins);
    expect([...wins].sort((x, y) => y - x)).toEqual(wins);
  });

  test('내 통계에 omok 가 포함된다', async () => {
    const a = await mk('ofSt');
    const stats = await (await fetch(`${base}/api/auth/stats`, { headers: { authorization: `Bearer ${a.token}` } })).json();
    expect(stats.stats.omok).toMatchObject({ games: 0, wins: 0, losses: 0, streak: 0 });
  });

  test('지표 API: 게임 수·평균 수·종료 방식·무르기 집계', async () => {
    const m = await (await fetch(`${base}/api/metrics/omok`)).json();
    expect(m.games).toBeGreaterThanOrEqual(3);
    expect(m.byKind.five).toBeGreaterThanOrEqual(1);
    expect(m.byKind.forfeit).toBeGreaterThanOrEqual(1);
    expect(m.avgMoves).toBeGreaterThan(0);
    expect(m.undos.granted).toBeGreaterThanOrEqual(1);
    expect(m.timeoutRate).toBeGreaterThanOrEqual(0);
    expect(Object.keys(m.ai)).toEqual(['moves', 'avgMs', 'maxMs']);
  });
});
