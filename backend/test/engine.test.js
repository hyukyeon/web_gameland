import { GostopGame } from '../src/game/GostopGame.js';
import { computeScore } from '../src/game/score.js';
import { card } from '../src/game/cards.js';

const A = 'A';
const B = 'B';

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

/** 지정한 상태로 덮어쓴 게임을 만든다 (월 3: 8광 9홍단 10피 11피 / 월 2: 4열끗 5홍단 6피 7피) */
function mk({ a = [], b = [], floor = [], stock = [], capA = [], capB = [], turn = A } = {}) {
  const g = new GostopGame([A, B], { rnd: seeded(1) });
  g.hands = { [A]: [...a], [B]: [...b] };
  g.floor = [...floor];
  g.stock = [...stock];
  g.captured = { [A]: [...capA], [B]: [...capB] };
  g.turn = turn;
  g.phase = 'play';
  return g;
}

const banners = (r) => r.frames.map((f) => f.banner?.kind).filter(Boolean);
const last = (r) => r.frames[r.frames.length - 1];

// 7점: 4광(0,8,28,40) + 홍단(1,5,9)
const SEVEN = [0, 8, 28, 40, 1, 5, 9];

describe('딜링', () => {
  test.each(Array.from({ length: 100 }, (_, i) => i + 1))('seed %i: 10/10/8/20 이며 48장 유일, 동월 4장 없음', (seed) => {
    const g = new GostopGame([A, B], { rnd: seeded(seed) });
    expect(g.hands[A]).toHaveLength(10);
    expect(g.hands[B]).toHaveLength(10);
    expect(g.floor).toHaveLength(8);
    expect(g.stock).toHaveLength(20);
    const all = [...g.hands[A], ...g.hands[B], ...g.floor, ...g.stock];
    expect(new Set(all).size).toBe(48);
    for (const grp of [g.hands[A], g.hands[B], g.floor]) {
      const m = {};
      grp.forEach((id) => (m[card(id).month] = (m[card(id).month] || 0) + 1));
      expect(Math.max(...Object.values(m))).toBeLessThan(4);
    }
  });
  test('선공은 firstPlayer', () => {
    expect(new GostopGame([A, B], { firstPlayer: B }).turn).toBe(B);
  });
});

describe('패 내기 기본', () => {
  test('내 차례가 아니면 거부', () => {
    const g = mk({ a: [20], b: [30], floor: [], stock: [40] });
    expect(g.play(B, 30).ok).toBe(false);
  });
  test('가지지 않은 패는 거부', () => {
    const g = mk({ a: [20], b: [30], stock: [40] });
    expect(g.play(A, 21).ok).toBe(false);
  });
  test('손패가 남아 있으면 뒤집기(null) 거부', () => {
    const g = mk({ a: [20], b: [30], stock: [40] });
    expect(g.play(A, null).ok).toBe(false);
  });
  test('매칭 없는 패는 바닥에 놓이고 턴이 넘어간다', () => {
    const g = mk({ a: [20, 21], b: [30], floor: [24], stock: [40, 41] });
    const r = g.play(A, 20);
    expect(r.ok).toBe(true);
    expect(g.floor).toEqual(expect.arrayContaining([20, 24, 40]));
    expect(g.captured[A]).toEqual([]);
    expect(g.turn).toBe(B);
  });
  test('1장 매칭이면 손패+바닥패를 가져온다', () => {
    const g = mk({ a: [8, 20], b: [30], floor: [9], stock: [40] });
    g.play(A, 8);
    expect(g.captured[A]).toEqual(expect.arrayContaining([8, 9]));
    expect(g.floor).not.toContain(9);
  });
  test('더미에서 뒤집은 패가 바닥과 맞으면 함께 가져온다', () => {
    const g = mk({ a: [20, 21], b: [30], floor: [24], stock: [25] });
    g.play(A, 20);
    expect(g.captured[A]).toEqual(expect.arrayContaining([25, 24]));
  });
  test('같은 종류 2장이 깔려 있으면 선택 없이 1장만 가져온다', () => {
    const g = mk({ a: [8, 20], b: [30], floor: [10, 11], stock: [40] });
    g.play(A, 8);
    expect(g.captured[A]).toHaveLength(2);
    expect(g.phase).toBe('play');
  });
});

