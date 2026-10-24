import { jest } from '@jest/globals';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
jest.setTimeout(30000);

let server, base, prisma, settleGame, recordPractice;
let seq = 0;

beforeAll(async () => {
  useTempDb();
  ({ prisma } = await import('../src/db.js'));
  ({ settleGame, recordPractice } = await import('../src/settle.js'));
  const { createServer } = await import('../src/app.js');
  ({ server } = createServer());
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

const api = async (method, p, token, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
async function mk(name = 'pg') {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  return { token: r.token, id: r.user.id, username };
}
const row = (id) => prisma.user.findUnique({ where: { id } });
const setUser = (id, data) => prisma.user.update({ where: { id }, data });
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);

describe('출석 체크', () => {
  test('하루 첫 호출에만 10,000원, 같은 날 재호출은 0 · 날짜가 바뀌면 다시 지급', async () => {
    const a = await mk();
    const r1 = await api('POST', '/api/auth/checkin', a.token);
    expect(r1.body.bonus).toBe(10000);
    expect(r1.body.user.money).toBe(110000);
    const r2 = await api('POST', '/api/auth/checkin', a.token);
    expect(r2.body.bonus).toBe(0);
    expect((await row(a.id)).money).toBe(110000);
    await setUser(a.id, { lastLoginAt: daysAgo(2) }); // 이틀 전에 마지막 출석
    expect((await api('POST', '/api/auth/checkin', a.token)).body.bonus).toBe(10000);
    expect((await row(a.id)).money).toBe(120000);
  });

  test('동시에 여러 번 호출해도 한 번만 지급', async () => {
    const a = await mk();
    const rs = await Promise.all(Array.from({ length: 6 }, () => api('POST', '/api/auth/checkin', a.token)));
    expect(rs.filter((r) => r.body.bonus === 10000).length).toBe(1);
    expect((await row(a.id)).money).toBe(110000);
  });

  test('로그인 필요', async () => {
    expect((await api('POST', '/api/auth/checkin', 'bad')).status).toBe(401);
    expect((await api('POST', '/api/auth/gaepyeong', 'bad')).status).toBe(401);
  });
});

describe('개평(구제금)', () => {
  test('잔액 10,000원 초과면 거부, 이하이면 +30,000원 · 횟수 증가 · 하루 3회 제한', async () => {
    const a = await mk();
    expect((await api('POST', '/api/auth/gaepyeong', a.token)).status).toBe(400); // 100,000원 보유
    expect((await api('GET', '/api/auth/me', a.token)).body.user.canGaepyeong).toBe(false);
    await setUser(a.id, { money: 10000 }); // 경계값: 10,000 은 가능
    const r1 = await api('POST', '/api/auth/gaepyeong', a.token);
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ amount: 30000 });
    expect(r1.body.user).toMatchObject({ money: 40000, gaepyeongLeft: 2, canGaepyeong: false });
    expect((await api('POST', '/api/auth/gaepyeong', a.token)).status).toBe(400); // 40,000 > 10,000
    for (let i = 2; i <= 3; i++) {
      await setUser(a.id, { money: 0 });
      const r = await api('POST', '/api/auth/gaepyeong', a.token);
      expect(r.status).toBe(200);
      expect(r.body.user.gaepyeongLeft).toBe(3 - i);
    }
    await setUser(a.id, { money: 500 });
    const over = await api('POST', '/api/auth/gaepyeong', a.token);
    expect(over.status).toBe(400); // 오늘 3회 소진
    expect((await row(a.id)).money).toBe(500);
    expect((await api('GET', '/api/auth/me', a.token)).body.user).toMatchObject({ gaepyeongLeft: 0, canGaepyeong: false });
    // 날짜가 바뀌면 횟수 초기화
    await setUser(a.id, { gaepyeongDate: '2000-01-01' });
    expect((await api('POST', '/api/auth/gaepyeong', a.token)).status).toBe(200);
    expect((await row(a.id)).gaepyeongCount).toBe(1);
  });

  test('연타(동시 요청)해도 한 번만 지급', async () => {
    const a = await mk();
    await setUser(a.id, { money: 0 });
    const rs = await Promise.all(Array.from({ length: 5 }, () => api('POST', '/api/auth/gaepyeong', a.token)));
    expect(rs.filter((r) => r.status === 200).length).toBe(1);
    const u = await row(a.id);
    expect(u.money).toBe(30000);
    expect(u.gaepyeongCount).toBe(1);
  });
});

