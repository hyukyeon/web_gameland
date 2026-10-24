# PROGRESS.md

> 새 세션 시작 시 이 파일을 가장 먼저 읽고, `claude.md`의 Phase 순서를 따른다.

## 현재 상태: **Phase 4 완료 + 심야 일괄 작업(Task 1~6) 완료 — 대기** (16 suites / 1448 tests 통과)

## 구현 완료
### Phase 1 – 코어 룰 엔진 + Jest (완료)
- `backend/src/game/cards.js` 카드 48장 테이블 (id=(row-1)*8+(col-1), 이미지 `pics/row-R-column-C.png`), `shuffle`.
- `backend/src/game/score.js` `computeScore`, `loserPiCount`, `WIN_THRESHOLD=7`.
- `backend/src/game/GostopGame.js` 2인 맞고 엔진 (뻑/자뻑/따닥/쪽/싹쓸이/폭탄/흔들기/고/스톱/나가리/기권, 광박·피박·멍박·고박).
- 테스트: `cd backend && npm test` (Jest, ESM: `NODE_OPTIONS=--experimental-vm-modules`) → **4 suites / 1288 tests 전부 통과** (`test/multi.test.js`: 3·4인·광팔기·보너스, `test/rules.test.js`: wingboardgame 규칙 보강분).
  - `test/score.test.js`, `test/engine.test.js` (딜링 100시드, 특수상황, 고/스톱, 정산, 종료, 정보 은닉, 300판 무작위 불변식).
  - 보조: `npm run test:sim`(3000판 시뮬), `npm run test:e2e`(소켓 E2E; 서버 불필요 여부는 파일 참고).

### Phase 2 – DB / 인증 / 소켓 서버 (완료, 6 suites / 1320 tests 통과)
- **DB (Prisma 6 + SQLite, `DATABASE_URL`, `backend/.env`)**: `User(money, wins, losses, isBot)`, `Game(roomName, betPerPt, playerCount, nagari, detail)`, `GameResult(gameId, userId, outcome win|lose|draw|none, moneyDelta)`.
  기존 `GameRecord` 는 마이그레이션 `20261024000000_multiplayer` 에서 새 테이블로 이관 후 삭제(데이터 보존).
- **`src/settle.js`**: `computeTransfers`(순수) + `settleGame`(`$transaction`) — `result.payments` 기반 다자 정산.
  패자 잔고 한도(비율 분배·1원 단위 보존, 음수 없음), `isBot` 계정은 한도 없이 지불/잔고·전적 불변, `ranked=false` 면 DB 무변경. 광팔기·뻑 지불도 동일 처리.
  승패는 `outcomesOf`(winner/losers/forfeit 기준; 고박 대납으로 payments.from 이 몰려도 losers 기준).
- **`src/sockets.js`**: 방 최대 4인(≥2인 전원 ready 시 시작), 방 옵션 `{bonus, ppeokPay, chongtong, ttibak, nagariCarry}`(`room:create`/`room:options`),
  4인 쉬는 사람 교대(`pickRest`, 직전에 쉰 사람 연속 제외), 첫 판 선은 `decideFirst`(밤일낮장) 후 이긴 사람이 선, 나가리면 선 유지 + `nagariCarry` 시 다음 판 ×2.
  이벤트: `game:play/choose/go/stop`, `game:sellGwang/passGwang`, `game:chongtong/passChongtong`; 서버→`game:start`(view, first, flips, ranked) / `game:frames` / `game:over`({result, payout, ranked}) / `me:update` / `room:state` / `lobby:rooms`.
  `isRankedRoom(room)`: 사람이 2명 이상이면 실전, 아니면 연습(비정산) — Phase 4 에서 규칙 확정 (아래 Phase 4 섹션).
  이탈/재접속 30초 유예 후 기권 정산, 중복 로그인 킥, 채팅 속도 제한, `room:ready` 중복 시작 방지.
- `src/app.js`(`createServer`) / `src/index.js`(listen): `/pics` 정적 서빙, `/api/auth/*`(register/login/me/records/ranking — 랭킹은 봇 제외).
- 테스트: `npm test`(Jest, 임시 SQLite + `prisma migrate deploy`로 격리) — `settle.test.js`(정산/롤백/봇 면제/연습 무영향), `sockets.test.js`(REST·방·2/3/4인 끝까지 진행·머니 보존·정보 은닉·4인 교대·이탈·옵션 ON 다판·부정 액션 거부). 옛 `test/e2e.js` 는 대체되어 삭제.

### Phase 3 – 프론트엔드 (완료)
- `frontend/` Vite 8 + React 19 + Tailwind 3 + Framer Motion. 실행: `cd frontend && npm run dev`(5173, `/api`·`/pics`·`/socket.io` 를 4000 으로 프록시, `BACKEND_URL` 로 변경 가능) / `npm run build` → `frontend/dist` 를 백엔드(`createServer`)가 그대로 서빙.
- `src/store.jsx`(AppProvider): 토큰(localStorage)·자동 로그인·소켓 연결, 로비/방/채팅 상태, **프레임 재생기**: `game:frames` 를 큐에 넣고 프레임마다 650ms(배너 프레임 1100ms) 간격으로 `view` 교체, 재생 중 `busy` 로 입력 잠금, `game:over` 는 재생이 끝난 뒤 표시, `game:start` 마다 epoch 증가로 이전 재생 취소(재접속 대응). `emit()` 은 ack 오류를 토스트로 표시.
- 화면: `Auth`(로그인/가입) → `Lobby`(방 목록·방 만들기+옵션·로비 채팅·랭킹/내 전적) → `Room`(2~4인 슬롯, 준비, 방장 옵션 변경, 채팅) → `GameBoard`. App 은 `room && view` 면 게임판, `room` 만이면 대기실.
- `GameBoard`: 상대 N명(손패 뒷면·획득패·점수/고/흔들기/폭탄/족보 칩, 쉬는 사람 흐리게), 바닥+더미, 내 획득패(광/열끗/띠/피 그룹 겹침)·손패. phase 별 UI: 내 차례 패 내기 / 더미 뒤집기(손패 없음·폭탄 더미) / 바닥 선택(`choice.options` 하이라이트) / 고·스톱 모달 / 광팔기·총통 모달 / 흔들기 확인 모달(같은 달 3장, 폭탄은 제외) / 선 정하기(밤일낮장) 연출 / 정산 모달(`game:over.payout`; 연습이면 "머니 무반영" 안내).
- **애니메이션**: `Card` 가 `layoutId="c{id}"` 를 써서 손패→바닥→획득패 이동이 공유 레이아웃 전환으로 날아감, 더미에서 뒤집힌 패는 flip-in. 배너(`frame.banner`)는 종류별 색/스케일 팝: 뻑·폭탄은 바닥 흔들림+화면 플래시, 싹쓸이 플래시, 따닥/쪽/고/흔들기/보너스/광팔기 등.
- 카드 이미지는 `/pics/row-R-column-C.png`, **뒷면·보너스패(48/49)는 CSS**(`.card-back`, `.card-bonus`).
- 검증: `vite build` 성공. Playwright(headless chromium, 스크래치패드 스크립트)로 실제 서버+빌드 산출물에 2명(옵션 없음)·4명(옵션 전부 ON) 가입→방 생성/입장→준비→자동 플레이→정산 모달까지 끝까지 진행, 콘솔/페이지 에러 0, 머니 증감 정상 확인. 프론트 단위 테스트는 없음.

### Phase 1 확장 – 2~4인 / 광팔기 / 보너스
- `new GostopGame(pids(2~4), {firstPlayer, rnd, bonus=false, rest})`.
  - 2인: 10장·바닥8·7점 / 3인: 7장·바닥6·3점 / 4인: 4명 착석, `rest` 1명은 쉬고 3명이 3인과 동일 진행.
  - 쪽·따닥·뻑먹기·싹쓸이·폭탄의 피 갈취는 **상대 각각에게서** 가져옴. 턴은 `active` 순환, 패 없는 사람은 건너뜀.
- **광팔기**(3·4인): 첫 패에 광 ≥3장인 사람에게 phase `gwang`에서 차례로 `sellGwang(pid)` / `passGwang(pid)`.
  4인 → `rest`가 패를 인수해 그 자리에서 치고 판 사람이 rest가 됨. 3인 → 패는 `dead`, 2인전(7점)으로 전환.
  (wingboardgame 규칙 반영) 판 패는 더미에 섞이고, 4인은 쉬던 사람이 새로 7장 받아 대신 침, 3인은 2인전(7점). 판 사람은 **광 1장당 2점**을 선·인수자를 뺀 플레이어에게서 수령 (`kind:'sale'`, 승패·나가리 무관).
- **보너스 카드**(옵션 `bonus:true`): id 48·49, 쌍피(피 2장) 취급, 이미지 없음 → UI에서 CSS 렌더 필요.
  손패에서 내면 즉시 획득 + 더미 1장을 손으로 받고 턴 계속, 더미에서 나오면 획득 후 한 장 더 뒤집음. 피 갈취 대상 아님.
- **결과 구조**: `result.payments = [{kind:'game'|'forfeit'|'sale', from, to, total(점수), mult, tags}]`.
  박(광·피·멍·고)은 패자별 개별 적용, 고/흔들기/폭탄 배수는 공통. 2인전은 기존 `winner/loser/total/tags` 필드 유지.