describe('바닥패 선택 (종류가 다른 2장)', () => {
  test('손패 단계에서 선택 대기 → choose 로 진행', () => {
    const g = mk({ a: [6, 20], b: [30], floor: [4, 5], stock: [40] });
    const r = g.play(A, 6);
    expect(g.phase).toBe('choose');
    expect(last(r).choice).toEqual({ step: 'hand', options: [4, 5] });
    expect(g.view(A).choice).not.toBeNull();
    expect(g.view(B).choice).toBeNull();
    expect(g.play(A, 20).ok).toBe(false);
    expect(g.choose(A, 40).ok).toBe(false);
    expect(g.choose(B, 5).ok).toBe(false);
    expect(g.choose(A, 5).ok).toBe(true);
    expect(g.captured[A]).toEqual(expect.arrayContaining([6, 5]));
    expect(g.floor).toContain(4);
    expect(g.turn).toBe(B);
  });
  test('더미 단계에서 선택 대기', () => {
    const g = mk({ a: [20, 21], b: [30], floor: [4, 5, 24], stock: [6, 40] });
    g.play(A, 20);
    expect(g.phase).toBe('choose');
    expect(g.ctx.choice.step).toBe('draw');
    g.choose(A, 4);
    expect(g.captured[A]).toEqual(expect.arrayContaining([6, 4]));
    expect(g.floor).toContain(5);
    expect(g.turn).toBe(B);
  });
});

