import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { JWT_SECRET, INITIAL_MONEY, BCRYPT_ROUNDS, AVATAR_DIR } from './config.js';
import { bus } from './events.js';
import { ACHIEVEMENTS, achievementById, parseAchievements, titleText, computeStats } from './stats.js';

export const BOT_PREFIX = 'AI봇';

/** 다른 사람에게 보이는 이름: 닉네임이 있으면 닉네임, 없으면 아이디 */
export const displayName = (u) => u.nickname || u.username;
export const avatarUrl = (u) => (u.avatar ? `/uploads/avatars/${u.avatar}` : null);

// ---------- 하루 단위 보상 (한국 시간 기준 날짜) ----------
export const ATTENDANCE_BONUS = 10000;
export const GAEPYEONG_AMOUNT = 30000;
export const GAEPYEONG_MAX_MONEY = 10000; // 이 금액 이하일 때만 받을 수 있다
export const GAEPYEONG_DAILY_LIMIT = 3;
export const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstStartOfDay = (day) => new Date(`${day}T00:00:00+09:00`);
const gaepyeongUsed = (u) => (u.gaepyeongDate === kstDate() ? u.gaepyeongCount : 0);

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  name: displayName(u),
  nickname: u.nickname ?? null,
  avatar: avatarUrl(u),
  money: u.money,
  wins: u.wins, // 고스톱
  losses: u.losses,
  sdWins: u.sdWins ?? 0, // 섯다
  sdLosses: u.sdLosses ?? 0,
  achievements: parseAchievements(u),
  title: u.title && parseAchievements(u).includes(u.title) ? u.title : null,
  titleText: titleText(u),
  gaepyeongLeft: Math.max(0, GAEPYEONG_DAILY_LIMIT - gaepyeongUsed(u)),
  canGaepyeong: u.money <= GAEPYEONG_MAX_MONEY && gaepyeongUsed(u) < GAEPYEONG_DAILY_LIMIT,
});

export const signToken = (user) => jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET).uid;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const uid = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.uid = uid;
  return next();
}

const router = Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !/^[A-Za-z0-9가-힣_]{2,12}$/.test(username))
    return res.status(400).json({ error: '아이디는 2~12자의 한글/영문/숫자/_ 만 가능합니다.' });
  if (typeof password !== 'string' || password.length < 4 || password.length > 64)
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  if (username.startsWith(BOT_PREFIX)) return res.status(400).json({ error: `'${BOT_PREFIX}' 로 시작하는 아이디는 예약되어 있습니다.` });
  if (await prisma.user.findFirst({ where: { OR: [{ username }, { nickname: username }] } }))
    return res.status(409).json({ error: '이미 사용 중인 아이디입니다.' });
  const user = await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), money: INITIAL_MONEY },
  });
  return res.json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = typeof username === 'string' ? await prisma.user.findUnique({ where: { username } }) : null;
  if (!user || user.isBot || typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  return res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!user) return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  return res.json({ user: publicUser(user) });
});

router.get('/records', requireAuth, async (req, res) => {
  const rows = await prisma.gameResult.findMany({
    where: { userId: req.uid },
    orderBy: { id: 'desc' },
    take: 20,
    include: { game: { include: { results: { include: { user: { select: { id: true, username: true, nickname: true } } } } } } },
  });
  res.json({
    records: rows.map((r) => ({
      id: r.game.id,
      roomName: r.game.roomName,
      outcome: r.outcome,
      won: r.outcome === 'win',
      opponents: r.game.results.filter((x) => x.userId !== req.uid).map((x) => displayName(x.user)),
      playerCount: r.game.playerCount,
      moneyDelta: r.moneyDelta,
      detail: r.game.detail,
      createdAt: r.game.createdAt,
    })),
  });
});

// ---------- 프로필 (닉네임 / 아바타) ----------
const NICK_RE = /^[A-Za-z0-9가-힣_]{2,12}$/;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** 확장자·Content-Type 은 믿지 않고 파일 첫 바이트로 이미지 종류를 판별 */
function sniffImage(b) {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const removeAvatarFile = (name) => {
  if (name) fs.promises.rm(path.join(AVATAR_DIR, path.basename(name)), { force: true }).catch(() => {});
};

router.put('/profile', requireAuth, async (req, res) => {
  const raw = req.body?.nickname;
  if (typeof raw !== 'string') return res.status(400).json({ error: '닉네임이 올바르지 않습니다.' });
  const nickname = raw.trim();
  if (nickname === '') {
    // 비우면 아이디를 그대로 보여준다
    const user = await prisma.user.update({ where: { id: req.uid }, data: { nickname: null } });
    bus.emit('profile', req.uid);
    return res.json({ user: publicUser(user) });
  }
  if (!NICK_RE.test(nickname)) return res.status(400).json({ error: '닉네임은 2~12자의 한글/영문/숫자/_ 만 가능합니다.' });
  if (nickname.toLowerCase().startsWith(BOT_PREFIX.toLowerCase())) return res.status(400).json({ error: `'${BOT_PREFIX}' 로 시작하는 이름은 예약되어 있습니다.` });
  const taken = await prisma.user.findFirst({
    where: { id: { not: req.uid }, OR: [{ nickname }, { username: nickname }] },
  });
  if (taken) return res.status(409).json({ error: '이미 사용 중인 이름입니다.' });
  try {
    const user = await prisma.user.update({ where: { id: req.uid }, data: { nickname } });
    bus.emit('profile', req.uid);
    return res.json({ user: publicUser(user) });
  } catch {
    return res.status(409).json({ error: '이미 사용 중인 이름입니다.' });
  }
});

router.post('/avatar', requireAuth, express.raw({ type: IMAGE_TYPES, limit: '2mb' }), async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(415).json({ error: 'PNG/JPG/GIF/WEBP 이미지만 올릴 수 있습니다.' });
  const ext = sniffImage(buf);
  if (!ext) return res.status(415).json({ error: '올바른 이미지 파일이 아닙니다.' });
  await fs.promises.mkdir(AVATAR_DIR, { recursive: true });
  const file = `${req.uid}-${Date.now()}.${ext}`;
  await fs.promises.writeFile(path.join(AVATAR_DIR, file), buf);
  const old = await prisma.user.findUnique({ where: { id: req.uid }, select: { avatar: true } });
  const user = await prisma.user.update({ where: { id: req.uid }, data: { avatar: file } });
  removeAvatarFile(old?.avatar);
  bus.emit('profile', req.uid);
  return res.json({ user: publicUser(user) });
});

