import { prisma } from './db.js';
import { POWER } from './seotda/rules.js';

/**
 * 업적 정의. check(ctx) 가 true 면 달성.
 *  ctx: { after: 이번 판 반영 후 누적 카운터, st: 이번 판 내 통계, baks: 이번 판에 내가 당한 박, win }
 */
export const ACHIEVEMENTS = [
  { id: 'ppeok_king', emoji: '💩', name: '뻑의 제왕', desc: '한 판에서 연속으로 3번 뻑', check: ({ st }) => (st?.ppeokMax ?? 0) >= 3 },
  { id: 'gwang_cult', emoji: '🙏', name: '광신도', desc: '3광 이상으로 5번 승리', check: ({ after }) => after.gwangWins >= 5 },
  {
    id: 'mushoyu',
    emoji: '🕳️',
    name: '무소유',
    desc: '피박·광박·멍박을 한 판에 동시에 당함',
    check: ({ baks }) => ['피박', '광박', '멍박'].every((b) => baks.includes(b)),
  },
  { id: 'tazza', emoji: '🃏', name: '타짜', desc: 'AI를 상대로 10번 승리', check: ({ after }) => after.botWins >= 10 },
  { id: 'first_win', emoji: '🥇', name: '첫 승리', desc: '실전에서 첫 승리', check: ({ after }) => after.wins >= 1 },
  { id: 'bomber', emoji: '💣', name: '폭탄마', desc: '폭탄을 누적 5번', check: ({ after }) => after.bombCount >= 5 },
  { id: 'go_addict', emoji: '🔥', name: '고 중독', desc: '고를 누적 20번 외침', check: ({ after }) => after.goCount >= 20 },
  // ----- 섯다 (ctx: { after, sd: 이번 판 내 정보, win, double }) -----
  { id: 'sd_first', game: 'seotda', emoji: '🀄', name: '섯다 첫 승', desc: '섯다 실전에서 첫 승리', check: ({ after }) => after.sdWins >= 1 },
  { id: 'sd_gwang', game: 'seotda', emoji: '🌕', name: '광땡 메이커', desc: '광땡으로 승리', check: ({ sd, win }) => win && sd?.category === 'gwangttaeng' },
  { id: 'sd_jang', game: 'seotda', emoji: '🔟', name: '장군', desc: '장땡으로 승리', check: ({ sd, win }) => win && sd?.power === POWER.TTAENG_BASE + 10 },
  { id: 'sd_bluff', game: 'seotda', emoji: '🎭', name: '허세왕', desc: '3끗 이하 패로 상대를 모두 다이시키고 3번 승리', check: ({ after }) => after.sdBluffWins >= 3 },
  { id: 'sd_amhaeng', game: 'seotda', emoji: '🕵️', name: '암행어사 출두', desc: '암행어사로 광땡을 잡음', check: ({ sd, win }) => win && sd?.special === 'amhaeng' && sd.caught },
  { id: 'sd_ttangjabi', game: 'seotda', emoji: '🪤', name: '땡잡이', desc: '땡잡이로 땡을 잡음', check: ({ sd, win }) => win && sd?.special === 'ttangjabi' && sd.caught },
  { id: 'sd_double', game: 'seotda', emoji: '💰', name: '묻고 더블로 가', desc: '묻고 더블 판에서 승리', check: ({ win, double }) => win && double > 0 },
  { id: 'sd_allin', game: 'seotda', emoji: '🔥', name: '올인 승부사', desc: '올인하고 승리', check: ({ sd, win }) => win && !!sd?.allIn },
  // ----- 오목 (ctx: { after, og: { moves, kind }, win }) -----
  { id: 'og_first', game: 'omok', emoji: '⚫', name: '오목 첫 승', desc: '오목 실전에서 첫 승리', check: ({ after }) => after.ogWins >= 1 },
  { id: 'og_streak3', game: 'omok', emoji: '🔥', name: '오목 3연승', desc: '오목 실전에서 3연승', check: ({ after }) => after.ogBestStreak >= 3 },
  { id: 'og_streak5', game: 'omok', emoji: '⚔️', name: '오목 5연승', desc: '오목 실전에서 5연승', check: ({ after }) => after.ogBestStreak >= 5 },
  { id: 'og_ai10', game: 'omok', emoji: '🤖', name: 'AI 사냥꾼', desc: '오목에서 AI 를 10번 이김 (연습 포함)', check: ({ after }) => after.ogBotWins >= 10 },
  { id: 'og_fast', game: 'omok', emoji: '⚡', name: '속전속결', desc: '25수 이내에 오목 승리 (실전)', check: ({ after, ranked }) => ranked && after.ogFastWin > 0 && after.ogFastWin <= 25 },
  { id: 'og_long', game: 'omok', emoji: '🏔️', name: '장기전의 달인', desc: '100수 이상 이어진 판에서 승리 (실전)', check: ({ og, win, ranked }) => ranked && win && (og?.moves ?? 0) >= 100 },
];

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id);
export const parseAchievements = (u) => {
  try {
    const a = JSON.parse(u.achievements || '[]');
    return Array.isArray(a) ? a.filter((id) => achievementById(id)) : [];
  } catch {
    return [];
  }
};
/** 대표 칭호 표시 문자열 (보유하지 않은 칭호는 표시하지 않는다) */
export const titleText = (u) => {
  const a = u.title && parseAchievements(u).includes(u.title) ? achievementById(u.title) : null;
  return a ? `${a.emoji} ${a.name}` : null;
};

