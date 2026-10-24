import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';
import { SeotdaBot, equityVsOne } from '../src/seotda/SeotdaBot.js';
import { SeotdaGame } from '../src/seotda/SeotdaGame.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.BOT_DELAY_SCALE = '0.02';
process.env.SEOTDA_REMATCH_MS = '100';
jest.setTimeout(60000);

describe('SeotdaBot 판단', () => {
  test('승률: 38광땡 ≈ 1, 약한 패는 낮고, 강할수록 높다', () => {
    expect(equityVsOne([8, 28])).toBeGreaterThan(0.99); // 38광땡
    expect(equityVsOne([0, 2])).toBeGreaterThan(equityVsOne([4, 29])); // 1땡 > 망통
  });

  const viewFor = (hands, extra = {}) => {
    const g = new SeotdaGame([1, 2], { ante: 100, balances: { 1: 100000, 2: 100000 }, dealer: 1, hands, ...extra });
    return g;
  };

  test('최강 패는 절대 다이하지 않고, 최약 패는 큰 베팅에 다이한다', () => {
    const rnd = () => 0.5;
    const strong = viewFor({ 1: [8, 28], 2: [4, 29] });
    const a = new SeotdaBot(1, { rnd }).decide(strong.view(1));
    expect(['bbing', 'half', 'call']).toContain(a);

    const g = viewFor({ 1: [4, 29], 2: [2, 0] });
    g.act(1, 'bbing');
    g.act(2, 'ddadang');
    const weak = new SeotdaBot(1, { rnd }).decide(g.view(1));
    expect(weak).toBe('die');
  });

  test('항상 합법적인 행동만 고른다 (랜덤 시뮬레이션)', () => {
    for (let n = 0; n < 300; n++) {
      const g = new SeotdaGame([1, 2, 3], { ante: 100, balances: { 1: 5000, 2: 5000, 3: 5000 }, dealer: 1 });
      const bots = Object.fromEntries([1, 2, 3].map((p) => [p, new SeotdaBot(p)]));
      let guard = 0;
      while (g.phase === 'betting' && guard++ < 50) {
        const r = g.act(g.turn, bots[g.turn].decide(g.view(g.turn)));
        expect(r.ok).toBe(true);
      }
      expect(g.phase).toBe('ended');
    }
  });
});

describe('섯다 AI 방 (소켓)', () => {
  let server, base, prisma;
  const sockets = [];
  let seq = 0;
  beforeAll(async () => {
    useTempDb();
    ({ prisma } = await import('../src/db.js'));
    const { createServer } = await import('../src/app.js');
    ({ server } = createServer());
    await new Promise((r) => server.listen(0, r));
    base = `http://localhost:${server.address().port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
  async function mk() {
    const username = `sb${++seq}`;
    const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
    const s = ioc(base, { auth: { token: r.token }, forceNew: true });
    sockets.push(s);
    const c = { s, user: r.user, view: null, room: null, over: null, starts: 0 };
    s.on('seotda:start', (m) => { c.view = m.view; c.starts++; c.over = null; });
    s.on('seotda:state', (m) => (c.view = m.view));
    s.on('seotda:over', (o) => (c.over = o));
    s.on('room:joined', ({ room }) => (c.room = room));
    s.on('room:state', (x) => (c.room = x));
    await new Promise((res) => s.on('connect', res));
    await sleep(40);
    return c;
  }
  const until = async (fn, ms = 20000) => {
    const t = Date.now();
    while (!fn()) {
      if (Date.now() - t > ms) throw new Error('timeout');
      await sleep(30);
    }
  };
  /** 내 차례마다 체크/콜, 아니면 대기하며 한 판이 끝날 때까지 */
  async function playOut(c) {
    while (!c.over) {
      if (c.view?.options && c.view.turn === c.user.id) await emit(c.s, 'seotda:act', { action: c.view.options.call.amount === 0 ? 'call' : 'die' });
      await sleep(30);
    }
  }

  test('AI 1:1 연습: 봇이 알아서 두고, 머니/전적은 그대로', async () => {
    const a = await mk();
    const before = await prisma.user.findUnique({ where: { id: a.user.id } });
    const r = await emit(a.s, 'room:practice', { game: 'seotda' });
    expect(r.ok).toBe(true);
    expect(a.room.game).toBe('seotda');
    expect(a.room.ranked).toBe(false);
    await until(() => a.starts > 0);
    await playOut(a);
    expect(a.over.ranked).toBe(false);
    expect(a.over.payout).toBeNull();
    const after = await prisma.user.findUnique({ where: { id: a.user.id } });
    expect(after.money).toBe(before.money);
    expect(after.wins + after.losses).toBe(0);
    expect(await prisma.game.count({ where: { roomName: { contains: '[섯다]' } } })).toBe(0);
  });

  test('사람 2명 + 봇은 실전: 봇은 잔고/전적에 반영되지 않고 사람끼리·봇과 정산된다', async () => {
    const a = await mk();
    const b = await mk();
    await emit(a.s, 'room:create', { name: 'bot-ranked', bet: 100, game: 'seotda' });
    await emit(b.s, 'room:join', { roomId: a.room.id });
    const ab = await emit(a.s, 'room:addBot');
    expect(ab.ok).toBe(true);
    expect(a.room.players.length).toBe(3);
    expect(a.room.ranked).toBe(true);
    await emit(a.s, 'room:ready', { ready: true });
    await emit(b.s, 'room:ready', { ready: true });
    await until(() => a.starts > 0 && b.starts > 0);
    await Promise.all([playOut(a), playOut(b)]);
    expect(a.over.ranked).toBe(true);
    const bot = a.room.players.find((p) => p.bot);
    const botRow = await prisma.user.findUnique({ where: { id: bot.id } });
    expect(botRow.money).toBe(0);
    expect(botRow.wins + botRow.losses).toBe(0);
    const d = a.over.payout.delta;
    expect(d[bot.id]).toBeDefined(); // 봇 몫은 계산되지만 잔고에는 반영되지 않는다 (위에서 확인)
    for (const u of [a, b]) expect((await prisma.user.findUnique({ where: { id: u.user.id } })).money).toBe(100000 + (d[u.user.id] ?? 0));
  });
});
