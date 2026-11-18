import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PORT = Number(process.env.PORT) || 4000;
// 듣는 주소. 비우면 모든 인터페이스, 127.0.0.1 이면 이 기기(리버스 프록시·tailscale funnel)로만 접속
export const HOST = process.env.HOST || undefined;
export const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_SECRET = 'dev-secret-change-me';
// 운영(NODE_ENV=production)에서는 JWT_SECRET 환경변수가 반드시 있어야 한다. 없거나 기본값이면 서버를 띄우지 않는다.
if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_SECRET || process.env.JWT_SECRET.length < 16))
  throw new Error('운영 모드에서는 16자 이상의 JWT_SECRET 환경변수가 필요합니다. (예: JWT_SECRET=$(openssl rand -hex 32))');
export const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;
export const USING_DEV_SECRET = !process.env.JWT_SECRET;
export const INITIAL_MONEY = 100000;
export const PICS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../pics');
export const FRONTEND_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
export const BET_OPTIONS = [100, 500, 1000, 5000];
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;
// AI 봇이 행동하기 전 대기 시간 배율 (프론트 프레임 재생 시간을 기다려 준다). 테스트에서는 0 에 가깝게.
export const BOT_DELAY_SCALE = Number(process.env.BOT_DELAY_SCALE ?? 1);
// 업로드된 아바타 이미지 저장 위치
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');
export const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
// 연결이 끊긴 유저의 자리를 유지하는 시간. 판이 진행 중이면 그동안 AI 가 대신 두고, 초과하면 판이 끝난 뒤 퇴장 처리
export const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 60000;
// 섯다: 한 사람의 베팅 제한 시간 (초과하면 체크 가능할 때 체크, 아니면 다이)
export const SEOTDA_TURN_MS = Number(process.env.SEOTDA_TURN_MS) || 40000;
// 구사 재경기: 결과를 보여준 뒤 다음 판을 시작하기까지의 대기 시간
export const SEOTDA_REMATCH_MS = Number(process.env.SEOTDA_REMATCH_MS) || 4000;
// 고스톱: 한 사람의 차례 제한 시간 (초과하면 AI 가 한 수 대신 둔다)
export const GOSTOP_TURN_MS = Number(process.env.GOSTOP_TURN_MS) || 30000;
// 오목: 한 수의 제한 시간 (초과하면 AI 가 한 수 대신 둔다)
export const OMOK_TURN_MS = Number(process.env.OMOK_TURN_MS) || 30000;
// 오목 방별 수당 시간 선택지(초). 기본은 OMOK_TURN_MS
export const OMOK_TURN_CHOICES = [10, 30, 60];
export const OMOK_UNDO_LIMIT = 2; // 실전 무르기 요청 횟수(사람당 판당)
export const OMOK_PRACTICE_UNDOS = 3; // AI 연습 무르기 횟수
export const OMOK_UNDO_ASK_MS = 15000; // 무르기 요청 응답 대기
// 연속으로 이만큼 시간을 초과하면 그 사람은 AI 자동 진행으로 전환된다 (직접 해제 가능)
export const AUTO_AFTER_TIMEOUTS = 2;
// 섯다 동점 '묻고 더블' 동의 대기 시간
export const SEOTDA_VOTE_MS = Number(process.env.SEOTDA_VOTE_MS) || 15000;
// 로그인/회원가입 레이트 리밋 (IP 기준). 0 이면 끔 — 테스트(NODE_ENV=test)에서는 기본으로 끈다.
const envNum = (k, d) => (process.env[k] != null ? Number(process.env[k]) : d);
export const LOGIN_RATE_MAX = envNum('LOGIN_RATE_MAX', process.env.NODE_ENV === 'test' ? 0 : 10); // 1분에 10번
export const LOGIN_RATE_WINDOW_MS = 60 * 1000;
export const REGISTER_RATE_MAX = envNum('REGISTER_RATE_MAX', process.env.NODE_ENV === 'test' ? 0 : 5); // 1시간에 5개
export const REGISTER_RATE_WINDOW_MS = 60 * 60 * 1000;

// 윷놀이: 던지기/말 선택 한 단계당 제한 시간
export const YUT_TURN_MS = Number(process.env.YUT_TURN_MS) || 30000;

// 라스베가스: 굴리기/놓기 한 단계당 제한 시간, 라운드 정산 화면을 보여 주는 시간
export const VEGAS_TURN_MS = Number(process.env.VEGAS_TURN_MS) || 30000;
export const VEGAS_ROUND_MS = Number(process.env.VEGAS_ROUND_MS) || 6000;

// 요트 다이스: 굴리기·고정·기록 한 단계당 제한 시간
export const YACHT_TURN_MS = Number(process.env.YACHT_TURN_MS) || 30000;

// 장기: 한 수 제한 시간, 상차림 고르는 시간
export const JANGGI_TURN_MS = Number(process.env.JANGGI_TURN_MS) || 60000;
export const JANGGI_SETUP_MS = Number(process.env.JANGGI_SETUP_MS) || 20000;
