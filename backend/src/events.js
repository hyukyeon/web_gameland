import { EventEmitter } from 'node:events';

// REST(프로필 변경) → 소켓 서버 알림용: 'profile' (userId)
export const bus = new EventEmitter();
