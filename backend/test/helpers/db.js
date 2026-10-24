import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 테스트 전용 SQLite 파일을 만들고 마이그레이션을 적용한 뒤 DATABASE_URL 을 지정한다. (db.js 를 import 하기 전에 호출) */
export function useTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gostop-test-'));
  const file = path.join(dir, 'test.db');
  process.env.DATABASE_URL = `file:${file}`;
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: process.env, cwd: path.resolve(import.meta.dirname, '../..') });
  return { dir, file };
}
