# PROGRESS.md — 프로젝트 현재 상태

> 새 세션: `claude.md` → 이 파일 → `TODO.md` 순으로 읽는다. 이 문서는 **연대기가 아니라 현재 상태**를 적는다(작업 후 해당 섹션을 고쳐 쓰고, 낡은 내용은 지운다).

## 0. 한눈에 보기
- **상태**: 5개 게임 모두 구현·배포 가능 상태. 마지막 작업 = 고스톱 국진(9월 술잔) 열끗/쌍피 선택 (**미커밋** — 아래 §3 고스톱). 마지막 커밋 `baf05c5`(윷놀이).
- **테스트**: 백엔드 Jest 28 suites / 1615 tests / 프론트 Vitest 22 / Playwright E2E ~20(오목·윷놀이 포함, 1 skip). 마지막 전체 실행 결과는 §8.
- **게임**: 고스톱(2~4인) · 섯다(2~4인) · 슬롯머신(1인, REST) · 오목(2인) · 윷놀이(2~4인 팀전). 모두 AI 봇/연습·관전(슬롯 제외)·재접속 복구 지원.
- **서버**: 포트 4000, `frontend/dist` 정적 서빙. 로그는 `server.log`(git 제외).

## 1. 저장소 구조
```
backend/src/
  app.js index.js config.js db.js auth.js events.js rateLimit.js   # Express·Prisma·인증(JWT)·레이트 리밋
  sockets.js        # 방/로비/채팅/모든 게임의 소켓 이벤트, 타이머, 봇 스케줄, 재접속 (가장 큰 파일)
  settle.js stats.js bots.js slot.js slotMath.js
  game/   cards.js score.js GostopGame.js AiPlayer.js HeuristicBot.js
  seotda/ rules.js SeotdaGame.js SeotdaBot.js
  omok/   rules.js engine.js OmokGame.js OmokBot.js opening.js analysis.js aiPool.js aiWorker.js metrics.js
  yut/    board.js YutGame.js YutBot.js
backend/prisma/schema.prisma + migrations/ (7개)      backend/scripts/omok-strength.mjs
backend/test/*.test.js (+ helpers/db.js: 임시 SQLite)
frontend/src/ store.jsx(소켓·프레임 재생기) App.jsx games.js settings.js sound.js keys.js lazy.js pwa.js yut.js omokSkill.js cards.js
  components/ Auth Lobby Room GameBoard(고스톱) SeotdaBoard OmokBoard YutBoard SlotMachine Profile Settings Tutorial
              Card Avatar Chat Emote GostopHelp JokboHelp SoundToggle TurnTools ComingSoon Loading options.js seotdaJokbo.js
frontend/test/{unit,e2e}   frontend/public/{bgm.mp3,bots/*.svg,icons,sw.js,manifest.webmanifest,...}
pics/  (화투패 48장)
```

