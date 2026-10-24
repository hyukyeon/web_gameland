import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from './db.js';
import { requireAuth, publicUser, kstDate } from './auth.js';
import { DIFFICULTIES, newPuzzle, checkSubmission } from './sudoku/engine.js';

export const SUDOKU_REWARD = 1000; // 클리어 1회 보상
export const SUDOKU_DAILY_LIMIT = 10; // 하루 보상 횟수 (KST 자정 초기화)

const router = Router();

// 유저별로 지금 풀고 있는 문제 하나만 서버에 둔다(정답 검증 기준). 메모리라 서버를 재시작하면 새 문제를 받아야 한다.
const active = new Map(); // uid → { id, difficulty, puzzle, issuedAt }

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
const publicPuzzle = (p) => (p ? { id: p.id, difficulty: p.difficulty, puzzle: p.puzzle } : null);

router.get('/status', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!u) return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  return res.json({
    sudoku: sudokuInfo(clearedToday(u)),
    difficulties: Object.entries(DIFFICULTIES).map(([id, d]) => ({ id, label: d.label, holes: d.holes })),
    current: publicPuzzle(active.get(req.uid)), // 새로고침해도 풀던 문제를 이어서
  });
});

/** 새 문제: 서버가 완성판을 만들고 빈칸을 뚫어 문제만 내려준다 (정답은 보내지 않는다) */
router.post('/new', requireAuth, (req, res) => {
  const difficulty = req.body?.difficulty ?? 'medium';
  if (!DIFFICULTIES[difficulty]) return res.status(400).json({ error: '난이도는 easy / medium / hard 중 하나입니다.' });
  const { puzzle } = newPuzzle(difficulty);
  const p = { id: randomUUID(), difficulty, puzzle, issuedAt: Date.now() };
  active.set(req.uid, p);
  return res.json(publicPuzzle(p));
});

/**
 * 정답 제출: ① 지금 풀고 있는 문제인지 ② 날짜가 바뀌었으면 횟수 초기화 ③ 오늘 10회면 403
 * ④ 문제 숫자를 지킨 규칙상 완성판이면 횟수 +1 · 머니 +1,000원을 한 트랜잭션으로.
 * 조건부 갱신(updateMany)으로 동시 요청이 겹쳐도 한도가 지켜진다.
 */
router.post('/submit', requireAuth, async (req, res) => {
  const out = await serial(req.uid, async () => {
    const p = active.get(req.uid);
    if (!p || p.id !== req.body?.id) return { status: 400, error: '풀고 있는 문제가 아닙니다. 새 문제를 받아 주세요.' };
    return prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: req.uid } });
      if (!u) return { status: 401, error: '계정을 찾을 수 없습니다.' };
      const cleared = clearedToday(u);
      if (cleared >= SUDOKU_DAILY_LIMIT) {
        // 다 푼 판이면 보상 없이 끝낸 것으로 정리한다 (같은 판으로 자정 뒤에 다시 받지 않게)
        if (checkSubmission(p.puzzle, req.body?.board).ok) active.delete(req.uid);
        return { status: 403, error: `오늘 스도쿠 보상(${SUDOKU_DAILY_LIMIT}회)을 모두 받았습니다.`, sudoku: sudokuInfo(cleared) };
      }
      const check = checkSubmission(p.puzzle, req.body?.board);
      if (!check.ok) return { status: 400, error: check.error, sudoku: sudokuInfo(cleared) };
      const r = await tx.user.updateMany({
        where: { id: u.id, money: u.money, dailySudokuCleared: u.dailySudokuCleared, lastSudokuClearedAt: u.lastSudokuClearedAt },
        data: { money: u.money + SUDOKU_REWARD, dailySudokuCleared: cleared + 1, lastSudokuClearedAt: new Date() },
      });
      if (r.count === 0) return { status: 409, error: '잠시 후 다시 시도해 주세요.' };
      active.delete(req.uid);
      const user = await tx.user.findUnique({ where: { id: u.id } });
      return { user, cleared: cleared + 1, seconds: Math.round((Date.now() - p.issuedAt) / 1000) };
    });
  });
  if (out.error) return res.status(out.status).json({ error: out.error, ...(out.sudoku ? { sudoku: out.sudoku } : {}) });
  return res.json({ ok: true, reward: SUDOKU_REWARD, seconds: out.seconds, user: publicUser(out.user), sudoku: sudokuInfo(out.cleared) });
});

export default router;
