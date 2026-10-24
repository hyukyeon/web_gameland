// 오목 규칙: 15×15, 흑(1) 선공 / 백(2). 흑은 렌주룰(쌍삼 3-3, 쌍사 4-4, 장목 6목 이상) 금지, 백은 5목 이상이면 승리.
export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]]; // 가로, 세로, 대각선 2개

export const newBoard = () => Array.from({ length: SIZE }, () => new Array(SIZE).fill(EMPTY));
export const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const other = (c) => (c === BLACK ? WHITE : BLACK);

// 한 방향 창: 중심 ±5 의 11칸. 5목 완성(정확히 5)·열린 4 판정에 '양 끝 바깥 칸'까지 봐야 해서 ±4 로는 모자란다 (퍼저가 찾아낸 오판 수정)
export const C = 5;
export const WIN_LEN = 2 * C + 1;

/** (x,y) 를 중심으로 한 방향 -5..+5 의 11칸. 'X'=내 돌, '.'=빈칸, 'O'=상대 돌 또는 판 밖. 중심(C)은 항상 'X'(방금 둔 돌). */
function line(board, x, y, [dx, dy], color) {
  const out = [];
  for (let i = -C; i <= C; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (i === 0) out.push('X');
    else if (!inBoard(nx, ny)) out.push('O');
    else out.push(board[ny][nx] === color ? 'X' : board[ny][nx] === EMPTY ? '.' : 'O');
  }
  return out;
}

/** 배열 a 에서 i 를 지나는 연속 'X' 길이 */
function runAt(a, i) {
  let l = i;
  let r = i;
  while (l > 0 && a[l - 1] === 'X') l--;
  while (r < a.length - 1 && a[r + 1] === 'X') r++;
  return { len: r - l + 1, l, r };
}
// 흑은 정확히 5목, 백은 5목 이상이 승리
const isFive = (len, exact) => (exact ? len === 5 : len >= 5);

/** 이 방향에서 방금 둔 돌로 5목이 완성됐는가 */
function lineFive(a, exact) {
  return isFive(runAt(a, C).len, exact);
}

/** 한 칸 더 두면 5목이 되는 빈칸들 (이 방향) */
function fourPoints(a, exact) {
  const pts = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== '.') continue;
    a[i] = 'X';
    if (isFive(runAt(a, i).len, exact)) pts.push(i);
    a[i] = '.';
  }
  return pts;
}

/** 한 칸 더 두면 '열린 4'(양쪽 끝 어디든 5목 완성)가 되는 빈칸이 있는가 = 열린 3 */
function hasOpenThree(a, exact) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== '.') continue;
    a[i] = 'X';
    const { len, l, r } = runAt(a, i);
    let open = false;
    if (len === 4 && l <= C && r >= C && l > 0 && r < a.length - 1 && a[l - 1] === '.' && a[r + 1] === '.') {
      // 양쪽 끝에 두었을 때 모두 5목이 되어야 진짜 열린 4 (바깥이 같은 돌이면 6목이 됨)
      a[l - 1] = 'X';
      const left = isFive(runAt(a, l - 1).len, exact);
      a[l - 1] = '.';
      a[r + 1] = 'X';
      const right = isFive(runAt(a, r + 1).len, exact);
      a[r + 1] = '.';
      open = left && right;
    }
    a[i] = '.';
    if (open) return true;
  }
  return false;
}

/** 5칸 창(중심 포함)에 상대 돌이 없고 내 돌이 2개인 창의 수 = '2' 배열 */
function twoWindows(a) {
  let n = 0;
  for (let s = C - 4; s <= C; s++) {
    let x = 0;
    let bad = false;
    for (let k = s; k < s + 5; k++) {
      if (a[k] === 'O') bad = true;
      else if (a[k] === 'X') x++;
    }
    if (!bad && x === 2) n++;
  }
  return n;
}