## 2. 공통 아키텍처
- **서버 권위 + 프레임 방식**: 엔진 액션은 `{ok, frames, error}`. `frames` = 단계별 스냅샷 → `emitFrames` 가 `game:frames` 로 보내고, 클라(`store.jsx`)가 큐에 넣어 650ms(배너 1100ms) 간격으로 재생(재생 중 입력 잠금, `game:start` 마다 epoch 증가로 이전 재생 취소). `viewOf(snapshot, viewer)` 가 상대 패를 숨김.
- **방**: 종류 `gostop | seotda | omok | yut`(`room:create {game}`). 상태 키는 `userId`(socket.id 비의존). 방장·준비·옵션·봇 추가/제거·관전(최대 8, 가득 찼거나 진행 중일 때만, 조작 전부 서버 차단)·이모트(`SEND_EMOTE`, 허용 목록만).
- **재접속**: 끊겨도 `RECONNECT_GRACE_MS`(60초) 동안 자리 유지, 끊긴 사람 차례는 즉시 AI 가 대행하고 돌아오면 넘겨받음. 유예 후에도 판 중엔 기권시키지 않고 판 종료 후 퇴장(`leaveAfterGame`). 재접속 시 `SYNC_BOARD_STATE`({room, chat, view, over, ranked, serverTime, 게임별 스냅샷}) 전송.
- **차례 제한 시간**: 고스톱 30초(`GOSTOP_TURN_MS`)·섯다 40초·오목 30초(`OMOK_TURN_MS`, 방별 10/30/60초 선택)·윷놀이 30초(`YUT_TURN_MS`). 초과 시 AI 대행, 연속 2회 초과면 자동 진행(`players[].auto`, `room:auto {on}`). `TURN_START {game,userId,deadlineAt,auto}` 방송.
- **경제/정산**: `settle.js` — `settleGame`(고스톱 다자 `payments`), `settleSeotda`(순증감 `net`), `settleOmok`, `settleYut`. 전부 Prisma 트랜잭션, 패자 잔고 한도(비율 분배·1원 보존), `isBot` 계정은 한도 없이 지불·불변, `ranked=false`(연습)면 DB 무변경. `isRankedRoom`: 사람 ≥2 → 실전, 사람 1명(+봇) → 연습.
- **봇**(`bots.js`): DB 더미 `AI봇N`(`isBot`, 로그인 불가) + 개성 8종(이름 `AI ○○`·아바타·공격/균형/수비 성향·상황별 말풍선, 봇당 6초 쿨다운). 난이도 easy/normal/hard(`room:practice {game,level,bet,skill?,turnSec?}`, `room:addBot {level}`), 사람 대행은 항상 hard. 지연은 `BOT_DELAY_SCALE`(테스트 0).
- **프로필/통계**: `User.nickname`(unique)·`avatar`(`UPLOAD_DIR`, 2MB, 매직바이트 검증, SVG 거부). 출석 +10,000(KST 하루 1회)·개평 +30,000(잔액 ≤10,000, 하루 3회). 업적/대표 칭호(`stats.js ACHIEVEMENTS`), 게임별 랭킹 `GET /api/auth/ranking?game=money|gostop|seotda|omok`.
- **보안**: production 에서 `JWT_SECRET` 필수, 로그인 1분 10회/가입 1시간 5회 IP 레이트 리밋(`LOGIN_RATE_MAX`·`REGISTER_RATE_MAX`, 0=끔, 프록시 뒤면 `TRUST_PROXY=1`). 같은 공인 IP 여러 명 가입 시 가입 제한에 걸릴 수 있음.
- **프론트**: 게임판은 lazy chunk(`lazy.js lazyNamed`, 옛 청크 404 시 1회 새로고침), 서버는 `/assets` 1년 immutable·index.html/sw.js no-cache. PWA(운영 빌드에서만 SW 등록). 설정(`settings.js`): 음량·연출 속도·카드 크기·진동·단축키·오목 옵션 등 localStorage. 접근성: aria-label·키보드(`keys.js data-hotkey`: 숫자 선택, D/G/S/Y/N/C/H/B/T/V/R/?)·`reducedMotion`. `backdrop-blur` 는 성능 문제로 쓰지 않는다.

## 3. 게임별 상태

