// 오목 규칙: 15×15, 흑(1) 선공 / 백(2). 흑은 렌주룰 일부(쌍삼 3-3, 장목 6목 이상) 금지, 백은 5목 이상이면 승리.
export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]]; // 가로, 세로, 대각선 2개

export const newBoard = () => Array.from({ length: SIZE }, () => new Array(SIZE).fill(EMPTY));
export const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const other = (c) => (c === BLACK ? WHITE : BLACK);

/** (x,y) 를 중심으로 한 방향 -4..+4 의 9칸. 'X'=내 돌, '.'=빈칸, 'O'=상대 돌 또는 판 밖. 중심(4)은 항상 'X'(방금 둔 돌). */
function line(board, x, y, [dx, dy], color) {
  const out = [];
  for (let i = -4; i <= 4; i++) {
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
  return isFive(runAt(a, 4).len, exact);
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
    if (len === 4 && l <= 4 && r >= 4 && l > 0 && r < a.length - 1 && a[l - 1] === '.' && a[r + 1] === '.') {
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
  for (let s = 0; s <= 4; s++) {
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

/**
 * color 가 (x,y) 에 두었을 때(비어 있다고 가정) 4방향 패턴 요약.
 * five: 5목 완성 / over: 6목 이상(장목) / fours: 4(다음에 5목) 방향 수 / open4: 열린 4 방향 수 / threes: 열린 3 방향 수 / twos: 2 배열 수
 */
export function patterns(board, x, y, color) {
  const exact = color === BLACK;
  const res = { five: false, over: false, fours: 0, open4: 0, threes: 0, twos: 0 };
  for (const d of DIRS) {
    const a = line(board, x, y, d, color);
    const len = runAt(a, 4).len;
    if (isFive(len, exact)) res.five = true;
    else if (len > 5) res.over = true;
    if (len >= 5) continue;
    const pts = fourPoints(a, exact);
    if (pts.length) {
      res.fours++;
      if (pts.length >= 2) res.open4++;
    } else if (hasOpenThree(a, exact)) res.threes++;
    else res.twos += twoWindows(a);
  }
  return res;
}

/** 흑 금지수 판정. 5목이 되면 금지 아님(승리 우선). 반환: null | '장목' | '쌍삼' */
export function forbiddenReason(board, x, y) {
  const p = patterns(board, x, y, BLACK);
  if (p.five) return null;
  if (p.over) return '장목(6목 이상)';
  if (p.threes >= 2) return '쌍삼(3-3)';
  return null;
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
