import { jest } from '@jest/globals';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';
import { useTempDb } from './helpers/db.js';

process.env.BCRYPT_ROUNDS = '4';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gostop-up-'));
jest.setTimeout(30000);

let server, base, prisma;
const clients = [];
let seq = 0;

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

beforeAll(async () => {
  useTempDb();
  ({ prisma } = await import('../src/db.js'));
  const { createServer } = await import('../src/app.js');
  ({ server } = createServer());
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  clients.forEach((s) => s.close());
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

const json = async (method, p, token, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const upload = async (token, buf, type = 'image/png') => {
  const r = await fetch(base + '/api/auth/avatar', { method: 'POST', headers: { 'content-type': type, authorization: `Bearer ${token}` }, body: buf });
  return { status: r.status, body: await r.json() };
};
async function mk(name) {
  const username = `${name}${++seq}`;
  const r = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'pw1234' }) })).json();
  return { username, token: r.token, user: r.user };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));

describe('닉네임', () => {
  test('기본은 아이디, 변경하면 name 에 반영', async () => {
    const a = await mk('nk');
    expect(a.user).toMatchObject({ name: a.username, nickname: null, avatar: null });
    const r = await json('PUT', '/api/auth/profile', a.token, { nickname: '고수철수' });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ name: '고수철수', username: a.username });
    const me = await json('GET', '/api/auth/me', a.token);
    expect(me.body.user.name).toBe('고수철수');
  });

  test('랭킹은 닉네임 기준 표시 이름(name)을 내려준다', async () => {
    const a = await mk('rk');
    await json('PUT', '/api/auth/profile', a.token, { nickname: '랭킹왕' });
    const r = await (await fetch(`${base}/api/auth/ranking`)).json();
    const me = r.ranking.find((u) => u.id === a.user.id);
    expect(me.name).toBe('랭킹왕');
    expect(me.username).toBe(a.username);
  });

  test('형식 오류 · 중복 · 예약어 거부, 비우면 아이디로 복귀', async () => {
    const [a, b] = [await mk('nk'), await mk('nk')];
    expect((await json('PUT', '/api/auth/profile', a.token, { nickname: 'x' })).status).toBe(400);
    expect((await json('PUT', '/api/auth/profile', a.token, { nickname: '<script>' })).status).toBe(400);
    expect((await json('PUT', '/api/auth/profile', a.token, { nickname: 'AI봇7' })).status).toBe(400);
    expect((await json('PUT', '/api/auth/profile', a.token, { nickname: 'ai봇7' })).status).toBe(400);
    expect((await json('PUT', '/api/auth/profile', a.token, { nickname: '쌍피왕' })).status).toBe(200);
    expect((await json('PUT', '/api/auth/profile', b.token, { nickname: '쌍피왕' })).status).toBe(409);
    expect((await json('PUT', '/api/auth/profile', b.token, { nickname: a.username })).status).toBe(409); // 남의 아이디 사칭 불가
    expect((await json('PUT', '/api/auth/profile', a.token, { nickname: '쌍피왕' })).status).toBe(200); // 내 것 재저장
    const cleared = await json('PUT', '/api/auth/profile', a.token, { nickname: '  ' });
    expect(cleared.body.user.name).toBe(a.username);
    // 비운 뒤 그 닉네임은 다른 사람이 쓸 수 있다
    expect((await json('PUT', '/api/auth/profile', b.token, { nickname: '쌍피왕' })).status).toBe(200);
    // 닉네임으로 가입 불가
    const r = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: '쌍피왕', password: 'pw1234' }) });
    expect(r.status).toBe(409);
    expect((await json('PUT', '/api/auth/profile', '', { nickname: '비로그인' })).status).toBe(401);
  });
});

