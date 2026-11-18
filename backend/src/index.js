import { createServer } from './app.js';
import { PORT, HOST, USING_DEV_SECRET } from './config.js';

if (USING_DEV_SECRET) console.warn('[경고] JWT_SECRET 환경변수가 없어 개발용 기본 비밀값을 씁니다. 운영에서는 반드시 지정하세요 (NODE_ENV=production 이면 서버가 시작되지 않음).');

const { server } = createServer();
server.listen(PORT, HOST, () => console.log(`gostop server on http://${HOST ?? 'localhost'}:${PORT}`));
