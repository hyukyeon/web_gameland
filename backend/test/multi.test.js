import { GostopGame } from '../src/game/GostopGame.js';
import { computeScore } from '../src/game/score.js';
import { card } from '../src/game/cards.js';

const [A, B, C, D] = ['A', 'B', 'C', 'D'];

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 지정 상태로 덮어쓴 N인 게임. hands/captured 는 {pid: ids} */
function mk(pids, { hands = {}, floor = [], stock = [], cap = {}, turn, ...opts } = {}) {
  const g = new GostopGame(pids, { rnd: seeded(3), firstPlayer: pids[0], ...opts });
  for (const p of pids) {
    g.hands[p] = [...(hands[p] || [])];
    g.captured[p] = [...(cap[p] || [])];
  }
  g.floor = [...floor];
  g.stock = [...stock];
  g.phase = 'play';
  g.ctx = null;
  g.sale = null;
  g.turn = turn ?? g.active[0];
  return g;
}
const banners = (r) => r.frames.map((f) => f.banner?.kind).filter(Boolean);
const allCards = (g) => [
  ...Object.values(g.hands).flat(),
  ...Object.values(g.captured).flat(),
  ...g.floor,
  ...g.stock,
  ...g.dead,
];

describe('인원별 딜링', () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('3인 seed %i: 7장씩, 바닥 6, 더미 21', (seed) => {
    const g = new GostopGame([A, B, C], { rnd: seeded(seed) });
    expect(g.active).toEqual([A, B, C]);
    for (const p of [A, B, C]) expect(g.hands[p]).toHaveLength(7);
    expect(g.floor).toHaveLength(6);
    expect(g.stock).toHaveLength(21);
    expect(g.threshold).toBe(3);
    expect(new Set(allCards(g)).size).toBe(48);
  });
  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('4인 seed %i: 3명이 7장씩, 쉬는 사람은 손패 없음', (seed) => {
    const g = new GostopGame([A, B, C, D], { rnd: seeded(seed), firstPlayer: A });
    expect(g.rest).toBe(D);
    expect(g.active).toEqual([A, B, C]);
    expect(g.hands[D]).toEqual([]);
    for (const p of [A, B, C]) expect(g.hands[p]).toHaveLength(7);
    expect(g.floor).toHaveLength(6);
    expect(g.stock).toHaveLength(21);
    expect(new Set(allCards(g)).size).toBe(48);
  });
  test('4인: rest 지정 가능, 선공은 쉬지 않는다', () => {
    const g = new GostopGame([A, B, C, D], { rest: B, firstPlayer: A });
    expect(g.rest).toBe(B);
    expect(g.active).toEqual([A, C, D]);
    const g2 = new GostopGame([A, B, C, D], { rest: A, firstPlayer: A });
    expect(g2.rest).not.toBe(A);
  });
  test('인원 수 검증', () => {
    expect(() => new GostopGame([A])).toThrow();
    expect(() => new GostopGame([A, B, C, D, 'E'])).toThrow();
    expect(() => new GostopGame([A, A])).toThrow();
  });
  test('2인전은 광팔기 단계가 없다', () => {
    for (let s = 1; s < 200; s++) expect(new GostopGame([A, B], { rnd: seeded(s) }).phase).toBe('play');
  });
});