/** 화면용 스탯 계산 (분모 0 방어) */
export function computeStats(u) {
  const decisions = u.goCount + u.stopCount;
  const total = u.wins + u.losses;
  const g = u.statGames;
  return {
    seotda: computeSeotdaStats(u),
    omok: computeOmokStats(u),
    games: g,
    wins: u.wins,
    losses: u.losses,
    winRate: total ? u.wins / total : 0,
    goRate: decisions ? u.goCount / decisions : 0, // 고 성향: 고 / (고 + 스톱)
    avgScore: g ? u.scoreSum / g : 0, // 평균 획득 점수 (판당)
    pibakAvoid: u.losses ? 1 - u.pibakLosses / u.losses : 1, // 진 판 중 피박을 당하지 않은 비율
    bbuckPerGame: g ? u.bbuckCount / g : 0,
    bombPerGame: g ? (u.bombCount + u.shakeCount) / g : 0,
    goCount: u.goCount,
    stopCount: u.stopCount,
    bbuckCount: u.bbuckCount,
    bombCount: u.bombCount,
    shakeCount: u.shakeCount,
    botWins: u.botWins,
  };
}

/** 섯다 화면용 스탯 */
export function computeSeotdaStats(u) {
  const total = u.sdWins + u.sdLosses;
  const g = u.sdGames;
  return {
    games: g,
    wins: u.sdWins,
    losses: u.sdLosses,
    winRate: total ? u.sdWins / total : 0,
    dieRate: g ? u.sdDies / g : 0, // 다이 비율
    foldWins: u.sdFoldWins, // 상대 전원 다이로 이긴 판
    bluffWins: u.sdBluffWins,
    ttaengWins: u.sdTtaengWins,
    gwangWins: u.sdGwangWins,
    allinWins: u.sdAllinWins,
    doubleWins: u.sdDoubleWins,
    biggestPot: u.sdBiggestPot,
    bestHand: u.sdBestHand,
  };
}

/** 오목 화면용 스탯 */
export function computeOmokStats(u) {
  const total = (u.ogWins ?? 0) + (u.ogLosses ?? 0);
  return {
    games: u.ogGames ?? 0,
    wins: u.ogWins ?? 0,
    losses: u.ogLosses ?? 0,
    winRate: total ? u.ogWins / total : 0,
    streak: u.ogStreak ?? 0,
    bestStreak: u.ogBestStreak ?? 0,
    botWins: u.ogBotWins ?? 0,
    fastWin: u.ogFastWin ?? 0,
  };
}

