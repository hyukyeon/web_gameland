import { describe, expect, test } from 'vitest';
import { monthOf, kindOf, cardName, groupCaptured, nearCombos, won, signed, isBonus } from '../../src/cards.js';

describe('카드 기본 정보', () => {
  test('월·종류·이름', () => {
    expect(monthOf(0)).toBe(1);
    expect(monthOf(47)).toBe(12);
    expect(kindOf(0)).toBe('gwang');
    expect(kindOf(32)).toBe('yeol'); // 9월 술잔은 열끗으로
    expect(cardName(8)).toBe('3월 광');
    expect(cardName(1)).toBe('1월 띠');
    expect(cardName(48)).toBe('보너스 쌍피');
    expect(isBonus(49)).toBe(true);
    expect(monthOf(48)).toBe(0);
  });

  test('획득패 묶기: 광/띠/열끗/피, 먹은 순서 유지', () => {
    expect(groupCaptured([2, 0, 1, 4, 3, 48])).toEqual({ gwang: [0], tti: [1], yeol: [4], pi: [2, 3, 48] });
    // 국진(32): 기본은 열끗, 쌍피로 셀 때는 피 그룹
    expect(groupCaptured([32, 34])).toEqual({ gwang: [], tti: [], yeol: [32], pi: [34] });
    expect(groupCaptured([32, 34], true)).toEqual({ gwang: [], tti: [], yeol: [], pi: [32, 34] });
  });

  test('금액 표시', () => {
    expect(won(1234567)).toBe('1,234,567');
    expect(won(-500)).toBe('-500');
    expect(signed(500)).toBe('+500');
    expect(signed(-500)).toBe('-500');
    expect(signed(0)).toBe('0');
  });
});

describe('nearCombos (족보 비상)', () => {
  test('단·고도리 2/3 장이면 비상', () => {
    expect(nearCombos({ 1: [21, 33], 2: [] }, 1)).toEqual(['청단']);
    expect(nearCombos({ 1: [4, 12, 1, 5], 2: [] }, 1)).toEqual(['홍단', '고도리']);
  });
  test('남은 한 장을 다른 사람이 먹었으면 표시하지 않음', () => {
    expect(nearCombos({ 1: [21, 33], 2: [37] }, 1)).toEqual([]);
  });
  test('이미 완성한 족보는 비상이 아님', () => {
    expect(nearCombos({ 1: [21, 33, 37] }, 1)).toEqual([]);
  });
  test('광 2/3/4장 → 삼광/사광/오광 비상, 남은 광이 모두 남의 것이면 없음', () => {
    expect(nearCombos({ 1: [0, 8] }, 1)).toEqual(['삼광']);
    expect(nearCombos({ 1: [0, 8, 28] }, 1)).toEqual(['사광']);
    expect(nearCombos({ 1: [0, 8, 28, 40] }, 1)).toEqual(['오광']);
    expect(nearCombos({ 1: [0, 8, 28, 40], 2: [44] }, 1)).toEqual([]);
    expect(nearCombos({ 1: [0] }, 1)).toEqual([]);
  });
  test('피·열끗·띠 장수는 다루지 않음', () => {
    expect(nearCombos({ 1: [2, 3, 6, 7, 10, 11, 14, 15, 18] }, 1)).toEqual([]);
  });
});
