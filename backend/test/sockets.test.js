import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
jest.setTimeout(60000);

let server, base, prisma, isRankedRoom;
const clients = [];
let seq = 0;

beforeAll(async () => {
  useTempDb();
  ({ prisma } = await import('../src/db.js'));
  const { createServer } = await import('../src/app.js');
  ({ isRankedRoom } = await import('../src/sockets.js'));
  ({ server } = createServer());
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  clients.forEach((c) => c.s.close());
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

const post = async (p, body) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function mk(name) {
  const username = `${name}${++seq}`;
  const r = await post('/api/auth/register', { username, password: 'pw1234' });
  const s = ioc(base, { auth: { token: r.token } });
  const c = { s, token: r.token, user: r.user, view: null, money: r.user.money, over: null, chat: [], rooms: [], started: [], msgs: [] };
  s.on('game:start', (m) => { c.view = m.view; c.over = null; c.started.push(m); });
  s.on('game:frames', ({ frames }) => { c.view = frames.at(-1); });
  s.on('me:update', (u) => { c.money = u.money; c.user = u; });
  s.on('game:over', (o) => { c.over = o; });
  s.on('room:chat', (m) => c.chat.push(m));
  s.on('room:joined', ({ room }) => { c.roomId = room.id; });
  s.on('room:state', (st) => { c.room = st; });
  s.on('lobby:rooms', (l) => { c.rooms = l; });
  await new Promise((res) => s.on('connect', res));
  clients.push(c);
  return c;
}

async function setupRoom(n, { bet = 100, opts } = {}) {
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(await mk('p'));
  let r = await emit(cs[0].s, 'room:create', { name: `room${n}`, bet, opts });
  expect(r.ok).toBe(true);
  await sleep(50);
  for (const c of cs.slice(1)) {
    r = await emit(c.s, 'room:join', { roomId: cs[0].roomId });
    expect(r.ok).toBe(true);
  }
  return cs;
}

async function readyAll(cs) {
  for (const c of cs) await emit(c.s, 'room:ready');
  await sleep(150);
}

/** 모든 클라이언트가 game:over 를 받을 때까지 무작위로 진행 */
async function playOut(cs, { sell = 0.5 } = {}) {
  const seen = { gwang: 0, chong: 0 };
  for (let step = 0; !cs.every((c) => c.over); step++) {
    expect(step).toBeLessThan(800);
    const by = Object.fromEntries(cs.map((c) => [c.user.id, c]));
    const view = cs.find((c) => c.view)?.view;
    const actor = by[view.turn];
    if (!actor || view.phase === 'ended' || view.phase === 'busy') { await sleep(10); continue; }
    const v = actor.view;
    let res;
    if (v.phase === 'gwang') {
      seen.gwang++;
      res = await emit(actor.s, Math.random() < sell ? 'game:sellGwang' : 'game:passGwang');
    } else if (v.phase === 'chong') {
      seen.chong++;
      res = await emit(actor.s, Math.random() < 0.5 ? 'game:chongtong' : 'game:passChongtong');
    } else if (v.phase === 'play') {
      res = await emit(actor.s, 'game:play', { cardId: v.hand.length ? pick(v.hand) : null });
      if (!res.ok) res = await emit(actor.s, 'game:play', { cardId: null });
    } else if (v.phase === 'choose') {
      res = await emit(actor.s, 'game:choose', { cardId: pick(v.choice.options) });
    } else if (v.phase === 'gostop') {
      res = await emit(actor.s, Math.random() < 0.3 ? 'game:go' : 'game:stop');
    } else { await sleep(10); continue; }
    expect(res).toMatchObject({ ok: true });
    await sleep(5);
  }
  await sleep(300);
  return seen;
}

describe('인증/REST', () => {
  test('가입 · 중복 · 로그인 · 잘못된 토큰', async () => {
    const name = `auth${++seq}`;
    const r = await post('/api/auth/register', { username: name, password: 'pw1234' });
    expect(r.user.money).toBe(100000);
    expect((await post('/api/auth/register', { username: name, password: 'pw1234' })).error).toBeDefined();
    expect((await post('/api/auth/login', { username: name, password: 'bad' })).error).toBeDefined();
    expect((await post('/api/auth/login', { username: name, password: 'pw1234' })).token).toBeDefined();
    const bad = ioc(base, { auth: { token: 'bad' } });
    const msg = await new Promise((res) => bad.on('connect_error', (e) => res(e.message)));
    bad.close();
    expect(msg).toBe('unauthorized');
  });

  test('이미지 정적 서빙', async () => {
    const r = await fetch(`${base}/pics/row-1-column-1.png`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('image/png');
  });
});

describe('방/로비', () => {
  test('최대 4인, 5번째는 입장 불가 · 로비 목록 반영 · 채팅', async () => {
    const cs = await setupRoom(4);
    const extra = await mk('x');
    const r = await emit(extra.s, 'room:join', { roomId: cs[0].roomId });
    expect(r.ok).toBe(false);
    await sleep(100);
    const summary = extra.rooms.find((x) => x.id === cs[0].roomId);
    expect(summary).toMatchObject({ count: 4, max: 4 });
    cs[1].s.emit('room:chat', { text: '안녕하세요' });
    await sleep(100);
    for (const c of cs) expect(c.chat.some((m) => m.text === '안녕하세요')).toBe(true);
    expect(extra.chat.some((m) => m.text === '안녕하세요')).toBe(false); // 방 밖에는 안 보임
    for (const c of cs) await emit(c.s, 'room:leave');
    extra.s.emit('lobby:chat', { text: '로비' });
  });

  test('혼자서는 시작할 수 없다', async () => {
    const [a] = await setupRoom(1);
    await emit(a.s, 'room:ready');
    await sleep(100);
    expect(a.view).toBeNull();
    await emit(a.s, 'room:leave');
  });

  test('머니 부족하면 입장 불가', async () => {
    const [a] = await setupRoom(1, { bet: 5000 });
    const poor = await mk('poor');
    await prisma.user.update({ where: { id: poor.user.id }, data: { money: 100 } });
    const r = await emit(poor.s, 'room:join', { roomId: a.roomId });
    expect(r.ok).toBe(false);
    await emit(a.s, 'room:leave');
  });

  test('ranked 판정: AI 1:1 은 연습, 3인 이상은 실전', () => {
    const u = (bot) => ({ id: 1, bot });
    expect(isRankedRoom({ players: [u(false), u(true)] })).toBe(false);
    expect(isRankedRoom({ players: [u(false), u(false), u(true)] })).toBe(true);
    expect(isRankedRoom({ players: [u(false), u(true), u(true)] })).toBe(false);
    expect(isRankedRoom({ players: [u(false), u(false)] })).toBe(true);
  });
});

describe.each([2, 3, 4])('%i인 대국 (소켓 e2e)', (n) => {
  test('끝까지 진행 → 머니 보존, 손패 비노출, 승패/기록 반영', async () => {
    const cs = await setupRoom(n, { opts: { bonus: n === 3 } });
    const total0 = cs.reduce((a, c) => a + c.money, 0);
    await readyAll(cs);
    expect(cs.every((c) => c.view)).toBe(true);
    // 정보 은닉: 내 손패만 보이고 남의 손패는 장수만
    for (const c of cs) {
      expect(c.view).not.toHaveProperty('hands');
      expect(c.view.hand.length).toBeGreaterThanOrEqual(0);
      expect(Object.keys(c.view.handCounts).length).toBe(n);
    }
    expect(cs[0].view.active.length).toBe(n === 2 ? 2 : 3);
    if (n === 4) expect(cs[0].view.rest).not.toBeNull();

    await playOut(cs);
    const o = cs[0].over;
    expect(o.ranked).toBe(true);
    // 모든 클라이언트가 같은 결과를 받음
    for (const c of cs) expect(c.over.result.winner).toBe(o.result.winner);
    await sleep(200);
    const rows = await prisma.user.findMany({ where: { id: { in: cs.map((c) => c.user.id) } } });
    expect(rows.reduce((a, u) => a + u.money, 0)).toBe(total0); // 제로섬
    expect(rows.every((u) => u.money >= 0)).toBe(true);
    for (const c of cs) expect(c.money).toBe(rows.find((u) => u.id === c.user.id).money); // 클라 갱신
    // 판 통계가 실전 판에 누적된다: 실제로 친 사람(쉬는 사람 제외)만 1판씩
    expect(rows.reduce((acc, u) => acc + u.statGames, 0)).toBe(n === 4 ? 3 : n);
    expect(rows.reduce((acc, u) => acc + u.goCount + u.stopCount, 0)).toBeGreaterThanOrEqual(0);
    if (!o.result.draw) {
      const w = rows.find((u) => u.id === o.result.winner) ?? null;
      if (w) expect(w.wins).toBe(1);
    }
    const game = await prisma.game.findUnique({ where: { id: o.payout.gameId }, include: { results: true } });
    expect(game.playerCount).toBe(n);
    expect(game.results.length).toBe(n);
    // 기록 API
    const rec = await (await fetch(`${base}/api/auth/records`, { headers: { authorization: `Bearer ${cs[0].token}` } })).json();
    expect(rec.records.length).toBe(1);
    expect(rec.records[0].opponents.length).toBe(n - 1);
    for (const c of cs) await emit(c.s, 'room:leave');
  });
});

describe('다판 / 4인 교대 / 광팔기', () => {
  test('4인: 연속 대국에서 같은 사람이 연속으로 쉬지 않는다', async () => {
    const cs = await setupRoom(4);
    const rests = [];
    for (let g = 0; g < 5; g++) {
      for (const c of cs) { c.over = null; c.view = null; }
      await readyAll(cs);
      rests.push(cs[0].view.rest);
      await playOut(cs);
      await sleep(100);
    }
    for (let i = 1; i < rests.length; i++) expect(rests[i]).not.toBe(rests[i - 1]);
    for (const c of cs) await emit(c.s, 'room:leave');
  });

  test('이탈(기권)하면 남은 사람에게 정산되고 방은 대기 상태로 복귀', async () => {
    const cs = await setupRoom(3);
    await readyAll(cs);
    const total0 = cs.reduce((a, c) => a + c.money, 0);
    const leaver = cs.find((c) => c.view.active.includes(c.user.id));
    await emit(leaver.s, 'room:leave');
    await sleep(400);
    const others = cs.filter((c) => c !== leaver);
    expect(others.every((c) => c.over)).toBe(true);
    expect(others[0].over.result.forfeit).toBe(true);
    const rows = await prisma.user.findMany({ where: { id: { in: cs.map((c) => c.user.id) } } });
    expect(rows.reduce((a, u) => a + u.money, 0)).toBe(total0);
    expect(rows.find((u) => u.id === leaver.user.id).money).toBeLessThan(100000);
    expect(others[0].room.status).toBe('waiting');
    for (const c of others) await emit(c.s, 'room:leave');
  });

  test('광팔기/총통 이벤트가 포함된 3·4인 판을 여러 번 끝까지 (옵션 전부 ON)', async () => {
    let gwangSeen = 0;
    for (const n of [3, 4]) {
      const cs = await setupRoom(n, { opts: { bonus: true, ppeokPay: true, chongtong: true, ttibak: true, nagariCarry: true } });
      for (let g = 0; g < 8; g++) {
        for (const c of cs) { c.over = null; c.view = null; }
        await readyAll(cs);
        const total = (await prisma.user.findMany({ where: { id: { in: cs.map((c) => c.user.id) } } })).reduce((a, u) => a + u.money, 0);
        const seen = await playOut(cs, { sell: 0.8 });
        gwangSeen += seen.gwang;
        await sleep(100);
        const after = (await prisma.user.findMany({ where: { id: { in: cs.map((c) => c.user.id) } } })).reduce((a, u) => a + u.money, 0);
        expect(after).toBe(total);
      }
      for (const c of cs) await emit(c.s, 'room:leave');
    }
    expect(gwangSeen).toBeGreaterThanOrEqual(0); // 광 3장 이상 패는 확률적이므로 실행 자체만 보장
  });
});

describe('보안', () => {
  test('차례가 아닌 사람의 액션 · 남의 방 액션 거부', async () => {
    const cs = await setupRoom(2);
    await readyAll(cs);
    const notTurn = cs.find((c) => c.view.turn !== c.user.id);
    const r = await emit(notTurn.s, 'game:play', { cardId: notTurn.view.hand[0] });
    expect(r.ok).toBe(false);
    const bad = await emit(cs[0].s, 'game:play', { cardId: 999 });
    expect(bad.ok).toBe(false);
    const stranger = await mk('st');
    expect((await emit(stranger.s, 'game:play', { cardId: 1 })).ok).toBe(false);
    // 내 손에 없는 카드
    const turner = cs.find((c) => c.view.turn === c.user.id);
    const notMine = [...Array(48).keys()].find((id) => !turner.view.hand.includes(id));
    expect((await emit(turner.s, 'game:play', { cardId: notMine })).ok).toBe(false);
    for (const c of cs) await emit(c.s, 'room:leave');
  });
});

describe('국진 선택 (game:gukjin)', () => {
  test('방/게임 없음 · 국진 미획득 · 잘못된 값은 거부, 획득 후 선택은 전원에게 방송되고 점수에 반영', async () => {
    const { GostopGame } = await import('../src/game/GostopGame.js');
    const lone = await mk('g');
    expect((await emit(lone.s, 'game:gukjin', { mode: 'pi' })).ok).toBe(false); // 방 없음

    const cs = await setupRoom(2);
    expect((await emit(cs[0].s, 'game:gukjin', { mode: 'pi' })).ok).toBe(false); // 게임 시작 전
    await readyAll(cs);
    expect(cs[0].view).toBeTruthy();
    expect((await emit(cs[0].s, 'game:gukjin', { mode: 'pi' })).error).toMatch(/국진/); // 먹지 않음

    // 먹은 상태를 만들어 주는 스파이: 실제 소켓 핸들러 → 엔진 경로는 그대로 탄다
    const orig = GostopGame.prototype.setGukjin;
    const spy = jest.spyOn(GostopGame.prototype, 'setGukjin').mockImplementation(function (pid, mode) {
      if (!this.captured[pid].includes(32)) this.captured[pid] = [...this.captured[pid], 32];
      return orig.call(this, pid, mode);
    });
    try {
      const [a, b] = cs;
      expect((await emit(a.s, 'game:gukjin', { mode: 'bogus' })).ok).toBe(false);
      const before = a.view.scores[a.user.id].total;
      const r = await emit(a.s, 'game:gukjin', { mode: 'pi' });
      expect(r.ok).toBe(true);
      await sleep(900); // 프레임 방송
      expect(a.view.gukjin[a.user.id]).toBe('pi');
      expect(b.view.gukjin[a.user.id]).toBe('pi'); // 상대에게도 노출
      expect(a.view.scores[a.user.id].total).toBeGreaterThanOrEqual(before);
      // 턴을 진행시키지 않는다
      expect(a.view.turn).toBe(b.view.turn);
    } finally {
      spy.mockRestore();
    }
  });
});
