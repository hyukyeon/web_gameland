import { GostopGame } from '../src/game/GostopGame.js';
import { computeScore } from '../src/game/score.js';

const [A, B, C] = ['A', 'B', 'C'];

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
  g.turn = turn ?? g.active[0];
  return g;
}
const banners = (r) => r.frames.map((f) => f.banner?.kind).filter(Boolean);
const SEVEN = [0, 8, 28, 40, 1, 5, 9];

describe('마지막 패에서는 따닥/쪽/싹쓸이 불인정', () => {
  test('따닥 불인정', () => {
    const g = mk([A, B], { hands: { [A]: [8], [B]: [] }, floor: [10, 11], stock: [9], cap: { [B]: [2] } });
    const r = g.play(A, 8);
    expect(banners(r)).not.toContain('ttadak');
    expect(g.captured[B]).toEqual([2]);
  });
  test('쪽 불인정', () => {
    const g = mk([A, B], { hands: { [A]: [8], [B]: [] }, floor: [24], stock: [9], cap: { [B]: [2] } });
    const r = g.play(A, 8);
    expect(banners(r)).not.toContain('jjok');
    expect(g.captured[B]).toEqual([2]);
  });
  test('싹쓸이 불인정', () => {
    const g = mk([A, B], { hands: { [A]: [8], [B]: [] }, floor: [9], stock: [], cap: { [B]: [2] } });
    const r = g.play(A, 8);
    expect(banners(r)).not.toContain('sweep');
  });
  test('마지막이 아니면 인정 (상대에게 패가 남음)', () => {
    const g = mk([A, B], { hands: { [A]: [8], [B]: [30] }, floor: [9], stock: [], cap: { [B]: [2] } });
    const r = g.play(A, 8);
    expect(banners(r)).toContain('sweep');
  });
});

describe('뻑 칩 (ppeokPay 옵션)', () => {
  // A 가 뻑: 손 8, 바닥 9, 더미 10
  const ppeokGame = (opts = {}) =>
    mk([A, B, C], {
      hands: { [A]: [8, 20, 21], [B]: [30, 31, 32], [C]: [36, 37, 38] },
      floor: [9],
      stock: [10, 40, 41, 42, 43],
      ...opts,
    });
  test('옵션이 꺼져 있으면 칩 없음', () => {
    const g = ppeokGame();
    g.play(A, 8);
    g.endDraw();
    expect(g.result.payments).toEqual([]);
  });
  test('첫뻑: 각 상대가 3점 지불', () => {
    const g = ppeokGame({ ppeokPay: true });
    g.play(A, 8);
    g.endDraw();
    expect(g.result.payments.map((p) => [p.kind, p.from, p.to, p.total, p.tags[0]])).toEqual([
      ['ppeok', B, A, 3, '첫뻑'],
      ['ppeok', C, A, 3, '첫뻑'],
    ]);
  });
  test('연뻑(2연속)은 6점, 삼연뻑은 즉시 종료', () => {
    const g = mk([A, B], {
      hands: { [A]: [8, 12, 16, 20], [B]: [30, 31, 32, 33] },
      floor: [9, 13, 17],
      stock: [10, 40, 14, 44, 18, 45],
      ppeokPay: true,
    });
    g.play(A, 8); // 뻑 (3월)
    expect(g.ppeokStreak[A]).toBe(1);
    g.play(B, 30);
    g.play(A, 12); // 뻑 (4월): 연뻑
    expect(g.ppeokStreak[A]).toBe(2);
    expect(g.extraPayments.map((p) => p.total)).toEqual([3, 6]);
    g.play(B, 31);
    const r = g.play(A, 16); // 삼연뻑
    expect(banners(r)).toContain('ppeok');
    expect(g.phase).toBe('ended');
    expect(g.result).toMatchObject({ winner: A, tags: ['삼연뻑'] });
    expect(g.result.payments.map((p) => [p.kind, p.total])).toEqual([
      ['game', 3],
      ['ppeok', 3],
      ['ppeok', 6],
    ]);
  });
  test('뻑이 아닌 턴을 보내면 연속 기록이 초기화', () => {
    const g = ppeokGame({ ppeokPay: true });
    g.play(A, 8);
    expect(g.ppeokStreak[A]).toBe(1);
    g.play(B, 30);
    g.play(C, 36);
    g.play(A, 20);
    expect(g.ppeokStreak[A]).toBe(0);
  });
});

