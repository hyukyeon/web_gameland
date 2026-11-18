// 장기 화면용 도우미 (규칙은 서버 backend/src/janggi/rules.js — 화면은 서버가 보낸 legal 만 쓴다)
export const W = 9;
export const H = 10;
export const FORMATIONS = ['마상마상', '상마상마', '마상상마', '상마마상'];
export const VALUE = { K: 0, R: 13, C: 7, N: 5, E: 3, A: 3, P: 2 };
export const NAME = { K: '궁', A: '사', R: '차', C: '포', N: '마', E: '상', P: '졸' };
// 말 글자 (초 楚 / 한 漢)
export const GLYPH = {
  cho: { K: '楚', A: '士', R: '車', C: '包', N: '馬', E: '象', P: '卒' },
  han: { K: '漢', A: '士', R: '車', C: '包', N: '馬', E: '象', P: '兵' },
};
export const SIDE = {
  cho: { name: '초', hanja: '楚', ink: '#0b5a33', rim: '#15803d', light: '#86efac' },
  han: { name: '한', hanja: '漢', ink: '#b91c1c', rim: '#dc2626', light: '#fca5a5' },
};
// 말 크기 (교차점 간격 대비): 궁 > 차·포·마·상 > 사·졸
export const SIZE = { K: 0.94, R: 0.8, C: 0.8, N: 0.8, E: 0.8, A: 0.64, P: 0.64 };
export const xyOf = (s) => [s % W, Math.floor(s / W)];
export const sq = (x, y) => y * W + x;