/** 업적 하나를 새로 달성했는지 판정해 갱신 데이터에 반영한다 */
function unlockInto(u, data, list, ctx) {
  const owned = parseAchievements(u);
  const fresh = list.filter((a) => !owned.includes(a.id) && a.check(ctx)).map((a) => a.id);
  if (!fresh.length) return [];
  data.achievements = JSON.stringify([...owned, ...fresh]);
  if (!u.title) data.title = fresh[0]; // 첫 업적은 자동으로 대표 칭호
  return fresh;
}

/**
 * 섯다 한 판 종료: 전적·스탯 누적(실전만) + 섯다 업적 판정(연습 포함, 누적 조건은 실전에서만 채워진다).
 *  info: SeotdaGame.statsInfo() — 참가자별 { name, power, category, special, died, allIn, caught }, double
 *  outcome: win | lose | draw | none
 */
export async function applySeotdaStats(tx, { pids, result, info, ranked, outcome }) {
  const users = await tx.user.findMany({ where: { id: { in: pids } } });
  const list = ACHIEVEMENTS.filter((a) => a.game === 'seotda');
  const unlocked = {};
  for (const u of users) {
    if (u.isBot) continue;
    const sd = info?.players?.[u.id] ?? null; // 묻고 더블 전에 빠진 사람은 없음
    const win = outcome[u.id] === 'win';
    const lose = outcome[u.id] === 'lose';
    const inc = {};
    const data = {};
    if (ranked) {
      Object.assign(inc, {
        sdGames: 1,
        sdWins: win ? 1 : 0,
        sdLosses: lose ? 1 : 0,
        sdDies: sd?.died ? 1 : 0,
        sdFoldWins: win && result.kind === 'fold' ? 1 : 0,
        sdBluffWins: win && result.kind === 'fold' && sd && sd.power <= POWER.KKEUT_BASE + 3 ? 1 : 0,
        sdTtaengWins: win && sd && (sd.category === 'ttaeng' || sd.category === 'gwangttaeng') ? 1 : 0,
        sdGwangWins: win && sd?.category === 'gwangttaeng' ? 1 : 0,
        sdAllinWins: win && sd?.allIn ? 1 : 0,
        sdDoubleWins: win && info?.double > 0 ? 1 : 0,
      });
      const got = result.payouts?.[u.id] ?? 0;
      if (win && got > u.sdBiggestPot) data.sdBiggestPot = got;
      if (sd && sd.power > u.sdBestPower) {
        data.sdBestPower = sd.power;
        data.sdBestHand = sd.name;
      }
    }
    const after = { ...u };
    for (const [k, v] of Object.entries(inc)) {
      after[k] = (u[k] ?? 0) + v;
      if (v) data[k] = { increment: v };
    }
    const fresh = unlockInto(u, data, list, { after, sd, win, double: info?.double ?? 0 });
    if (fresh.length) unlocked[u.id] = fresh;
    if (Object.keys(data).length) await tx.user.update({ where: { id: u.id }, data });
  }
  return unlocked;
}

/**
 * 한 판이 끝났을 때 유저별 스탯 누적 + 업적 판정.
 *  - 실전(ranked) 판만 스탯 카운터를 올린다. (AI 연습은 전적·스탯에 영향 없음)
 *  - 단 botWins(AI 상대 승리)는 '타짜' 업적을 위해 연습 포함으로 센다.
 * tx: prisma 트랜잭션 클라이언트. @returns {Record<number, string[]>} 이번에 새로 달성한 업적 id
 */