router.delete('/avatar', requireAuth, async (req, res) => {
  const old = await prisma.user.findUnique({ where: { id: req.uid }, select: { avatar: true } });
  const user = await prisma.user.update({ where: { id: req.uid }, data: { avatar: null } });
  removeAvatarFile(old?.avatar);
  bus.emit('profile', req.uid);
  return res.json({ user: publicUser(user) });
});

router.get('/stats', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!user) return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  return res.json({ stats: computeStats(user) });
});

router.get('/achievements', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!user) return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  const owned = parseAchievements(user);
  return res.json({
    title: user.title,
    achievements: ACHIEVEMENTS.map(({ id, game, emoji, name, desc }) => ({ id, game: game ?? 'gostop', emoji, name, desc, owned: owned.includes(id) })),
  });
});

/** 대표 칭호 선택: 달성한 업적만 고를 수 있고, null 이면 칭호 없음 */
router.put('/title', requireAuth, async (req, res) => {
  const id = req.body?.title ?? null;
  if (id !== null && (typeof id !== 'string' || !achievementById(id))) return res.status(400).json({ error: '없는 칭호입니다.' });
  const me = await prisma.user.findUnique({ where: { id: req.uid } });
  if (id !== null && !parseAchievements(me).includes(id)) return res.status(403).json({ error: '아직 달성하지 못한 칭호입니다.' });
  const user = await prisma.user.update({ where: { id: req.uid }, data: { title: id } });
  bus.emit('profile', req.uid);
  return res.json({ user: publicUser(user) });
});

/** 출석 체크: KST 하루 첫 호출에만 보너스. 조건부 updateMany 로 동시 호출에도 한 번만 지급된다. */
router.post('/checkin', requireAuth, async (req, res) => {
  const startOfToday = kstStartOfDay(kstDate());
  const r = await prisma.user.updateMany({
    where: { id: req.uid, OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: startOfToday } }] },
    data: { lastLoginAt: new Date(), money: { increment: ATTENDANCE_BONUS } },
  });
  const user = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!user) return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  if (r.count > 0) bus.emit('profile', req.uid);
  return res.json({ bonus: r.count > 0 ? ATTENDANCE_BONUS : 0, user: publicUser(user) });
});

/** 개평(구제금): 잔액 10,000원 이하 + 오늘 3회 미만일 때 30,000원. 트랜잭션 + 조건부 갱신으로 이중 지급 방지. */
router.post('/gaepyeong', requireAuth, async (req, res) => {
  const today = kstDate();
  const out = await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: req.uid } });
    if (!u) return { status: 401, error: '계정을 찾을 수 없습니다.' };
    if (u.money > GAEPYEONG_MAX_MONEY) return { status: 400, error: `보유 머니가 ${GAEPYEONG_MAX_MONEY.toLocaleString('ko-KR')}원 이하일 때만 받을 수 있습니다.` };
    const used = u.gaepyeongDate === today ? u.gaepyeongCount : 0;
    if (used >= GAEPYEONG_DAILY_LIMIT) return { status: 400, error: '오늘 개평을 모두 받았습니다.' };
    const r = await tx.user.updateMany({
      where: { id: u.id, money: { lte: GAEPYEONG_MAX_MONEY }, gaepyeongCount: u.gaepyeongCount, gaepyeongDate: u.gaepyeongDate },
      data: { money: { increment: GAEPYEONG_AMOUNT }, gaepyeongDate: today, gaepyeongCount: used + 1 },
    });
    if (r.count === 0) return { status: 409, error: '잠시 후 다시 시도해 주세요.' };
    return { user: await tx.user.findUnique({ where: { id: u.id } }) };
  });
  if (out.error) return res.status(out.status).json({ error: out.error });
  bus.emit('profile', req.uid);
  return res.json({ amount: GAEPYEONG_AMOUNT, user: publicUser(out.user) });
});

/** 랭킹: ?game=money(보유 머니, 기본) | gostop(고스톱 승수) | seotda(섯다 승수). 같은 승수면 패가 적은 순. */
router.get('/ranking', async (req, res) => {
  const game = ['gostop', 'seotda'].includes(req.query.game) ? req.query.game : 'money';
  const order = {
    money: [{ money: 'desc' }],
    gostop: [{ wins: 'desc' }, { losses: 'asc' }],
    seotda: [{ sdWins: 'desc' }, { sdLosses: 'asc' }],
  }[game];
  const where = { isBot: false, ...(game === 'gostop' ? { wins: { gt: 0 } } : game === 'seotda' ? { sdWins: { gt: 0 } } : {}) };
  const users = await prisma.user.findMany({ where, orderBy: order, take: 10 });
  res.json({ game, ranking: users.map(publicUser) });
});

export { publicUser };
export default router;
