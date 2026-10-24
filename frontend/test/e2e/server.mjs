/**
 * E2E 용 백엔드: 임시 SQLite 에 마이그레이션을 적용하고 빌드된 프론트(dist)와 함께 띄운다.
 * 실제 DB(backend/prisma/dev.db)는 절대 건드리지 않는다. 종료 시 임시 폴더를 지운다.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const backend = path.resolve(import.meta.dirname, '../../../backend');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gostop-e2e-'));
const env = {
  ...process.env,
  DATABASE_URL: `file:${path.join(dir, 'e2e.db')}`,
  UPLOAD_DIR: path.join(dir, 'uploads'),
  PORT: process.env.E2E_PORT || '4199',
  JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
  BCRYPT_ROUNDS: '4',
  LOGIN_RATE_MAX: '0',
  REGISTER_RATE_MAX: '0',
  BOT_DELAY_SCALE: '0.25',
  GOSTOP_TURN_MS: '60000',
};
execSync('npx prisma migrate deploy', { cwd: backend, env, stdio: 'pipe' });
const child = spawn(process.execPath, ['src/index.js'], { cwd: backend, env, stdio: 'inherit' });
const cleanup = () => {
  child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
};
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
child.on('exit', (code) => { fs.rmSync(dir, { recursive: true, force: true }); process.exit(code ?? 0); });
