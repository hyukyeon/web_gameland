import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import authRouter from './auth.js';
import slotRouter from './slot.js';
import { attachSockets } from './sockets.js';
import { PICS_DIR, FRONTEND_DIST, UPLOAD_DIR } from './config.js';

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // 화투패 이미지: 작업 경로의 ./pics 를 정적 서빙
  app.use('/pics', express.static(PICS_DIR, { maxAge: '7d' }));
  // 업로드한 아바타. 파일명은 서버가 만들고 내용은 이미지로 검증된 것만 저장한다. nosniff 로 이미지 외 해석을 막는다.
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
  app.use('/api/auth', authRouter);
  app.use('/api/slot', slotRouter);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // 프론트엔드 빌드가 있으면 함께 서빙
  if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    app.get(/^\/(?!api|pics|uploads|socket\.io).*/, (_req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
  }

  // 업로드 크기 초과 등 body 파싱 오류를 JSON 으로 응답
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: '이미지는 2MB 이하만 올릴 수 있습니다.' });
    return res.status(err?.status || 500).json({ error: '요청을 처리하지 못했습니다.' });
  });

  const server = http.createServer(app);
  const io = attachSockets(server, '*');
  return { app, server, io };
}