- 뷰: `opps, active, rest, handCounts, threshold, sale, gwangAsk` 추가 (`oppId/oppHandCount`는 2인 호환용).
- **wingboardgame 규칙 보강** (https://www.wingboardgame.com/2022/01/go-stop.html):
  - 따닥·쪽·싹쓸이는 **마지막 패(더미+모든 손패 소진)에서 불인정**.
  - 고박(3인 이상): 고를 부른 패자는 ×2 이고 **다른 패자의 몫까지 대납**(`고박 대납`).
  - 옵션 `ppeokPay`: 첫뻑 3점, 연뻑 6점(상대 각각), 삼연뻑은 즉시 종료(뻑 낸 사람 3점 승) — 점수 환산(칩=점)은 페이지 표현이 모호해 해석함.
  - 옵션 `chongtong`: 첫 패 동월 4장 보유자가 `callChongtong`(즉시 종료, 상대 각 3점) / `passChongtong`(계속, 이기면 ×4). 꺼두면 기존처럼 재딜.
  - 옵션 `carry`(나가리 이월 배수, 보통 2) — 방 로직이 직전 판이 나가리(`result.nagari`)면 전달. 옵션 `ttibak`(띠 5장+ ×2).
  - `GostopGame.decideFirst(pids,{night})` 밤일낮장 선 정하기.
  - 미구현(페이지가 모호/비표준): 독박, 쇼당, 3피 표시 카드(덱에 없음), 기리(컷) 연출, 4~6인 '장' 단계(페이지도 불명), 연속 쉬기 금지(방 로직 몫).
- 점수 규칙 점검 완료: 광(3/비광3=2/4/5), 열끗5장+, 고도리5, 홍·청·초단 각3, 띠5장+, 피10장+, 쌍피2장, 9월 술잔 자동선택 — 모두 테스트로 확인.

### Phase 4 – AI 봇 + 경제 예외 (완료, 8 suites / 1350 tests 통과)
- `backend/src/game/AiPlayer.js`: 룰 기반 AI. `decide(view)` 는 사람과 똑같은 뷰(`viewOf`)만 보고 `{type,...}` 하나 반환(치팅 없음).
  - 카드 선택: 폭탄 > 뻑 더미 먹기 > 바닥 매칭(매칭된 카드 가치 합) > 매칭 없으면 가치 낮은 패 버리기. 가치 광6 > 쌍피/보너스4 > 열끗3 > 띠2.5 > 피1 (비광 −1.5, 고도리 +1, 술잔 3.5). 보너스패는 즉시, 좋은 매칭이 없고 동월 3장이면 흔들기, 폭탄 더미가 남았고 낼 매칭이 없으면 더미 뒤집기.
  - 바닥 선택(choose): 가치 높은 패. 총통: 선언. 광팔기: 비광이 섞인 3광(2점)일 때만 판매.
  - 고/스톱: 엔진이 임계값(2인 7점/3인·4인 3점)에 도달해야 물어보므로 "3점 이상" 은 이 임계값으로 해석. 남은 손패<3, 이미 2고, 상대 점수≥임계값−1, 상대가 고를 불렀음(고박 위험), 내 점수≥임계값+4 중 하나면 스톱, 아니면 고.
- **봇 계정**: `User.isBot=true` 더미(`AI봇1..N`, `passwordHash='!'`). 로그인·소켓 접속 불가, `AI봇` 접두 아이디 가입 차단(`BOT_PREFIX`), 랭킹 제외. `acquireBot` 이 비어 있는 봇을 방에 예약(동시 요청도 겹치지 않음). 사람이 모두 나가면 방 삭제 + 봇 반환.
- **서버 연동(`sockets.js`)**: 봇 차례(`chong/gwang/play/choose/gostop`)를 `scheduleBot` 이 감지해 클라 프레임 재생 시간(프레임 650ms, 배너 1100ms)+0.7초 뒤 `runBot` 이 대신 둠. AI 행동이 엔진에서 거부되면 `botFallback`(안전한 행동)으로 대체해 판이 멈추지 않음. `BOT_DELAY_SCALE` 환경변수로 지연 배율 조정(테스트는 0). 봇은 항상 준비 상태(`resetReady`), 방장은 사람 중에서 승계.
- **이벤트**: `room:practice`(로비 'AI 1:1 연습하기' – 봇과 단둘, 준비 없이 바로 시작), `room:addBot` / `room:removeBot`(방장, 대기 중). 프론트: Lobby 버튼, Room 빈 자리의 'AI 봇 추가'·봇 '내보내기', 방 헤더에 실전/연습 표시.
- **경제 규칙(`isRankedRoom`)**: **사람이 2명 이상이면 실전**, 사람 1명뿐(AI 1:1, 사람 1+AI 여럿)이면 연습. → AI 1:1 은 머니·전적·Game 기록 전부 무변동(`ranked=false` 면 `settleGame` 이 DB 를 건드리지 않음), 유저2+AI1 은 실전(유저 머니·전적 정상 증감), 봇 행은 항상 불변(자본 무한 취급, 잔고 한도 없이 지불). 사람1+AI2 를 연습으로 둔 것은 무한 자본 봇에서 머니를 캐는 어뷰징 방지(설계 결정).
- 테스트: `test/ai.test.js`(판단 단위 22개 + AI끼리 2/3/4인 각 150판 자체 대국, 엔진 거부 0), `test/bot.test.js`(봇 계정 보호, 연습 3판 무변동, 유저2+AI1 실전 머니·전적, 4인 유저2+AI2, 이탈 정산, 봇 중복 방지). `npm test` 전체 통과.
- 검증: Playwright 로 빌드 산출물에 접속해 'AI 1:1 연습하기' → 실제 지연으로 봇과 한 판 끝까지(2회), 콘솔 에러 0, 연습 안내 문구 확인. 프론트 단위 테스트는 없음.

### Phase 4 이후 추가 작업
- **UI/연출**: 짝 맞는 패 강조(시안 맥동 테두리+솟음), 바닥패 같은 달 묶음 겹침(뻑 표시, 묶음 순서는 처음 나온 순서 유지·flex-wrap), 획득패 광→띠→멍→피 그룹을 먹은 순서로 컴팩트하게 겹침, 손패는 좁은 화면에서 자동 겹침, 낸 패 slam 애니메이션, 대기실 준비 버튼 위치 수정(모바일에서 옵션에 가려지던 문제).
- **사운드**: `frontend/src/sound.js` Web Audio 합성 효과음(상황별) + 배경음악 `frontend/public/bgm.mp3`(Intro.mp3). 효과음/배경음 각각 토글(localStorage `gostop.sound`/`gostop.bgm`).
- **프로필**: `User.nickname`(유니크, 비우면 아이디)·`User.avatar`(파일명). REST `PUT /api/auth/profile`, `POST|DELETE /api/auth/avatar`(raw 이미지, 2MB, 매직바이트로 PNG/JPG/GIF/WEBP 검증, SVG 거부, `UPLOAD_DIR`(기본 `backend/uploads`) 저장, `/uploads` 서빙+nosniff). `events.js` 버스로 소켓 서버에 알려 방 상태·채팅 이름 즉시 갱신. 화면 이름은 `user.name`(닉네임||아이디), 방 상태 `players[].username` 은 표시 이름 + `avatar`. 프론트: 로비 '내 정보' 탭(사진 256px 정사각 크롭 후 업로드), 방/게임판/팝업 배너/선 정하기에 아바타 표시, 기본 이미지 `public/default-avatar.svg`, 봇 `public/bot-avatar.svg`. 테스트 `test/profile.test.js`(9 suites / 1355 tests 통과). 마이그레이션 `20261025000000_profile`.

- **재접속/상태 복구**: 방·게임 상태는 원래부터 `userId` 키(`userRoom`/`rooms`)로 보관(`socket.id` 비의존). `disconnect` 시 즉시 퇴장하지 않고 `RECONNECT_GRACE_MS`(기본 60초, 환경변수)만큼 자리 유지 → 초과 시 `leaveRoom`(진행 중이면 기권 정산). 끊김/복귀를 방에 알림(`room:chat` 시스템 메시지, `player:offline|online`, `room:state.players[].offlineAt`). 재접속하면 타이머 해제 후 `SYNC_BOARD_STATE`({room, chat, view(내 손패·바닥·턴·점수), over(끊긴 사이 끝난 판 결과 1회), ranked, serverTime}) 전송. 클라가 `sync` 를 보내도 동일 응답(방이 없으면 room=null). 기존 버그 수정: 판 종료 시 `clearTimers` 가 끊긴 유저의 유예 타이머까지 지우던 것을 봇 타이머만 지우도록. 프론트: `SYNC_BOARD_STATE` 로 room/chat/view 를 통째로 덮어쓰고 재생 큐 폐기, 탭 복귀(visibilitychange/pageshow/online) 시 끊겨 있으면 `connect()`·연결돼 있으면 `sync`, 끊김 동안 전체 반투명 오버레이("서버와 연결이 끊겼습니다. 재접속 중…", 0.8초 이상일 때), 게임판 상단에 상대 끊김 카운트다운. 폴백은 기권 처리(봇 대행은 미구현). 테스트 `test/reconnect.test.js`(10 suites / 1359 tests), Playwright+TCP 프록시로 끊김→오버레이→복구 E2E 확인.

### 심야 일괄 작업 (Batch) — 진행 기록
- **Task 1 완료 – HeuristicBot**: `backend/src/game/HeuristicBot.js`(카운팅+EV)로 소켓 서버의 봇을 교체(`AiPlayer` 는 `cardValue` 공유용·비교 기준으로 유지). 한 판 동안 봇 인스턴스(`room.brains`)를 유지하며 `observe(view)` 로 본 패(내 손패+바닥+전 플레이어 획득패)를 누적 → 남은 패(더미+상대 손패) 월별 수량·가치. 패 EV = 확정 매칭 + 더미 매칭 확률(Odds) − 상대에게 줄 방어 리스크 − 뻑 위험(폭탄/뻑먹기/따닥/흔들기 보너스 유지). 고/스톱 `goEV`: stop(현재 점수) 대비 go = (1−상대역전확률)(현재+1+추가득점기대) − 역전확률×손실(고박 1.5배), 족보 임박도(광·고도리·홍/청/초단·피)로 득점 속도 추정, 남은 패<2·3고 이상은 스톱. 테스트 `test/heuristic.test.js`(카운팅·EV·고스톱·2/3/4인 150판 무거부, 결정 최대 지연 <10ms·평균 <1ms). 2인 AiPlayer 상대 2000판 시뮬: 승 1018:982, 득점 17783:15401(우위는 근소). MCTS 등 무작위 시뮬레이션은 쓰지 않음.

- **Task 2 완료 – 타짜 이모트**: 서버 `SEND_EMOTE {text}` → 허용 목록(`EMOTES`: 묻고 더블로 가!/싸늘하다.../동작그만 밑장빼기냐?/아수라발발타) 밖은 거부, 방 안 플레이어만, 채팅 속도 제한 공유 → 같은 방 전원(관전자 포함)에게 `BROADCAST_EMOTE {userId,name,text,ts}`. 프론트: `Emote.jsx` — `EmoteButton`(프로필 영역 😎, 목록 팝업), `EmoteBubble`(아바타 위/아래에서 spring 으로 통통 튀어나오고 3초 뒤 opacity 0 으로 exit), 스토어 `emotes` 상태.
- **Task 3 완료 – 관전 모드**: `room:spectate {roomId}`(방이 가득 찼거나 진행 중일 때만, 최대 8명). 관전자는 `room.spectators` 에만 존재 — `players`/`pids`/턴 순서/정산에 절대 들어가지 않음. 입장 시 `SYNC_BOARD_STATE`(role:'spectator', 손패 `[]`, 상대 손패 비노출) 후 `game:frames`/`game:start`/`game:over` 를 함께 수신. `game:*`·`room:ready`·`SEND_EMOTE`·방 설정 등 모든 조작은 서버에서 차단. 관전자 퇴장은 기권/정산 무영향, 플레이어가 전원 나가면 관전자도 `room:left` 로 로비 복귀. 방 상태 `room:state.spectators[]`, 로비 요약 `spectators` 수. 프론트: 로비 '👁️ 관전하기' 버튼, 게임판 손패·조작 영역 숨김 + '👁️ 관전 중' 배지, 대기실 관전 표시. 테스트(bot.test.js '관전' 3종).
- **Task 4~6 완료 – 스탯/업적/출석·개평 (백엔드)** — 마이그레이션 `20261026000000_stats_achievements_daily`:
  - `User` 신규 컬럼: `statGames, goCount, stopCount, bbuckCount, bombCount, shakeCount, scoreSum, pibakLosses, gwangWins, botWins`(Int), `achievements`(JSON 문자열 배열, SQLite 는 배열 컬럼 없음), `title`(대표 칭호 업적 id), `lastLoginAt`, `gaepyeongDate`(KST YYYY-MM-DD), `gaepyeongCount`.
  - 엔진 `result.stats[pid]`({active,go,stop,ppeok,ppeokMax,bomb,shake,score,gwang}) / `result.baks[loser]`(박 이름 목록) 추가.
  - `src/stats.js`: `ACHIEVEMENTS`(뻑의 제왕·광신도·무소유·타짜·첫 승리·폭탄마·고 중독), `applyGameStats`(실전 판만 카운터 증가, botWins 는 연습 포함, 새 업적 판정·JSON 저장·첫 업적 자동 대표 칭호), `computeStats`, `recordPractice`(연습 판 전용). `settleGame` 트랜잭션 안에서 호출, 결과에 `unlocked` 포함 → 소켓 `achievement:unlocked {achievements[]}` 로 개인 통지.
  - REST: `GET /api/auth/stats`(승률·고 성향 goRate=고/(고+스톱)·평균 점수·피박 회피율=1−피박패/패·뻑/폭탄 비율), `GET /api/auth/achievements`, `PUT /api/auth/title`(달성한 것만), `POST /api/auth/checkin`(KST 하루 첫 호출 +10,000원, 조건부 updateMany 로 동시 호출 1회만), `POST /api/auth/gaepyeong`(잔액 ≤10,000 & 오늘 <3회 → +30,000원, 트랜잭션+조건부 갱신). `publicUser` 에 `achievements, title, titleText, gaepyeongLeft, canGaepyeong` 추가, 방 플레이어에 `title`(표시 문자열).
  - 테스트 `test/progress.test.js`(출석 경계·동시성, 개평 10,000 경계·3회 제한·날짜 초기화·연타, 스탯 누적/연습 무영향, 업적 4종·칭호 선택).

- **Task 4~6 프론트엔드**: `Profile.jsx`(내 정보 탭: 사진·닉네임 + `StatsPanel` = 방사형 `RadarChart`(승률/고 성향/평균 점수/피박 회피/폭탄·흔들기, 의존성 없는 SVG)+진행 바+뻑/폭탄/흔들기/AI승 카드 + 업적 목록·대표 칭호 선택), `Avatar.jsx` 의 `showTitle`(대표 칭호를 아바타 위에 항상 표시: 로비 헤더·대기실·게임판), 로비 헤더 '🧧 개평 받기 (n/3)' 버튼(`canGaepyeong` 일 때만 활성), `App.jsx` 의 `RewardModal`(출석 보너스·개평·업적 달성 안내). 스토어: 세션당 1회 `POST /checkin`, `claimGaepyeong`, `reward`, `achievement:unlocked` 수신. Playwright 로 출석 모달→개평→프로필 차트→이모트 말풍선(3초 후 소멸)→관전자 화면을 실제 서버에서 확인(에러 0).

### 심야 일괄 작업 최종 요약 (스키마 · 소켓 이벤트 · 컴포넌트)
- **DB 스키마(User 추가 컬럼)**: 프로필 `nickname`(unique), `avatar` / 스탯 `statGames, goCount, stopCount, bbuckCount, bombCount, shakeCount, scoreSum, pibakLosses, gwangWins, botWins` / `achievements`(JSON 배열 문자열), `title` / `lastLoginAt`, `gaepyeongDate`, `gaepyeongCount`. 마이그레이션: `20261025000000_profile`, `20261026000000_stats_achievements_daily`.
- **소켓 이벤트(추가분)** — 서버→클라: `SYNC_BOARD_STATE`(role 포함), `BROADCAST_EMOTE`, `achievement:unlocked`, `player:offline|online`, `room:state.spectators[]` / 클라→서버: `SEND_EMOTE {text}`, `room:spectate {roomId}`, `sync`, `room:practice`, `room:addBot`, `room:removeBot`.
- **REST(추가분)**: `PUT /api/auth/profile`, `POST|DELETE /api/auth/avatar`, `GET /stats`, `GET /achievements`, `PUT /title`, `POST /checkin`, `POST /gaepyeong`.
- **프론트 컴포넌트**: `Auth, Lobby(관전하기/개평/AI 연습), Room(관전 표시), GameBoard(관전자 모드·OfflineNotice·Banner 아바타), Card, Avatar, Emote(EmoteButton/EmoteBubble), Profile(ProfilePanel/StatsPanel/RadarChart), SoundToggle, Chat` + `App` 의 `DisconnectOverlay`, `RewardModal`.
- **주의/한계**: 업적·스탯 규칙 해석 — 광신도는 '3광 이상으로 이긴 승리 누적 5회', 무소유의 '멍따'는 멍박, 고 성향=고/(고+스톱), 평균 점수=실전 판당 최종 점수, 피박 회피율=1−(피박 패/패). 스탯·전적·머니는 실전만, AI 상대 승리(botWins)·업적(뻑의 제왕·무소유 등 판 단위 조건)은 연습 판에서도 반영. 관전은 최대 8명·가득 찼거나 진행 중인 방만(요청서의 3인 기준은 이 앱의 4인 방 기준으로 해석). HeuristicBot 은 AiPlayer 대비 근소 우위(2000판 승률 50.9%, 득점 +15%).

### 로비 개편 + 슬롯머신
- **강원랜드 로비**: 로그인/로비 제목을 "🎰 강원랜드"로, 카지노 SVG 배경(`frontend/public/casino-bg.svg`, 직접 그린 일러스트). 게임 선택 탭(`frontend/src/games.js` 레지스트리: 고스톱 ready / 섯다 스텁 `ComingSoon.jsx` / 슬롯머신). 새 게임은 `ready` 를 true 로 바꾸고 `Lobby.jsx` 의 화면 매핑에 연결.
- **슬롯머신**: 마이그레이션 `20261027000000_slot_limit`(`User.dailySlotSpent`, `lastSlotPlayedAt`). `src/slotMath.js`(확률 모델 `SLOT_TIERS`, `spinSlot(rng)`, `evaluateSymbols`, `theoreticalRtp`), `src/slot.js`: `GET /api/slot/status`, `POST /api/slot/spin`(500원 차감+당첨금 지급 한 트랜잭션, KST 날짜 바뀌면 한도 초기화, 오늘 베팅합 +500 > 10,000 이면 403 "오늘 슬롯머신 한도를 모두 소진했습니다.", 유저별 직렬 큐 + 조건부 갱신으로 연타 안전). 응답 `{resultSymbols, payout, tier, bet, user, slot:{spent,limit,left}}`. 결과는 서버 `Math.random`. 소켓 푸시 없음(연출 전에 머니가 미리 바뀌지 않게, 화면은 연출 후 반영).
  - ⚠ **요청서의 확률표는 RTP 155%**(1%×40+4%×10+15%×3+30%×1) 라서 목표 95% 와 모순 → 배당 금액은 유지하고 확률만 0.5%/2%/8%/31%(꽝 58.5%)로 조정해 이론 RTP 정확히 95.0%. '소박'은 "아무 심볼 2개 일치"로 해석. 표를 원래대로 되돌리려면 `SLOT_TIERS` 만 수정.
  - 검증(`test/slot.test.js`): 200k 스핀 결과/당첨금 일치, 1,000,000회 RTP 95.19%(티어 빈도 ±0.002 이내), 10,000회 시드 실행 96.7%(표본 작아 ±3% 흔들림이 정상), 한도 20회/403, 날짜 초기화, 머니 부족, 30연타 동시성.
  - 프론트 `SlotMachine.jsx`: 3릴(Framer Motion 모션값 하나로 transform 만 갱신, 스핀 중 블러), 왼쪽부터 0.5초 간격 ease-out 정지(탁·탁·탁 효과음), 잭팟/대박 = 전체 플래시+파티클+동전 비, 꽝 = 릴 회색조, 한도 바, 배당표. 심볼: 똥광(40)·삼팔광땡(8+28)·멧돼지(24)·홍단(1)·껍데기(2).
  - 성능: 헤드리스 크롬 측정에서 `backdrop-blur` 가 프레임을 60→34fps 로 떨어뜨림 → 로비/슬롯 패널의 backdrop-blur 제거(불투명도로 대체) 후 스핀 59.7fps, 잭팟+동전 비 59.5fps.

### ✅ 화투 섯다 모드 추가 완료 (무중단 1~4 페이즈 완료)
- **Phase 1 – 족보 엔진** `backend/src/seotda/rules.js`: 20장 덱(`SEOTDA_DECK` = 1~10월 각 2장, 고스톱과 같은 카드 id 라 ./pics 재사용), `evaluateHand`(삼팔광땡 > 18·13광땡 > 장땡~삥땡 > 알리·독사·구삥·장삥·장사·세륙 > 갑오 > 8끗~1끗 > 망통, 점수 1000~500), `compareHands`(특수 족보 상성·구사 재경기·무승부 공동 승자).
  - 암행어사(4열+7열): 상대에 13/18광땡이 있으면 승(950점), 38광땡은 못 잡음, 아니면 1끗. 땡잡이(3광+7열): 상대에 1~9땡이 있으면 승(809.5점), 장땡·광땡은 못 잡음, 아니면 망통. 구사(4+9): 멍텅구리구사(4열+9열)는 상대 최고 패가 9땡 이하, 일반 구사는 알리 이하이면 재경기, 아니면 3끗.
  - 해석/단순화: '멍텅구리 구사'는 4월 열끗+9월 열끗(32, 국진)으로 정의. 땡잡이/암행어사의 승리 효과는 해당 족보보다 약한 모든 패를 이기는 점수로 환산(3인 이상에서 비이행성 방지). 동점은 팟을 나눠 가짐(나머지는 앉은 순서 앞 승자).
- **Phase 2 – 베팅/소켓** `SeotdaGame.js`: 참가비(=방 판돈) 징수 → 2장 비공개 분배 → 선부터 시계 방향 베팅. 액션 `die/call(0이면 체크)/half(콜+팟 50%)/bbing(선의 첫 베팅만, 기본 판돈)/ddadang(앞사람 베팅 ×2)`, 레이즈 후 생존자 재응답, 한도=생존자 중 최소 보유금(사이드팟 없음), 전원 콜/한 명만 남으면 종료. 구사 재경기는 팟 이월 + 참가비 재징수 후 round+1. 이탈/연결 끊김/제한시간(40초, 체크 가능하면 체크·아니면 다이)은 다이 처리. 방 `type:'seotda'`(`room:create {game:'seotda'}`), 이벤트: 클→서 `seotda:act {action}`; 서→클 `seotda:start`, `seotda:state`, `TURN_START`, `SHOW_DOWN`, `seotda:over {result,payout}`; `SYNC_BOARD_STATE.seotda` 로 재접속 복구, 관전자 지원(패 비공개). 정산 `settleSeotda`(Prisma 트랜잭션, 순증감 `net` 반영, 잔액 부족 시 비율 조정, wins/losses·Game 기록 `[섯다]`). 섯다엔 AI 봇 없음.
- **Phase 3 – UI**: `SeotdaBoard.jsx`(녹색 펠트 타원 테이블, 중앙 POT, 좌석별 아바타·보유금·카드 2장(뒷면)·마지막 액션·남은 시간, 내 패 face-up + 족보 이름, 내 차례에 [다이][콜/체크][하프][삥][따당] 버튼, 쇼다운 뒤집기, 재경기 배너, 결과 모달), `JokboHelp.jsx`(우상단 ❓ 족보 보기: 아코디언 + 특수 족보 상성표, 배경 반투명 `pointer-events-none` 이라 게임을 멈추지 않고 내 패·베팅 버튼을 그대로 사용 가능). 로비 '섯다' 탭에서 방 목록/방 만들기(옵션 없음), 대기실은 섯다 안내.
- **Phase 4 – 테스트**: `test/seotda.rules.test.js`(20: 덱, 190조합 평가, 암행어사가 13/18광땡 잡음, 38광땡이 암행어사 무시, 땡잡이가 8땡 잡음/장땡·광땡 못 잡음, 구사 재경기 조건), `test/seotda.game.test.js`(15: 삥/콜/하프/따당/다이/한도/재경기 이월/이탈/타임아웃/1000판 무작위 제로섬), `test/seotda.socket.test.js`(7: 패 비공개, SHOW_DOWN, 정산 제로섬, 재경기, 관전, 이탈, 재접속, 무작위 3인). 패 고정은 Fisher-Yates 역산으로 난수열을 조작.
- 참고: 이 프로젝트는 git 저장소가 아니라 '커밋'은 하지 않았다(저장소 초기화도 하지 않음). 서버(4000)는 새 코드로 재시작했다.

## 주요 아키텍처 결정
- 서버 권위: 액션은 `{ok, frames}` 반환, frames = 단계별 스냅샷(클라가 순서 재생해 애니메이션). `GostopGame.viewOf(snapshot, viewer, pids)`로 상대 손패 은닉.
- phase: `play | choose | gostop | busy | ended`. 바닥패 선택은 `ctx.choice`.
- 규칙: 7점 이상 고/스톱, 1고+1·2고+2·3고부터 ×2^(n-2), 박/흔들기/폭탄 각 ×2, 소진 시 나가리.
- 지급액 = min(점수×판돈, 패자 보유금), 제로섬.
- 프론트엔드: Phase 3 섹션 참고 (Vite+React+Tailwind+Framer Motion, 프레임 큐 재생 방식).

## 해결되지 않은 이슈 / 주의
- (해결) 보너스패/뒷면은 CSS 로 구현. 단, 보너스 카드 렌더는 육안 검증하지 못함(자동 플레이에서 보너스가 안 나왔을 수 있음).
- 차례 제한시간(타이머)·자동 플레이는 **미구현**(Phase 4 에서도 제외, 클라 카운트다운 UI 필요): 접속은 했지만 가만히 있는 유저는 판을 멈출 수 있음(연결 끊김만 30초 후 기권). 필요하면 `AiPlayer` 를 재사용해 시간 초과 시 대행하면 됨.
- (해결) AI 봇·버튼·봇 계정은 Phase 4 에서 구현. 남은 개선: 봇이 상대 패 추적/확률 계산은 하지 않는 단순 룰 기반.
- 쇼당·독박 등 미구현 규칙은 Phase 1 확장 항목 참고. `JWT_SECRET` 은 운영 시 반드시 환경변수로 지정.
- 실행: `cd backend && npx prisma migrate deploy && npm start` (PORT 4000). 서버 프로세스는 띄워 두지 않음.

## Next Step
프로젝트 4단계 모두 완료. 선택 개선 사항:
- 차례 타이머 + 시간 초과 시 `AiPlayer` 자동 대행(클라 카운트다운 UI 포함), 쇼당·독박 등 미구현 규칙, 보너스 카드 육안 확인, 프론트 단위 테스트.
- 배포: `cd frontend && npm run build` → `cd backend && npx prisma migrate deploy && JWT_SECRET=<비밀값> PORT=4000 npm start` (백엔드가 `frontend/dist` 와 `/pics` 서빙). DB 경로는 `backend/.env` 의 `DATABASE_URL`.


## 🤖 섯다 AI 모드 추가
- `backend/src/seotda/SeotdaBot.js`: 내 패 + 남은 18장으로 상대 2장 조합 전수 비교(승률) → 팟 오즈와 비교해 콜/다이, 매우 강하면 따당·하프, 약 6% 허세. 봇마다 성향(boldness) 약간 다름. 항상 `options` 에 맞는 합법 행동만 반환(실패 시 체크/다이 폴백).
- `sockets.js`: 섯다 방에서도 `room:addBot`(대기방 AI 추가) / `room:practice {game:'seotda'}`(로비 'AI 1:1 연습') 가능. 봇 차례엔 0.9~2초 생각 후 행동(`seotda-bot` 타이머, `BOT_DELAY_SCALE` 적용).
- 경제: 고스톱과 동일. 사람 1명 + 봇 = 연습(머니/전적/게임 기록 무변동, 사람은 최소 `ante*50` 칩 보장), 사람 2명 이상 + 봇 = 실전(봇은 가상 잔액 1천만으로 무한 자본, 봇 잔고·전적·기록 제외).
- 프론트: 섯다 탭에도 'AI 1:1 연습하기', 대기방 'AI 봇 추가', 봇 칩은 ∞ 표시, 연습 결과창에 안내 문구.
- 테스트: `seotda.bot.test.js` 5개 추가(판단·합법성 시뮬레이션·연습/실전 정산). 전체 17 suites 통과.

## 🎊 족보 완성 팝업/효과음
- 고스톱에서 홍단·청단·초단·고도리·N광이 새로 완성되면 상단 팝업(누가, +점수)과 `combo` 효과음 재생. 프레임 간 `scores[pid].detail` 비교로 클라이언트에서 감지(`store.jsx newCombos`), 재접속/새로고침 직후엔 이전 프레임이 없어 울리지 않음. 여러 개가 동시에 완성되면 1.5초 간격으로 순서대로 표시.

## ✅ TODO #1~#6 구현 (2026-10-24)
- **#1 고스톱 차례 제한 시간**: `GOSTOP_TURN_MS`(기본 30초, 프레임 재생·시작 연출 시간만큼 마감을 늦춤). 사람 차례마다 `TURN_START {game, userId, deadlineAt, auto}` 방송 → 초과 시 HeuristicBot 이 그 사람 대신 한 수. 연속 `AUTO_AFTER_TIMEOUTS`(2)회 초과하면 자동 진행 전환(`players[].auto`), 상단 '🤖 자동' 버튼으로 본인이 켜고 끔(`room:auto {on}`). 직접 두면 초과 횟수 초기화, 판이 끝나면 자동 진행 해제. 섯다도 같은 규칙(초과 시 체크/다이, 2회면 자동 진행).
- **#2 끊김 시 AI 대행**: 연결이 끊긴 사람 차례는 즉시 AI 가 대신 둔다(고스톱 HeuristicBot / 섯다 SeotdaBot). 유예(60초)가 지나도 판 중에는 기권시키지 않고 `leaveAfterGame` 표시 → 판이 끝나면 퇴장. 유예 안에 돌아오면 자동 진행 해제 후 바로 넘겨받음(`resumeTurn`). 직접 '나가기'는 여전히 기권/다이.
- **#3 게임별 전적·랭킹**: `User.wins/losses` = 고스톱 전용, 섯다는 `sdWins/sdLosses/sdGames` + 스탯(`sdDies, sdFoldWins, sdBluffWins(3끗 이하로 상대 전원 다이), sdTtaengWins, sdGwangWins, sdAllinWins, sdDoubleWins, sdBiggestPot, sdBestPower/sdBestHand`). 마이그레이션 `20261028000000_seotda_stats` 가 기존 `[섯다]` 기록의 승패를 고스톱 전적에서 빼서 옮김(실 DB 적용 전 백업: `/tmp/claude-1000/dev.db.bak-before-seotda-stats`). 섯다 업적 8종(섯다 첫 승·광땡 메이커·장군·허세왕·암행어사 출두·땡잡이·묻고 더블로 가·올인 승부사, `game:'seotda'`). `GET /api/auth/ranking?game=money|gostop|seotda`. 로비 랭킹 탭(머니/고스톱/섯다), 헤더 전적 분리, 내 정보 스탯·업적을 게임별 탭으로.
- **#4 섯다 올인 사이드팟**: 콜할 돈이 모자라면 가진 만큼 올인. 올인자는 더 행동하지 않음. 레이즈 상한 = min(내 잔액, 아직 낼 수 있는 다른 사람의 최대치). 쇼다운 시 생존자 투입 금액 수준별 메인/사이드팟(`result.pots`), 팟마다 승자 판정(사이드팟 비교에서는 구사 재경기 미적용), 혼자 남은 사이드팟은 환급(승리 아님). 전원 참가비로 올인이면 즉시 쇼다운. 기존 '최소 보유자 한도' 규칙은 폐기.
- **#5 고스톱 쇼당·독박·기리**: 독박 = 3인 이상에서 고박 대납(태그 '독박 (고박)') + 쇼당 받은 사람(태그 '독박 (쇼당 받음)'), 결과에 `dokbak`·"독박!" 배너. 쇼당(해석): 3인, 내 차례(play), 두 상대가 모두 기준 점수 이상, 내가 고를 안 불렀고 손패 2장 이상, 판당 1회 → 두 상대에게 차례로 묻고 둘 다 수락하면 나가리(이월 옵션 적용), 한 명이라도 받으면 계속하고 그 사람이 독박 책임(쇼당 부른 사람이 나면 독박 없음). phase `shodang`, 소켓 `game:shodang`, `game:shodangAnswer {accept}`, HeuristicBot 도 판단. 기리: `game:start.cutter`(선의 앞사람) → 덱을 둘로 나눠 바꾸는 1.7초 연출(서버 셔플은 그대로, 첫 차례 대기에 `GIRI_MS` 반영).
- **#6 섯다 묻고 더블**: 최고 족보 동점이고 모든 팟을 그 동점자들이 똑같이 나눌 때 `result.tie` → `seotda:tieVote {pids, votes, deadlineAt, ante}` 투표(`SEOTDA_VOTE_MS` 15초). 동점자 전원 동의 시 동점자끼리만 판돈 2배로 새 판(`doubleArgs`: 팟 이월, 진 사람의 돈은 `outsiders` 로 팟에 남고 정산에 포함), 거절/시간초과/이탈/끊김이면 분배. 봇은 60% 확률 동의. `seotda:tieResult`, 화면에 투표 모달·"💰 묻고 더블" 표시.
- 테스트: `turn.test.js`(타이머/자동 진행), `shodang.test.js`, 섯다 엔진(올인·사이드팟·동점·더블)·소켓(묻고 더블 동의/거절, 섯다 스탯·업적·랭킹)·재접속(AI 대행) 테스트 갱신. **19 suites / 1469 tests 통과**. Playwright 로 기리 연출·차례 타이머·자동 진행 토글·끊김 안내·섯다 연습/결과·랭킹 탭 확인(콘솔 에러 없음). 묻고 더블 투표 모달·사이드팟 결과 표시는 소켓 테스트로만 검증(브라우저 육안 확인은 못 함).
- 버그 수정: 1초마다 다시 그려지는 차례 타이머 때문에 '선 정하기' 연출 타이머가 계속 리셋되던 문제 → `useLatest` ref.

## ✅ TODO #7, #9~#14 구현 (2026-10-24, #8 은 제외)
- **#7 족보 비상**: `cards.js nearCombos(captured, pid)` — 홍단/청단/초단/고도리가 2/3, 광이 2·3·4장(→ 삼광/사광/오광 비상)일 때. 남은 패를 이미 다른 사람이 먹었으면 표시 안 함. 피·멍(열끗)·띠 장수는 요청대로 제외. 점수칩 옆 빨간 '🚨 ○○ 비상' 배지(나/상대 모두) + 새로 생길 때 상단 작은 팝업과 `alert` 효과음(`useNearAlert`, 판 시작·재접속 직후 상태는 알리지 않음).
- **#8 고/스톱 판단 보조 정보**: 사용자 요청으로 제외.
- **#9 고스톱 규칙 도움말**: `GostopHelp.jsx`, 상단 '❓ 규칙' 버튼. 점수/고·스톱/박/뻑·따닥·쪽·싹쓸이/흔들기·폭탄·총통/3인 이상 규칙 아코디언(서버 GostopGame·score.js 기준 수치). 배경 클릭 통과라 게임을 계속할 수 있음.
- **#10 정산 연출**: `GameOver` 의 `useSettleSteps` — 족보 점수가 0.42초 간격으로 한 줄씩 쌓이며 합계 증가 → 패자별 행에 배수 태그(박·흔들기·고·이월·독박)가 하나씩 찍힘 → 최종 '점수 × 판돈'. `tick/boost/chip` 효과음, 클릭하면 건너뜀. 머니 증감은 연출이 끝난 뒤 표시.
- **#11 섯다 배분/공개/쪼기**: 새 판(`seotda:start` → store `seotdaDeal` 키)마다 테이블 가운데서 좌석으로 카드가 한 장씩 두 바퀴 날아감(`DealLayer`). 쇼다운 때 상대 패를 앉은 순서대로 0.75초 간격으로 뒤집고(`flip` 효과음), 공개가 끝난 뒤 승자 표시·결과 창(공개 연출 동안 결과 창·동점 투표 창·안내 문구·기록의 결과 줄은 숨김). 내 패는 뒷면으로 오고 위로 밀어 올리면 아래부터 보이는 '쪼기'(`SqueezeCard`, 42% 넘게 밀거나 탭하면 공개, '👀 바로 보기' 버튼). 판이 끝나거나 재접속 복구면 바로 공개. 승패 효과음은 결과 창이 뜰 때로 옮김.
- **#12 칩 이동**: `seotda:state.event` → store `seotdaEvent` → 베팅 금액 칩이 좌석에서 팟으로, 공개 후 팟에서 받는 사람에게(`ChipLayer`, % 좌표 애니메이션). 결과 창은 칩 이동을 본 뒤(+1초) 뜸.
- **#13 베팅 버튼 금액**: 원래도 금액은 나와 있었음 → 두 줄 형식 [하프 / +1,200], 체크는 ±0, 올인이면 🔥 표시, 데스크톱은 옆에 보유금. 모바일에서 한 줄에 들어가게 버튼 폭 축소.
- **#14 판 액션 기록**: 테이블 왼쪽 위 접이식 '📜 판 기록'(누가 무엇을 얼마, 그때 팟, 올인/자리 비움, 끝나면 결과 줄). 열림 상태는 localStorage 에 기억(기본: 넓은 화면만 열림). 서버 `view.log` 를 최근 12 → 40개로 늘림. 재경기/묻고 더블은 새 판이라 기록도 새로 시작.
- 덤: 자동 진행 중 버튼 문구가 모바일 상단 바를 밀어내던 문제 → 모바일은 '🤖 끄기'.
- 검증: 백엔드 19 suites / 1469 tests (전체 실행 시 `heuristic.test.js` 의 '결정당 최대 지연 < 10ms' 2개가 부하로 12~14ms 가 나와 실패, 단독 실행은 통과 — 이번 변경과 무관한 타이밍 테스트). Playwright(임시 서버 4100): 섯다 연습 데스크톱/모바일(배분, 쪼기 반쯤 밀기·공개, 금액 버튼, 칩, 순차 공개, 결과), 고스톱 연습 데스크톱/모바일(규칙 도움말, '삼광 비상'·'고도리 비상' 팝업/배지, 정산 연출) — 콘솔 에러 없음. 3인 이상 섯다의 순차 공개와 다인 칩 이동은 브라우저로는 확인하지 못함(같은 코드 경로).

## ✅ TODO 대번호 4·6·7 (#15~#17, #23~#30) 구현 (2026-10-24)
- **#27 git**: 저장소 초기화(`main`), `.gitignore`(node_modules, dist, dev.db, uploads, .env, 로그, test-results). 항목별로 커밋. 이후 작업도 커밋 단위로 진행 가능.
- **#28 보안**: `NODE_ENV=production` 이면 `JWT_SECRET`(16자 이상, 기본값 금지) 없을 때 서버 시작 거부, 개발 모드는 경고 로그. `src/rateLimit.js`(메모리 고정 창) — 로그인 1분 10회 / 가입 1시간 5회(IP 기준, 429 + Retry-After). `LOGIN_RATE_MAX`/`REGISTER_RATE_MAX` 로 조절(0=끔, 테스트 기본 끔), 프록시 뒤면 `TRUST_PROXY=1`. 테스트 `security.test.js`.
- **#29 코드 스플리팅**: GameBoard·SeotdaBoard·SlotMachine·Profile lazy load(`lazy.js lazyNamed`: 새 배포로 옛 청크가 없으면 1회 새로고침), react/motion/socket 벤더 청크 분리(경고 해소, 첫 화면 앱 코드 44KB). 방 입장 시 게임 화면 청크 미리 받음. 서버: `/assets` 1년 immutable, index.html·sw.js·manifest no-cache, 없는 청크는 index.html 대신 404.
- **#15~#17 AI** (`backend/src/bots.js`):
  - 난이도: 고스톱 easy = AiPlayer + 실수 40% + 무모한 고 / normal = AiPlayer + 실수 12% / hard = HeuristicBot(카운팅). 섯다 easy = 헤픈 콜·상대 수 무시 / normal = 기존 + 15% 실수 / hard = 압박 반영·가치 베팅·허세 절제. 시뮬레이션으로 easy < normal < hard 확인(고스톱 2000판·섯다 20000판). 사람 대행(시간 초과·끊김·자동)은 항상 hard.
  - 연습 판돈: `room:practice {game, level, bet}`(BET_OPTIONS, 잘못되면 100/보통). `room:addBot {level}`. 로비 '연습 설정' 모달(마지막 선택 기억), 대기실 봇 추가 시 난이도 선택, 좌석 이름 옆 하/중/상 배지.
  - 개성 8종(박사장·순자 할매·신입 민수·샤크·김교수·행운이·한탕 최씨·스님): 이름 `AI ○○`, 아바타 `public/bots/*.svg`, 성향(공격/균형/수비 → 고 기준·섯다 베팅/허세), 방 안에서 겹치지 않게 배정. 상황별 말풍선(뻑/상대 뻑/고/상대 고/폭탄·싹쓸이/크게 올림/다이/승·패) — 프레임 재생 시점에 맞춰 `BROADCAST_EMOTE {bot:true}`, 개성별 수다 확률 + 봇당 6초 쿨다운. DB 봇 계정(AI봇N)은 그대로.
  - AiPlayer 에 쇼당 응답 추가. 테스트 `bots.test.js` + bot.test.js 소켓 케이스.
- **#23 설정** (`settings.js`, `components/Settings.jsx`, 로비·게임 상단 ⚙️): 효과음/배경음 켜기·음량, 연출 속도(느리게 1.35/보통/빠르게 0.6 — 고스톱 프레임·정산 연출·섯다 배분/공개에 적용), 카드 크기(CSS `--cs-user` 0.88/1/1.15), 진동, 단축키 표시, 튜토리얼 다시 보기, 앱 설치. 게임 상단 🎵 버튼은 ⚙️ 로 대체(🔊 빠른 끄기는 유지).
- **#24 튜토리얼** (`components/Tutorial.jsx`): 아직 한 판도 안 한 사용자에게 로비 스포트라이트 7단계(게임 선택 → AI 연습 → 실전 방 → 내 정보 → 설정), 출석 보상 등 다른 모달이 닫힌 뒤 표시, ←/→/Enter/Esc. 고스톱 첫 내 차례에 한 번짜리 힌트(`OnceHint`).
- **#25 모바일**: 휴대폰 가로 모드(높이 500px 이하) — 카드 0.72배, 고스톱 상대 뒷면 줄·보조 문구 숨김, 섯다 전용 좌석 배치 + 베팅 바를 오른쪽 아래로(`useShortLandscape`). 진동(내 차례·족보·비상·승패·뻑·폭탄). PWA: `manifest.webmanifest`, 아이콘(svg + 192/512/maskable/apple PNG), `public/sw.js`(빌드 청크·화투패 캐시, API/소켓/음원 제외, 운영 빌드에서만 등록), 설치 버튼.
- **#26 접근성**: 짝 맞는 패에 색 외 🔗 배지, 카드 aria-label("3월 광 (짝 맞음)")·role=button·Tab/Enter, `:focus-visible` 테두리, `MotionConfig reducedMotion="user"`, 모달 role=dialog. 키보드(`keys.js` data-hotkey): 1~0 손패/바닥 선택, D 더미·다이, G/S 고/스톱, Y/N 예/아니오, C/H/B/T 섯다 베팅, V 바로 보기, ? 도움말, Esc 닫기.
- **#30 프론트 테스트**: vitest + jsdom + Testing Library 단위 테스트 22개(`frontend/test/unit`: cards/nearCombos, settings, 단축키, 컴포넌트) — `npm test`. Playwright E2E 11개(`frontend/test/e2e`, 데스크톱+모바일: 튜토리얼, 설정 저장, PWA, 고스톱 연습(난이도·판돈·키보드·자동 진행·정산), 가로 모드 넘침, 섯다 연습(V/C 단축키)) — `npm run test:e2e` 가 빌드 후 임시 DB 백엔드(4199)를 띄움(`test/e2e/server.mjs`, 실제 dev.db 미사용). 받아 둔 크로미움 경로는 `PW_CHROMIUM` 으로 지정 가능.
- 버그 수정: 튜토리얼 '다음' 연타 시 퇴장 애니메이션 중인 이전 카드가 눌려 단계가 안 넘어가던 문제, 모바일 로비 방 목록 행/헤더가 줄바꿈되지 않아 화면이 넓어질 수 있던 문제, 대기실 봇 배지 잘림, jsdom/구형 브라우저에서 `audio.play()` 가 Promise 를 안 돌려줄 때 예외.
- 검증: 백엔드 21 suites / 1490 tests(전체 실행 3회 중 2회 전부 통과, 1회는 기존 `heuristic.test.js` '결정당 최대 지연 < 10ms' 타이밍 실패 — 부하 의존. 그 전에 `sockets.test.js` 1건이 전체 실행에서 한 번 실패했으나 단독 3회·이후 전체 실행에서는 통과, 원인 미확인). 프론트 단위 22 통과, E2E 11 통과(1개는 모바일 전용이라 데스크톱에서 skip). 스크린샷으로 튜토리얼·연습 설정·설정·대기실·봇 말풍선·가로 모드 확인.
- 남은 것: 대번호 5(로비·소셜 #18~#22). 운영 배포 시 `NODE_ENV=production JWT_SECRET=...` 필수. 같은 공인 IP 뒤 여러 명이 가입하면 가입 레이트 리밋(1시간 5개)에 걸릴 수 있음 → `REGISTER_RATE_MAX` 조절.

## ✅ 실시간 오목 모드 및 AI 추가 완료 (무중단 1~4 페이즈 완료) (2026-10-24)
- **Phase 1 코어** (`backend/src/omok/`): `rules.js` 15×15 `boardState`(0 빈칸/1 흑/2 백), `checkWin()` 가로·세로·대각선 2개, 흑은 정확히 5목(6목 이상 장목은 승리 아님·금지), 백은 5목 이상 승리. 렌주룰: 흑 **쌍삼(3-3)·장목 금지**(`forbiddenReason`; 띄운 3(X.XX)도 열린 3 으로 계산, 5목이 완성되는 수는 금지가 아님). `OmokGame.js` 턴 상태 머신(턴·중복·범위 검증, 금지수는 에러 반환하고 턴 유지, 기권, 무승부=판 가득/남은 칸이 전부 흑 금지수). 서버가 유일한 진실.
- **소켓**(`sockets.js`): 방 종류 `omok`(2인, 방 만들기/입장/관전/AI 연습/봇 추가/재접속 복원/연결 끊김 AI 대행 모두 기존 흐름 재사용), `omok:place {x,y}` → `omok:state`/`omok:over`, `TURN_START{game:'omok'}`. 제한 시간 30초(`OMOK_TURN_MS`) 초과 시 AI 가 대신 한 수. 첫 판 흑은 무작위, 다음 판은 진 사람이 흑. 정산 `settleOmok`: 사람 2명이면 진 사람이 참가비를 이긴 사람에게(가진 만큼), AI 연습은 머니·전적 무변동, DB 스키마 변경 없음(Game 기록 `[오목]`).
- **Phase 2 AI** (`OmokBot.js`): 돌 주변 2칸 후보 압축 → 패턴 점수(5목 완성 > 상대 5목 차단 > 내 4 10000 > 상대 열린3·4 방어 9000 > 내 열린3 500 > 상대 2 차단 100) 그리디. 난이도: 쉬움(35% 무작위 실수, 단 이기는 수·5목 차단은 놓치지 않음) / 보통(10% 차선) / 어려움(상위 8후보 × 상대 최선 공격 응수까지 보는 깊이 2). 봇 개성(공격/수비 가중치)·말풍선·난이도 배지 재사용. 시뮬레이션: 어려움>보통>쉬움(어려움 vs 쉬움 35/40, 어려움 vs 보통 28/40, 보통 vs 쉬움 35/40). 한 수 평균 ~2ms, 최대 ~10ms(50ms 이내).
- **Phase 3 UI** (`components/OmokBoard.jsx`): CSS grid 15×15 교차점(가장자리는 반 토막 선), 나무 질감, 화점 5개, 호버·포커스 시 반투명 가이드 돌, framer-motion spring 으로 위에서 '탁' 떨어지는 착수, 마지막 수 붉은 점, 승리 5목 강조, 금지수 에러 안내, 규칙 창(?), 결과 창, 방향키+Enter 착수·aria-label(A1~O15), 모바일 세로/가로 대응. 로비에 ⚪ 오목 탭(4열), 연습 설정·방 만들기·대기실 안내 반영.
- **Phase 4 테스트**: `test/omok.test.js` 29개(`checkWin` 4방향·장목·가장자리, 쌍삼·장목·막힌3·5목 우선, 상태 머신, AI 방어/공격/후보 압축, 난이도 강약, **AI 블로킹 측정**), `test/omok.socket.test.js` 5개(턴 검증·승리 정산·시간 초과 AI 대행·기권·AI 연습·재접속), 프론트 E2E `omok.spec.js`(데스크톱·모바일).
- 검증: 백엔드 23 suites, 오목 포함 전부 통과(전체 실행을 Playwright 와 동시에 돌리면 기존 `heuristic.test.js` 지연 테스트가 부하로 흔들림 — 단독 실행은 통과). 프론트 단위 22, E2E 오목 포함 전부 통과. 스크린샷으로 판 정렬 확인(가장자리 선 위치 버그를 이때 수정).
- 참고: 4-4(쌍사)는 금지하지 않음(요청 범위: 쌍삼·장목). 오목 전적/랭킹/업적은 아직 없음(머니 정산만).

## ✅ 오목 AI 개선 A1~A10 완료 (2026-10-24)
- **A3 캐시/증분** (`omok/rules.js`, `omok/engine.js`): 방향별 9칸 패턴을 `dirInfo` 캐시(3^8 조합), `FastBoard` = 1차원 판 + 5칸 창 점수 증분 갱신(착수/되돌리기 O(20)) + Zobrist 해시 + 돌 주변 2칸 카운터. 규칙 모듈과 금지수 판정이 무작위 국면 3000+개에서 일치함을 테스트.
- **A1 위협 탐색**: `vcf`(4 만 연속으로 두어 이기는 수순, 금지수 자리를 막아야 하는 흑 수비는 불가 처리), `vct`(열린 3 → 상대의 휴리스틱 응수 후보 전부에 VCF 가 남는 수), 상대 VCF 방어(`defend-vcf`), 상대 VCF 를 허용하는 수 제외.
- **A2 탐색**: 반복 심화 알파-베타(깊이 최대 6) + 전치표 + 노드 예산(결정적) + 시간 안전망(어려움 30ms). 한 수 평균 ~10~16ms, 최대 35~47ms.
- **A4 오프닝** (`omok/opening.js`): 백 2수(직접 40%/간접 60%)·흑 3수 변화, 정석 계열 단순화(정식 정석 이름 전부 구현한 것은 아님).
- **A5 쉬움 현실화**: 무작위 착수 대신 "열린 3 을 못 보고 지나치기(blind)" + 상위 4후보 중 선택. 4·5목은 항상 막음(테스트로 확인).
- **A6 성향**: 공격형(atk 1.25, 4-3·3-3 보너스, 검색 동점권에서 공격 수 선호) / 수비형(def 1.35).
- **A7 적응형 난이도**: 연습 설정에 "🎯 자동" — 실력 추정치(0.1~1)를 브라우저에 기억(`omokSkill.js`), 이기면 +0.12 / 지면 −0.12, 서버는 `strength` 연속 파라미터(`paramsFor`)로 봇 생성. 결과 창에 변화 표시.
- **A8 힌트**: 연습 판 전용 `omok:hint`(판당 3번, 내 차례에만, 실전 거절), 💡 버튼/H 키, 추천 칸 점멸.
- **A9 복기 분석** (`omok/analysis.js`): 결과 창 "🔍 AI 복기 분석" → 수 직전 국면의 최선 수와 실제 수의 탐색 값 비교, 실수(blunder)/악수(mistake) 태그·정확도·추천 수. 수마다 setImmediate 양보로 이벤트 루프를 막지 않음. 기보 저장(C6) 없이 결과 payload 의 수순을 사용(서버가 규칙대로 재생해 검증, 동시 1건).
- **A10 강도 회귀** (`scripts/omok-strength.mjs`, `test/omok.engine.test.js`): 선후공 교대 매트릭스 스크립트 + 테스트(보통 vs 쉬움 18-0-2, 어려움 vs 보통 20-0-0, 어려움 vs 쉬움 12-0-0, strength 0.3<0.6<1.0). 모든 난이도×성향 조합 합법성 검사.
- 발견·수정: 흑이 막아야 할 칸이 금지수인 국면에서 엔진이 불법 수를 반환하던 문제(시뮬레이션에서 발견) → 막을 수 없는 경우 다른 경로로.
- 검증: 백엔드 24 suites / 1551 tests 전체 통과, 프론트 단위 22, E2E 17 통과(1 skip). 사용: `node backend/scripts/omok-strength.mjs 20 easy,normal,hard` (strength 숫자도 가능: `0.3,0.6,1`).

## ✅ 오목 나머지 개선 항목 전부 완료 (OMOK_TODO.md 의 C·U·Q)
**게임 코어 (C)**
- **C1 쌍사(4-4) 금지**: `rules.js` 의 방향별 요약에 '4 의 개수'(`four`)를 추가. 한 줄에 서로 떨어진 4 가 둘이면(X.XXX.X) 4-4, 연속 4(열린 4)는 하나. 5목 완성은 금지 아님. 엔진(`FastBoard.isForbiddenBlack`)도 같이 맞춤. *미구현*: '금지 자리가 상대 4 를 막는 경우' 같은 재귀적 예외(렌주 정석의 세부)는 단순화.
- **C3 무르기·기권**: `omok:undo`(AI 연습은 즉시·판당 3번, 실전은 요청→상대 `omok:undoReply` 수락/거절, 사람당 판당 2번, 15초 무응답 시 거절, 자리 비운 상대에겐 불가, 요청 중 착수하면 취소) / `omok:resign`(방에 남은 채 패배). `OmokGame.undo(pid)`: 상대가 뒤에 뒀으면 두 수를 함께 되돌리고 내 차례.
- **C4 한 판 더**: 결과 창 "🔁 한 판 더"(Enter/R) = 결과를 닫고 바로 준비. (닫기 → 준비 순서여야 새 판의 상태를 지우지 않음)
- **C5 전적·업적·랭킹**: 컬럼 `ogGames/ogWins/ogLosses/ogStreak/ogBestStreak/ogBotWins/ogFastWin`(마이그레이션 `20261029000000_omok_stats`, 기존 `[오목]` 기록에서 승패 이관). 실전만 전적·연승, AI 승리는 연습 포함. 업적 6개(첫 승·3연승·5연승·AI 사냥꾼 10승·속전속결 25수 이내·장기전 100수 이상). 로비 랭킹 "⚪ 오목" 탭, 프로필 오목 탭, `/ranking?game=omok`. *변경*: '역전승' 대신 '100수 장기전 승리'.
- **C7 시간 선택**: 방 만들기/연습에서 수당 10·30·60초 선택(`room.turnSec`, 목록·방 상태에 노출). *미구현*: 총 시간제.
- **C8 초읽기**: 내 차례 5초 이하 매초 삑 + 진동(`urgent`).
- **C9 중복 착수 방지**: `omok:place` 의 `rid`(요청 id) — 같은 id 가 다시 오면 한 번만 처리하고 `{ok, dup}`. 클라이언트는 응답 없음(8초)이면 같은 rid 로 한 번 재전송.

**UI (U)**
- **U1 금지수 ✕**: 서버가 흑 차례의 금지 칸 목록을 view 에 실어 보냄(클라이언트에 판정 로직 중복 없음). 눌러도 거절 메시지.
- **U2 착수 확인**: 설정 '자동(터치 기기만)/항상/끔'. 탭 → 미리보기(점멸 링) → 한 번 더 탭 또는 "✔ H8 에 두기".
- **U3 좌표** A~O / 1~15(설정으로 끔), **U4 승리 연출** 5목 선 긋기(SVG pathLength 애니메이션)·컨페티(움직임 줄이기 설정 존중), **U5 착수음** 흑/백 음색이 다른 '딱', **U6 판 테마(나무/대리석/다크)·돌 스킨(기본/유리/단색)**, **U7 수 번호**(끔/최근 3수/전부), **U8 위협 표시**(열린 3·4 를 '3'/'4' 배지, 내 것 파랑·상대 빨강 — 서버 `threatCells`), **U9 확대/축소**(버튼·핀치, 확대 중심 유지), **U10 결과 창** 총 수·소요 시간·한 판 더, **U11 첫 판 안내**(`OnceHint`), **U12 접근성** 굵은 포커스 링·Home/End·읽어 주는 live 영역·셀 라벨에 금지/위협/수 번호, **U13 오목 전용 이모티콘**(서버 `OMOK_EMOTES`).

**품질·운영 (Q)**
- **Q1 룰 퍼저** `test/omok.fuzz.test.js`: 무작위 판 2만 개에서 서버 금지수 판정을 독립 브루트포스와 비교. **실제 버그 발견·수정**: 줄 검사 창이 ±4(9칸)라 '4 가 열린 4 인지/장목인지'를 가르는 바깥 칸(±5)을 못 봐서 드물게 오판(가짜 쌍삼, 장목 놓침) → 창을 ±5(11칸)로 확대(규칙·엔진 모두).
- **Q2 E2E**: 실전 2인(두 브라우저) 금지 ✕·거절 메시지·5목 승리 선/컨페티·한 판 더, 보조기능(좌표·번호·무르기·확대·테마), 기권→결과→한 판 더. 모바일(확인 탭)에서도 통과하도록 헬퍼.
- **Q3 AI 워커**: `omok/aiPool.js`+`aiWorker.js` — 착수·힌트·복기 분석을 워커 스레드에서 계산(메인 소켓 스레드 비차단). 워커 실패/4초 초과/`OMOK_WORKER=0` 이면 같은 스레드에서 계산(폴백). 계산 중 상황이 바뀌면(착수·무르기·종료·방 폐쇄) 결과를 버림.
- **Q4 메모리 정리**: 판이 끝나면 `brains/hintsUsed/undosUsed/lastRid/undoAsk` 비움, 닫힌 방엔 타이머/AI 착수 안 걸림(테스트), 워커는 서버 종료 시 정리.
- **Q5 지표**: `GET /api/metrics/omok` — 게임 수(실전/연습)·종료 방식·평균 수·시간 초과율·무르기 집계·AI 연산 평균/최대 ms (집계 수치만, 메모리 기반이라 재시작하면 초기화).

## ✅ 실시간 가족 윷놀이 모드 추가 완료 (무중단 1~4 페이즈 완료)
- **Phase 1 윷판·룰 엔진** (`backend/src/yut/board.js`, `YutGame.js`): 29개 칸 방향성 그래프(바깥 0~19 + 지름길 20~28). `step/forward` 가 분기를 정한다 — 모서리(5·10)·방(22)에서 **출발**할 때만 대각선, 지나치기만 하면 바깥 길(방을 지나칠 땐 가던 대각선 유지, 방에서 출발하면 곧장 도착 쪽 27→28). 말은 `trail`(밟은 길)을 가져 빽도가 온 길을 그대로 되짚는다. 윷가락 4개 던지기(평면 확률 0.6 → 도 11.5 · 개 34.6 · 걸 34.6 · 윷 13 · 모 2.6 · 빽도 3.8 %, 0번 가락이 빽도 표시). 던진 결과는 `pending` 에 쌓여 말에 나눠 쓴다. `extraTurn` = 윷·모·잡기로 얻은 추가 던지기.
- **Phase 2 업기·잡기·승리**: 같은 칸의 같은 팀 말은 한 덩어리(최대 4, 함께 이동·도착), 도착 칸의 상대 말은 모두 대기실로 + 추가 던지기, 지나치기만 한 칸은 잡지 않음. 한 팀 4개 도착 시 종료. 기권/퇴장은 팀원이 남으면 계속(AI 대신), 팀 전원이 나가면 상대 승리.
- **서버 연동** (`sockets.js`, `settle.js`): 방 종류 `yut`(2~4인, 방 순서대로 청·홍 번갈아). 이벤트 `yut:start/state/over`, `yut:throw`, `yut:move`. 한 단계당 30초(`YUT_TURN_MS`) 시간 초과·봇·끊김은 `YutBot` 이 대신(잡기>도착>업기>지름길>전진, 위험 감점, 난이도별 잡음). 정산 `settleYut`: 진 팀 참가비를 모아 이긴 팀이 균등 분배(연습 판은 무변동). 재접속 스냅샷·결과 보관 포함.
- **Phase 3 UI** (`YutBoard.jsx`, `yut.js`): 정사각 윷판 SVG 선 + 칸 버튼(퍼센트 좌표), 청🔵/홍🔴 말, 업힌 말 `x2` 배지, 대기·도착 트레이. 던지기 팝업: 4개 윷가락이 3D 회전하며 튀어올라 앞/뒤로 떨어지고 결과 글자가 스프링으로 등장. 말 이동: 길을 따라 한 칸씩 '통, 통' 점프(`lastMove.path`), 잡히면 이동이 끝난 뒤 대기실로. 결과 칩 선택 → 말 선택(목적지 칸 점멸) → 한 번 더 누르면 이동. 움직임 줄이기 설정 존중, T 키 던지기, 규칙 창(?), 이모티콘, 관전.
- **Phase 4 테스트**: `test/yut.test.js` 31개(그래프·분기·방/모서리 진입, 확률 분포, 던지기 보너스 누적, 업기 4개, 잡기+추가 턴, 도착 칸만 잡기, **빽도**: 말 없음/도(1)에서 막힘 → 소멸, 되짚기·지름길·방·업힌 말·잡기, 승리·기권, 2:2 순서, 봇 대국 2·3·4인×난이도 불변식), `test/yut.socket.test.js` 6개(턴 검증→끝까지→정산, 시간 초과 대행, 2:2 퇴장, 기권, AI 연습, 재접속), 프론트 E2E `yut.spec.js`(데스크톱·모바일).
- 검증: 백엔드 28 suites / 1613 tests(전체를 한꺼번에 돌리면 기존 `sockets.test.js` 4인 교대 테스트가 부하로 1회 흔들렸고 단독 3회 통과), 프론트 단위 22, E2E 전체 통과. 스크린샷으로 판·팝업·말 배치 확인.
- 결정/한계: **빽도는 도(1)에 있는 말·대기 말에겐 쓸 수 없음**(대기실로 돌아가지 않음), 쓸 수 있는 말이 없으면 결과가 소멸하고 차례 종료. 중앙(방)에서 출발하면 항상 27→28 지름길(공식 규칙의 일반형). 선(先)은 방장. 윷놀이 전적/랭킹/업적은 없음(머니 정산만, DB 변경 없음).
- 같이 고친 것: 오목 다크 테마 판을 밝은 슬레이트로(흑·백 돌 구분), 그에 맞춰 E2E 기대값 갱신, 오목 연습 E2E 의 결과 창 경합 보정.
