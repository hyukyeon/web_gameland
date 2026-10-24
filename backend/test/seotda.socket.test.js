import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';
import { SEOTDA_DECK } from '../src/seotda/rules.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.SEOTDA_TURN_MS = '700';
process.env.SEOTDA_REMATCH_MS = '150';
jest.setTimeout(60000);

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
afterEach(() => jest.restoreAllMocks());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const row = (id) => prisma.user.findUnique({ where: { id } });

async function mk(name = 'sd') {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  return connect({ token: r.token, user: r.user });
}
async function connect({ token, user }) {
  const s = ioc(base, { auth: { token }, forceNew: true });
  sockets.push(s);
  const c = { s, token, user, view: null, room: null, rooms: [], starts: [], turns: [], shows: [], over: null, syncs: [], tieVote: null, tieResults: [] };
  s.on('seotda:start', (m) => { c.view = m.view; c.starts.push(m); c.over = null; });
  s.on('seotda:state', (m) => { c.view = m.view; });
  s.on('TURN_START', (t) => c.turns.push(t));
  s.on('SHOW_DOWN', (r) => c.shows.push(r));
  s.on('seotda:over', (o) => (c.over = o));
  s.on('seotda:tieVote', (v) => (c.tieVote = v));
  s.on('seotda:tieResult', (r) => c.tieResults.push(r));
  s.on('room:joined', ({ room }) => (c.room = room));
  s.on('room:state', (r) => (c.room = r));
  s.on('room:left', () => (c.room = null));
  s.on('lobby:rooms', (l) => (c.rooms = l));
  s.on('SYNC_BOARD_STATE', (p) => { c.syncs.push(p); if (p.seotda) c.view = p.seotda; });
  await new Promise((res) => s.on('connect', res));
  await sleep(40);
  return c;
}