// 엔진 result 와 같은 모양의 합성 결과
const st = (o = {}) => ({ active: true, go: 0, stop: 0, ppeok: 0, ppeokMax: 0, bomb: 0, shake: 0, score: 0, gwang: 0, ...o });
const result = ({ winner, loser, stats, baks = {}, total = 3 }) => ({
  draw: false, winner, loser, losers: [loser], detail: [], tags: [], base: total, total,
  payments: [{ kind: 'game', from: loser, to: winner, mult: 1, tags: [], total }],
  stats, baks,
});

describe('포커 스타일 스탯 누적 (실전만)', () => {
  test('실전 판: 고/스톱/뻑/폭탄/흔들기/점수/피박 누적 → computeStats', async () => {
    const [a, b] = [await mk(), await mk()];
    const res = result({
      winner: a.id, loser: b.id,
      stats: { [a.id]: st({ go: 2, stop: 1, ppeok: 1, bomb: 1, shake: 1, score: 9 }), [b.id]: st({ score: 2 }) },
      baks: { [b.id]: ['피박'] },
    });
    await settleGame({ roomName: 't', betPerPt: 100, pids: [a.id, b.id], result: res, ranked: true });
    const ua = await row(a.id);
    const ub = await row(b.id);
    expect(ua).toMatchObject({ statGames: 1, goCount: 2, stopCount: 1, bbuckCount: 1, bombCount: 1, shakeCount: 1, scoreSum: 9, pibakLosses: 0, wins: 1 });
    expect(ub).toMatchObject({ statGames: 1, goCount: 0, scoreSum: 2, pibakLosses: 1, losses: 1 });
    const stats = (await api('GET', '/api/auth/stats', a.token)).body.stats;
    expect(stats).toMatchObject({ games: 1, winRate: 1, goRate: 2 / 3, avgScore: 9, pibakAvoid: 1 });
    const sb = (await api('GET', '/api/auth/stats', b.token)).body.stats;
    expect(sb).toMatchObject({ winRate: 0, pibakAvoid: 0, avgScore: 2 });
    // 분모 0 방어: 아무 판도 안 한 유저
    const c = await mk();
    expect((await api('GET', '/api/auth/stats', c.token)).body.stats).toMatchObject({ games: 0, winRate: 0, goRate: 0, avgScore: 0, pibakAvoid: 1 });
  });

  test('연습(비정산) 판은 스탯·전적·머니에 영향 없음 (botWins 만 증가)', async () => {
    const a = await mk();
    const bot = await prisma.user.create({ data: { username: `AI봇t${++seq}`, passwordHash: '!', isBot: true, money: 0 } });
    const res = result({
      winner: a.id, loser: bot.id,
      stats: { [a.id]: st({ go: 3, stop: 1, score: 12, gwang: 3 }), [bot.id]: st() },
    });
    const pay = await settleGame({ roomName: 'p', betPerPt: 100, pids: [a.id, bot.id], result: res, ranked: false });
    expect(pay).toBeNull();
    await recordPractice({ pids: [a.id, bot.id], result: res, outcome: { [a.id]: 'win', [bot.id]: 'lose' } });
    const u = await row(a.id);
    expect(u).toMatchObject({ money: 100000, wins: 0, losses: 0, statGames: 0, goCount: 0, scoreSum: 0, gwangWins: 0, botWins: 1 });
  });
});