describe('3인 이상 진행', () => {
  test('턴이 A→B→C→A 로 순환', () => {
    const g = mk([A, B, C], { hands: { [A]: [20, 21], [B]: [30, 31], [C]: [36, 37] }, floor: [24], stock: [25 + 20, 40, 41, 42] });
    g.play(A, 20);
    expect(g.turn).toBe(B);
    g.play(B, 30);
    expect(g.turn).toBe(C);
    g.play(C, 36);
    expect(g.turn).toBe(A);
  });
  test('4인: 쉬는 사람은 낼 수 없고 턴도 오지 않는다', () => {
    const g = mk([A, B, C, D], { hands: { [A]: [20, 21], [B]: [30, 31], [C]: [36, 37] }, floor: [24], stock: [40, 41, 42] });
    expect(g.play(D, 20).ok).toBe(false);
    g.play(A, 20);
    g.play(B, 30);
    g.play(C, 36);
    expect(g.turn).toBe(A);
  });
  test('3인은 3점부터 고/스톱', () => {
    const g = mk([A, B, C], { hands: { [A]: [20, 21], [B]: [30], [C]: [36] }, floor: [24], stock: [44], cap: { [A]: [0, 8, 28] } });
    g.play(A, 20);
    expect(g.phase).toBe('gostop');
    expect(g.turn).toBe(A);
  });
  test('쪽/따닥/싹쓸이 등은 모든 상대에게서 피를 1장씩 가져온다', () => {
    const g = mk([A, B, C], {
      hands: { [A]: [8, 20], [B]: [30], [C]: [36] },
      floor: [24],
      stock: [9, 40],
      cap: { [B]: [2], [C]: [3] },
    });
    const r = g.play(A, 8); // 낸 패를 더미가 맞춤 → 쪽
    expect(banners(r)).toContain('jjok');
    expect(g.captured[A]).toEqual(expect.arrayContaining([8, 9, 2, 3]));
    expect(g.captured[B]).toEqual([]);
    expect(g.captured[C]).toEqual([]);
  });
  test('뻑 먹기도 상대 각각에게서 1장', () => {
    const g = mk([A, B, C], {
      hands: { [A]: [8, 20], [B]: [11, 30], [C]: [36, 37] },
      floor: [9],
      stock: [10, 40, 41],
      cap: { [A]: [2], [C]: [3] },
    });
    g.play(A, 8); // 뻑
    g.play(B, 11); // B 가 먹음
    expect(g.captured[B]).toEqual(expect.arrayContaining([8, 9, 10, 11, 2, 3]));
  });
  test('보유 피가 없으면 그만큼만 가져온다', () => {
    const g = mk([A, B, C], { hands: { [A]: [8, 20], [B]: [30], [C]: [36] }, floor: [24], stock: [9, 40], cap: { [B]: [2] } });
    g.play(A, 8);
    expect(g.captured[A]).toEqual(expect.arrayContaining([8, 9, 2]));
    expect(g.captured[A]).toHaveLength(3);
  });
  test('손패가 빈 사람은 건너뛰고 모두 소진되면 나가리', () => {
    const g = mk([A, B, C], { hands: { [A]: [20], [B]: [], [C]: [] }, floor: [24], stock: [] });
    g.play(A, 20);
    expect(g.phase).toBe('ended');
    expect(g.result.draw).toBe(true);
  });
  test('손패가 빈 사람은 건너뛰고 다음 사람에게 턴', () => {
    const g = mk([A, B, C], { hands: { [A]: [20], [B]: [], [C]: [36] }, floor: [24], stock: [] });
    g.play(A, 20);
    expect(g.turn).toBe(C);
  });
});

describe('3인 이상 정산', () => {
  const SEVEN = [0, 8, 28, 40, 1, 5, 9];
  function stop(pids, o, tweak) {
    const g = mk(pids, { cap: o });
    g.threshold = 3;
    g.phase = 'gostop';
    g.turn = A;
    g.ctx = { base: computeScore(g.captured[A]).total };
    tweak?.(g);
    g.callStop(A);
    return g.result;
  }
  test('패자 각각에게 개별 박을 적용', () => {
    // B 는 광 보유, C 는 광 없음(광박)
    const r = stop([A, B, C], { [A]: SEVEN, [B]: [44], [C]: [2] });
    expect(r.winner).toBe(A);
    expect(r.losers).toEqual([B, C]);
    const pb = r.payments.find((p) => p.from === B);
    const pc = r.payments.find((p) => p.from === C);
    expect(pb.total).toBe(7);
    expect(pc.total).toBe(14);
    expect(pc.tags).toContain('광박 ×2');
    expect(r.total).toBe(21);
    expect(r.loser).toBeNull();
  });
  test('고박: 고를 부른 패자는 ×2 이고 다른 패자의 몫까지 대신 낸다', () => {
    const r = stop([A, B, C], { [A]: SEVEN, [B]: [44], [C]: [44] }, (g) => (g.go[B] = 1));
    expect(r.payments.every((p) => p.from === B && p.to === A)).toBe(true);
    expect(r.payments.map((p) => p.total).sort((a, b) => a - b)).toEqual([7, 14]);
    expect(r.payments.some((p) => p.tags.includes('독박 (고박)'))).toBe(true);
    expect(r.dokbak).toBe(B);
  });
  test('고/흔들기 배수는 모든 패자에게 공통', () => {
    const r = stop([A, B, C], { [A]: SEVEN, [B]: [44], [C]: [44] }, (g) => ((g.go[A] = 3), (g.shakes[A] = 1)));
    for (const p of r.payments) expect(p.total).toBe((7 + 2) * 2 * 2);
  });
  test('4인: 쉬는 사람은 지불하지 않는다', () => {
    const r = stop([A, B, C, D], { [A]: SEVEN, [B]: [44], [C]: [44], [D]: [] });
    expect(r.payments.map((p) => p.from).sort()).toEqual([B, C]);
  });
  test('기권: 3인이면 남은 사람 각각에게 기준 점수 지불', () => {
    const g = mk([A, B, C], { hands: { [A]: [20], [B]: [30], [C]: [36] }, stock: [40] });
    g.forfeit(B);
    expect(g.result.forfeit).toBe(true);
    expect(g.result.winner).toBeNull();
    expect(g.result.payments.map((p) => [p.from, p.to, p.total])).toEqual([
      [B, A, 3],
      [B, C, 3],
    ]);
  });
  test('쉬는 사람의 기권은 게임에 영향 없음', () => {
    const g = mk([A, B, C, D], { hands: { [A]: [20], [B]: [30], [C]: [36] }, stock: [40] });
    expect(g.forfeit(D).ok).toBe(false);
    expect(g.phase).toBe('play');
  });
});

