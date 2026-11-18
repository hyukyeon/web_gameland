// 라스베가스 화면용 도우미 (정산 규칙은 서버 backend/src/vegas/VegasGame.js 의 resolveCasino 와 같아야 한다)

// 자리 색 (view.pids 순서). 강제 다크 모드에서도 색이 뒤집히지 않게 주사위는 그라데이션 이미지로 칠한다
export const SEATS = [
  { name: '빨강', fill: '#dc2626', hi: '#f87171', pip: '#fff' },
  { name: '파랑', fill: '#2563eb', hi: '#60a5fa', pip: '#fff' },
  { name: '초록', fill: '#16a34a', hi: '#4ade80', pip: '#fff' },
  { name: '노랑', fill: '#ca8a04', hi: '#fde047', pip: '#1f2937' },
  { name: '보라', fill: '#9333ea', hi: '#c084fc', pip: '#fff' },
];
export const NEUTRAL_SEAT = { name: '흰색(중립)', fill: '#cbd5e1', hi: '#ffffff', pip: '#1f2937' };
export const NEUTRAL = 'neutral';

/** 지폐 한 장 (단위 천 달러) → "$90k" */
export const note = (v) => `$${v}k`;
/** 모은 돈 → "$230,000" */
export const dollars = (v) => `$${(v * 1000).toLocaleString('en-US')}`;

/** 카지노 정산 미리보기: 주사위가 많은 순서로 큰 지폐부터, 같은 개수끼리는 모두 취소, 흰 주사위는 돈을 못 받는다 */
export function resolveCasino(notes, dice, neutral = 0) {
  const entries = Object.entries(dice).filter(([, c]) => c > 0).map(([p, c]) => ({ who: Number(p), count: c }));
  if (neutral > 0) entries.push({ who: NEUTRAL, count: neutral });
  const freq = {};
  for (const e of entries) freq[e.count] = (freq[e.count] ?? 0) + 1;
  entries.sort((a, b) => b.count - a.count);
  const sorted = [...notes].sort((a, b) => b - a);
  let k = 0;
  const owner = sorted.map(() => null); // 지폐마다 지금 가져갈 사람 (pid | 'neutral' | null)
  const ranking = entries.map((e) => {
    const tied = freq[e.count] > 1;
    if (!tied && k < sorted.length) owner[k++] = e.who;
    return { ...e, tied };
  });
  return { ranking, owner };
}