export async function applyGameStats(tx, { pids, result, ranked, outcome }) {
  const users = await tx.user.findMany({ where: { id: { in: pids } } });
  const hasBot = users.some((u) => u.isBot);
  const unlocked = {};
  for (const u of users) {
    if (u.isBot) continue;
    const st = result.stats?.[u.id];
    const win = outcome[u.id] === 'win';
    const baks = result.baks?.[u.id] ?? [];
    const inc = {};
    if (ranked && st?.active) {
      Object.assign(inc, {
        statGames: 1,
        goCount: st.go,
        stopCount: st.stop,
        bbuckCount: st.ppeok,
        bombCount: st.bomb,
        shakeCount: st.shake,
        scoreSum: st.score,
        pibakLosses: outcome[u.id] === 'lose' && baks.includes('피박') ? 1 : 0,
        gwangWins: win && st.gwang >= 3 ? 1 : 0,
      });
    }
    if (win && hasBot) inc.botWins = 1;
    // 이 판 반영 후 값 (wins/losses 는 settleGame 이 이미 올렸거나(실전) 변동 없음(연습))
    const after = { ...u };
    for (const [k, v] of Object.entries(inc)) after[k] = (u[k] ?? 0) + v;
    const data = {};
    for (const [k, v] of Object.entries(inc)) if (v) data[k] = { increment: v };
    const fresh = st?.active === false ? [] : unlockInto(u, data, ACHIEVEMENTS.filter((a) => !a.game), { after, st, baks, win });
    if (fresh.length) unlocked[u.id] = fresh;
    if (Object.keys(data).length) await tx.user.update({ where: { id: u.id }, data });
  }
  return unlocked;
}

/** 연습(비정산) 판: 머니·전적은 건드리지 않고 botWins/업적만 반영 */
export function recordPractice({ pids, result, outcome }) {
  return prisma.$transaction((tx) => applyGameStats(tx, { pids, result, ranked: false, outcome }));
}

/**
 * 오목 한 판 종료: 전적(ogGames/ogWins/ogLosses)·연승은 실전(ranked)만, AI 상대 승리(ogBotWins)는 연습 포함. 오목 업적 판정.
 *  moves: 총 수. outcome: { pid: 'win'|'lose'|'draw' }
 */
export async function applyOmokStats(tx, { pids, moves, ranked, outcome }) {
  const users = await tx.user.findMany({ where: { id: { in: pids } } });
  const hasBot = users.some((u) => u.isBot);
  const list = ACHIEVEMENTS.filter((a) => a.game === 'omok');
  const unlocked = {};
  for (const u of users) {
    if (u.isBot) continue;
    const win = outcome[u.id] === 'win';
    const lose = outcome[u.id] === 'lose';
    const inc = {};
    const set = {};
    if (ranked) {
      Object.assign(inc, { ogGames: 1, ogWins: win ? 1 : 0, ogLosses: lose ? 1 : 0 });
      if (win) set.ogStreak = u.ogStreak + 1;
      else if (lose) set.ogStreak = 0;
      if (set.ogStreak > u.ogBestStreak) set.ogBestStreak = set.ogStreak;
      if (win && (!u.ogFastWin || moves < u.ogFastWin)) set.ogFastWin = moves;
    }
    if (win && hasBot) inc.ogBotWins = 1;
    const after = { ...u, ...set };
    const data = { ...set };
    for (const [k, v] of Object.entries(inc)) {
      after[k] = (u[k] ?? 0) + v;
      if (v) data[k] = { increment: v };
    }
    const fresh = unlockInto(u, data, list, { after, og: { moves }, win, ranked });
    if (fresh.length) unlocked[u.id] = fresh;
    if (Object.keys(data).length) await tx.user.update({ where: { id: u.id }, data });
  }
  return unlocked;
}

/** 오목 연습 판(사람 1명 + AI): 머니·전적은 그대로, AI 승리 수와 업적만 */
export function recordOmokPractice({ pids, moves, outcome }) {
  return prisma.$transaction((tx) => applyOmokStats(tx, { pids, moves, ranked: false, outcome }));
}
