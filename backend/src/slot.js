import { Router } from 'express';
import { prisma } from './db.js';
import { requireAuth, publicUser, kstDate } from './auth.js';
import { spinSlot, SLOT_BET, SLOT_DAILY_LIMIT, SLOT_TIERS, SLOT_SYMBOLS, theoreticalRtp } from './slotMath.js';

const router = Router();

// 같은 유저의 스핀 요청은 한 줄로 세워 순서대로 처리한다. (연타해도 SQLite 트랜잭션 경합 없이 한도·잔액이 정확히 지켜진다)
const lanes = new Map();
function serial(key, fn) {
  const prev = lanes.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => {});
  lanes.set(key, tail);
  tail.then(() => lanes.get(key) === tail && lanes.delete(key));
  return run;
}

/** 오늘(KST) 베팅한 금액. 날짜가 바뀌었으면 0 으로 본다. */
const spentToday = (u) => (u.lastSlotPlayedAt && kstDate(u.lastSlotPlayedAt) === kstDate() ? u.dailySlotSpent : 0);
const slotInfo = (spent) => ({ spent, limit: SLOT_DAILY_LIMIT, left: Math.max(0, SLOT_DAILY_LIMIT - spent), bet: SLOT_BET });

router.get('/status', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!u) return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  return res.json({
    slot: slotInfo(spentToday(u)),
    symbols: SLOT_SYMBOLS,
    table: SLOT_TIERS.map(({ id, label, p, payout }) => ({ id, label, p, payout })),
    rtp: theoreticalRtp(),
  });
});

/**
 * 스핀 1회: 500원 차감 → 서버 난수로 결과 결정 → 당첨금 지급을 한 트랜잭션으로 처리.
 * 일일 한도(10,000원)를 넘기면 403. 조건부 갱신(updateMany)으로 연타/동시 요청에도 한도·잔액이 지켜진다.
 */
router.post('/spin', requireAuth, async (req, res) => {
  const out = await serial(req.uid, () => prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: req.uid } });
    if (!u) return { status: 401, error: '계정을 찾을 수 없습니다.' };
    const spent = spentToday(u);
    if (spent + SLOT_BET > SLOT_DAILY_LIMIT) return { status: 403, error: '오늘 슬롯머신 한도를 모두 소진했습니다.', slot: slotInfo(spent) };
    if (u.money < SLOT_BET) return { status: 400, error: '머니가 부족합니다. (1회 500원)', slot: slotInfo(spent) };

    const spin = spinSlot(Math.random);
    const r = await tx.user.updateMany({
      // 읽은 시점의 값과 같을 때만 갱신 → 동시 요청이 겹쳐도 한 번에 하나만 반영된다
      where: { id: u.id, money: u.money, dailySlotSpent: u.dailySlotSpent, lastSlotPlayedAt: u.lastSlotPlayedAt },
      data: { money: u.money - SLOT_BET + spin.payout, dailySlotSpent: spent + SLOT_BET, lastSlotPlayedAt: new Date() },
    });
    if (r.count === 0) return { status: 409, error: '잠시 후 다시 시도해 주세요.' };
    const user = await tx.user.findUnique({ where: { id: u.id } });
    return { spin, user, spent: spent + SLOT_BET };
  }));
  if (out.error) return res.status(out.status).json({ error: out.error, ...(out.slot ? { slot: out.slot } : {}) });
  // 머니 갱신은 응답으로 내려주고, 화면은 릴 연출이 끝난 뒤 반영한다 (me:update 푸시로 결과가 미리 보이지 않게 소켓 알림은 보내지 않는다)
  return res.json({ resultSymbols: out.spin.resultSymbols, payout: out.spin.payout, tier: out.spin.tier, bet: SLOT_BET, user: publicUser(out.user), slot: slotInfo(out.spent) });
});

export default router;