### 고스톱 (`game/`)
- **엔진** `GostopGame`: 2~4인(2인 10장·7점 / 3·4인 7장·3점, 4인은 1명 쉼 `rest`+연속 쉬기 금지 교대 `pickRest`). 뻑/자뻑/따닥/쪽/싹쓸이/폭탄/흔들기/고(1고+1·2고+2·3고부터 ×2^(n-2))/스톱/나가리(이월 ×2 옵션), 광·피·멍·고박, 독박(고박 대납·쇼당 받음), 쇼당(3인·두 상대 모두 기준 이상·판당 1회·둘 다 수락해야 나가리), 기리 연출(`game:start.cutter`), 광팔기(3·4인, 광 1장당 2점), 총통 옵션, 보너스패(id 48·49, 쌍피) 옵션, 밤일낮장 선 정하기(`decideFirst`). 방 옵션 `{bonus, ppeokPay, chongtong, ttibak, nagariCarry}`. 마지막 패에선 따닥·쪽·싹쓸이 불인정. 결과 `payments=[{kind,from,to,total,mult,tags}]`, `result.stats`·`result.baks`.
- **국진 선택(미커밋)**: 9월 술잔(id 32, `dual`)은 열끗/쌍피 중 선택. `gukjin[pid] = 'auto'|'yeol'|'pi'`(기본 auto = 유리한 쪽), 판 끝나기 전까지 `setGukjin` 으로 변경, 소켓 `game:gukjin {mode}`(턴 진행 없이 스냅샷만 방송). 점수·고/스톱·피박(`loserPiCount`)·쇼당 판정 모두 선택값 사용. UI: 먹는 순간 1회 선택 모달 + 내 점수줄 🍶 칩(auto→pi→yeol 순환). 봇은 auto. **소켓 이벤트·모달은 자동 테스트/육안 확인 안 함**.
- **AI**: `AiPlayer`(룰 기반: 폭탄>뻑 먹기>매칭 가치>버리기, 고/스톱 임계 규칙), `HeuristicBot`(카운팅+EV, hard). easy = AiPlayer+실수 40%, normal = +12%.
- **UI**: 짝 맞는 패 강조(+🔗), 같은 달 묶음 겹침, 획득패 그룹, 족보 완성 팝업·효과음, 족보 비상 배지/팝업(`nearCombos`, 피·멍·띠 제외), 규칙 도움말(❓), 정산 연출(순차 누적), 기리 연출, 타이머/자동 진행 토글, 관전·끊김 안내. 보너스패 렌더는 육안 검증 못 함.
- 미구현: 3피 표시 카드, 4~6인 '장' 단계, 연속 쉬기 외 세부. 요청서 모호 해석: 뻑 점수 환산 `ppeokPay`(첫뻑 3·연뻑 6·삼연뻑 종료).

### 섯다 (`seotda/`)
- 20장 덱(1~10월 ×2), `evaluateHand`/`compareHands`(삼팔광땡>광땡>땡>알리~세륙>갑오>끗>망통, 암행어사·땡잡이·구사 재경기·멍텅구리구사=4월+9월 열끗(id 32)). 베팅: 참가비→2장→`die/call/half/bbing/ddadang`, **올인·사이드팟**(`result.pots`), 구사 재경기 팟 이월, 동점 시 **묻고 더블** 투표(`SEOTDA_VOTE_MS` 15초, 전원 동의 시 동점자끼리 판돈 2배). 시간 초과=체크/다이.
- 이벤트: `seotda:act`, ← `seotda:start/state/over/tieVote/tieResult`, `SHOW_DOWN`. 전적 `sdWins/sdLosses/sdGames`+스탯, 업적 8종.
- `SeotdaBot`: 상대 2장 조합 전수 승률 vs 팟 오즈, 성향·난이도(easy 헤픈 콜 / normal 15% 실수 / hard 압박·가치 베팅·허세 절제). 연습 시 사람 칩 최소 `ante*50` 보장, 실전 시 봇은 가상 잔액 1천만.
- UI: 카드 배분 연출, 쪼기(`SqueezeCard`), 순차 쇼다운, 칩 이동, 베팅 버튼 금액, 접이식 판 기록, 족보 도움말(`JokboHelp`). 묻고 더블 모달·사이드팟 결과는 브라우저 육안 확인 못 함(소켓 테스트로만 검증).

