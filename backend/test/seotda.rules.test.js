import { SEOTDA_DECK, seotdaCard, evaluateHand, compareHands, POWER } from '../src/seotda/rules.js';

// 카드 id (1~10월 각 2장)
const C = {
  g1: 0, p1: 2, // 1월 광, 피
  b2: 4, red2: 5, // 2월 새, 홍단
  g3: 8, p3: 10, // 3월 광, 피
  b4: 12, p4: 14, // 4월 새(열끗), 피
  bf5: 16, p5: 18, // 5월 나비, 피
  bf6: 20, p6: 22, // 6월 나비, 피
  boar7: 24, p7: 26, // 7월 멧돼지(열끗), 피
  g8: 28, b8: 29, // 8월 광, 새
  ss9: 32, p9: 34, // 9월 국진(쌍피), 피
  deer10: 36, p10: 38, // 10월 사슴, 피
};
const ev = (a, b) => evaluateHand([a, b]);
const win = (hands) => compareHands(hands);

describe('섯다 덱', () => {
  test('1~10월 각 2장, 총 20장, 중복 없음', () => {
    expect(SEOTDA_DECK).toHaveLength(20);
    expect(new Set(SEOTDA_DECK).size).toBe(20);
    const byMonth = {};
    SEOTDA_DECK.forEach((id) => {
      const m = seotdaCard(id).month;
      byMonth[m] = (byMonth[m] ?? 0) + 1;
    });
    expect(Object.keys(byMonth).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(Object.values(byMonth).every((n) => n === 2)).toBe(true);
    expect(() => seotdaCard(1)).toThrow(); // 1월 띠 등은 섯다 덱이 아님
  });

  test('카드 라벨이 사양과 일치', () => {
    const l = (id) => seotdaCard(id).label;
    expect([l(C.g1), l(C.p1), l(C.b2), l(C.red2), l(C.bf5), l(C.boar7), l(C.g8), l(C.b8), l(C.ss9), l(C.deer10)]).toEqual([
      '1월 광', '1월 피', '2월 새', '2월 홍단', '5월 나비', '7월 멧돼지', '8월 광', '8월 새', '9월 쌍피', '10월 사슴',
    ]);
  });
});

describe('족보 판별', () => {
  test('광땡', () => {
    expect(ev(C.g3, C.g8)).toMatchObject({ name: '삼팔광땡', power: POWER.GWANG38 });
    expect(ev(C.g1, C.g8)).toMatchObject({ name: '18광땡' });
    expect(ev(C.g1, C.g3)).toMatchObject({ name: '13광땡' });
    expect(ev(C.g3, C.g8).power).toBeGreaterThan(ev(C.g1, C.g8).power);
    expect(ev(C.g1, C.g8).power).toBeGreaterThan(ev(C.g1, C.g3).power);
  });

  test('땡: 10땡(장땡) ~ 1땡(삥땡), 같은 월 두 장', () => {
    expect(ev(C.deer10, C.p10).name).toBe('장땡');
    expect(ev(C.ss9, C.p9).name).toBe('9땡');
    expect(ev(C.g1, C.p1).name).toBe('삥땡');
    expect(ev(C.g3, C.p3).name).toBe('3땡'); // 같은 월이면 광이어도 땡
    expect(ev(C.deer10, C.p10).power).toBeGreaterThan(ev(C.ss9, C.p9).power);
    expect(ev(C.g1, C.p1).power).toBeGreaterThan(ev(C.g1, C.b2).power); // 삥땡 > 알리
    expect(ev(C.g1, C.g3).power).toBeGreaterThan(ev(C.deer10, C.p10).power); // 광땡 > 장땡
  });

  test('중간 족보 6종 + 순서', () => {
    expect(ev(C.g1, C.b2).name).toBe('알리');
    expect(ev(C.p1, C.b4).name).toBe('독사');
    expect(ev(C.g1, C.p9).name).toBe('구삥');
    expect(ev(C.g1, C.deer10).name).toBe('장삥');
    expect(ev(C.p4, C.p10).name).toBe('장사');
    expect(ev(C.p4, C.bf6).name).toBe('세륙');
    const order = ['알리', '독사', '구삥', '장삥', '장사', '세륙'];
    const hands = [ev(C.g1, C.b2), ev(C.p1, C.b4), ev(C.g1, C.p9), ev(C.g1, C.deer10), ev(C.p4, C.p10), ev(C.p4, C.bf6)];
    expect(hands.map((h) => h.name)).toEqual(order);
    for (let i = 1; i < hands.length; i++) expect(hands[i - 1].power).toBeGreaterThan(hands[i].power);
  });

  test('갑오·끗·망통', () => {
    expect(ev(C.g1, C.b8)).toMatchObject({ name: '갑오', category: 'gapo' }); // 1광+8새 = 9
    expect(ev(C.p3, C.bf6).name).toBe('갑오');
    expect(ev(C.g1, C.p3).name).toBe('4끗');
    expect(ev(C.b2, C.bf6).name).toBe('8끗');
    expect(ev(C.p3, C.p7).name).toBe('망통'); // 3+7=10
    expect(ev(C.p1, C.b8).power).toBeGreaterThan(ev(C.b2, C.bf6).power); // 갑오 > 8끗
    expect(ev(C.b2, C.bf6).power).toBeGreaterThan(ev(C.p3, C.p7).power);
  });

  test('특수 족보 식별: 암행어사/땡잡이/구사/멍텅구리구사', () => {
    expect(ev(C.b4, C.boar7)).toMatchObject({ name: '암행어사', special: 'amhaeng', power: POWER.KKEUT_BASE + 1 });
    expect(ev(C.p4, C.boar7).special).toBeNull(); // 4피 + 7열 은 그냥 1끗
    expect(ev(C.g3, C.boar7)).toMatchObject({ name: '땡잡이', special: 'ttangjabi', power: POWER.KKEUT_BASE });
    expect(ev(C.g3, C.p7).special).toBeNull(); // 3광 + 7피 는 그냥 망통
    expect(ev(C.b4, C.ss9)).toMatchObject({ name: '멍텅구리구사', special: 'meongtung_gusa' });
    expect(ev(C.p4, C.p9)).toMatchObject({ name: '구사', special: 'gusa' });
    expect(ev(C.b4, C.p9).special).toBe('gusa');
    expect(ev(C.p4, C.ss9).special).toBe('gusa');
  });

  test('모든 190가지 두 장 조합이 오류 없이 평가된다', () => {
    let n = 0;
    for (let i = 0; i < SEOTDA_DECK.length; i++) {
      for (let j = i + 1; j < SEOTDA_DECK.length; j++) {
        const h = ev(SEOTDA_DECK[i], SEOTDA_DECK[j]);
        expect(typeof h.name).toBe('string');
        expect(h.power).toBeGreaterThanOrEqual(500);
        expect(evaluateHand([SEOTDA_DECK[j], SEOTDA_DECK[i]])).toEqual(h); // 순서 무관
        n++;
      }
    }
    expect(n).toBe(190);
    expect(() => evaluateHand([0, 0])).toThrow();
  });
});

describe('쇼다운 – 특수 족보 상성', () => {
  test('암행어사가 13광땡·18광땡을 잡는다', () => {
    expect(win({ 1: [C.b4, C.boar7], 2: [C.g1, C.g3] }).winners).toEqual([1]); // vs 13광땡
    expect(win({ 1: [C.b4, C.boar7], 2: [C.g1, C.g8] }).winners).toEqual([1]); // vs 18광땡
  });

  test('38광땡은 암행어사를 무시하고 이긴다', () => {
    expect(win({ 1: [C.b4, C.boar7], 2: [C.g3, C.g8] }).winners).toEqual([2]);
    // 3인: 13광땡·38광땡·암행어사 → 38광땡
    expect(win({ 1: [C.b4, C.boar7], 2: [C.g1, C.g3], 3: [C.g3, C.g8] }).winners).toEqual([3]);
  });

  test('암행어사는 광땡이 없으면 1끗 취급: 끗·갑오에도 진다', () => {
    expect(win({ 1: [C.b4, C.boar7], 2: [C.b2, C.bf6] }).winners).toEqual([2]); // vs 8끗
    expect(win({ 1: [C.b4, C.boar7], 2: [C.deer10, C.p10] }).winners).toEqual([2]); // vs 장땡
    expect(win({ 1: [C.b4, C.boar7], 2: [C.p3, C.p7] }).winners).toEqual([1]); // vs 망통 → 1끗 승
  });

  test('땡잡이가 8땡을 잡는다 (1땡~9땡 전부)', () => {
    expect(win({ 1: [C.g3, C.boar7], 2: [C.g8, C.b8] }).winners).toEqual([1]); // vs 8땡
    expect(win({ 1: [C.g3, C.boar7], 2: [C.g1, C.p1] }).winners).toEqual([1]); // vs 삥땡
    expect(win({ 1: [C.g3, C.boar7], 2: [C.ss9, C.p9] }).winners).toEqual([1]); // vs 9땡
  });

  test('땡잡이는 장땡·광땡은 못 잡는다', () => {
    expect(win({ 1: [C.g3, C.boar7], 2: [C.deer10, C.p10] }).winners).toEqual([2]);
    expect(win({ 1: [C.g3, C.boar7], 2: [C.g1, C.g8] }).winners).toEqual([2]);
    // 3인: 9땡과 장땡이 같이 있으면 장땡이 이긴다 (땡잡이는 9땡만 잡음)
    expect(win({ 1: [C.g3, C.boar7], 2: [C.ss9, C.p9], 3: [C.deer10, C.p10] }).winners).toEqual([3]);
  });

  test('땡잡이는 땡이 없으면 망통: 끗에도 진다', () => {
    expect(win({ 1: [C.g3, C.boar7], 2: [C.g1, C.p3] }).winners).toEqual([2]); // vs 4끗
    expect(win({ 1: [C.g3, C.boar7], 2: [C.p3, C.p7] }).winners).toEqual([1, 2]); // 망통 vs 망통 → 무승부(공동)
  });

  test('일반 비교와 무승부(공동 승자)', () => {
    expect(win({ 1: [C.g1, C.b2], 2: [C.p4, C.bf6] }).winners).toEqual([1]); // 알리 > 세륙
    expect(win({ 1: [C.g1, C.p3], 2: [C.p1, C.g3] }).winners).toEqual([1, 2]); // 4끗 vs 4끗
    expect(win({ 1: [C.deer10, C.p10], 2: [C.ss9, C.p9], 3: [C.g1, C.g8] }).winners).toEqual([3]);
  });
});

describe('쇼다운 – 구사 재경기', () => {
  test('멍텅구리구사: 상대 최고 패가 9땡 이하이면 재경기', () => {
    const r = win({ 1: [C.b4, C.ss9], 2: [C.g8, C.b8] }); // 상대 8땡 (9땡 이하)
    expect(r).toMatchObject({ rematch: true, rematchBy: 1, winners: [] });
    expect(win({ 1: [C.b4, C.ss9], 2: [C.g1, C.b2], 3: [C.p3, C.p7] }).rematch).toBe(true); // 3인에서도 상대 전원이 약하면
  });

  test('멍텅구리구사: 상대가 장땡/광땡이면 재경기 아님 (그 패가 이김)', () => {
    const r = win({ 1: [C.b4, C.ss9], 2: [C.deer10, C.p10] });
    expect(r.rematch).toBe(false);
    expect(r.winners).toEqual([2]);
    expect(win({ 1: [C.b4, C.ss9], 2: [C.g1, C.g3] }).winners).toEqual([2]);
  });

  test('일반 구사: 상대 최고 패가 알리 이하이면 재경기, 땡 이상이면 아님', () => {
    expect(win({ 1: [C.p4, C.p9], 2: [C.g1, C.b2] }).rematch).toBe(true); // 알리
    expect(win({ 1: [C.p4, C.p9], 2: [C.p1, C.b4] }).rematch).toBe(true); // 독사 (알리 이하)
    expect(win({ 1: [C.p4, C.p9], 2: [C.p3, C.p7] }).rematch).toBe(true); // 망통
    const r = win({ 1: [C.p4, C.p9], 2: [C.g1, C.p1] }); // 삥땡
    expect(r.rematch).toBe(false);
    expect(r.winners).toEqual([2]);
  });

  test('일반 구사는 8땡만 돼도 재경기가 아니고, 멍텅구리구사는 일반 구사(3끗)가 상대여도 재경기', () => {
    const r = win({ 1: [C.p4, C.p9], 2: [C.g8, C.b8] }); // 상대 8땡 (알리 초과)
    expect(r.rematch).toBe(false);
    expect(r.winners).toEqual([2]);
    expect(win({ 1: [C.b4, C.ss9], 2: [C.p9, C.p4] }).rematch).toBe(true); // 상대 일반 구사(3끗) → 멍텅구리 재경기
  });

  test('구사 재경기가 아니면 3끗으로 비교', () => {
    const r = win({ 1: [C.b4, C.ss9], 2: [C.deer10, C.p4] }); // 상대 장사(4+10): 장사 > 3끗... 재경기 조건(최고≤9땡) 충족 → 재경기
    expect(r.rematch).toBe(true);
    const r2 = win({ 1: [C.p4, C.p9], 2: [C.g1, C.p1], 3: [C.b2, C.bf6] });
    expect(r2.winners).toEqual([2]);
  });
});
