import { execFileSync } from 'node:child_process';
import path from 'node:path';
import express from 'express';
import { rateLimit } from '../src/rateLimit.js';

const backend = path.resolve(import.meta.dirname, '..');

/** config.js 를 새 프로세스에서 불러 운영 모드 JWT_SECRET 검사를 확인 */
function loadConfig(env) {
  try {
    execFileSync(process.execPath, ['-e', "import('./src/config.js').then(()=>process.stdout.write('ok'))"], {
      cwd: backend,
      env: { PATH: process.env.PATH, ...env },
      stdio: 'pipe',
    });
    return 'ok';
  } catch (e) {
    return String(e.stderr);
  }
}

describe('운영 모드 JWT_SECRET', () => {
  test('production 에서 JWT_SECRET 이 없거나 짧으면 시작 실패', () => {
    expect(loadConfig({ NODE_ENV: 'production' })).toMatch(/JWT_SECRET/);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toMatch(/JWT_SECRET/);
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-me' })).toMatch(/JWT_SECRET/);
  });
  test('production + 충분히 긴 JWT_SECRET, 또는 개발 모드는 통과', () => {
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) })).toBe('ok');
    expect(loadConfig({})).toBe('ok');
  });
});

describe('rateLimit', () => {
  let server;
  let base;
  const limiter = rateLimit({ windowMs: 300, max: 3 });
  beforeAll(async () => {
    const app = express();
    app.post('/x', limiter, (_q, r) => r.json({ ok: true }));
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => server.close());

  test('창 안에서 max 를 넘으면 429 + Retry-After, 창이 지나면 다시 허용', async () => {
    const codes = [];
    for (let i = 0; i < 5; i += 1) codes.push((await fetch(`${base}/x`, { method: 'POST' })).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    const r = await fetch(`${base}/x`, { method: 'POST' });
    expect(r.headers.get('retry-after')).toBeTruthy();
    expect((await r.json()).error).toMatch(/초 후/);
    await new Promise((res) => setTimeout(res, 350));
    expect((await fetch(`${base}/x`, { method: 'POST' })).status).toBe(200);
  });

  test('max 0 이면 제한 없음', async () => {
    const off = rateLimit({ windowMs: 1000, max: 0 });
    let n = 0;
    for (let i = 0; i < 20; i += 1) off({ ip: '1' }, {}, () => { n += 1; });
    expect(n).toBe(20);
  });
});

describe('로그인/가입 레이트 리밋 적용', () => {
  let server;
  let base;
  beforeAll(async () => {
    const { useTempDb } = await import('./helpers/db.js');
    useTempDb();
    process.env.LOGIN_RATE_MAX = '3';
    process.env.REGISTER_RATE_MAX = '2';
    const { createServer } = await import('../src/app.js');
    ({ server } = createServer());
    server.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    server.close();
    const { prisma } = await import('../src/db.js');
    await prisma.$disconnect();
  });
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  test('로그인 4번째부터 429', async () => {
    const codes = [];
    for (let i = 0; i < 4; i += 1) codes.push((await post('/api/auth/login', { username: 'nobody', password: 'x' })).status);
    expect(codes).toEqual([401, 401, 401, 429]);
  });
  test('가입 3번째부터 429', async () => {
    const codes = [];
    for (let i = 0; i < 3; i += 1) codes.push((await post('/api/auth/register', { username: `rl${i}`, password: 'pw1234' })).status);
    expect(codes).toEqual([200, 200, 429]);
  });
});