### 슬롯머신 (`slot.js`, `slotMath.js`)
- REST: `GET /api/slot/status`, `POST /api/slot/spin`(500원, 하루 베팅합 10,000 한도·KST 초기화, 유저별 직렬 큐). **이론 RTP 95.0%**: 요청서 확률표가 RTP 155% 라 배당은 유지하고 확률만 조정(`SLOT_TIERS`, 0.5%/2%/8%/31%). 소켓 푸시 없음(연출 후 머니 반영). 프론트 `SlotMachine.jsx`(3릴 순차 정지, 잭팟 파티클).

### 오목 (`omok/`)
- 15×15 렌주룰: 흑 쌍삼·쌍사(4-4)·장목 금지, 백은 5목 이상. **알려진 단순화**: 금지 자리가 상대 4를 막는 경우 같은 재귀 예외 미구현, 총 시간제 미구현. 룰 퍼저(`omok.fuzz.test.js`)로 독립 브루트포스와 대조(창 ±5 버그 수정 이력).
- AI `OmokBot`+`engine.js`: FastBoard(증분 패턴 점수·Zobrist), VCF/VCT, 반복 심화 알파-베타(깊이 ≤6, 전치표, 노드 예산+시간 안전망), 오프닝북, 쉬움=열린 3 놓치기, 성향 가중, 적응형 난이도(`strength`, 실력 추정치는 브라우저 `omokSkill.js`), 힌트(연습 판당 3번 `omok:hint`), 복기 분석(`omok:analyze`, 수순 재생 검증). 계산은 워커 스레드(`aiPool.js`, 실패/4초 초과/`OMOK_WORKER=0` 이면 동일 스레드 폴백).
- 이벤트: `omok:place {x,y,rid}`(rid 중복 방지), `omok:undo/undoReply`(연습 즉시·3번, 실전 요청→수락, 사람당 2번, 15초 무응답=거절), `omok:resign`, → `omok:start/state/over`. 첫 흑 무작위, 이후 진 사람이 흑. 정산: 진 사람이 참가비를 이긴 사람에게.
- 전적 `ogGames/ogWins/ogLosses/ogStreak/ogBestStreak/ogBotWins/ogFastWin`, 업적 6개. 지표 `GET /api/metrics/omok`(메모리, 재시작 시 초기화).
- UI `OmokBoard.jsx`: 금지수 ✕(서버가 view 에 목록 제공), 착수 확인(모바일), 좌표·수 번호, 위협 표시, 테마(나무/대리석/다크=밝은 슬레이트)·돌 스킨, 확대/핀치, 5목 선·컨페티, 초읽기 경고, 결과 창(한 판 더·복기), 오목 전용 이모트.

### 윷놀이 (`yut/`)
- 29칸 방향 그래프(바깥 0~19+지름길 20~28): 모서리(5·10)·방(22)에서 **출발**할 때만 대각선, 지나치기만 하면 바깥 길. 말은 `trail` 을 가져 빽도가 온 길을 되짚음. 윷가락 4개 확률(평면 0.6; 도 11.5·개 34.6·걸 34.6·윷 13·모 2.6·빽도 3.8%), `pending` 에 쌓아 말에 나눠 씀, 윷·모·잡기=추가 던지기. 업기(최대 4)·잡기(도착 칸만)·4개 도착 시 종료. 방 순서대로 청/홍 번갈아 팀, 선=방장.
- 결정: 빽도는 도(1)·대기 말에겐 쓸 수 없고 쓸 말이 없으면 소멸; 중앙(방) 출발은 항상 27→28.
- 이벤트: `yut:throw`, `yut:move`, → `yut:start/state/over`. 정산 `settleYut`(진 팀 참가비를 이긴 팀이 균등 분배). `YutBot`(잡기>도착>업기>지름길>전진). 전적/랭킹/업적 **없음**(머니 정산만).
- UI `YutBoard.jsx`: SVG 윷판, 3D 윷가락 던지기, 말 이동 애니메이션, 결과 칩→말 선택→이동 확정.