describe('광팔기', () => {
  const GW = [0, 8, 28]; // 광 3장

  function sellerGame(pids, extra = {}) {
    const g = mk(pids, { hands: { [A]: [...GW, 4, 5, 6, 7], [B]: [20, 21, 22, 23, 24, 25, 26], [C]: [30, 31, 32, 33, 34, 35, 36] }, ...extra });
    g.phase = 'gwang';
    g.ctx = { queue: [A], first: A };
    g.turn = A;
    return g;
  }

  test('첫 패에 광 3장 이상이면 선택 단계로 시작 (3인/4인)', () => {
    let found3 = 0;
    let found4 = 0;
    for (let s = 1; s < 400; s++) {
      const g3 = new GostopGame([A, B, C], { rnd: seeded(s) });
      const g4 = new GostopGame([A, B, C, D], { rnd: seeded(s), firstPlayer: A });
      for (const [g, count] of [[g3, () => found3++], [g4, () => found4++]]) {
        const sellers = g.active.filter((p) => g.hands[p].filter((id) => card(id).kind === 'gwang').length >= 3);
        if (sellers.length) {
          count();
          expect(g.phase).toBe('gwang');
          expect(g.turn).toBe(sellers[0]);
          expect(g.view(sellers[0]).gwangAsk).toBe(sellers[0]);
        } else {
          expect(g.phase).toBe('play');
        }
      }
    }
    expect(found3).toBeGreaterThan(0);
    expect(found4).toBeGreaterThan(0);
  });
  test('광팔기 중에는 패를 낼 수 없다', () => {
    const g = sellerGame([A, B, C]);
    expect(g.play(A, 4).ok).toBe(false);
  });
  test('거절하면 그대로 시작', () => {
    const g = sellerGame([A, B, C]);
    expect(g.sellGwang(B).ok).toBe(false);
    expect(g.passGwang(A).ok).toBe(true);
    expect(g.phase).toBe('play');
    expect(g.turn).toBe(A);
    expect(g.sale).toBeNull();
  });
  test('여러 명이 광을 가졌으면 차례로 묻는다', () => {
    const g = sellerGame([A, B, C]);
    g.ctx.queue = [A, B];
    g.passGwang(A);
    expect(g.phase).toBe('gwang');
    expect(g.turn).toBe(B);
    g.passGwang(B);
    expect(g.phase).toBe('play');
    expect(g.turn).toBe(A);
  });
  test('4인: 판 패는 더미로 섞이고 쉬던 사람이 새 7장을 받아 대신 친다', () => {
    const g = sellerGame([A, B, C, D]);
    g.rest = D;
    g.active = [A, B, C];
    g.stock = [40, 41, 42, 43, 44, 45, 46, 47, 3, 2, 1];
    const before = [...g.hands[A]];
    const r = g.sellGwang(A);
    expect(r.ok).toBe(true);
    expect(banners(r)).toContain('sale');
    expect(g.rest).toBe(A);
    expect(g.active).toEqual([D, B, C]);
    expect(g.hands[D]).toHaveLength(7);
    expect(g.hands[A]).toEqual([]);
    expect(g.hands[D].some((id) => before.includes(id)) || g.stock.some((id) => before.includes(id))).toBe(true);
    // 광 3장 × 2점, 선(D=인수자가 선이 됨)과 인수자를 뺀 B, C 가 지불
    expect(g.sale).toMatchObject({ seller: A, buyer: D, gwang: 3, pts: 6, payers: [B, C] });
    expect(g.phase).toBe('play');
    expect(g.turn).toBe(D);
    expect(g.play(A, 4).ok).toBe(false);
  });
  test('3인: 판 패는 더미로 돌아가고 2인전(7점)으로 진행, 선은 광값을 내지 않는다', () => {
    const g = sellerGame([A, B, C]);
    const stockBefore = g.stock.length;
    g.sellGwang(A);
    expect(g.active).toEqual([B, C]);
    expect(g.stock).toHaveLength(stockBefore + 7);
    expect(g.rest).toBe(A);
    expect(g.threshold).toBe(7);
    expect(g.sale).toMatchObject({ seller: A, buyer: null, gwang: 3, pts: 6, payers: [C] });
    expect(g.turn).toBe(B);
    g.stock = [40, 41, 42, 43];
    g.floor = [];
    g.play(B, 20);
    expect(g.turn).toBe(C);
  });
  test('광값은 광 1장당 2점 (4장이면 8점)', () => {
    const g = sellerGame([A, B, C]);
    g.hands[A] = [0, 8, 28, 40, 5, 6, 7];
    g.sellGwang(A);
    expect(g.sale.pts).toBe(8);
  });
  test('판 사람은 승패와 무관하게 광값을 받는다 (정산에 sale 포함)', () => {
    const g = sellerGame([A, B, C, D]);
    g.rest = D;
    g.active = [A, B, C];
    g.sellGwang(A);
    g.forfeit(B);
    const sale = g.result.payments.filter((p) => p.kind === 'sale');
    expect(sale.map((p) => [p.from, p.to, p.total])).toEqual([
      [B, A, 6],
      [C, A, 6],
    ]);
    expect(g.result.sale.seller).toBe(A);
  });
  test('나가리여도 광값은 정산된다', () => {
    const g = sellerGame([A, B, C]);
    g.sellGwang(A);
    g.endDraw();
    expect(g.result.draw).toBe(true);
    expect(g.result.payments.filter((p) => p.kind === 'sale')).toHaveLength(1);
  });
  test('뷰: 판 사람은 rest 로 표시되고 인수자는 새 손패를 본다', () => {
    const g = sellerGame([A, B, C, D]);
    g.rest = D;
    g.active = [A, B, C];
    g.sellGwang(A);
    const vd = g.view(D);
    expect(vd.hand).toEqual(g.hands[D]);
    expect(vd.rest).toBe(A);
    expect(g.view(A).hand).toEqual([]);
  });
});