describe('특수 상황', () => {
  test('뻑: 손패+더미가 같은 월로 3장 쌓이고 턴 종료', () => {
    const g = mk({ a: [8, 20], b: [11, 30], floor: [9], stock: [10, 40] });
    const r = g.play(A, 8);
    expect(banners(r)).toContain('ppeok');
    expect(g.ppeokPiles[3]).toBe(A);
    expect(g.ppeok[A]).toBe(1);
    expect(g.floor).toEqual(expect.arrayContaining([8, 9, 10]));
    expect(g.captured[A]).toEqual([]);
    expect(g.turn).toBe(B);
  });
  test('뻑 먹기: 4장 획득 + 상대 피 1장', () => {
    const g = mk({ a: [8, 20], b: [11, 30], floor: [9], stock: [10, 40], capA: [2] });
    g.play(A, 8);
    g.play(B, 11);
    expect(g.captured[B]).toEqual(expect.arrayContaining([8, 9, 10, 11, 2]));
    expect(g.captured[A]).toEqual([]);
    expect(g.ppeokPiles[3]).toBeUndefined();
  });
  test('자뻑: 내가 만든 뻑을 먹으면 피 2장', () => {
    const g = mk({ a: [8, 11, 20], b: [30], floor: [9], stock: [10, 40], capB: [2, 3] });
    g.play(A, 8);
    g.turn = A;
    const r = g.play(A, 11);
    expect(last(r).banner?.text ?? r.frames.map((f) => f.banner?.text).join()).toContain('자뻑');
    expect(g.captured[A]).toEqual(expect.arrayContaining([8, 9, 10, 11, 2, 3]));
    expect(g.captured[B]).toEqual([]);
  });
  test('더미로 뻑 더미 먹기', () => {
    const g = mk({ a: [8, 20], b: [24, 30], floor: [9], stock: [10, 11], capA: [2] });
    g.play(A, 8); // 뻑
    g.play(B, 24); // 바닥에 놓이고 더미 11 로 뻑 더미 먹기
    expect(g.captured[B]).toEqual(expect.arrayContaining([8, 9, 10, 11, 2]));
  });
  test('뻑 + 더미에서 나온 보너스패: 보너스패도 획득하지 못하고 뻑 더미에 같이 남는다', () => {
    // 손 8(3월) + 바닥 9 → 더미에서 보너스(48) → 한 장 더 뒤집어 10(3월) = 뻑
    const g = mk({ a: [8, 20], b: [11, 30], floor: [9], stock: [48, 10, 40] });
    const r = g.play(A, 8);
    expect(banners(r)).toEqual(expect.arrayContaining(['bonus', 'ppeok']));
    expect(g.captured[A]).toEqual([]); // 보너스패도 못 가져감
    expect(g.floor).toEqual(expect.arrayContaining([8, 9, 10, 48]));
    expect(g.ppeokBonus).toEqual({ 3: [48] });
    expect(GostopGame.viewOf(g.snapshot(), A, [A, B]).ppeokBonus).toEqual({ 3: [48] }); // 화면에서 3월 더미에 같이 보인다
    // 상대가 뻑 더미를 먹으면 보너스패도 함께
    g.play(B, 11);
    expect(g.captured[B]).toEqual(expect.arrayContaining([8, 9, 10, 11, 48]));
    expect(g.floor).not.toContain(48);
    expect(g.ppeokBonus).toEqual({});
  });
  test('뻑 + 손에서 낸 보너스패(같은 차례): 그 보너스패도 뻑 더미에 같이 남는다', () => {
    // 보너스(48)를 내면 더미 한 장(20)을 받아 같은 차례를 이어감 → 8 을 내 9 와 짝 → 더미 10 = 뻑
    const g = mk({ a: [48, 8], b: [11, 30], floor: [9], stock: [20, 10, 40] });
    g.play(A, 48);
    expect(g.captured[A]).toEqual([48]);
    expect(g.turn).toBe(A);
    g.play(A, 8);
    expect(g.ppeokPiles[3]).toBe(A);
    expect(g.captured[A]).toEqual([]);
    expect(g.ppeokBonus[3]).toEqual([48]);
    // 뻑 더미는 더미 뒤집기로 먹어도 보너스패까지
    g.hands[B] = [30];
    g.stock = [11, 41];
    g.play(B, 30);
    expect(g.captured[B]).toEqual(expect.arrayContaining([8, 9, 10, 11, 48]));
  });
  test('뻑이 아니면 이번 차례 보너스패는 그대로 내 것', () => {
    const g = mk({ a: [8, 20], b: [11, 30], floor: [9], stock: [48, 24, 40] });
    g.play(A, 8);
    expect(g.captured[A]).toEqual(expect.arrayContaining([48, 8, 9]));
    expect(g.ppeokBonus).toEqual({});
  });
  test('따닥: 같은 월 4장 + 피 1장', () => {
    const g = mk({ a: [8, 20], b: [30], floor: [10, 11], stock: [9, 40], capB: [2] });
    const r = g.play(A, 8);
    expect(banners(r)).toContain('ttadak');
    expect(g.captured[A]).toEqual(expect.arrayContaining([8, 9, 10, 11, 2]));
    expect(g.captured[B]).toEqual([]);
  });
  test('쪽: 낸 패를 더미가 바로 맞춤 + 피 1장', () => {
    const g = mk({ a: [8, 20], b: [30], floor: [24], stock: [9, 40], capB: [2] });
    const r = g.play(A, 8);
    expect(banners(r)).toContain('jjok');
    expect(g.captured[A]).toEqual(expect.arrayContaining([8, 9, 2]));
  });
  test('싹쓸이: 바닥이 비면 피 1장', () => {
    const g = mk({ a: [8, 20], b: [30], floor: [9, 12], stock: [13, 40], capB: [2] });
    const r = g.play(A, 8);
    expect(banners(r)).toContain('sweep');
    expect(g.floor).toEqual([]);
    expect(g.captured[A]).toEqual(expect.arrayContaining([8, 9, 12, 13, 2]));
  });
  test('마지막 더미로 바닥이 비어도 싹쓸이는 아니다', () => {
    const g = mk({ a: [8], b: [], floor: [9, 12], stock: [13], capB: [2] });
    const r = g.play(A, 8);
    expect(banners(r)).not.toContain('sweep');
  });
  test('폭탄: 3장+바닥 1장 = 4장 획득, 피 1장, 더미턴 2회', () => {
    const g = mk({ a: [8, 9, 10, 20], b: [30], floor: [11, 24], stock: [28, 40], capB: [2] });
    const r = g.play(A, 8);
    expect(banners(r)).toContain('bomb');
    expect(g.captured[A]).toEqual(expect.arrayContaining([8, 9, 10, 11, 2]));
    expect(g.bombs[A]).toBe(1);
    expect(g.dummies[A]).toBe(2);
    expect(g.hands[A]).toEqual([20]);
  });
  test('폭탄 후 더미턴: 패를 내지 않고 뒤집기만 가능', () => {
    const g = mk({ a: [8, 9, 10, 20], b: [30, 31], floor: [11, 24], stock: [28, 40, 41], capB: [2] });
    g.play(A, 8);
    g.turn = A;
    expect(g.play(A, null).ok).toBe(true);
    expect(g.dummies[A]).toBe(1);
  });
  test('흔들기: 같은 월 3장 보유 시 가능, 아니면 거부', () => {
    const g = mk({ a: [8, 9, 10, 20], b: [30], floor: [24], stock: [28, 40] });
    expect(g.play(A, 20, { shake: true }).ok).toBe(false);
    const r = g.play(A, 8, { shake: true });
    expect(r.ok).toBe(true);
    expect(banners(r)).toContain('shake');
    expect(g.shakes[A]).toBe(1);
  });
  test('손패가 없으면 뒤집기만 한다', () => {
    const g = mk({ a: [], b: [30], floor: [24], stock: [25, 40] });
    expect(g.play(A, null).ok).toBe(true);
    expect(g.captured[A]).toEqual(expect.arrayContaining([25, 24]));
  });
});

