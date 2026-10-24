import { newBoard, forbiddenReason, forbiddenCells, threatCells, patterns, BLACK, WHITE, SIZE } from '../src/omok/rules.js';

/**
 * Q1 룰 퍼저: 서버 판정(rules.js: 패턴 캐시·9칸 창)과 일부러 다르게 짠 단순 브루트포스 판정을 무작위 판에서 비교한다.
 * 브루트포스는 "돌을 실제로 놓아 보고 줄을 처음부터 끝까지 훑는" 방식이라 캐시/창 로직의 실수를 잡는다.
 */
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const at = (b, x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 9 : b[y][x]); // 9 = 판 밖

/** (x,y) 를 지나는 방향 d 의 연속 길이 (b[y][x] 가 color 라고 가정) */
function run(b, x, y, [dx, dy], color) {
  let n = 1;
  for (let k = 1; at(b, x + dx * k, y + dy * k) === color; k++) n++;
  for (let k = 1; at(b, x - dx * k, y - dy * k) === color; k++) n++;
  return n;
}
/** 줄 위 연속 구간의 양 끝 바깥 칸 */
function ends(b, x, y, [dx, dy], color) {
  let a = 1;
  while (at(b, x + dx * a, y + dy * a) === color) a++;
  let c = 1;
  while (at(b, x - dx * c, y - dy * c) === color) c++;
  return { hi: [x + dx * a, y + dy * a], lo: [x - dx * c, y - dy * c] };
}

/** 흑이 (x,y) 에 놓은 뒤 이 방향의 정확히-5 완성 칸 집합(빈칸 중 거기 놓으면 (x,y) 를 지나는 연속이 정확히 5) */
function fivePoints(b, x, y, d) {
  const pts = [];
  for (let k = -5; k <= 5; k++) {
    const px = x + d[0] * k;
    const py = y + d[1] * k;
    if (at(b, px, py) !== 0) continue;
    b[py][px] = BLACK;
    if (run(b, x, y, d, BLACK) === 5) pts.push([px, py]); // 방금 둔 돌(x,y)이 포함된 줄이 정확히 5 가 되어야 '이 수가 만든 4'
    b[py][px] = 0;
  }
  return pts;
}
/** 열린 4: 연속 정확히 4 이고 양 끝이 비었으며 그 바깥 칸이 흑이 아님 (어느 쪽으로 늘려도 정확히 5) */
function isOpenFour(b, x, y, d) {
  if (run(b, x, y, d, BLACK) !== 4) return false;
  const { hi, lo } = ends(b, x, y, d, BLACK);
  if (at(b, ...hi) !== 0 || at(b, ...lo) !== 0) return false;
  return at(b, hi[0] + d[0], hi[1] + d[1]) !== BLACK && at(b, lo[0] - d[0], lo[1] - d[1]) !== BLACK;
}

