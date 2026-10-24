import { jest } from '@jest/globals';
import { useTempDb } from './helpers/db.js';
import { computeTransfers, outcomesOf } from '../src/settle.js';

const pay = (from, to, total, kind = 'game') => ({ from, to, total, kind, mult: 1, tags: [] });

describe('computeTransfers (순수 계산)', () => {
  test('1:1 정산: 점수 × 판돈', () => {
    const r = computeTransfers({ payments: [pay(2, 1, 5)], betPerPt: 100, balances: { 1: 1000, 2: 1000 } });
    expect(r.delta).toEqual({ 1: 500, 2: -500 });
  });

  test('패자 보유금이 모자라면 보유금까지만 (음수 없음, 제로섬)', () => {
    const r = computeTransfers({ payments: [pay(2, 1, 50)], betPerPt: 100, balances: { 1: 0, 2: 700 } });
    expect(r.delta).toEqual({ 1: 700, 2: -700 });
  });

  test('다자 정산: 승자 1 / 패자 2,3 각각 지불', () => {
    const r = computeTransfers({
      payments: [pay(2, 1, 6), pay(3, 1, 12)],
      betPerPt: 100,
      balances: { 1: 5000, 2: 5000, 3: 5000 },
    });
    expect(r.delta).toEqual({ 1: 1800, 2: -600, 3: -1200 });
  });

  test('한 사람이 여러 명에게 내는데 잔고 부족 → 금액 비율대로 나눠 내고 정확히 잔고만큼 차감', () => {
    // 3 이 1 에게 7점, 2 에게 3점(=1000원) 내야 하지만 잔고 500
    const r = computeTransfers({
      payments: [pay(3, 1, 7), pay(3, 2, 3)],
      betPerPt: 100,
      balances: { 1: 0, 2: 0, 3: 500 },
    });
    expect(r.delta[3]).toBe(-500);
    expect(r.delta[1] + r.delta[2]).toBe(500);
    expect(r.delta[1]).toBeGreaterThan(r.delta[2]);
  });

  test('나머지 1원 단위도 새지 않는다 (홀수 분배)', () => {
    const r = computeTransfers({
      payments: [pay(3, 1, 1), pay(3, 2, 1), pay(3, 4, 1)],
      betPerPt: 1,
      balances: { 3: 2 },
    });
    expect(r.delta[3]).toBe(-2);
    expect((r.delta[1] ?? 0) + (r.delta[2] ?? 0) + (r.delta[4] ?? 0)).toBe(2);
  });

  test('광팔기/뻑 지불도 같이 정산', () => {
    const r = computeTransfers({
      payments: [pay(2, 1, 10), pay(3, 4, 4, 'sale'), pay(2, 3, 3, 'ppeok')],
      betPerPt: 10,
      balances: { 1: 1000, 2: 1000, 3: 1000, 4: 1000 },
    });
    expect(r.delta).toEqual({ 1: 100, 2: -130, 3: -10, 4: 40 });
    expect(Object.values(r.delta).reduce((a, b) => a + b, 0)).toBe(0);
  });

  test('AI 봇이 지면 한도 없이 전액 지불, 봇 잔고는 delta 에 없음', () => {
    const r = computeTransfers({ payments: [pay(9, 1, 100)], betPerPt: 1000, balances: { 1: 0, 9: 0 }, exempt: new Set([9]) });
    expect(r.delta).toEqual({ 1: 100000 });
  });

  test('AI 봇이 이기면 유저만 차감되고 봇 잔고는 건드리지 않음', () => {
    const r = computeTransfers({ payments: [pay(1, 9, 5)], betPerPt: 100, balances: { 1: 10000, 9: 0 }, exempt: new Set([9]) });
    expect(r.delta).toEqual({ 1: -500 });
  });

  test('0점/0원 지불은 무시', () => {
    expect(computeTransfers({ payments: [pay(2, 1, 0)], betPerPt: 100, balances: { 1: 1, 2: 1 } })).toEqual({ transfers: [], delta: {} });
  });
});

describe('outcomesOf', () => {
  const pids = [1, 2, 3, 4];
  test('일반 승부 + 광팔기 판매자는 none', () => {
    expect(outcomesOf({ winner: 1, losers: [2, 3], payments: [] }, pids)).toEqual({ 1: 'win', 2: 'lose', 3: 'lose', 4: 'none' });
  });
  test('고박 대납으로 payments.from 이 몰려도 losers 기준', () => {
    expect(outcomesOf({ winner: 1, losers: [2, 3], payments: [pay(2, 1, 5), pay(2, 1, 5)] }, [1, 2, 3])).toEqual({ 1: 'win', 2: 'lose', 3: 'lose' });
  });
  test('기권: 나간 사람 패, 지급받은 사람 승', () => {
    const r = { winner: null, loser: 2, losers: [2], payments: [pay(2, 1, 3, 'forfeit'), pay(2, 3, 3, 'forfeit')] };
    expect(outcomesOf(r, [1, 2, 3])).toEqual({ 1: 'win', 2: 'lose', 3: 'win' });
  });
  test('나가리는 전원 draw', () => {
    expect(outcomesOf({ draw: true, payments: [] }, [1, 2])).toEqual({ 1: 'draw', 2: 'draw' });
  });
});