describe('고/스톱 흐름', () => {
  test('7점 달성 시 gostop 단계로 대기', () => {
    const g = mk({ a: [20, 21], b: [30], floor: [24], stock: [44], capA: SEVEN });
    g.play(A, 20);
    expect(g.phase).toBe('gostop');
    expect(g.turn).toBe(A);
    expect(g.play(A, 21).ok).toBe(false);
    expect(g.callStop(B).ok).toBe(false);
  });
  test('6점 이하면 계속 진행', () => {
    const g = mk({ a: [20, 21], b: [30], floor: [24], stock: [44], capA: [0, 8, 28, 40, 1, 5] });
    g.play(A, 20);
    expect(g.phase).toBe('play');
    expect(g.turn).toBe(B);
  });
  test('고: go 증가, 상대 턴으로', () => {
    const g = mk({ a: [20, 21], b: [30], floor: [24], stock: [44], capA: SEVEN });
    g.play(A, 20);
    const r = g.callGo(A);
    expect(r.ok).toBe(true);
    expect(g.go[A]).toBe(1);
    expect(g.turn).toBe(B);
    expect(g.phase).toBe('play');
  });
  test('고 이후 점수가 늘지 않으면 다시 묻지 않는다', () => {
    const g = mk({ a: [20, 21], b: [30, 31], floor: [24], stock: [44, 45], capA: SEVEN });
    g.play(A, 20);
    g.callGo(A);
    g.play(B, 30);
    g.play(A, 21);
    expect(g.phase).toBe('play');
    expect(g.turn).toBe(B);
  });
  test('고 이후 점수가 오르면 다시 고/스톱', () => {
    const g = mk({ a: [20, 21], b: [30, 31], floor: [24], stock: [26, 27, 44], capA: SEVEN });
    g.play(A, 20);
    g.callGo(A);
    g.play(B, 30);
    g.captured[A].push(44); // 5광
    g.play(A, 21);
    expect(g.phase).toBe('gostop');
  });
  test('스톱 → 종료', () => {
    const g = mk({ a: [20, 21], b: [30], floor: [24], stock: [26], capA: SEVEN, capB: [44] });
    g.play(A, 20);
    const r = g.callStop(A);
    expect(r.ok).toBe(true);
    expect(g.phase).toBe('ended');
    expect(g.result.winner).toBe(A);
    expect(g.result.loser).toBe(B);
  });
});

