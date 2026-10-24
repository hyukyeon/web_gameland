# 🎰 강원랜드 — 프로젝트 지침 (claude.md)

실시간 멀티플레이어 카지노 웹 앱. 게임: **고스톱 · 섯다 · 슬롯머신 · 오목 · 윷놀이 · 스도쿠**.
인증/게임 머니/전적/랭킹/업적/채팅/AI 봇/관전/재접속 복구를 갖춘 풀스택.

## 0. 세션 시작·종료 규칙 (가장 중요)
1. **새 세션에서는 이 파일 → `PROGRESS.md` → `TODO.md` 순으로 먼저 읽고** 작업을 시작한다. (`PROGRESS.md` 가 현재 상태의 단일 진실 공급원)
2. **마크다운 문서는 작업하면서 수시로 갱신한다.** 기능 하나/버그 하나를 끝낼 때마다, 세션이 끝나기 전에 기다리지 말고 바로:
   - `PROGRESS.md` — 해당 영역 섹션을 *현재 상태* 로 고친다(연대기 추가 금지: 낡은 설명은 지우고 최신 사실만 남긴다). 새 이벤트/컬럼/환경변수/명령/한계/결정을 반영하고, 맨 위 "현재 상태" 줄(테스트 수·마지막 작업)을 갱신.
   - `TODO.md` — 끝낸 항목은 체크, 새 아이디어/미해결 이슈는 추가. 다 끝낸 목록 파일은 만들지 말고 `TODO.md` 하나로 관리한다.
   - 이 파일(`claude.md`) — 작업 방식·명령·제약이 바뀔 때만.
3. 문서에는 **코드/깃 로그로 알 수 있는 내용을 길게 적지 않는다.** 적을 것: 결정과 그 이유, 해석/단순화한 규칙, 알려진 한계, 함정, 실행·테스트 방법.
4. 한 번에 다 하지 말고 단계로 나눠 진행, 단계가 끝나면 문서 갱신 후 멈춰 사용자 확인을 받는다. **사용자가 요청하지 않은 항목(예: `TODO.md` 5번 섹션, 윷놀이 개선 목록)은 시작하기 전에 묻는다.**
5. **커밋은 사용자가 요청할 때만** 한다. 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
6. 세션을 끝내기 전 정리: 임시 파일(스크래치패드·`/tmp` 의 스크립트/로그/백업)과 `frontend/test-results` 삭제, 실행 중인 테스트 서버 종료.

## 1. 기술 스택
- Frontend: React 19 + Vite 8 + Tailwind 3 + Framer Motion (`frontend/`)
- Backend: Node (ESM) + Express 5 + Socket.IO + Prisma 6 / SQLite (`backend/`)
- 테스트: Jest(ESM) / Vitest+Testing Library / Playwright
- 에셋: 화투패 이미지 `./pics/row-R-column-C.png` (백엔드가 `/pics` 로 서빙). 뒷면·보너스패는 CSS.

## 2. 실행·테스트 명령
| 용도 | 명령 |
|---|---|
| 서버(실서비스 DB) | `cd backend && npx prisma migrate deploy && nohup npm start > ../server.log 2>&1 &` (포트 4000, `frontend/dist` 서빙) |
| 프론트 빌드 | `cd frontend && npx vite build` |
| 프론트 개발 | `cd frontend && npm run dev` (5173, `/api`·`/pics`·`/socket.io` 를 4000 으로 프록시) |
| 백엔드 테스트 | `cd backend && npm test` (임시 SQLite 로 격리됨) |
| 프론트 단위 | `cd frontend && npm test` |
| E2E | `cd frontend && npm run test:e2e` (빌드 후 임시 DB 백엔드를 **4199** 에 띄움, `E2E_PORT`·`PW_CHROMIUM` 로 조정) |
| 오목 강도 | `node backend/scripts/omok-strength.mjs 20 easy,normal,hard` |
| 고스톱 시뮬 | `cd backend && npm run test:sim` |

운영: `NODE_ENV=production` 이면 `JWT_SECRET`(16자 이상) 필수. `backend/.env` 에 `DATABASE_URL`, `JWT_SECRET`(git 제외).

## 3. 작업 시 지켜야 할 제약
- **실제 DB(`backend/prisma/dev.db`)에 테스트·스크립트를 돌리지 않는다.** 임시 DB 경로를 명시해 쓴다(`backend/test/helpers/db.js` 참고).
- 서버 재시작: `ss -ltnp | sed -n 's/.*:4000 .*pid=\([0-9]*\).*/\1/p'` 로 pid 를 얻어 kill 후 다시 `npm start`. **`pkill`/`pgrep -f` 같이 내 셸까지 매치할 수 있는 패턴 금지**, 사용자의 다른 node/vite 프로세스는 건드리지 않는다.
- 사용자 이메일(git config 에만 존재)은 식별용일 뿐 어떤 외부 서비스에도 보내지 않는다.
- 패키지는 **버전 고정**, 공개된 지 2주 이상 된 버전만.
- 임시 파일은 세션 스크래치패드 디렉터리에만 둔다(프로젝트 안·`/tmp` 직접 사용 금지).
- 사용자를 지칭할 때 성별을 모르면 they/them.
- 알려진 불안정 테스트(부하 의존): `heuristic.test.js` "결정당 최대 지연 <10ms", `sockets.test.js` 4인 교대 — 단독 실행하면 통과. 실패 시 단독 재실행으로 구분.

## 4. 핵심 도메인 규칙 (원 지시서 요약)
- **서버 권위**: 턴·패 분배·점수·고/스톱 등 모든 게임 상태는 서버만 갖는다. 클라이언트는 `viewOf` 가 만든 뷰만 받는다(상대 패 은닉).
- **경제**: 게임 종료 시 `settle*` 가 Prisma 트랜잭션으로 머니/전적을 증감. 패자는 가진 만큼만 지불(제로섬).
- **AI 봇**: `User.isBot` 더미 계정. **사람 1명 + AI = 연습(머니·전적·기록 무변동)**, **사람 2명 이상 + AI = 실전(사람만 정상 증감, 봇은 무한 자본·불변)**. 봇은 로그인/랭킹/가입 접두(`AI봇`) 차단.
- 고스톱·섯다·오목·윷놀이는 방(`room`) 단위, 슬롯머신(`/api/slot`)·스도쿠(`/api/sudoku`, 하루 10회 × 1,000원 보상)는 REST 단독.

## 5. 문서 지도
| 파일 | 내용 |
|---|---|
| `claude.md` | 이 파일: 작업 규칙·명령·제약 |
| `PROGRESS.md` | 현재 구현 상태 · 아키텍처 · 이벤트/스키마 · 결정/한계 (영역별 정리) |
| `TODO.md` | 남은 작업/아이디어 목록 |
