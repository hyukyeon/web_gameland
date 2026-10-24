/**
 * 스도쿠 엔진: 완성판 생성(백트래킹) → 난이도별 빈칸 뚫기 → 제출판 검증.
 * 판은 길이 81 배열(행 우선, 0 = 빈칸). 행·열·박스에 쓴 숫자를 비트마스크로 들고 있어 후보 계산이 O(1) 이라
 * 한 판 생성이 1ms 안팎이다(라즈베리파이에서도 이벤트 루프를 붙잡지 않는다).
 */

export const DIFFICULTIES = {
  easy: { label: '하', holes: 30 },
  medium: { label: '중', holes: 40 },
  hard: { label: '상', holes: 50 },
};

const ALL = 0x3fe; // 비트 1~9
const boxOf = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 무작위 완성판(81칸, 1~9). 빈 판에서 시작하면 막다른 길이 거의 없어 백트래킹이 금방 끝난다. */
export function generateSolution(rnd = Math.random) {
  const board = new Array(81).fill(0);
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const fill = (i) => {
    if (i === 81) return true;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const b = boxOf(r, c);
    const used = rows[r] | cols[c] | boxes[b];
    for (const d of shuffle([...digits], rnd)) {
      const bit = 1 << d;
      if (used & bit) continue;
      board[i] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (fill(i + 1)) return true;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
    board[i] = 0;
    return false;
  };
  fill(0);
  return board;
}

/**
 * 완성판에서 holes 칸을 지운다. 중앙(40번)을 기준으로 점대칭 짝을 함께 지워 보기 좋은 모양을 만든다.
 * 유일해는 보장하지 않는다 — 그래서 검증은 '정답과 같은가'가 아니라 '규칙을 지킨 완성판인가'로 한다.
 */
export function makePuzzle(solution, holes, rnd = Math.random) {
  const puzzle = [...solution];
  const pairs = shuffle(Array.from({ length: 40 }, (_, i) => i), rnd); // i 와 80-i 짝 (0~39)
  let left = holes;
  for (const i of pairs) {
    if (left < 2) break;
    puzzle[i] = 0;
    puzzle[80 - i] = 0;
    left -= 2;
  }
  if (left === 1) puzzle[40] = 0; // 홀수 개면 중앙 한 칸
  return puzzle;
}

/** 난이도 키로 문제/정답 한 벌 생성 */
export function newPuzzle(difficulty = 'medium', rnd = Math.random) {
  const d = DIFFICULTIES[difficulty];
  if (!d) throw new Error('알 수 없는 난이도');
  const solution = generateSolution(rnd);
  return { difficulty, puzzle: makePuzzle(solution, d.holes, rnd), solution };
}

/** 행·열·3×3 박스에 1~9 가 한 번씩 있는 완성판인가 */
export function isValidSolution(board) {
  if (!Array.isArray(board) || board.length !== 81) return false;
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const d = board[i];
    if (!Number.isInteger(d) || d < 1 || d > 9) return false;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const b = boxOf(r, c);
    const bit = 1 << d;
    if ((rows[r] | cols[c] | boxes[b]) & bit) return false;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }
  return rows.every((m) => m === ALL);
}

/** 제출판 검증: 문제에 있던 숫자를 그대로 두고 규칙대로 다 채웠는가 */
export function checkSubmission(puzzle, board) {
  if (!Array.isArray(board) || board.length !== 81) return { ok: false, error: '판 형식이 잘못되었습니다.' };
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] !== 0 && board[i] !== puzzle[i]) return { ok: false, error: '문제에 있던 숫자를 바꿀 수 없습니다.' };
  }
  if (board.some((d) => d === 0 || d == null)) return { ok: false, error: '아직 빈칸이 있습니다.' };
  if (!isValidSolution(board)) return { ok: false, error: '정답이 아닙니다. 겹치는 숫자를 확인해 보세요.' };
  return { ok: true };
}
