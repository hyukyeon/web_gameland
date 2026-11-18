import { EMOTE_CATS, EMOTE_SETS, isEmoteFor } from '../src/emotes.js';
import * as front from '../../frontend/src/emotes.js';

const GAMES = ['gostop', 'seotda', 'omok', 'yut', 'vegas', 'yacht', 'janggi'];

describe('말풍선 대사', () => {
  test('서버와 화면의 목록이 같다', () => {
    expect(front.EMOTE_CATS).toEqual(EMOTE_CATS);
    expect(front.EMOTE_SETS).toEqual(EMOTE_SETS);
  });
  test('모든 방 게임에 7가지 상황(칭찬·감탄·억울·자책·도발·재촉·인사)이 다 있다', () => {
    expect(EMOTE_CATS.map((c) => c.key)).toEqual(['praise', 'wow', 'unfair', 'self', 'taunt', 'hurry', 'greet']);
    expect(Object.keys(EMOTE_SETS).sort()).toEqual([...GAMES].sort());
    for (const g of GAMES) {
      for (const { key } of EMOTE_CATS) {
        const list = EMOTE_SETS[g][key];
        expect(list.length).toBeGreaterThanOrEqual(3);
        for (const t of list) expect([...t].length).toBeLessThanOrEqual(18); // 말풍선 폭에 맞게 짧게
      }
      const all = Object.values(EMOTE_SETS[g]).flat();
      expect(new Set(all).size).toBe(all.length); // 한 게임 안에서 중복 없음
    }
  });
  test('게임마다 분위기가 다르다: 상황별 대사가 게임끼리 대부분 겹치지 않는다', () => {
    for (const { key } of EMOTE_CATS.filter((c) => c.key !== 'greet')) {
      const lines = GAMES.flatMap((g) => EMOTE_SETS[g][key]);
      expect(new Set(lines).size / lines.length).toBeGreaterThan(0.8);
    }
  });
  test('그 게임 방에서만 보낼 수 있다', () => {
    expect(isEmoteFor('gostop', '묻고 더블로 가!')).toBe(true);
    expect(isEmoteFor('omok', '묻고 더블로 가!')).toBe(false);
    expect(isEmoteFor('janggi', '장군!')).toBe(true);
    expect(isEmoteFor('yacht', '장군!')).toBe(false);
    expect(isEmoteFor('slot', '한 판 더!')).toBe(false); // 혼자 하는 게임엔 없음
    expect(isEmoteFor('gostop', '<img src=x>')).toBe(false);
  });
});