describe('보너스 카드', () => {
  test('옵션을 켜면 덱이 51장 (보너스 3장, 2인: 딜 후 합계 51)', () => {
    const g = new GostopGame([A, B], { bonus: true, rnd: seeded(5) });
    expect(new Set(allCards(g)).size).toBe(51);
  });
  test('옵션이 꺼져 있으면 보너스패가 없다', () => {
    const g = new GostopGame([A, B], { rnd: seeded(5) });
    expect(allCards(g).filter((id) => id >= 48)).toEqual([]);
  });
  test('보너스패는 쌍피(피 2장)로 계산, 피로 갈취되지 않는다', () => {
    expect(computeScore([48, 2, 3, 6, 7, 10, 11, 14, 15]).pi).toBe(10);
    const g = mk([A, B], { hands: { [A]: [20, 21], [B]: [30] }, floor: [24], stock: [9, 40], cap: { [B]: [48] } });
    g.stealPi(A, 1);
    expect(g.captured[B]).toEqual([48]);
  });
  test('손패의 보너스패: 즉시 획득하고 더미에서 한 장 받아 턴을 이어간다', () => {
    const g = mk([A, B], { hands: { [A]: [48, 20], [B]: [30] }, floor: [24], stock: [40, 41, 42] });
    const r = g.play(A, 48);
    expect(r.ok).toBe(true);
    expect(banners(r)).toContain('bonus');
    expect(g.captured[A]).toEqual([48]);
    expect(g.hands[A]).toEqual([20, 40]);
    expect(g.stock).toEqual([41, 42]);
    expect(g.turn).toBe(A);
    expect(g.phase).toBe('play');
    expect(g.play(A, 20).ok).toBe(true);
  });
  test('더미에서 보너스패가 나오면 획득하고 한 장 더 뒤집는다', () => {
    const g = mk([A, B], { hands: { [A]: [20, 21], [B]: [30] }, floor: [24], stock: [49, 25, 40] });
    const r = g.play(A, 20);
    expect(banners(r)).toContain('bonus');
    expect(g.captured[A]).toEqual(expect.arrayContaining([49, 25, 24]));
    expect(g.turn).toBe(B);
  });
  test('세 번째 보너스패(50)도 쌍피 — 연달아 나오면 계속 뒤집는다', () => {
    expect(computeScore([48, 49, 50, 2, 3, 6, 7]).pi).toBe(10);
    const g = mk([A, B], { hands: { [A]: [20, 21], [B]: [30] }, floor: [24], stock: [50, 48, 25, 40] });
    g.play(A, 20);
    expect(g.captured[A]).toEqual(expect.arrayContaining([50, 48, 25, 24]));
    expect(g.stock).toEqual([40]);
  });
  test('보너스패로 더미가 비면 턴 종료', () => {
    const g = mk([A, B], { hands: { [A]: [20], [B]: [] }, floor: [24], stock: [49] });
    g.play(A, 20);
    expect(g.phase).toBe('ended');
    expect(g.result.draw).toBe(true);
  });
  test('덱 딜링 시 바닥의 보너스패는 선이 가져간다', () => {
    for (let s = 1; s < 300; s++) {
      const g = new GostopGame([A, B], { bonus: true, rnd: seeded(s) });
      expect(g.floor.filter((id) => id >= 48)).toEqual([]);
      expect(g.floor).toHaveLength(8);
      expect(new Set(allCards(g)).size).toBe(51);
    }
  });
});

