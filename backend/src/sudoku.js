import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from './db.js';
import { requireAuth, publicUser, kstDate } from './auth.js';
import { DIFFICULTIES, newPuzzle, checkSubmission } from './sudoku/engine.js';

export const SUDOKU_REWARD = 1000; // 클리어 1회 보상
export const SUDOKU_DAILY_LIMIT = 10; // 하루 보상 횟수 (KST 자정 초기화)

const router = Router();

// 유저별로 지금 풀고 있는 문제 하나만 둔다(정답 검증 기준). 메모리 캐시 + DB(User.sudokuSave) — 재시작·다른 기기에서도 이어 푼다.
const active = new Map(); // uid → { id, difficulty, puzzle, issuedAt, board, elapsed }
const MAX_ELAPSED = 7 * 24 * 3600; // 저장할 수 있는 걸린 시간 상한(초)

async function getActive(uid) {
  if (active.has(uid)) return active.get(uid);
  const u = await prisma.user.findUnique({ where: { id: uid }, select: { sudokuSave: true } });
  let p = null;
  try {
    p = u?.sudokuSave ? JSON.parse(u.sudokuSave) : null;
  } catch {
    p = null;
  }
  if (p && Array.isArray(p.puzzle) && p.puzzle.length === 81 && typeof p.id === 'string') active.set(uid, p);
  else p = null;
  return p;
}
async function setActive(uid, p) {
  if (p) active.set(uid, p);
  else active.delete(uid);
  await prisma.user.update({ where: { id: uid }, data: { sudokuSave: p ? JSON.stringify(p) : null } });
}
/** 테스트용: 서버 재시작처럼 메모리 캐시만 비운다 */
export const forgetActiveCache = () => active.clear();

/** 저장할 판: 81칸 0~9 정수, 문제에 있던 숫자는 그대로 */
const validBoard = (puzzle, board) => Array.isArray(board) && board.length === 81 && board.every((d, i) => Number.isInteger(d) && d >= 0 && d <= 9 && (puzzle[i] === 0 || d === puzzle[i]));

// 같은 유저의 제출은 한 줄로 세워 처리한다 (연타해도 보상이 두 번 나가지 않게)
const lanes = new Map();
function serial(key, fn) {
  const prev = lanes.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  lanes.set(key, tail);
  tail.then(() => lanes.get(key) === tail && lanes.delete(key));
  return run;
}

/** 오늘(KST) 보상을 받은 횟수. 날짜가 바뀌었으면 0 으로 본다. */
const clearedToday = (u) => (u.lastSudokuClearedAt && kstDate(u.lastSudokuClearedAt) === kstDate() ? u.dailySudokuCleared : 0);
const sudokuInfo = (cleared) => ({ cleared, limit: SUDOKU_DAILY_LIMIT, left: Math.max(0, SUDOKU_DAILY_LIMIT - cleared), reward: SUDOKU_REWARD });
const publicPuzzle = (p) => (p ? { id: p.id, difficulty: p.difficulty, puzzle: p.puzzle, board: p.board ?? p.puzzle, elapsed: p.elapsed ?? 0, savedAt: p.savedAt ?? p.issuedAt } : null);

router.get('/status', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!u) return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  return res.json({
    sudoku: sudokuInfo(clearedToday(u)),
    difficulties: Object.entries(DIFFICULTIES).map(([id, d]) => ({ id, label: d.label, holes: d.holes })),
    current: publicPuzzle(await getActive(req.uid)), // 저장한 판(입력한 숫자·걸린 시간)을 이어서
  });
});

/** 새 문제: 서버가 완성판을 만들고 빈칸을 뚫어 문제만 내려준다 (정답은 보내지 않는다) */
router.post('/new', requireAuth, async (req, res) => {
  const difficulty = req.body?.difficulty ?? 'medium';
  if (!DIFFICULTIES[difficulty]) return res.status(400).json({ error: '난이도는 easy / medium / hard 중 하나입니다.' });
  const { puzzle } = newPuzzle(difficulty);
  const p = { id: randomUUID(), difficulty, puzzle, issuedAt: Date.now(), board: [...puzzle], elapsed: 0 };
  await serial(req.uid, () => setActive(req.uid, p));
  return res.json(publicPuzzle(p));
});

