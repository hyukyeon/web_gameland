// 요트 다이스 화면용 도우미 (칸 이름·규칙은 서버 backend/src/yacht/YachtGame.js 와 같아야 한다)
export const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER = ['choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
export const BONUS_AT = 63;
export const BONUS = 35;

// 칸 이름: 위쪽은 '그 눈 모으기', 아래쪽은 족보 이름
export const CAT_LABEL = {
  ones: '1 모으기', twos: '2 모으기', threes: '3 모으기', fours: '4 모으기', fives: '5 모으기', sixes: '6 모으기',
  choice: '초이스', fourKind: '포카드', fullHouse: '풀하우스', smallStraight: '스몰 스트레이트', largeStraight: '라지 스트레이트', yacht: '요트',
};
// 칸 설명 (점수 계산법)
export const CAT_HINT = {
  ones: '나온 1을 모두 더해요', twos: '나온 2를 모두 더해요', threes: '나온 3을 모두 더해요', fours: '나온 4를 모두 더해요', fives: '나온 5를 모두 더해요', sixes: '나온 6을 모두 더해요',
  choice: '5개를 모두 더해요',
  fourKind: '같은 눈 4개 → 5개 합',
  fullHouse: '3개 + 2개 → 5개 합',
  smallStraight: '4개 연속 → 15점',
  largeStraight: '5개 연속 → 30점',
  yacht: '5개 모두 같음 → 50점',
};
// 위쪽 칸 아이콘으로 쓸 눈 (1~6), 아래쪽 칸 아이콘
export const CAT_FACE = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };
export const CAT_ICON = { choice: '🎲', fourKind: '🎯', fullHouse: '🏠', smallStraight: '🪜', largeStraight: '🛤️', yacht: '⛵' };

/** 보너스까지 상태: done(달성) · fail(남은 칸을 다 6개씩 채워도 불가) · need(남은 점수) */
export function bonusState(sheet) {
  const upper = UPPER.reduce((a, k) => a + (sheet[k] ?? 0), 0);
  if (upper >= BONUS_AT) return { upper, done: true, need: 0, fail: false };
  const maxLeft = UPPER.reduce((a, k, i) => a + (sheet[k] == null ? (i + 1) * 5 : 0), 0);
  return { upper, done: false, need: BONUS_AT - upper, fail: upper + maxLeft < BONUS_AT };
}