describe('N인 무작위 불변식', () => {
  const configs = [
    ['3인', [A, B, C], {}],
    ['4인', [A, B, C, D], {}],
    ['3인+보너스', [A, B, C], { bonus: true }],
    ['4인+보너스', [A, B, C, D], { bonus: true }],
    ['2인+보너스', [A, B], { bonus: true }],
  ];
  for (const [name, pids, opts] of configs) {
    test.each(Array.from({ length: 120 }, (_, i) => i + 1))(`${name} seed %i`, (seed) => {
      const rnd = seeded(seed * 104729);
      const g = new GostopGame(pids, { rnd, firstPlayer: pids[0], ...opts });
      const total = g.bonusOn ? 51 : 48;
      for (let step = 0; step < 600 && g.phase !== 'ended'; step++) {
        const p = g.turn;
        let r;
        if (g.phase === 'gwang') r = rnd() < 0.5 ? g.sellGwang(p) : g.passGwang(p);
        else if (g.phase === 'choose') r = g.choose(p, g.ctx.choice.options[Math.floor(rnd() * g.ctx.choice.options.length)]);
        else if (g.phase === 'gostop') r = rnd() < 0.5 ? g.callGo(p) : g.callStop(p);
        else if (g.hands[p].length === 0 || g.dummies[p] > 0) r = g.play(p, null);
        else r = g.play(p, g.hands[p][Math.floor(rnd() * g.hands[p].length)]);
        expect(r.ok).toBe(true);
        expect(g.active).not.toContain(g.rest);
        const all = allCards(g);
        expect(all).toHaveLength(total);
        expect(new Set(all).size).toBe(total);
      }
      expect(g.phase).toBe('ended');
      const res = g.result;
      if (!res.draw) {
        expect(res.total).toBeGreaterThanOrEqual(g.threshold);
        for (const pay of res.payments.filter((x) => x.kind === 'game')) {
          expect(pay.to).toBe(res.winner);
          expect(g.active).toContain(pay.from);
        }
      }
      // 어떤 프레임 뷰도 다른 사람의 손패를 담지 않는다
      const v = GostopGame.viewOf(g.snapshot(), pids[0], pids);
      expect(v).not.toHaveProperty('hands');
    });
  }
});