describe('settleGame (DB 트랜잭션)', () => {
  let prisma, settleGame;
  beforeAll(async () => {
    useTempDb();
    ({ prisma } = await import('../src/db.js'));
    ({ settleGame } = await import('../src/settle.js'));
  });
  afterAll(() => prisma.$disconnect());

  const mkUser = (username, money, isBot = false) => prisma.user.create({ data: { username, passwordHash: 'x', money, isBot } });
  const money = async (id) => (await prisma.user.findUnique({ where: { id } })).money;

  test('3인 실전: 머니·승패·기록이 한 번에 반영되고 총합 보존', async () => {
    const [a, b, c] = [await mkUser('a1', 10000), await mkUser('b1', 10000), await mkUser('c1', 10000)];
    const result = {
      draw: false, winner: a.id, losers: [b.id, c.id], detail: [{ name: '3광' }], tags: ['피박 ×2'],
      payments: [pay(b.id, a.id, 6), pay(c.id, a.id, 3)],
    };
    const r = await settleGame({ roomName: 'r', betPerPt: 100, pids: [a.id, b.id, c.id], result });
    expect(r.delta).toEqual({ [a.id]: 900, [b.id]: -600, [c.id]: -300 });
    expect([await money(a.id), await money(b.id), await money(c.id)]).toEqual([10900, 9400, 9700]);
    const us = await prisma.user.findMany({ where: { id: { in: [a.id, b.id, c.id] } }, orderBy: { id: 'asc' } });
    expect(us.map((u) => [u.wins, u.losses])).toEqual([[1, 0], [0, 1], [0, 1]]);
    const g = await prisma.game.findUnique({ where: { id: r.gameId }, include: { results: true } });
    expect(g.playerCount).toBe(3);
    expect(g.results.map((x) => x.outcome).sort()).toEqual(['lose', 'lose', 'win']);
  });

  test('보유금 초과 지불은 잔고까지만, 음수 없음', async () => {
    const [a, b] = [await mkUser('a2', 10000), await mkUser('b2', 300)];
    const result = { draw: false, winner: a.id, losers: [b.id], detail: [], tags: [], payments: [pay(b.id, a.id, 99)] };
    await settleGame({ roomName: 'r', betPerPt: 100, pids: [a.id, b.id], result });
    expect(await money(b.id)).toBe(0);
    expect(await money(a.id)).toBe(10300);
  });

  test('ranked=false(AI 1:1 연습)는 DB 를 전혀 건드리지 않는다', async () => {
    const [a, bot] = [await mkUser('a3', 10000), await mkUser('bot3', 0, true)];
    const before = await prisma.game.count();
    const result = { draw: false, winner: a.id, losers: [bot.id], detail: [], tags: [], payments: [pay(bot.id, a.id, 10)] };
    const r = await settleGame({ roomName: 'r', betPerPt: 100, pids: [a.id, bot.id], result, ranked: false });
    expect(r).toBeNull();
    expect(await money(a.id)).toBe(10000);
    expect((await prisma.user.findUnique({ where: { id: a.id } })).wins).toBe(0);
    expect(await prisma.game.count()).toBe(before);
  });

  test('3인 실전에 AI 포함: AI 는 머니/전적 불변, 유저는 정상 증감', async () => {
    const [a, b, bot] = [await mkUser('a4', 10000), await mkUser('b4', 10000), await mkUser('bot4', 0, true)];
    const result = {
      draw: false, winner: bot.id, losers: [a.id, b.id], detail: [], tags: [],
      payments: [pay(a.id, bot.id, 5), pay(b.id, bot.id, 5)],
    };
    await settleGame({ roomName: 'r', betPerPt: 100, pids: [a.id, b.id, bot.id], result });
    expect(await money(a.id)).toBe(9500);
    expect(await money(b.id)).toBe(9500);
    const botRow = await prisma.user.findUnique({ where: { id: bot.id } });
    expect([botRow.money, botRow.wins, botRow.losses]).toEqual([0, 0, 0]);
    // 유저가 AI 에게서 따는 경우: 잔고 0 인 AI 가 전액 지불
    const result2 = { draw: false, winner: a.id, losers: [bot.id], detail: [], tags: [], payments: [pay(bot.id, a.id, 20)] };
    await settleGame({ roomName: 'r', betPerPt: 100, pids: [a.id, b.id, bot.id], result: result2 });
    expect(await money(a.id)).toBe(11500);
    expect((await prisma.user.findUnique({ where: { id: bot.id } })).money).toBe(0);
  });

  test('나가리: 머니 변동 없음, 기록은 draw', async () => {
    const [a, b] = [await mkUser('a5', 5000), await mkUser('b5', 5000)];
    const r = await settleGame({ roomName: 'r', betPerPt: 100, pids: [a.id, b.id], result: { draw: true, payments: [], detail: [], tags: [] } });
    expect(r.delta).toEqual({});
    expect(await money(a.id)).toBe(5000);
    const u = await prisma.user.findUnique({ where: { id: a.id } });
    expect([u.wins, u.losses]).toEqual([0, 0]);
  });

  test('도중 오류면 전체 롤백', async () => {
    const [a, b] = [await mkUser('a6', 5000), await mkUser('b6', 5000)];
    // 존재하지 않는 id 가 섞여도 users 에 없으므로 무시되지만, 기록 생성 실패를 유발하려고 roomName 을 null 로
    const result = { draw: false, winner: a.id, losers: [b.id], detail: [], tags: [], payments: [pay(b.id, a.id, 10)] };
    await expect(settleGame({ roomName: null, betPerPt: 100, pids: [a.id, b.id], result })).rejects.toBeDefined();
    expect(await money(a.id)).toBe(5000);
    expect(await money(b.id)).toBe(5000);
  });
});