describe('총통 (chongtong 옵션)', () => {
  function findChong(n, opts) {
    for (let s = 1; s < 5000; s++) {
      const g = new GostopGame(n === 2 ? [A, B] : [A, B, C], { rnd: seeded(s), chongtong: true, ...opts });
      if (g.phase === 'chong') return g;
    }
    throw new Error('총통 시드를 찾지 못함');
  }
  test('옵션이 꺼져 있으면 4장 동월은 다시 섞는다 (총통 단계 없음)', () => {
    for (let s = 1; s < 3000; s++) {
      const g = new GostopGame([A, B, C], { rnd: seeded(s) });
      expect(g.phase).not.toBe('chong');
    }
  });
  test('총통 보유자에게 선언 여부를 묻는다', () => {
    const g = findChong(3);
    const holder = g.turn;
    expect(g.view(holder).chongAsk).toBe(holder);
    expect(g.play(holder, g.hands[holder][0]).ok).toBe(false);
  });
  test('선언하면 즉시 종료, 상대 각각에게 3점', () => {
    const g = findChong(3);
    const h = g.turn;
    const r = g.callChongtong(h);
    expect(r.ok).toBe(true);
    expect(g.phase).toBe('ended');
    expect(g.result.chongtong).toBe(true);
    expect(g.result.payments).toHaveLength(2);
    for (const p of g.result.payments) expect([p.to, p.total]).toEqual([h, 3]);
  });
  test('선언 안 하고 계속해서 이기면 ×4', () => {
    const g = findChong(3);
    const h = g.turn;
    g.passChongtong(h);
    expect(['chong', 'gwang', 'play']).toContain(g.phase);
    expect(g.chongHolders).toContain(h);
    // 강제로 승리 상태를 만든다
    g.phase = 'gostop';
    g.turn = h;
    g.captured[h] = [...SEVEN];
    for (const p of g.pids) if (p !== h) g.captured[p] = [44];
    g.threshold = 3;
    g.ctx = { base: 7 };
    g.callStop(h);
    expect(g.result.mult).toBe(4);
    expect(g.result.tags).toContain('총통 ×4');
    expect(g.result.payments[0].total).toBe(28);
  });
  test('다른 사람은 선언할 수 없다', () => {
    const g = findChong(3);
    const other = g.active.find((p) => p !== g.turn);
    expect(g.callChongtong(other).ok).toBe(false);
  });
});

describe('나가리 이월 / 띠박', () => {
  function stop(pids, cap, opts, tweak) {
    const g = mk(pids, { cap, ...opts });
    g.phase = 'gostop';
    g.turn = A;
    g.ctx = { base: computeScore(g.captured[A]).total };
    tweak?.(g);
    g.callStop(A);
    return g.result;
  }
  test('나가리 결과는 nagari 표시', () => {
    const g = mk([A, B], { hands: { [A]: [20], [B]: [] }, floor: [24], stock: [] });
    g.play(A, 20);
    expect(g.result.nagari).toBe(true);
  });
  test('carry=2 이면 다음 판 점수가 ×2', () => {
    const r = stop([A, B], { [A]: SEVEN, [B]: [44] }, { carry: 2 });
    expect(r.total).toBe(14);
    expect(r.tags).toContain('나가리 이월 ×2');
  });
  test('carry 기본값은 영향 없음', () => {
    expect(stop([A, B], { [A]: SEVEN, [B]: [44] }, {}).total).toBe(7);
  });
  test('띠박은 옵션을 켰을 때만 (승자 띠 5장 이상 ×2)', () => {
    const tti5 = [1, 5, 9, 13, 17]; // 홍단3 + 띠5장1 = 4점 (+광 3점 이상으로 7점 맞춤)
    const cap = { [A]: [...tti5, 0, 8, 28], [B]: [44] };
    expect(stop([A, B], cap, {}).tags.join()).not.toContain('띠박');
    const r = stop([A, B], cap, { ttibak: true });
    expect(r.tags).toContain('띠박 ×2');
    expect(r.total).toBe(r.base * 2);
  });
});

describe('밤일낮장 (선 정하기)', () => {
  test('밤: 낮은 월이 선, 낮: 높은 월이 선', () => {
    for (let s = 1; s < 50; s++) {
      const n = GostopGame.decideFirst([A, B, C], { rnd: seeded(s), night: true });
      const d = GostopGame.decideFirst([A, B, C], { rnd: seeded(s), night: false });
      expect(n.flips).toHaveLength(3);
      expect(n.flips.find((f) => f.p === n.first).m).toBe(Math.min(...n.flips.map((f) => f.m)));
      expect(d.flips.find((f) => f.p === d.first).m).toBe(Math.max(...d.flips.map((f) => f.m)));
      expect(new Set(n.flips.map((f) => f.id)).size).toBe(3);
    }
  });
  test('동월이면 먼저 앉은 사람이 선', () => {
    const r = GostopGame.decideFirst([A, B], { rnd: () => 0.99 });
    expect(['A', 'B']).toContain(r.first);
  });
});

describe('옵션 조합 무작위 불변식', () => {
  const opts = { ppeokPay: true, ttibak: true, chongtong: true, bonus: true, carry: 2 };
  test.each(Array.from({ length: 150 }, (_, i) => i + 1))('3인 전체옵션 seed %i', (seed) => {
    const rnd = seeded(seed * 7727);
    const g = new GostopGame([A, B, C], { rnd, ...opts });
    const total = 50;
    for (let step = 0; step < 600 && g.phase !== 'ended'; step++) {
      const p = g.turn;
      let r;
      if (g.phase === 'chong') r = rnd() < 0.4 ? g.callChongtong(p) : g.passChongtong(p);
      else if (g.phase === 'gwang') r = rnd() < 0.5 ? g.sellGwang(p) : g.passGwang(p);
      else if (g.phase === 'choose') r = g.choose(p, g.ctx.choice.options[0]);
      else if (g.phase === 'gostop') r = rnd() < 0.5 ? g.callGo(p) : g.callStop(p);
      else if (g.hands[p].length === 0 || g.dummies[p] > 0) r = g.play(p, null);
      else r = g.play(p, g.hands[p][Math.floor(rnd() * g.hands[p].length)]);
      expect(r.ok).toBe(true);
      const all = [...Object.values(g.hands).flat(), ...Object.values(g.captured).flat(), ...g.floor, ...g.stock];
      expect(all).toHaveLength(total);
      expect(new Set(all).size).toBe(total);
    }
    expect(g.phase).toBe('ended');
    for (const pay of g.result.payments) {
      expect(pay.total).toBeGreaterThan(0);
      expect(pay.from).not.toBe(pay.to);
    }
  });
});