describe('아바타', () => {
  test('업로드 → 정적 서빙 → 교체 시 이전 파일 삭제 → 삭제하면 기본 이미지', async () => {
    const a = await mk('av');
    const r = await upload(a.token, PNG);
    expect(r.status).toBe(200);
    const url = r.body.user.avatar;
    expect(url).toMatch(/^\/uploads\/avatars\/\d+-\d+\.png$/);
    const img = await fetch(base + url);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toContain('image/png');
    expect(img.headers.get('x-content-type-options')).toBe('nosniff');
    await sleep(5);
    const r2 = await upload(a.token, PNG);
    expect(r2.body.user.avatar).not.toBe(url);
    await sleep(100);
    expect((await fetch(base + url)).status).not.toBe(200); // 이전 파일 삭제
    const del = await json('DELETE', '/api/auth/avatar', a.token);
    expect(del.body.user.avatar).toBeNull();
  });

  test('이미지가 아니면 거부: 위조 Content-Type · SVG · 너무 큼 · 비로그인', async () => {
    const a = await mk('av');
    expect((await upload(a.token, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png')).status).toBe(415);
    expect((await upload(a.token, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).status).toBe(415);
    expect((await upload(a.token, Buffer.from('not an image at all, just text'), 'image/jpeg')).status).toBe(415);
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    expect((await upload(a.token, big)).status).toBe(413);
    expect((await upload('bad', PNG)).status).toBe(401);
    const row = await prisma.user.findUnique({ where: { id: a.user.id } });
    expect(row.avatar).toBeNull();
    // 경로 탈출 시도 (fetch 는 .. 를 미리 정규화하므로 raw 요청으로)
    const body = await new Promise((res) => {
      http.get({ host: 'localhost', port: server.address().port, path: '/uploads/avatars/..%2f..%2fpackage.json' }, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => res(d));
      });
    });
    expect(body).not.toContain('gostop-backend');
  });
});

describe('방/채팅에 반영', () => {
  test('방 상태에 닉네임·아바타가 보이고, 변경하면 같은 방 사람에게 즉시 갱신', async () => {
    const [a, b] = [await mk('rm'), await mk('rm')];
    await json('PUT', '/api/auth/profile', a.token, { nickname: '방장님' });
    await upload(a.token, PNG);
    const mkSock = async (c) => {
      const s = ioc(base, { auth: { token: c.token } });
      clients.push(s);
      const st = { s, room: null, chat: [], me: null };
      s.on('room:state', (r) => (st.room = r));
      s.on('room:joined', ({ room }) => (st.room = room));
      s.on('room:chat', (m) => st.chat.push(m));
      s.on('me:update', (u) => (st.me = u));
      await new Promise((res) => s.on('connect', res));
      return st;
    };
    const sa = await mkSock(a);
    const sb = await mkSock(b);
    expect((await emit(sa.s, 'room:create', { name: 'r', bet: 100 })).ok).toBe(true);
    await sleep(50);
    await emit(sb.s, 'room:join', { roomId: sa.room.id });
    await sleep(100);
    const pa = sb.room.players.find((p) => p.id === a.user.id);
    expect(pa.username).toBe('방장님');
    expect(pa.avatar).toMatch(/^\/uploads\/avatars\//);
    const pb = sb.room.players.find((p) => p.id === b.user.id);
    expect(pb).toMatchObject({ username: b.username, avatar: null });
    // 방에 있는 동안 닉네임 변경 → 상대 화면 즉시 갱신 + 본인에게 me:update
    await json('PUT', '/api/auth/profile', b.token, { nickname: '도전자' });
    await sleep(150);
    expect(sa.room.players.find((p) => p.id === b.user.id).username).toBe('도전자');
    expect(sb.me.name).toBe('도전자');
    // 채팅 이름도 닉네임
    sb.s.emit('room:chat', { text: '안녕' });
    await sleep(100);
    expect(sa.chat.find((m) => m.text === '안녕').user).toBe('도전자');
    await emit(sa.s, 'room:leave');
    await emit(sb.s, 'room:leave');
  });
});