## 4. DB (Prisma/SQLite, 마이그레이션 7개)
- `User`: 머니·`wins/losses`(고스톱 전용)·`isBot`·프로필(`nickname`,`avatar`)·고스톱 스탯(`statGames, goCount, ...`)·`achievements`(JSON 문자열)·`title`·출석/개평(`lastLoginAt, gaepyeongDate/Count`)·슬롯(`dailySlotSpent, lastSlotPlayedAt`)·섯다(`sd*`)·오목(`og*`). `Game(roomName, betPerPt, playerCount, nagari, detail)`, `GameResult(gameId,userId,outcome,moneyDelta)`.
- 윷놀이는 스키마 변경 없음. 마이그레이션 적용: `cd backend && npx prisma migrate deploy`. 실제 DB 는 `backend/prisma/dev.db`(git 제외) — **테스트에 쓰지 말 것**.

## 5. 소켓/REST 요약
- 클→서: `room:create/join/leave/ready/options/spectate/practice/addBot/removeBot/auto`, `sync`, `lobby:chat`, `room:chat`, `SEND_EMOTE`, `game:play/choose/go/stop/sellGwang/passGwang/chongtong/passChongtong/shodang/shodangAnswer/gukjin`, `seotda:act/tieVote`, `omok:place/undo/undoReply/resign/hint/analyze`, `yut:throw/move`.
- 서→클: `lobby:rooms`, `room:joined/state/left`, `room:chat`, `game:start/frames/over`, `seotda:*`, `omok:*`, `yut:*`, `TURN_START`, `SHOW_DOWN`, `SYNC_BOARD_STATE`, `BROADCAST_EMOTE`, `achievement:unlocked`, `me:update`, `player:offline|online`.
- REST: `/api/auth/{register,login,me,records,ranking,profile,avatar,stats,achievements,title,checkin,gaepyeong}`, `/api/slot/{status,spin}`, `/api/metrics/omok`, `/api/health`.

## 6. 환경변수
`PORT`(4000) · `DATABASE_URL` · `JWT_SECRET`(production 필수) · `NODE_ENV` · `UPLOAD_DIR` · `RECONNECT_GRACE_MS` · `GOSTOP_TURN_MS` · `OMOK_TURN_MS` · `YUT_TURN_MS` · `SEOTDA_VOTE_MS` · `BOT_DELAY_SCALE` · `OMOK_WORKER` · `LOGIN_RATE_MAX` · `REGISTER_RATE_MAX` · `TRUST_PROXY` · (E2E) `E2E_PORT`, `PW_CHROMIUM`, `BACKEND_URL`(vite 프록시).

## 7. 알려진 한계 / 주의
- 육안 미검증: 고스톱 보너스패 렌더, 섯다 묻고 더블 모달·사이드팟 결과, 3인 이상 섯다 순차 공개, **국진 선택 모달/🍶 칩**.
- 자동 테스트 없는 부분: 소켓 `game:gukjin`.
- 봇 강도: HeuristicBot 은 AiPlayer 대비 근소 우위(2000판 승률 ~51%). 오목 어려움은 보통 20-0, 쉬움 12-0(회귀 테스트로 고정).
- 부하 시 불안정 테스트 2건은 `claude.md` §3 참고.
- 메트릭은 메모리 기반(재시작하면 초기화).

## 8. 마지막 검증 기록
- 2026-10-24 세션 종료 시점: 백엔드 `npm test` 전체 **28 suites / 1615 tests 통과**(국진 변경 포함). 프론트 `vite build` 성공. Vitest·Playwright E2E 는 국진 변경 후 전체 재실행하지 않음(Vitest 는 실패 없이 종료, E2E 미실행).
- 실서버(4000)는 국진 변경 반영해 재시작됨.

## 9. Next Step
- `TODO.md` 참고. 대기 중인 사용자 결정: (a) 국진 선택 변경분 커밋 여부, (b) 윷놀이 개선 목록(32개 제안, 파일로 저장 안 됨) 저장/구현 여부, (c) `TODO.md` 5번 섹션(로비·소셜) 착수 여부.