// 한 방향 11칸 문자열 → 패턴 요약. 칸 조합이 3^10 가지뿐이라 결과를 캐시한다 (A3: 패턴 평가 캐시)
const DIR_CACHE = new Map();
/** a: line() 이 만든 11칸 배열 (중심 C 는 'X'). 반환: { five, over, len, pts(5목 완성 칸 인덱스들), three, twos } — 캐시된 불변 객체 */
export function dirInfo(a, exact) {
  const key = (exact ? 'e' : 'f') + a.join('');
  let r = DIR_CACHE.get(key);
  if (r) return r;
  const len = runAt(a, C).len;
  r = { five: isFive(len, exact), over: !isFive(len, exact) && len > 5, len, pts: [], four: 0, three: false, twos: 0 };
  if (len < 5) {
    r.pts = fourPoints(a, exact);
    // 쌍사(4-4) 계산용 '4'의 개수: 같은 줄이라도 5목 완성 자리가 둘이면 (연속 4가 아닌 한) 4가 두 개다 (예: XX.XX.X? / X.XXX.X)
    if (r.pts.length === 1) r.four = 1;
    else if (r.pts.length >= 2) {
      const { l, r: rr } = runAt(a, C);
      r.four = len === 4 && l > 0 && rr < a.length - 1 && a[l - 1] === '.' && a[rr + 1] === '.' ? 1 : 2;
    }
    if (!r.pts.length) {
      if (hasOpenThree(a, exact)) r.three = true;
      else r.twos = twoWindows(a);
    }
  }
  DIR_CACHE.set(key, r);
  return r;
}

/**
 * color 가 (x,y) 에 두었을 때(비어 있다고 가정) 4방향 패턴 요약.
 * five: 5목 완성 / over: 6목 이상(장목) / fours: 4(다음에 5목) 방향 수 / open4: 열린 4 방향 수 / threes: 열린 3 방향 수 / twos: 2 배열 수
 * fourz: 쌍사 판정용 '4' 의 개수 (한 줄에 서로 다른 4 가 둘이면 2)
 */
export function patterns(board, x, y, color) {
  const exact = color === BLACK;
  const res = { five: false, over: false, fours: 0, fourz: 0, open4: 0, threes: 0, twos: 0 };
  for (const d of DIRS) {
    const info = dirInfo(line(board, x, y, d, color), exact);
    if (info.five) res.five = true;
    else if (info.over) res.over = true;
    if (info.len >= 5) continue;
    if (info.pts.length) {
      res.fours++;
      res.fourz += info.four;
      if (info.pts.length >= 2) res.open4++;
    } else if (info.three) res.threes++;
    else res.twos += info.twos;
  }
  return res;
}

/** 흑 금지수 판정. 5목이 되면 금지 아님(승리 우선). 반환: null | '장목' | '쌍삼' | '쌍사' */
export function forbiddenReason(board, x, y) {
  const p = patterns(board, x, y, BLACK);
  if (p.five) return null;
  if (p.over) return '장목(6목 이상)';
  if (p.threes >= 2) return '쌍삼(3-3)';
  if (p.fourz >= 2) return '쌍사(4-4)';
  return null;
}

/** 흑이 둘 수 없는 빈칸들 (흑 차례 표시용) */
export function forbiddenCells(board) {
  const out = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (board[y][x] === EMPTY && forbiddenReason(board, x, y)) out.push([x, y]);
  return out;
}

/**
 * 위협 칸 (초보 보조): color 가 그 빈칸에 두면 5목(kind 'four' = 지금 4 가 있다) 또는 열린 4(kind 'three' = 열린 3 이 있다)가 되는 칸.
 * 흑의 금지 자리는 위협이 아니다. 반환: [{ x, y, color, kind }]
 */
export function threatCells(board) {
  const out = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] !== EMPTY) continue;
      for (const color of [BLACK, WHITE]) {
        const p = patterns(board, x, y, color);
        if (color === BLACK && !p.five && (p.over || p.threes >= 2 || p.fourz >= 2)) continue;
        if (p.five) out.push({ x, y, color, kind: 'four' });
        else if (p.open4) out.push({ x, y, color, kind: 'three' });
      }
    }
  }
  return out;
}

/** (x,y) 에 방금 둔 color 의 돌로 승리했는가 — 가로/세로/대각선 2개를 검사 */
export function checkWin(board, x, y) {
  const color = board[y]?.[x];
  if (!color) return null;
  const exact = color === BLACK;
  for (const d of DIRS) {
    const [dx, dy] = d;
    let n = 1;
    const cells = [[x, y]];
    for (const s of [1, -1]) {
      let nx = x + dx * s;
      let ny = y + dy * s;
      while (inBoard(nx, ny) && board[ny][nx] === color) {
        n++;
        cells.push([nx, ny]);
        nx += dx * s;
        ny += dy * s;
      }
    }
    if (isFive(n, exact)) return { color, line: cells.sort((p, q) => p[0] - q[0] || p[1] - q[1]) };
  }
  return null;
}

export const isFull = (board) => board.every((row) => row.every((c) => c !== EMPTY));
