import { prisma } from './db.js';
import { applyGameStats, applySeotdaStats, applyOmokStats, recordPractice } from './stats.js';

/**
 * 엔진 result 에서 승/패/무를 가린다.
 * - 일반 승부/총통/삼연뻑: winner 승, losers 패 (고박 대납으로 payments.from 이 바뀌어도 losers 기준)
 * - 기권: loser 패, 지급받은 사람들 승
 * - 나가리: 전원 무
 */
export function outcomesOf(result, pids) {
  const out = Object.fromEntries(pids.map((p) => [p, 'none']));
  if (result.draw) {
    for (const p of pids) out[p] = 'draw';
    return out;
  }
  const losers = result.losers ?? [];
  const winners =
    result.winner != null
      ? [result.winner]
      : [...new Set(result.payments.filter((p) => p.kind === 'forfeit' || p.kind === 'game').map((p) => p.to))];
  for (const p of winners) out[p] = 'win';
  for (const p of losers) out[p] = 'lose';
  return out;
}

/**
 * 지불 내역 → 실제 이동 금액. (DB 접근 없는 순수 함수)
 * - 한 사람이 여러 명에게 내야 하는데 보유 머니가 모자라면, 가진 만큼을 금액 비율대로 나눠 낸다.
 * - 보유 머니가 전부 바닥나도 음수가 되지 않는다.
 * - exempt(AI 봇) 가 내는 돈은 한도 없이 전액 지불, 받는 돈과 차감은 잔고에 반영하지 않는다(자본금 무한).
 * @returns {{ transfers: {from,to,kind,amount}[], delta: Record<number, number> }} delta 는 봇 제외 실제 잔고 증감
 */
export function computeTransfers({ payments, betPerPt, balances, exempt = new Set() }) {
  const wanted = payments.map((p) => ({ ...p, want: Math.max(0, Math.round(p.total * betPerPt)) })).filter((p) => p.want > 0);
  const owed = new Map();
  for (const p of wanted) owed.set(p.from, (owed.get(p.from) ?? 0) + p.want);

  const transfers = [];
  for (const [from, sum] of owed) {
    const pay = exempt.has(from) ? sum : Math.min(sum, Math.max(0, balances[from] ?? 0));
    const mine = wanted.filter((p) => p.from === from);
    let left = pay;
    const parts = mine.map((p) => {
      const a = pay === sum ? p.want : Math.floor((p.want * pay) / sum);
      left -= a;
      return a;
    });
    for (let i = 0; left > 0; i = (i + 1) % parts.length) {
      parts[i] += 1; // 나머지 1원 단위는 앞에서부터 배분
      left -= 1;
    }
    mine.forEach((p, i) => transfers.push({ from, to: p.to, kind: p.kind, amount: parts[i] }));
  }

  const delta = {};
  for (const t of transfers) {
    if (!exempt.has(t.from)) delta[t.from] = (delta[t.from] ?? 0) - t.amount;
    if (!exempt.has(t.to)) delta[t.to] = (delta[t.to] ?? 0) + t.amount;
  }
  return { transfers: transfers.filter((t) => t.amount > 0), delta };
}

/**
 * 게임 종료 정산: 머니 증감 + 승/패 카운트 + 기록을 한 트랜잭션으로 처리한다.
 * ranked=false(AI 1:1 연습)면 DB 를 전혀 건드리지 않는다.
 * @returns {Promise<null | { transfers, delta, money: Record<number, number>, gameId }>}
 */
export { recordPractice };

export async function settleGame({ roomName, betPerPt, pids, result, ranked = true }) {
  if (!ranked) return null;
  return prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: { id: { in: pids } } });
    const balances = Object.fromEntries(users.map((u) => [u.id, u.money]));
    const exempt = new Set(users.filter((u) => u.isBot).map((u) => u.id));
    const { transfers, delta } = computeTransfers({ payments: result.payments, betPerPt, balances, exempt });
    const outcome = outcomesOf(result, pids);
    const money = {};

    for (const u of users) {
      if (u.isBot) continue;
      const d = delta[u.id] ?? 0;
      const upd = await tx.user.update({
        where: { id: u.id },
        data: {
          money: { increment: d },
          wins: { increment: outcome[u.id] === 'win' ? 1 : 0 },
          losses: { increment: outcome[u.id] === 'lose' ? 1 : 0 },
        },
      });
      money[u.id] = upd.money;
    }
    const game = await tx.game.create({
      data: {
        roomName,
        betPerPt,
        playerCount: pids.length,
        nagari: !!result.draw,
        detail: result.draw ? '나가리' : [...(result.detail ?? []).map((d) => d.name), ...(result.tags ?? [])].join(', '),
        results: {
          create: users.filter((u) => !u.isBot).map((u) => ({ userId: u.id, outcome: outcome[u.id], moneyDelta: delta[u.id] ?? 0 })),
        },
      },
    });
    const unlocked = await applyGameStats(tx, { pids, result, ranked: true, outcome });
    return { transfers, delta, money, gameId: game.id, unlocked };
  });
}

/**
 * 섯다 정산: game.result.net(순증감: 받은 돈 − 낸 돈)을 한 트랜잭션으로 반영한다.
 * 그 사이 잔액이 줄어 모자라면 진 사람은 가진 만큼만 내고, 이긴 사람은 실제로 걷힌 금액을 비율대로 나눠 받는다(음수 잔액 없음, 제로섬 유지).
 * @returns {Promise<{ delta: Record<number, number>, money: Record<number, number>, gameId: number }>}
 */