describe('업적/칭호', () => {
  const play = (winner, loser, extra = {}) =>
    settleGame({
      roomName: 'a', betPerPt: 100, pids: [winner, loser],
      result: result({ winner, loser, stats: { [winner]: st({ score: 7, ...(extra.w ?? {}) }), [loser]: st(extra.l ?? {}) }, baks: extra.baks ?? {} }),
      ranked: true,
    });

  test('뻑의 제왕: 한 판 연속 3뻑 → 업적 + 대표 칭호 자동 설정 + unlocked 반환', async () => {
    const [a, b] = [await mk(), await mk()];
    const p = await play(a.id, b.id, { w: { ppeok: 3, ppeokMax: 3 } });
    expect(p.unlocked[a.id]).toContain('ppeok_king');
    const u = await row(a.id);
    expect(JSON.parse(u.achievements)).toContain('ppeok_king');
    expect(u.title).toBe('ppeok_king');
    const me = (await api('GET', '/api/auth/me', a.token)).body.user;
    expect(me.titleText).toBe('💩 뻑의 제왕');
    // 이미 가진 업적은 다시 알리지 않는다
    const p2 = await play(a.id, b.id, { w: { ppeok: 3, ppeokMax: 3 } });
    expect(p2.unlocked[a.id]?.includes('ppeok_king')).toBeFalsy();
  });

  test('무소유: 피박+광박+멍박 동시에 당함 (하나라도 빠지면 안 됨)', async () => {
    const [a, b] = [await mk(), await mk()];
    let p = await play(a.id, b.id, { baks: { [b.id]: ['피박', '광박'] } });
    expect(p.unlocked[b.id]?.includes('mushoyu')).toBeFalsy();
    p = await play(a.id, b.id, { baks: { [b.id]: ['피박', '광박', '멍박'] } });
    expect(p.unlocked[b.id]).toContain('mushoyu');
  });

  test('광신도: 3광 이상으로 5승째에 달성 (2광 승리는 세지 않음)', async () => {
    const [a, b] = [await mk(), await mk()];
    for (let i = 0; i < 4; i++) await play(a.id, b.id, { w: { gwang: 3 } });
    await play(a.id, b.id, { w: { gwang: 2 } });
    expect((await row(a.id)).gwangWins).toBe(4);
    expect(JSON.parse((await row(a.id)).achievements)).not.toContain('gwang_cult');
    const p = await play(a.id, b.id, { w: { gwang: 4 } });
    expect(p.unlocked[a.id]).toContain('gwang_cult');
  });

  test('타짜: AI 상대 10승 (연습 포함) 에서 달성', async () => {
    const a = await mk();
    const bot = await prisma.user.create({ data: { username: `AI봇u${++seq}`, passwordHash: '!', isBot: true, money: 0 } });
    let got = [];
    for (let i = 0; i < 10; i++) {
      const res = result({ winner: a.id, loser: bot.id, stats: { [a.id]: st({ score: 7 }), [bot.id]: st() } });
      const u = await recordPractice({ pids: [a.id, bot.id], result: res, outcome: { [a.id]: 'win', [bot.id]: 'lose' } });
      if (i < 9) expect(u[a.id]?.includes('tazza')).toBeFalsy();
      else got = u[a.id] ?? [];
    }
    expect(got).toContain('tazza');
    expect((await row(a.id)).botWins).toBe(10);
  });

  test('대표 칭호 선택: 달성한 것만 가능, 해제 가능', async () => {
    const [a, b] = [await mk(), await mk()];
    await play(a.id, b.id, { w: { ppeok: 3, ppeokMax: 3 } });
    await play(a.id, b.id); // first_win 은 이미 같이 달성됨
    expect((await api('PUT', '/api/auth/title', a.token, { title: 'tazza' })).status).toBe(403);
    expect((await api('PUT', '/api/auth/title', a.token, { title: 'nope' })).status).toBe(400);
    const ok = await api('PUT', '/api/auth/title', a.token, { title: 'first_win' });
    expect(ok.body.user.titleText).toBe('🥇 첫 승리');
    const off = await api('PUT', '/api/auth/title', a.token, { title: null });
    expect(off.body.user.titleText).toBeNull();
    const list = (await api('GET', '/api/auth/achievements', a.token)).body.achievements;
    expect(list.find((x) => x.id === 'ppeok_king').owned).toBe(true);
    expect(list.find((x) => x.id === 'tazza').owned).toBe(false);
  });
});
