import { jest } from '@jest/globals';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.RECONNECT_GRACE_MS = '1500';
jest.setTimeout(30000);

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

async function mk(name) {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  const st = await connect(r.token);
  return Object.assign(st, { token: r.token, user: r.user });
}

/** 같은 토큰으로 (재)접속. 받은 이벤트를 모두 기록한다. */
async function connect(token) {
  const s = ioc(base, { auth: { token }, forceNew: true });
  sockets.push(s);
  const st = { s, syncs: [], chat: [], room: null, over: null, offline: [], online: [], turns: [], view: null };
  s.on('game:start', ({ view }) => (st.view = view));
  s.on('game:frames', ({ frames }) => (st.view = frames.at(-1)));
  s.on('TURN_START', (t) => st.turns.push(t));
  s.on('SYNC_BOARD_STATE', (p) => { st.syncs.push(p); if (p.room) st.room = p.room; });
  s.on('room:state', (r) => (st.room = r));
  s.on('room:joined', ({ room }) => (st.room = room));
  s.on('room:chat', (m) => st.chat.push(m));
  s.on('game:over', (o) => (st.over = o));
  s.on('player:offline', (e) => st.offline.push(e));
  s.on('player:online', (e) => st.online.push(e));
  await new Promise((res) => s.on('connect', res));
  await sleep(50);
  return st;
}

async function startTwo() {
  const a = await mk('rc');
  const b = await mk('rc');
  await emit(a.s, 'room:create', { name: 'rc', bet: 100 });
  await sleep(50);
  await emit(b.s, 'room:join', { roomId: a.room.id });
  await emit(a.s, 'room:ready');
  await emit(b.s, 'room:ready');
  await sleep(200);
  return { a, b };
}

/** 내 차례면 아무 합법 수나 둔다 */
async function actFor(st) {
  const v = st.view;
  if (!v || v.turn !== v.you) return;
  if (v.phase === 'play') await emit(st.s, 'game:play', { cardId: v.hand[0] ?? null });
  else if (v.phase === 'choose' && v.choice) await emit(st.s, 'game:choose', { cardId: v.choice.options[0] });
  else if (v.phase === 'gostop') await emit(st.s, 'game:stop');
  else if (v.phase === 'gwang') await emit(st.s, 'game:passGwang');
  else if (v.phase === 'chong') await emit(st.s, 'game:passChongtong');
}

describe('재접속 / 상태 복구', () => {
  test('끊겼다가 유예 안에 돌아오면 SYNC_BOARD_STATE 로 손패·바닥·턴이 그대로 복구되고 기권되지 않는다', async () => {
    const { a, b } = await startTwo();
    const before = b.syncs.at(-1) ?? null; // 접속 시점(방 없음)
    expect(before.room).toBeNull();
    // 내 패 확인: 재접속 후 view.hand 와 비교하기 위해 서버에 sync 요청
    await emit(b.s, 'sync');
    await sleep(100);
    const snap = b.syncs.at(-1);
    expect(snap.view.hand.length).toBeGreaterThan(0);

    b.s.close();
    await sleep(200);
    expect(a.offline.length).toBe(1);
    expect(a.offline[0]).toMatchObject({ userId: b.user.id, graceMs: 1500 });
    expect(a.chat.some((m) => m.system && m.text.includes('연결이 끊겼습니다') && m.text.includes('재접속을 대기'))).toBe(true);
    expect(a.room.players.find((p) => p.id === b.user.id)).toMatchObject({ online: false });
    expect(a.room.players.find((p) => p.id === b.user.id).offlineAt).toBeGreaterThan(0);

    const b2 = await connect(b.token); // 같은 토큰으로 재접속
    const s2 = b2.syncs.at(-1);
    expect(s2.room.id).toBe(a.room.id);
    expect(s2.view.hand).toEqual(snap.view.hand);
    expect(s2.view.floor).toEqual(snap.view.floor);
    expect(s2.view.turn).toBe(snap.view.turn);
    expect(s2.view.phase).toBe(snap.view.phase);
    expect(s2.view).not.toHaveProperty('hands'); // 상대 손패는 여전히 숨김
    await sleep(100);
    expect(a.online.length).toBe(1);
    expect(a.room.players.find((p) => p.id === b.user.id).online).toBe(true);

    await sleep(1800); // 원래 유예 시간이 지나도 타이머가 풀렸으므로 방이 유지된다
    expect(a.over).toBeNull();
    expect(a.room.players.length).toBe(2);
    await emit(a.s, 'room:leave');
    await emit(b2.s, 'room:leave');
  });

  test('끊기면 AI가 대신 두고, 유예 시간이 지나도 판 도중에는 기권되지 않으며 판이 끝난 뒤 퇴장된다', async () => {
    const { a, b } = await startTwo();
    b.s.close();
    const t0 = Date.now();
    while (Date.now() - t0 < 2600 && !a.over) {
      await actFor(a);
      await sleep(50);
    }
    expect(a.turns.some((t) => t.userId === b.user.id && t.auto && t.deadlineAt == null)).toBe(true); // B 차례는 AI 대행
    expect(a.over).toBeNull(); // 기권 처리되지 않음
    expect(a.room.players.find((p) => p.id === b.user.id)).toMatchObject({ online: false });
    expect(a.chat.some((m) => m.system && m.text.includes('이번 판이 끝나면 퇴장'))).toBe(true);
    await emit(a.s, 'room:leave'); // A 이탈 → 판 종료 → 유예가 지난 B 도 정리되어 방이 닫힌다
    await sleep(200);
    const b2 = await connect(b.token);
    expect(b2.syncs.at(-1).room).toBeNull();
  });

  test('끊긴 사이에 판이 끝나면 돌아왔을 때 결과(over)를 받는다', async () => {
    const { a, b } = await startTwo();
    b.s.close();
    await sleep(150);
    await emit(a.s, 'room:leave'); // A 이탈 → B 승리로 판 종료 (B 는 오프라인)
    await sleep(300);
    const b2 = await connect(b.token);
    const s = b2.syncs.at(-1);
    expect(s.over?.result.forfeit).toBe(true);
    expect(s.over.result.winner).toBe(b.user.id);
    expect(s.view).toBeNull(); // 판은 끝났고 방은 대기 상태
    await emit(b2.s, 'sync');
    await sleep(100);
    expect(b2.syncs.at(-1).over).toBeNull(); // 결과는 한 번만 전달
    await emit(b2.s, 'room:leave');
  });

  test('대기실에서 끊겨도 바로 나가지지 않고, 돌아오면 그대로 복귀 · 방이 없는 유저의 sync 는 room=null', async () => {
    const a = await mk('rw');
    await emit(a.s, 'room:create', { name: 'w', bet: 100 });
    await sleep(50);
    const roomId = a.room.id;
    a.s.close();
    await sleep(300);
    const a2 = await connect(a.token);
    expect(a2.syncs.at(-1).room.id).toBe(roomId);
    expect(a2.syncs.at(-1).view).toBeNull();
    await emit(a2.s, 'room:leave');
    await emit(a2.s, 'sync');
    await sleep(100);
    expect(a2.syncs.at(-1).room).toBeNull();
  });
});