export async function settleSeotda({ roomName, ante, pids, result, ranked = true, info = null }) {
  if (!ranked) return null; // AI 연습 판은 머니/전적 무변동
  return prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: { id: { in: pids } } });
    const bal = Object.fromEntries(users.map((u) => [u.id, u.money]));
    const exempt = new Set(users.filter((u) => u.isBot).map((u) => u.id)); // AI 봇: 자본금 무한, 잔고/전적 무반영
    const net = result.net ?? {};
    const debit = {};
    let collected = 0;
    let needed = 0;
    for (const p of pids) {
      const n = net[p] ?? 0;
      if (n < 0) {
        debit[p] = exempt.has(p) ? -n : Math.min(-n, bal[p] ?? 0);
        collected += debit[p];
      } else needed += n;
    }
    const delta = {};
    for (const p of pids) delta[p] = (net[p] ?? 0) < 0 ? -debit[p] : 0;
    // 이긴 사람: 필요한 금액만큼 (걷힌 돈이 모자라면 비율대로 줄여서)
    const positives = pids.filter((p) => (net[p] ?? 0) > 0);
    let given = 0;
    for (const p of positives) {
      const want = net[p];
      const amt = needed <= collected ? want : Math.floor((want * collected) / needed);
      delta[p] = amt;
      given += amt;
    }
    if (positives.length && given < collected) delta[positives[0]] += collected - given; // 반올림 나머지
    const outcome = Object.fromEntries(pids.map((p) => [p, result.rematch ? 'none' : (net[p] ?? 0) > 0 ? 'win' : (net[p] ?? 0) < 0 ? 'lose' : 'draw']));
    const money = {};
    for (const u of users) {
      if (u.isBot) continue;
      const upd = await tx.user.update({
        where: { id: u.id },
        data: {
          money: { increment: delta[u.id] ?? 0 },
        },
      });
      money[u.id] = upd.money;
    }
    const names = Object.values(result.hands ?? {}).map((h) => h.name);
    const game = await tx.game.create({
      data: {
        roomName: `[섯다] ${roomName}`,
        betPerPt: ante,
        playerCount: pids.length,
        nagari: false,
        detail: `섯다${result.kind === 'fold' ? ' · 전원 다이' : ''}${names.length ? ` · ${names.join(' vs ')}` : ''}`,
        results: { create: users.filter((u) => !u.isBot).map((u) => ({ userId: u.id, outcome: outcome[u.id], moneyDelta: delta[u.id] ?? 0 })) },
      },
    });
    const unlocked = await applySeotdaStats(tx, { pids, result, info, ranked: true, outcome }); // 섯다 전적(sdWins/sdLosses)·스탯·업적
    return { delta, money, gameId: game.id, unlocked };
  });
}

/** 섯다 연습 판(사람 1명 + AI): 머니·전적은 그대로, 판 단위 업적만 */
export function recordSeotdaPractice({ pids, result, info }) {
  const outcome = Object.fromEntries(pids.map((p) => [p, result.rematch ? 'none' : (result.net?.[p] ?? 0) > 0 ? 'win' : (result.net?.[p] ?? 0) < 0 ? 'lose' : 'draw']));
  return prisma.$transaction((tx) => applySeotdaStats(tx, { pids, result, info, ranked: false, outcome }));
}

/** 오목 정산: 진 사람이 참가비를 이긴 사람에게 (모자라면 가진 만큼). AI 연습 판은 무변동. 무승부는 변동 없음. */
export async function settleOmok({ roomName, ante, pids, result, ranked = true }) {
  if (!ranked) return null;
  return prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: { id: { in: pids } } });
    const bal = Object.fromEntries(users.map((u) => [u.id, u.money]));
    const exempt = new Set(users.filter((u) => u.isBot).map((u) => u.id));
    const delta = Object.fromEntries(pids.map((p) => [p, 0]));
    const loser = pids.find((p) => (result.net?.[p] ?? 0) < 0);
    const winner = pids.find((p) => (result.net?.[p] ?? 0) > 0);
    if (loser != null && winner != null) {
      const pay = exempt.has(loser) ? ante : Math.min(ante, bal[loser] ?? 0);
      delta[loser] = -pay;
      delta[winner] = pay;
    }
    const outcome = Object.fromEntries(pids.map((p) => [p, winner == null ? 'draw' : p === winner ? 'win' : 'lose']));
    const money = {};
    for (const u of users) {
      if (u.isBot) continue;
      const upd = await tx.user.update({ where: { id: u.id }, data: { money: { increment: delta[u.id] ?? 0 } } });
      money[u.id] = upd.money;
    }
    const game = await tx.game.create({
      data: {
        roomName: `[오목] ${roomName}`,
        betPerPt: ante,
        playerCount: pids.length,
        nagari: false,
        detail: `오목${result.kind === 'forfeit' ? ' · 기권' : result.kind === 'full' ? ' · 무승부' : ''}`,
        results: { create: users.filter((u) => !u.isBot).map((u) => ({ userId: u.id, outcome: outcome[u.id], moneyDelta: delta[u.id] ?? 0 })) },
      },
    });
    const unlocked = await applyOmokStats(tx, { pids, moves: result.moveCount ?? 0, ranked: true, outcome });
    return { delta, money, gameId: game.id, unlocked };
  });
}
