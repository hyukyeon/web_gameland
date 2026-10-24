// 윷판 기하 (서버 backend/src/yut/board.js 의 coords 와 같은 값). 좌표는 판 크기에 대한 퍼센트.
export const WAIT = -1;
export const DONE = 99;

export function coords() {
  const c = new Array(29);
  const lo = 8;
  const hi = 92;
  const span = hi - lo;
  for (let i = 0; i < 20; i++) {
    const side = Math.floor(i / 5);
    const k = (i % 5) / 5;
    if (side === 0) c[i] = [hi, hi - span * k];
    else if (side === 1) c[i] = [hi - span * k, lo];
    else if (side === 2) c[i] = [lo, lo + span * k];
    else c[i] = [lo + span * k, hi];
  }
  const line = (a, b, ids) => ids.forEach((id, j) => {
    const t = (j + 1) / (ids.length + 1);
    c[id] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });
  line(c[5], [50, 50], [20, 21]);
  line(c[10], [50, 50], [25, 26]);
  c[22] = [50, 50];
  line([50, 50], c[15], [23, 24]);
  line([50, 50], c[0], [27, 28]);
  return c;
}
export const XY = coords();

// 판 위에 그릴 선 (바깥 사각형 + 두 대각선)
export const LINES = [
  [0, 5, 10, 15, 0],
  [5, 20, 21, 22, 23, 24, 15],
  [10, 25, 26, 22, 27, 28, 0],
];

export const CORNERS = new Set([0, 5, 10, 15, 22]);
export const TEAM = [
  { name: '청', emoji: '🔵', fill: '#2563eb', ring: '#93c5fd' },
  { name: '홍', emoji: '🔴', fill: '#dc2626', ring: '#fca5a5' },
];
export const THROW_NAME = { back: '빽도', do: '도', gae: '개', geol: '걸', yut: '윷', mo: '모' };
export const THROW_STEPS = { back: '−1', do: '1', gae: '2', geol: '3', yut: '4', mo: '5' };
