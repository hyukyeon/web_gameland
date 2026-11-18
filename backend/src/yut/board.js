/**
 * 윷판: 29개 교차점의 방향성 그래프.
 *
 *   10 ─ 9 ─ 8 ─ 7 ─ 6 ─ 5          바깥 20칸: 0(출발·도착)에서 반시계로 1 → 19
 *   │ 25               20 │          지름길:   5→20→21→22(방)→23→24→15
 *   11                    4          지름길:   10→25→26→22(방)→27→28→0(도착)
 *   │      26        21    │
 *   12         22(방)      3
 *   │      27        23    │
 *   13                    2
 *   │ 28               24 │
 *   14                    1
 *   15 ─16 ─17 ─18 ─19 ─ 0
 *
 * 말은 대기(-1) → 판 위(0~28) → 도착(DONE) 순서. 0 번 칸은 출발점(참먹이): 19·28 다음 칸이고,
 * 여기에 딱 멈추면 아직 판 위(잡기·업기 가능)이며 **0 을 지나 한 칸이라도 더 가야** 말이 나간다(DONE).
 * 대기 중인 말은 0 을 거치지 않고 곧장 1 로 나온다.
 */
export const WAIT = -1;
export const DONE = 99;
export const NODES = 29;

/** 한 칸 앞으로. first = 이번 이동의 첫 걸음(분기점에서 출발하는 경우), prev = 직전 칸 */
export function step(node, prev, first) {
  if (first) {
    if (node === 5) return 20;
    if (node === 10) return 25;
    if (node === 22) return 27; // 방에서 출발하면 곧장 도착 쪽 지름길
  }
  if (node === 22) return prev === 21 ? 23 : 27; // 방을 지나칠 땐 가던 대각선을 그대로
  if (node === 0) return DONE; // 참먹이를 넘어서면 나간다
  if (node === 19 || node === 28) return 0; // 참먹이(출발점)로 들어온다
  if (node === 20) return 21;
  if (node === 21) return 22;
  if (node === 23) return 24;
  if (node === 24) return 15;
  if (node === 25) return 26;
  if (node === 26) return 22;
  if (node === 27) return 28;
  return node + 1; // 바깥 길 (대기 -1 → 1 은 따로 처리)
}

/**
 * 앞으로 n 칸(1~5) 갔을 때의 경로. 도착을 넘어서면 DONE 에서 멈춘다.
 * trail = 지금까지 밟은 칸(마지막이 현재 위치). 대기 중이면 [].
 */
export function forward(pos, trail, n) {
  const path = [];
  let node = pos;
  let prev = trail.length > 1 ? trail[trail.length - 2] : null;
  for (let i = 0; i < n; i++) {
    const nx = node === WAIT ? 1 : step(node, prev, i === 0);
    path.push(nx);
    if (nx === DONE) break;
    prev = node === WAIT ? null : node;
    node = nx;
  }
  return path;
}

/** 이 칸이 분기점(모서리·방)인가 — 화면 표시용 */
export const isCorner = (n) => n === 0 || n === 5 || n === 10 || n === 15 || n === 22;

/** 판 위 좌표(0~100 퍼센트). 클라이언트와 같은 값을 쓰도록 서버도 보관 */
export function coords() {
  const c = new Array(NODES);
  const lo = 6;
  const hi = 94;
  const span = hi - lo;
  // 바깥: 0 = 우하, 5 = 우상, 10 = 좌상, 15 = 좌하
  for (let i = 0; i < 20; i++) {
    const side = Math.floor(i / 5);
    const k = (i % 5) / 5;
    if (side === 0) c[i] = [hi, hi - span * k];
    else if (side === 1) c[i] = [hi - span * k, lo];
    else if (side === 2) c[i] = [lo, lo + span * k];
    else c[i] = [lo + span * k, hi];
  }
  const mid = 50;
  const line = (a, b, ids) => ids.forEach((id, j) => {
    const t = (j + 1) / (ids.length + 1);
    c[id] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });
  line(c[5], [mid, mid], [20, 21]);
  line(c[10], [mid, mid], [25, 26]);
  c[22] = [mid, mid];
  line([mid, mid], c[15], [23, 24]);
  line([mid, mid], c[0], [27, 28]);
  return c;
}