describe('정산 (점수/박/배수)', () => {
  function stopWith(o, tweak) {
    const g = mk({ turn: A, ...o });
    g.phase = 'gostop';
    g.ctx = { base: computeScore(g.captured[A]).total };
    tweak?.(g);
    g.callStop(A);
    return g.result;
  }

  test('기본: 7점 그대로', () => {
    const r = stopWith({ capA: SEVEN, capB: [44] });
    expect(r.total).toBe(7);
    expect(r.mult).toBe(1);
    expect(r.tags).toEqual([]);
  });
  test('광박: 상대 광 0장 → ×2', () => {
    const r = stopWith({ capA: SEVEN, capB: [] });
    expect(r.total).toBe(14);
    expect(r.tags).toContain('광박 ×2');
  });
  test('광 점수가 없으면 광박 아님', () => {
    const yeol7 = [4, 12, 16, 20, 24, 29, 36];
    const r = stopWith({ capA: yeol7, capB: [] });
    expect(r.tags.join()).not.toContain('광박');
  });
  test('피박: 내 피 10장 이상 + 상대 피 5장 이하 → ×2', () => {
    const pi10 = [2, 3, 6, 7, 10, 11, 14, 15, 18, 19];
    const r = stopWith({ capA: [0, 8, 28, 40, 1, 5, 9, ...pi10].filter((x, i, a) => a.indexOf(x) === i), capB: [44, 22] });
    expect(r.base).toBe(8);
    expect(r.tags).toContain('피박 ×2');
    expect(r.total).toBe(16);
  });
  test('상대 피가 6장 이상이면 피박 아님', () => {
    const pi10 = [2, 3, 6, 7, 10, 11, 14, 15, 18, 19];
    const r = stopWith({ capA: [0, 8, 28, 40, 1, 5, 9, ...pi10], capB: [44, 22, 23, 26, 27, 30, 31] });
    expect(r.tags.join()).not.toContain('피박');
  });
  test('멍박: 열끗 7장 이상 → ×2', () => {
    const r = stopWith({ capA: [4, 12, 16, 20, 24, 29, 36], capB: [44] });
    expect(r.base).toBe(8); // 열끗 3점 + 고도리 5점
    expect(r.tags).toContain('멍박 ×2');
    expect(r.total).toBe(16);
  });
  test('고박: 진 사람이 고를 불렀다면 ×2', () => {
    const r = stopWith({ capA: SEVEN, capB: [44] }, (g) => (g.go[B] = 1));
    expect(r.tags).toContain('고박 ×2');
    expect(r.total).toBe(14);
  });
  test('1고 = +1, 2고 = +2', () => {
    expect(stopWith({ capA: SEVEN, capB: [44] }, (g) => (g.go[A] = 1)).total).toBe(8);
    expect(stopWith({ capA: SEVEN, capB: [44] }, (g) => (g.go[A] = 2)).total).toBe(9);
  });
  test('3고 = (점수+2)×2, 4고 = ×4', () => {
    expect(stopWith({ capA: SEVEN, capB: [44] }, (g) => (g.go[A] = 3)).total).toBe(18);
    expect(stopWith({ capA: SEVEN, capB: [44] }, (g) => (g.go[A] = 4)).total).toBe(36);
  });
  test('흔들기/폭탄은 각각 ×2', () => {
    expect(stopWith({ capA: SEVEN, capB: [44] }, (g) => (g.shakes[A] = 1)).total).toBe(14);
    expect(stopWith({ capA: SEVEN, capB: [44] }, (g) => ((g.shakes[A] = 1), (g.bombs[A] = 1))).total).toBe(28);
  });
  test('박이 겹치면 곱해진다 (광박×고박)', () => {
    const r = stopWith({ capA: SEVEN, capB: [] }, (g) => (g.go[B] = 1));
    expect(r.total).toBe(28);
  });
});

