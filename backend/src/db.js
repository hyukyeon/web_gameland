import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// .env 가 없어도 개발용 DB 로 동작하도록 기본값을 둔다 (절대 경로라 실행 위치와 무관)
process.env.DATABASE_URL ??= `file:${path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/dev.db')}`;

export const prisma = new PrismaClient();
