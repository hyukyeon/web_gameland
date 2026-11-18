export const OPTION_LABELS = {
  bonus: ['보너스 카드', '보너스 쌍피 3장 추가 (획득 시 한 장 더)'],
  ppeokPay: ['뻑 지불', '뻑 / 연뻑 / 삼연뻑 점수 지불'],
  chongtong: ['총통', '첫 패 동월 4장이면 즉시 승리 선언'],
  ttibak: ['띠박', '띠 5장 이상으로 이기면 ×2'],
  nagariCarry: ['나가리 이월', '나가리 다음 판 ×2'],
};
export const BETS = [100, 500, 1000, 5000];

// AI 봇 난이도 / 성향 (서버 bots.js 와 맞춘다)
export const LEVELS = [
  ['easy', '쉬움', '실수가 잦고 무모하게 덤벼요'],
  ['normal', '보통', '정석대로 두지만 가끔 실수해요'],
  ['hard', '어려움', '나온 패와 확률을 따져 냉정하게 판단해요'],
];
export const LEVEL_LABEL = Object.fromEntries(LEVELS.map(([k, l]) => [k, l]));
export const STYLE_LABEL = { aggressive: '공격형', balanced: '균형형', defensive: '수비형' };
