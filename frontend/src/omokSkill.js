// 오목 적응형 난이도(A7): 내 실력 추정치(0.1~1)를 이 브라우저에 기억해 두었다가, 연습 시작 때 서버로 보낸다.
// 이기면 올리고 지면 내려서 항상 비슷한 승률(약 절반)에 맞춘다.
const KEY = 'omok.skill';
export const SKILL_MIN = 0.1;
export const SKILL_MAX = 1;
const STEP = 0.12;
const clamp = (v) => Math.min(SKILL_MAX, Math.max(SKILL_MIN, v));

export function getSkill() {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? clamp(v) : 0.5;
  } catch {
    return 0.5;
  }
}

/** 결과 반영: win +STEP, lose −STEP, draw 유지. 새 값을 반환 */
export function adjustSkill(outcome) {
  const next = clamp(getSkill() + (outcome === 'win' ? STEP : outcome === 'lose' ? -STEP : 0));
  try {
    localStorage.setItem(KEY, String(next));
  } catch { /* 저장소 없음 */ }
  return next;
}

export const skillLabel = (s) => (s < 0.3 ? '입문' : s < 0.5 ? '초급' : s < 0.7 ? '중급' : s < 0.9 ? '상급' : '고수');