describe('종료 조건', () => {
  test('모든 패 소진 + 7점 미만 → 나가리', () => {
    const g = mk({ a: [20], b: [], floor: [24], stock: [] });
    const r = g.play(A, 20);
    expect(g.phase).toBe('ended');
    expect(g.result.draw).toBe(true);
    expect(g.result.winner).toBeNull();
    expect(last(r).banner.text).toBe('나가리');
  });
  test('마지막 패에서 7점 달성 → 즉시 승리', () => {
    const g = mk({ a: [20], b: [], floor: [24], stock: [], capA: SEVEN, capB: [44] });
    g.play(A, 20);
    expect(g.phase).toBe('ended');
    expect(g.result.winner).toBe(A);
  });
  test('기권: 상대 7점 승', () => {
    const g = mk({ a: [20], b: [30], stock: [40] });
    const r = g.forfeit(A);
    expect(r.ok).toBe(true);
    expect(g.result).toMatchObject({ winner: B, loser: A, total: 7, forfeit: true });
    expect(g.forfeit(A).ok).toBe(false);
  });
  test('종료 후 액션 거부', () => {
    const g = mk({ a: [20], b: [30], stock: [40] });
    g.forfeit(A);
    expect(g.play(A, 20).ok).toBe(false);
    expect(g.callGo(A).ok).toBe(false);
  });
});

describe('뷰 (정보 은닉)', () => {
  test('상대 손패/더미 내용은 노출되지 않는다', () => {
    const g = new GostopGame([A, B], { rnd: seeded(7) });
    const v = g.view(A);
    expect(v.hand).toEqual(g.hands[A]);
    expect(v.oppHandCount).toBe(10);
    expect(v).not.toHaveProperty('hands');
    expect(v).not.toHaveProperty('stock');
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(g.hands[B]));
  });
  test('프레임 뷰도 상대 손패를 숨긴다', () => {
    const g = new GostopGame([A, B], { rnd: seeded(9), firstPlayer: A });
    const id = g.hands[A][0];
    const r = g.play(A, id);
    for (const f of r.frames) {
      const v = GostopGame.viewOf(f, B, [A, B]);
      expect(v).not.toHaveProperty('hands');
      expect(v.hand).toEqual(f.hands[B]);
    }
  });
});

describe('무작위 대국 불변식', () => {
  test.each(Array.from({ length: 300 }, (_, i) => i + 1))('seed %i: 카드 보존, 종료 보장', (seed) => {
    const rnd = seeded(seed * 7919);
    const g = new GostopGame([A, B], { rnd });
    for (let step = 0; step < 400 && g.phase !== 'ended'; step++) {
      const p = g.turn;
      let r;
      if (g.phase === 'choose') r = g.choose(p, g.ctx.choice.options[Math.floor(rnd() * g.ctx.choice.options.length)]);
      else if (g.phase === 'gostop') r = rnd() < 0.5 ? g.callGo(p) : g.callStop(p);
      else if (g.hands[p].length === 0 || g.dummies[p] > 0) r = g.play(p, null);
      else r = g.play(p, g.hands[p][Math.floor(rnd() * g.hands[p].length)]);
      expect(r.ok).toBe(true);
      const all = [...g.hands[A], ...g.hands[B], ...g.floor, ...g.stock, ...g.captured[A], ...g.captured[B]];
      expect(all).toHaveLength(48);
      expect(new Set(all).size).toBe(48);
    }
    expect(g.phase).toBe('ended');
    if (!g.result.draw) {
      expect(g.result.total).toBeGreaterThanOrEqual(7);
      expect(g.result.winner).not.toBe(g.result.loser);
    }
  });
});
