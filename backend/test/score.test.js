import { computeScore, loserPiCount, WIN_THRESHOLD } from '../src/game/score.js';
import { CARDS, ALL_IDS, shuffle } from '../src/game/cards.js';

const total = (ids) => computeScore(ids).total;

describe('카드 테이블', () => {
  test('48장, id 유일, 월별 4장', () => {
    expect(CARDS).toHaveLength(48);
    expect(new Set(ALL_IDS).size).toBe(48);
    for (let m = 1; m <= 12; m++) expect(CARDS.filter((c) => c.month === m)).toHaveLength(4);
  });
  test('종류별 장수: 광5 열끗9 띠10 피(쌍피 포함)24', () => {
    const n = (k) => CARDS.filter((c) => c.kind === k).length;
    expect(n('gwang')).toBe(5);
    expect(n('yeol')).toBe(9);
    expect(n('tti')).toBe(10);
    expect(n('pi') + n('ssangpi')).toBe(24);
  });
  test('shuffle 은 순열을 유지한다', () => {
    expect([...shuffle(ALL_IDS)].sort((a, b) => a - b)).toEqual(ALL_IDS);
  });
});

describe('점수 계산', () => {
  test('승리 기준은 7점', () => expect(WIN_THRESHOLD).toBe(7));
  test('빈 손은 0점', () => expect(total([])).toBe(0));

  test('3광(비광 제외) = 3점', () => expect(total([0, 8, 28])).toBe(3));
  test('3광(비광 포함) = 2점', () => expect(total([0, 8, 44])).toBe(2));
  test('4광 = 4점', () => expect(total([0, 8, 28, 40])).toBe(4));
  test('5광 = 15점', () => expect(total([0, 8, 28, 40, 44])).toBe(15));
  test('2광은 0점', () => expect(total([0, 8])).toBe(0));

  test('열끗 5장부터 1점, 이후 장당 +1', () => {
    expect(total([16, 20, 24, 36, 45])).toBe(1);
    expect(total([16, 20, 24, 36, 45, 4])).toBe(2);
  });
  test('고도리 = 5점', () => expect(total([4, 12, 29])).toBe(5));
  test('홍단/청단/초단 = 각 3점', () => {
    expect(total([1, 5, 9])).toBe(3);
    expect(total([21, 33, 37])).toBe(3);
    expect(total([13, 17, 25])).toBe(3);
  });
  test('띠 5장 + 홍단 = 4점', () => expect(total([1, 5, 9, 13, 17])).toBe(4));

  test('피 10장 = 1점', () => expect(total([2, 3, 6, 7, 10, 11, 14, 15, 18, 19])).toBe(1));
  test('피 9장 = 0점', () => expect(total([2, 3, 6, 7, 10, 11, 14, 15, 18])).toBe(0));
  test('쌍피는 피 2장으로 계산', () => {
    expect(computeScore([2, 3, 6, 7, 10, 11, 14, 15, 41]).pi).toBe(10);
    expect(total([2, 3, 6, 7, 10, 11, 14, 15, 41])).toBe(1);
  });

  test('9월 술잔: 쌍피로 보는 편이 유리하면 쌍피 처리', () => {
    const ids = [16, 20, 24, 36, 32, 2, 3, 6, 7, 10, 11, 14, 15, 18];
    const s = computeScore(ids);
    expect(s.sepAsPi).toBe(true);
    expect(s.total).toBe(2);
  });
  test('9월 술잔: 열끗이 유리하면 열끗 처리', () => {
    const s = computeScore([16, 20, 24, 36, 32, 2, 3]);
    expect(s.sepAsPi).toBe(false);
    expect(s.total).toBe(1);
  });
  test('loserPiCount 는 술잔을 쌍피로 본 장수까지 고려', () => {
    expect(loserPiCount([32, 2])).toBe(3);
    expect(loserPiCount([2, 3])).toBe(2);
  });
});