/** Fisher-Yates 를 거꾸로 풀어서, 섞은 결과의 앞쪽(prefix)이 원하는 패가 되도록 하는 난수열 */
function rigDeck(prefix) {
  const target = [...prefix, ...SEOTDA_DECK.filter((id) => !prefix.includes(id))];
  const arr = [...SEOTDA_DECK];
  const out = [];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = arr.indexOf(target[i]);
    out.push((j + 0.5) / (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return out;
}
const rig = (...rounds) => {
  const seq = rounds.flatMap(rigDeck);
  let i = 0;
  jest.spyOn(Math, 'random').mockImplementation(() => (i < seq.length ? seq[i++] : 0.5));
};

async function room2(opts = {}) {
  const [a, b] = [await mk(), await mk()];
  expect((await emit(a.s, 'room:create', { name: 'sd', bet: opts.bet ?? 100, game: 'seotda' })).ok).toBe(true);
  await sleep(50);
  expect((await emit(b.s, 'room:join', { roomId: a.room.id })).ok).toBe(true);
  return { a, b };
}
// 패를 고정해야 하면 시작 직전(마지막 준비 직전)에 난수를 조작한다. (클라이언트 라이브러리도 Math.random 을 쓰므로 일찍 걸면 난수열이 소모된다)
let rigged = null;
const rigNext = (...rounds) => { rigged = rounds; };
const ready = async (...cs) => {
  for (const c of cs.slice(0, -1)) await emit(c.s, 'room:ready');
  if (rigged) { rig(...rigged); rigged = null; }
  await emit(cs.at(-1).s, 'room:ready');
  await sleep(250);
};
const ALRI = [0, 4]; // 알리
const SERYUK = [14, 22]; // 세륙
const GUSA = [14, 34];
const TT8 = [28, 29];

describe('섯다 소켓 e2e', () => {
  test('방 요약에 game=seotda, AI 봇 추가 가능', async () => {
    const { a } = await room2();
    expect(a.room.game).toBe('seotda');
    const x = await mk();
    await sleep(100);
    expect(x.rooms.find((r) => r.id === a.room.id).game).toBe('seotda');
    expect((await emit(a.s, 'room:addBot')).ok).toBe(true);
    await emit(a.s, 'room:leave');
  });

  test('삥 → 콜 → 쇼다운: 패는 비공개, TURN_START/SHOW_DOWN 방송, 정산은 제로섬', async () => {
    rigNext([...ALRI, ...SERYUK]); // 선(방장 a): 알리, b: 세륙
    const { a, b } = await room2();
    const m0 = [(await row(a.user.id)).money, (await row(b.user.id)).money];
    await ready(a, b);
    expect(a.view.game).toBe('seotda');
    expect(a.view.players[a.user.id].hand.map((c) => c.id).sort((x, y) => x - y)).toEqual(ALRI);
    expect(b.view.players[b.user.id].hand.map((c) => c.id).sort((x, y) => x - y)).toEqual([...SERYUK].sort((x, y) => x - y));
    expect(a.view.players[b.user.id].hand).toBeNull(); // 상대 패 비공개
    expect(b.view.players[a.user.id].hand).toBeNull();
    expect(a.view.pot).toBe(200);
    expect(a.turns.at(-1)).toMatchObject({ userId: a.user.id });
    expect(a.view.options.bbing).toMatchObject({ raiseTo: 100, amount: 100 });
    expect((await emit(b.s, 'seotda:act', { action: 'call' })).ok).toBe(false); // 내 차례 아님
    expect((await emit(a.s, 'seotda:act', { action: 'nope' })).ok).toBe(false);
    expect((await emit(a.s, 'seotda:act', { action: 'bbing' })).ok).toBe(true);
    await sleep(80);
    expect(b.turns.at(-1)).toMatchObject({ userId: b.user.id, toCall: 100 });
    expect((await emit(b.s, 'seotda:act', { action: 'call' })).ok).toBe(true);
    await sleep(300);
    expect(a.shows).toHaveLength(1);
    expect(a.shows[0]).toMatchObject({ winners: [a.user.id], rematch: false, pot: 400 });
    expect(b.shows[0].result.hands[a.user.id].name).toBe('알리');
    expect(b.shows[0].result.hands[b.user.id].name).toBe('세륙');
    expect(a.over.payout.delta).toEqual({ [a.user.id]: 200, [b.user.id]: -200 });
    const ua = await row(a.user.id);
    const ub = await row(b.user.id);
    expect(ua.money).toBe(m0[0] + 200);
    expect(ub.money).toBe(m0[1] - 200);
    expect(ua.sdWins).toBe(1); // 섯다 전적은 고스톱 wins/losses 와 분리
    expect(ub.sdLosses).toBe(1);
    expect(ua.wins + ub.losses).toBe(0);
    expect(ua.sdGames).toBe(1);
    const rec = await prisma.game.findUnique({ where: { id: a.over.payout.gameId }, include: { results: true } });
    expect(rec.roomName).toContain('[섯다]');
    expect(rec.results.reduce((s, r) => s + r.moneyDelta, 0)).toBe(0);
    expect(a.room.status).toBe('waiting');
    // 다음 판 선은 승자
    expect(a.room.players.every((p) => !p.ready)).toBe(true);
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });

  test('한 명이 다이하면 즉시 종료: 승자 패만 공개', async () => {
    rigNext([...ALRI, ...SERYUK]);
    const { a, b } = await room2();
    await ready(a, b);
    await emit(a.s, 'seotda:act', { action: 'bbing' });
    await emit(b.s, 'seotda:act', { action: 'die' });
    await sleep(300);
    expect(a.shows[0]).toMatchObject({ winners: [a.user.id] });
    expect(Object.keys(a.shows[0].result.hands)).toEqual([String(a.user.id)]);
    expect(a.over.payout.delta[a.user.id]).toBe(100); // 상대의 참가비
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });

  test('구사 재경기: 팟 이월 후 새 판 → 승자가 이월된 팟을 가져간다', async () => {
    rigNext([...GUSA, ...ALRI], [...TT8, ...SERYUK]); // 1판: a 구사 vs b 알리(재경기) / 2판: a 8땡 vs b 세륙
    const { a, b } = await room2();
    const m0 = [(await row(a.user.id)).money, (await row(b.user.id)).money];
    await ready(a, b);
    await emit(a.s, 'seotda:act', { action: 'bbing' });
    await emit(b.s, 'seotda:act', { action: 'call' });
    await sleep(100);
    expect(a.shows[0]).toMatchObject({ rematch: true, winners: [] });
    expect(a.shows[0].result.rematchBy).toBe(a.user.id);
    expect(a.over).toBeNull(); // 아직 정산 안 됨
    await sleep(500);
    expect(a.starts.at(-1)).toMatchObject({ rematch: true, round: 2 });
    expect(a.view.pot).toBe(400 + 200); // 이월 400 + 참가비 재징수 200
    await emit(a.s, 'seotda:act', { action: 'call' });
    await emit(b.s, 'seotda:act', { action: 'call' });
    await sleep(300);
    expect(a.shows.at(-1)).toMatchObject({ winners: [a.user.id], pot: 600, round: 2 });
    expect(a.over.payout.delta).toEqual({ [a.user.id]: 300, [b.user.id]: -300 });
    expect((await row(a.user.id)).money).toBe(m0[0] + 300);
    expect((await row(b.user.id)).money).toBe(m0[1] - 300);
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });

  test('관전자: 패 비공개, 조작 차단 · 도중 이탈 = 다이(기권) · 재접속 시 상태 복구', async () => {
    rigNext([...ALRI, ...SERYUK]);
    const { a, b } = await room2();
    await ready(a, b);
    const w = await mk('sw');
    expect((await emit(w.s, 'room:spectate', { roomId: a.room.id })).ok).toBe(true);
    await sleep(100);
    expect(w.syncs.at(-1).role).toBe('spectator');
    expect(w.view.players[a.user.id].hand).toBeNull();
    expect(w.view.players[b.user.id].hand).toBeNull();
    expect(w.view.options).toBeNull();
    expect((await emit(w.s, 'seotda:act', { action: 'die' })).ok).toBe(false);
    expect((await emit(w.s, 'room:ready')).ok).toBe(false);
    // b 의 재접속 복구
    b.s.close();
    await sleep(120);
    const b2 = await connect({ token: b.token, user: b.user });
    expect(b2.syncs.at(-1).seotda.players[b.user.id].hand).toHaveLength(2);
    expect(b2.syncs.at(-1).view).toBeNull();
    // a 가 이탈하면 남은 b 가 이김, a 는 참가비를 잃음
    const ma = (await row(a.user.id)).money;
    await emit(a.s, 'room:leave');
    await sleep(300);
    expect(b2.over.result.winners).toEqual([b.user.id]);
    expect((await row(a.user.id)).money).toBe(ma - 100);
    await emit(w.s, 'room:leave');
    await emit(b2.s, 'room:leave');
  });

  test('시간 초과: 체크 가능하면 체크, 걸린 금액이 있으면 다이', async () => {
    rigNext([...ALRI, ...SERYUK]);
    const { a, b } = await room2();
    await ready(a, b);
    // a(선) 가 아무것도 안 하면 체크 → b 가 아무것도 안 하면 체크 → 쇼다운
    await sleep(2200);
    expect(a.shows[0]).toMatchObject({ winners: [a.user.id], rematch: false }); // 알리 > 세륙
    expect(a.shows[0].pot).toBe(200);
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');

    rigNext([...ALRI, ...SERYUK]);
    const r2 = await room2();
    await ready(r2.a, r2.b);
    await emit(r2.a.s, 'seotda:act', { action: 'bbing' });
    await sleep(1300); // b 가 응답하지 않음 → 걸린 금액이 있으니 다이
    expect(r2.a.shows[0]).toMatchObject({ winners: [r2.a.user.id] });
    expect(r2.a.over.payout.delta[r2.a.user.id]).toBe(100);
    await emit(r2.a.s, 'room:leave');
    await emit(r2.b.s, 'room:leave');
  });

  test('섯다 스탯·업적: 광땡 승리 → sdGwangWins/최고 족보/업적(섯다 첫 승·광땡 메이커)', async () => {
    rigNext([8, 28, ...ALRI]); // A: 삼팔광땡
    const { a, b } = await room2();
    await ready(a, b);
    await emit(a.s, 'seotda:act', { action: 'call' });
    await emit(b.s, 'seotda:act', { action: 'call' });
    await sleep(300);
    const u = await row(a.user.id);
    expect(u).toMatchObject({ sdGames: 1, sdWins: 1, sdGwangWins: 1, sdTtaengWins: 1, sdBestHand: '삼팔광땡', wins: 0 });
    expect(JSON.parse(u.achievements)).toEqual(expect.arrayContaining(['sd_first', 'sd_gwang']));
    const lb = await row(b.user.id);
    expect(lb).toMatchObject({ sdGames: 1, sdLosses: 1, losses: 0 });
    const rk = await (await fetch(base + '/api/auth/ranking?game=seotda')).json();
    expect(rk.ranking.map((x) => x.id)).toContain(a.user.id);
    expect(rk.ranking.map((x) => x.id)).not.toContain(b.user.id); // 승 0 은 제외
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });

  test('동점 → 둘 다 동의하면 묻고 더블: 동점자끼리 판돈 2배로 다시, 팟 이월', async () => {
    rigNext([0, 10, 2, 8], [...TT8, ...ALRI]); // 1판: 4끗 vs 4끗, 2판: 8땡 vs 알리
    const { a, b } = await room2();
    await ready(a, b);
    await emit(a.s, 'seotda:act', { action: 'call' }); // 체크
    await emit(b.s, 'seotda:act', { action: 'call' }); // 체크 → 쇼다운 동점
    await sleep(150);
    expect(a.tieVote).toMatchObject({ pids: [a.user.id, b.user.id], ante: 200 });
    expect(a.over).toBeNull(); // 아직 정산 전
    expect((await emit(a.s, 'seotda:tieVote', { agree: true })).ok).toBe(true);
    expect((await emit(a.s, 'seotda:tieVote', { agree: true })).ok).toBe(false); // 중복 투표
    await emit(b.s, 'seotda:tieVote', { agree: true });
    await sleep(450); // SEOTDA_REMATCH_MS = 150
    expect(a.tieResults.at(-1)).toMatchObject({ agreed: true });
    expect(a.starts.at(-1)).toMatchObject({ double: 1 });
    expect(a.view.ante).toBe(200);
    expect(a.view.pot).toBe(200 + 400); // 이전 팟 + 참가비 200 × 2
    await emit(a.s, 'seotda:act', { action: 'call' });
    await emit(b.s, 'seotda:act', { action: 'call' });
    await sleep(300);
    expect(a.over.result.winners).toEqual([a.user.id]);
    expect(a.over.payout.delta).toEqual({ [a.user.id]: 300, [b.user.id]: -300 });
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });

  test('동점 → 한 명이라도 거절하면 팟을 나눈다', async () => {
    rigNext([0, 10, 2, 8]);
    const { a, b } = await room2();
    await ready(a, b);
    await emit(a.s, 'seotda:act', { action: 'bbing' });
    await emit(b.s, 'seotda:act', { action: 'call' });
    await sleep(150);
    expect((await emit(b.s, 'seotda:tieVote', { agree: false })).ok).toBe(true);
    await sleep(300);
    expect(a.tieResults.at(-1)).toMatchObject({ agreed: false });
    expect(a.tieVote).toBeNull();
    expect(a.over.result.tie).toEqual([a.user.id, b.user.id]);
    expect(a.over.payout.delta).toEqual({ [a.user.id]: 0, [b.user.id]: 0 });
    await emit(a.s, 'room:leave');
    await emit(b.s, 'room:leave');
  });

  test('무작위 3인 판을 여러 번: 항상 끝나고 머니가 보존된다', async () => {
    const cs = [await mk(), await mk(), await mk()];
    await emit(cs[0].s, 'room:create', { name: 'r3', bet: 100, game: 'seotda' });
    await sleep(50);
    for (const c of cs.slice(1)) await emit(c.s, 'room:join', { roomId: cs[0].room.id });
    const ids = cs.map((c) => c.user.id);
    const total = async () => (await prisma.user.findMany({ where: { id: { in: ids } } })).reduce((s, u) => s + u.money, 0);
    const t0 = await total();
    for (let g = 0; g < 5; g++) {
      for (const c of cs) { c.over = null; c.shows = []; }
      await ready(...cs);
      for (let step = 0; step < 60 && !cs.every((c) => c.over); step++) {
        // 우연히 동점이면 묻고 더블 투표가 열린다 → 거절해서 나눠 갖기
        const voter = cs.find((c) => c.tieVote?.pids.includes(c.user.id) && c.tieVote.votes[c.user.id] == null);
        if (voter) { await emit(voter.s, 'seotda:tieVote', { agree: false }); await sleep(30); continue; }
        const actor = cs.find((c) => c.view?.options);
        if (!actor) { await sleep(30); continue; }
        const o = actor.view.options;
        const pool = ['call', 'call', 'call', 'die', ...(o.half ? ['half'] : []), ...(o.ddadang ? ['ddadang'] : []), ...(o.bbing ? ['bbing'] : [])];
        await emit(actor.s, 'seotda:act', { action: pool[(step + g) % pool.length] });
        await sleep(30);
      }
      await sleep(400);
      expect(cs.every((c) => c.over)).toBe(true);
      expect(await total()).toBe(t0);
    }
    for (const c of cs) await emit(c.s, 'room:leave');
  });
});