/** 저장하고 나가기: 지금 풀던 판(입력한 숫자)과 걸린 시간을 저장한다. 다음에 들어오면 /status 의 current 로 이어서 */
router.post('/save', requireAuth, async (req, res) => {
  const out = await serial(req.uid, async () => {
    const p = await getActive(req.uid);
    if (!p || p.id !== req.body?.id) return { status: 400, error: '풀고 있는 문제가 아닙니다. 새 문제를 받아 주세요.' };
    if (!validBoard(p.puzzle, req.body?.board)) return { status: 400, error: '판 형식이 잘못되었습니다.' };
    const elapsed = Math.min(MAX_ELAPSED, Math.max(0, Math.floor(Number(req.body?.elapsed)) || 0));
    await setActive(req.uid, { ...p, board: req.body.board, elapsed, savedAt: Date.now() });
    return { ok: true, elapsed };
  });
  if (out.error) return res.status(out.status).json({ error: out.error });
  return res.json(out);
});

/**
 * 정답 제출: ① 지금 풀고 있는 문제인지 ② 날짜가 바뀌었으면 횟수 초기화 ③ 오늘 10회면 403
 * ④ 문제 숫자를 지킨 규칙상 완성판이면 횟수 +1 · 머니 +1,000원을 한 트랜잭션으로.
 * 조건부 갱신(updateMany)으로 동시 요청이 겹쳐도 한도가 지켜진다.
 */
router.post('/submit', requireAuth, async (req, res) => {
  const out = await serial(req.uid, async () => {
    const p = await getActive(req.uid);
    if (!p || p.id !== req.body?.id) return { status: 400, error: '풀고 있는 문제가 아닙니다. 새 문제를 받아 주세요.' };
    const done = await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: req.uid } });
      if (!u) return { status: 401, error: '계정을 찾을 수 없습니다.' };
      const cleared = clearedToday(u);
      if (cleared >= SUDOKU_DAILY_LIMIT) {
        // 다 푼 판이면 보상 없이 끝낸 것으로 정리한다 (같은 판으로 자정 뒤에 다시 받지 않게)
        if (checkSubmission(p.puzzle, req.body?.board).ok) await tx.user.update({ where: { id: u.id }, data: { sudokuSave: null } });
        return { clear: checkSubmission(p.puzzle, req.body?.board).ok, status: 403, error: `오늘 스도쿠 보상(${SUDOKU_DAILY_LIMIT}회)을 모두 받았습니다.`, sudoku: sudokuInfo(cleared) };
      }
      const check = checkSubmission(p.puzzle, req.body?.board);
      if (!check.ok) return { status: 400, error: check.error, sudoku: sudokuInfo(cleared) };
      const r = await tx.user.updateMany({
        where: { id: u.id, money: u.money, dailySudokuCleared: u.dailySudokuCleared, lastSudokuClearedAt: u.lastSudokuClearedAt },
        data: { money: u.money + SUDOKU_REWARD, dailySudokuCleared: cleared + 1, lastSudokuClearedAt: new Date(), sudokuSave: null },
      });
      if (r.count === 0) return { status: 409, error: '잠시 후 다시 시도해 주세요.' };
      const user = await tx.user.findUnique({ where: { id: u.id } });
      return { clear: true, user, cleared: cleared + 1, seconds: Math.round((Date.now() - p.issuedAt) / 1000) };
    });
    // 다 푼 판은 정리한다 (같은 판으로 다시 받지 않게) — DB 는 트랜잭션에서 이미 비웠다
    if (done.clear) active.delete(req.uid);
    return done;
  });
  if (out.error) return res.status(out.status).json({ error: out.error, ...(out.sudoku ? { sudoku: out.sudoku } : {}) });
  return res.json({ ok: true, reward: SUDOKU_REWARD, seconds: out.seconds, user: publicUser(out.user), sudoku: sudokuInfo(out.cleared) });
});

export default router;