function brute(b, x, y) {
  b[y][x] = BLACK;
  try {
    const lens = DIRS.map((d) => run(b, x, y, d, BLACK));
    if (lens.includes(5)) return null;
    if (lens.some((n) => n >= 6)) return '장목';
    let threes = 0;
    let fours = 0;
    DIRS.forEach((d, i) => {
      if (lens[i] >= 5) return;
      const pts = fivePoints(b, x, y, d);
      if (pts.length) {
        // 연속 4(양쪽 끝 모두 5목)는 4 하나, 서로 떨어진 4 두 개(예: X.XXX.X)는 둘
        fours += pts.length >= 2 && !(lens[i] === 4 && isOpenFour(b, x, y, d)) ? 2 : 1;
        return;
      }
      // 열린 3: 한 칸 더 두면 열린 4 가 되는 빈칸이 이 줄에 있다
      for (let k = -4; k <= 4; k++) {
        const px = x + d[0] * k;
        const py = y + d[1] * k;
        if (k === 0 || at(b, px, py) !== 0) continue;
        b[py][px] = BLACK;
        const open = run(b, px, py, d, BLACK) === 4 && run(b, x, y, d, BLACK) === 4 && isOpenFour(b, x, y, d);
        b[py][px] = 0;
        if (open) { threes++; break; }
      }
    });
    if (threes >= 2) return '쌍삼';
    if (fours >= 2) return '쌍사';
    return null;
  } finally {
    b[y][x] = 0;
  }
}
const kind = (r) => (r ? r.slice(0, 2) : null);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('오목 룰 퍼저 (Q1): 서버 판정 = 독립 브루트포스', () => {
  test('무작위 판 20000개에서 금지수 판정(장목·쌍삼·쌍사)이 일치한다', () => {
    const r = rng(20261024);
    let checked = 0;
    const seen = { 장목: 0, 쌍삼: 0, 쌍사: 0, ok: 0 };
    for (let n = 0; n < 20000; n++) {
      const b = newBoard();
      // 한 점 주변에 돌을 몰아서 놓아야 줄이 자주 생긴다
      const cx = 3 + Math.floor(r() * 9);
      const cy = 3 + Math.floor(r() * 9);
      const stones = 6 + Math.floor(r() * 22);
      for (let i = 0; i < stones; i++) {
        const x = Math.min(SIZE - 1, Math.max(0, cx + Math.floor((r() - 0.5) * 9)));
        const y = Math.min(SIZE - 1, Math.max(0, cy + Math.floor((r() - 0.5) * 9)));
        if (b[y][x] === 0) b[y][x] = r() < 0.7 ? BLACK : WHITE;
      }
      const x = Math.min(SIZE - 1, Math.max(0, cx + Math.floor((r() - 0.5) * 7)));
      const y = Math.min(SIZE - 1, Math.max(0, cy + Math.floor((r() - 0.5) * 7)));
      // 절반은 목표 칸을 지나는 줄 몇 개에 흑 돌을 촘촘히 깐다 (쌍삼·쌍사·장목이 자주 나오게)
      if (n % 2 === 0) {
        for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
          const d = DIRS[Math.floor(r() * 4)];
          const p = 0.45 + r() * 0.4;
          for (let o = -5; o <= 5; o++) {
            const px = x + d[0] * o;
            const py = y + d[1] * o;
            if (o !== 0 && at(b, px, py) === 0 && r() < p) b[py][px] = r() < 0.9 ? BLACK : WHITE;
          }
        }
      }
      if (b[y][x] !== 0) continue;
      const want = brute(b, x, y);
      const got = forbiddenReason(b, x, y);
      if (kind(got) !== kind(want)) throw new Error(`불일치 (${x},${y}): 서버=${got} 브루트=${want}\n${b.map((row) => row.join('')).join('\n')}`);
      checked++;
      seen[want ? kind(want) : 'ok']++;
    }
    expect(checked).toBeGreaterThan(10000);
    // 퍼저가 실제로 모든 종류를 만났는지 (너무 쉬운 판만 만들면 의미가 없다)
    expect(seen.장목).toBeGreaterThan(20);
    expect(seen.쌍삼).toBeGreaterThan(20);
    expect(seen.쌍사).toBeGreaterThan(20);
  });

  test('forbiddenCells 는 forbiddenReason 과 같은 칸을 모은다', () => {
    const b = newBoard();
    for (const [x, y] of [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]) b[y][x] = BLACK;
    const cells = forbiddenCells(b);
    expect(cells.some(([x, y]) => x === 7 && y === 7)).toBe(true);
    for (const [x, y] of cells) expect(forbiddenReason(b, x, y)).not.toBeNull();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (b[y][x] === 0 && !cells.some(([cx, cy]) => cx === x && cy === y)) expect(forbiddenReason(b, x, y)).toBeNull();
  });

  test('위협 칸: 4 가 있으면 완성 칸(four), 열린 3 이 있으면 열린 4 칸(three)', () => {
    const b = newBoard();
    for (const x of [5, 6, 7]) b[7][x] = WHITE; // 백 열린 3
    for (const y of [2, 3, 4, 5]) b[y][11] = BLACK; // 흑 4 (위 막힘 없음)
    const t = threatCells(b);
    expect(t.filter((c) => c.color === WHITE && c.kind === 'three').length).toBeGreaterThan(0);
    expect(t.filter((c) => c.color === BLACK && c.kind === 'four').map((c) => `${c.x},${c.y}`).sort()).toEqual(['11,1', '11,6']);
    // 흑 금지수는 위협으로 세지 않는다
    const f = newBoard();
    for (const [x, y] of [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]) f[y][x] = BLACK;
    expect(threatCells(f).some((c) => c.color === BLACK && c.x === 7 && c.y === 7)).toBe(false);
    expect(patterns(f, 7, 7, BLACK).fourz).toBeGreaterThanOrEqual(2);
  });
});
