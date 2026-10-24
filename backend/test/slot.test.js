import { jest } from '@jest/globals';
import { useTempDb } from './helpers/db.js';
import { spinSlot, evaluateSymbols, theoreticalRtp, SLOT_TIERS, SLOT_SYMBOLS, SLOT_BET } from '../src/slotMath.js';

process.env.BCRYPT_ROUNDS = '4';
jest.setTimeout(60000);

// 재현 가능한 시드 난수 (mulberry32)
const seeded = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('슬롯 확률 모델 (RTP)', () => {
  test('확률 합 100%, 이론 RTP 95%', () => {
    expect(SLOT_TIERS.reduce((s, t) => s + t.p, 0)).toBeCloseTo(1, 10);
    expect(theoreticalRtp()).toBeCloseTo(0.95, 10);
  });

  test('생성된 릴 결과와 당첨금이 항상 일치하고, 꽝에는 우연한 짝이 없다', () => {
    const rng = seeded(7);
    const seen = new Set();
    let bad = 0; // 반복 안에서 expect 를 수십만 번 부르면 느려서 위반 횟수만 센다
    for (let i = 0; i < 200000; i++) {
      const s = spinSlot(rng);
      const uniq = new Set(s.resultSymbols).size;
      if (s.resultSymbols.length !== 3 || !s.resultSymbols.every((x) => SLOT_SYMBOLS.includes(x))) bad++;
      if (evaluateSymbols(s.resultSymbols) !== s.payout) bad++;
      if (s.tier === 'miss' && uniq !== 3) bad++;
      if (s.tier === 'small' && uniq !== 2) bad++;
      seen.add(s.tier);
    }
    expect(bad).toBe(0);
    expect([...seen].sort()).toEqual(['big', 'jackpot', 'mid', 'miss', 'small']);
  });

  test('1,000,000회: 티어별 빈도가 설정 확률에 수렴하고 RTP 가 90~98% (콘솔에 출력)', () => {
    const run = (n, rng) => {
      const count = {};
      let paid = 0;
      for (let i = 0; i < n; i++) {
        const s = spinSlot(rng);
        count[s.tier] = (count[s.tier] ?? 0) + 1;
        paid += s.payout;
      }
      return { count, rtp: paid / (n * SLOT_BET) };
    };
    const small = run(10000, seeded(2024));
    const big = run(1000000, seeded(42));
    // eslint-disable-next-line no-console
    console.log(
      `슬롯 RTP 검증 — 이론 ${(theoreticalRtp() * 100).toFixed(2)}% | 10,000회 ${(small.rtp * 100).toFixed(2)}% (표본이 작아 ±3% 흔들림 정상) | 1,000,000회 ${(big.rtp * 100).toFixed(2)}%\n` +
        SLOT_TIERS.map((t) => `  ${t.label}: 설정 ${(t.p * 100).toFixed(1)}% / 실측 ${((big.count[t.id] / 1e6) * 100).toFixed(2)}%`).join('\n'),
    );
    expect(big.rtp).toBeGreaterThan(0.9);
    expect(big.rtp).toBeLessThan(0.98);
    for (const t of SLOT_TIERS) expect(Math.abs(big.count[t.id] / 1e6 - t.p)).toBeLessThan(0.002);
  });
});

let server, base, prisma;
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
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});
afterEach(() => jest.restoreAllMocks());

const call = async (method, p, token, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
async function mk() {
  const username = `sl${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  return { token: r.token, id: r.user.id };
}
const row = (id) => prisma.user.findUnique({ where: { id } });

describe('슬롯 API', () => {
  test('스핀: 500원 차감 + 당첨금 지급, 응답에 릴 결과·당첨금·한도', async () => {
    const a = await mk();
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.001).mockReturnValue(0.5); // 잭팟
    const r = await call('POST', '/api/slot/spin', a.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ resultSymbols: ['똥광', '똥광', '똥광'], payout: 20000, tier: 'jackpot', bet: 500 });
    expect(r.body.slot).toMatchObject({ spent: 500, limit: 10000, left: 9500 });
    expect(r.body.user.money).toBe(100000 - 500 + 20000);
    const u = await row(a.id);
    expect(u).toMatchObject({ money: 119500, dailySlotSpent: 500 });
    expect(u.lastSlotPlayedAt).not.toBeNull();
  });

  test('꽝은 500원만 잃는다', async () => {
    const a = await mk();
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValue(0.3);
    const r = await call('POST', '/api/slot/spin', a.token);
    expect(r.body).toMatchObject({ payout: 0, tier: 'miss' });
    expect(new Set(r.body.resultSymbols).size).toBe(3);
    expect((await row(a.id)).money).toBe(99500);
  });

  test('일일 한도 10,000원(20회) 초과는 403, 상태/머니 불변', async () => {
    const a = await mk();
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // 계속 꽝
    for (let i = 1; i <= 20; i++) {
      const r = await call('POST', '/api/slot/spin', a.token);
      expect(r.status).toBe(200);
      expect(r.body.slot.spent).toBe(500 * i);
    }
    const over = await call('POST', '/api/slot/spin', a.token);
    expect(over.status).toBe(403);
    expect(over.body.error).toBe('오늘 슬롯머신 한도를 모두 소진했습니다.');
    const u = await row(a.id);
    expect(u.dailySlotSpent).toBe(10000);
    expect(u.money).toBe(90000);
    const st = await call('GET', '/api/slot/status', a.token);
    expect(st.body.slot).toMatchObject({ spent: 10000, left: 0 });
    expect(st.body.rtp).toBeCloseTo(0.95, 10);
  });

  test('날짜가 바뀌면 한도가 초기화된 뒤 스핀한다', async () => {
    const a = await mk();
    await prisma.user.update({ where: { id: a.id }, data: { dailySlotSpent: 10000, lastSlotPlayedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) } });
    expect((await call('GET', '/api/slot/status', a.token)).body.slot.spent).toBe(0);
    const r = await call('POST', '/api/slot/spin', a.token);
    expect(r.status).toBe(200);
    expect(r.body.slot.spent).toBe(500);
    expect((await row(a.id)).dailySlotSpent).toBe(500);
  });

  test('머니 부족(400) · 비로그인(401)', async () => {
    const a = await mk();
    await prisma.user.update({ where: { id: a.id }, data: { money: 499 } });
    const r = await call('POST', '/api/slot/spin', a.token);
    expect(r.status).toBe(400);
    expect((await row(a.id)).dailySlotSpent).toBe(0);
    expect((await call('POST', '/api/slot/spin', 'bad')).status).toBe(401);
  });

  test('동시에 30번 연타해도 한도(20회)와 잔액 계산이 어긋나지 않는다', async () => {
    const a = await mk();
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const rs = await Promise.all(Array.from({ length: 30 }, () => call('POST', '/api/slot/spin', a.token)));
    const ok = rs.filter((r) => r.status === 200).length;
    expect(ok).toBe(20); // 연타 요청이 순서대로 처리되어 정확히 한도만큼만 성공
    expect(rs.filter((r) => r.status === 403).length).toBe(10);
    const u = await row(a.id);
    expect(u.dailySlotSpent).toBe(10000);
    expect(u.money).toBe(100000 - 10000);
  });
});
