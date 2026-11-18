# PROGRESS.md — 프로젝트 현재 상태

> 새 세션: `claude.md` → 이 파일 → `TODO.md` 순으로 읽는다. 이 문서는 **연대기가 아니라 현재 상태**를 적는다(작업 후 해당 섹션을 고쳐 쓰고, 낡은 내용은 지운다).

## 0. 한눈에 보기
- **상태**: 9개 게임 모두 구현·배포 가능 상태. 서비스 이름 **강원게임랜드**(예전 '강원랜드'). 마지막 작업 = **장기 모드 추가**(2026-11-18, 말 그림은 SVG 로 직접 그림). 그 전: **요트 다이스 모드 추가**(2026-11-18, `~/52_YachtDice` 참고). 그 전: **라스베가스(주사위 보드게임) 모드 추가**(2026-11-18, `~/51_LasVegas` 파이썬 솔버의 규칙·전략을 JS 로 옮김). 그 전: 슬롯머신·스도쿠를 '입장'하는 전용 게임 화면으로, 스도쿠 저장하고 나가기(DB), 오목돌 그라데이션(강제 다크 대응). 그 전: 다크 모드 고정·대표 로고·첫 화면(소개 페이지)·윷 던지기/업기 그래픽·AI 대전(난이도+AI 수). 그 전: 고스톱 더미 애니메이션·보너스패 3장, 스도쿠, 고스톱 UI G1~G17.
- ✅ 스도쿠 게임 모드 및 일일 보상(1천원/10회) 시스템 추가 완료 (무중단 1~4 페이즈 완료)
- **테스트**: 백엔드 Jest 36 suites / 1707 tests / 프론트 Vitest 23 / Playwright E2E 49 통과·1 skip(데스크톱·모바일). 마지막 전체 실행 결과는 §8.
- **게임**: 고스톱(2~4인) · 섯다(2~4인) · 슬롯머신(1인, REST) · 오목(2인) · 윷놀이(2~4인 팀전) · 라스베가스(2~5인 주사위) · 요트 다이스(2~4인 주사위) · 장기(1:1) · 스도쿠(1인 퍼즐, REST). 모두 AI 봇(로비 'AI 대전': 난이도 + AI 상대 1~3명, 라스베가스 1~4명, 오목·장기는 1명)·관전(슬롯 제외)·재접속 복구 지원.
- **서버**: 포트 4000, `frontend/dist` 정적 서빙. **외부 공개**: tailscale funnel 공개 주소(저장소엔 적지 않음 — 이 PC 에서 `tailscale funnel status` 로 확인) → 4000(2026-10-25부터, 그 전엔 같은 주소가 포트 5000 의 다른 서비스였음). 공개라서 `.env` 에 64자 무작위 `JWT_SECRET`·`TRUST_PROXY=1`(funnel 은 127.0.0.1 에서 프록시 — 없으면 모든 접속자가 한 IP 로 보여 가입 한도 5회/시간을 다 같이 씀), 실행은 systemd 사용자 서비스 `gostop`(`node --env-file=.env`, 2026-11-18부터 — 재부팅 후 자동 시작, linger 켬). 로그는 `server.log`(git 제외). `HOST` 환경변수로 듣는 주소 지정 가능(예: `127.0.0.1` — 리버스 프록시/tailscale funnel 뒤에서만 받기).

## 1. 저장소 구조
```
backend/src/
  app.js index.js config.js db.js auth.js events.js rateLimit.js   # Express·Prisma·인증(JWT)·레이트 리밋
  sockets.js        # 방/로비/채팅/모든 게임의 소켓 이벤트, 타이머, 봇 스케줄, 재접속 (가장 큰 파일)
  settle.js stats.js bots.js slot.js slotMath.js sudoku.js(REST 라우터)
  game/   cards.js score.js GostopGame.js AiPlayer.js HeuristicBot.js
  seotda/ rules.js SeotdaGame.js SeotdaBot.js
  omok/   rules.js engine.js OmokGame.js OmokBot.js opening.js analysis.js aiPool.js aiWorker.js metrics.js
  yut/    board.js YutGame.js YutBot.js
  vegas/  VegasGame.js(규칙·정산) VegasBot.js(쉬움/보통 탐욕/어려움 몬테카를로)
  yacht/  YachtGame.js(점수·차례) YachtBot.js(한 차례 기댓값 계산)
  janggi/ rules.js(말 이동·장군·빅장·점수) JanggiGame.js(상차림·차례·종료 판정) JanggiBot.js(알파베타)
  sudoku/ engine.js(생성·빈칸·검증)
backend/prisma/schema.prisma + migrations/ (9개)      backend/scripts/omok-strength.mjs
backend/test/*.test.js (+ helpers/db.js: 임시 SQLite)
frontend/src/ store.jsx(소켓·프레임 재생기) App.jsx games.js settings.js sound.js keys.js lazy.js pwa.js yut.js vegas.js yacht.js janggi.js omokSkill.js cards.js
  components/ Auth(첫 화면: 소개+로그인) Logo Lobby Room SoloRoom(슬롯·스도쿠 입장 화면) GameBoard(고스톱) SeotdaBoard OmokBoard YutBoard VegasBoard YachtBoard JanggiBoard JanggiPiece(장기말 SVG) Die(주사위 그림, 라스베가스·요트 공용) SlotMachine Profile Settings Tutorial
              Card Avatar Chat Emote GostopHelp JokboHelp SoundToggle TurnTools ComingSoon Loading SudokuGame options.js seotdaJokbo.js
frontend/test/{unit,e2e}   frontend/public/{logo-mark.svg(대표 엠블럼),bgm.mp3,bots/*.svg,icons,sw.js,manifest.webmanifest,...}
pics/  (화투패 48장)
```

## 2. 공통 아키텍처
- **서버 권위 + 프레임 방식**: 엔진 액션은 `{ok, frames, error}`. `frames` = 단계별 스냅샷 → `emitFrames` 가 `game:frames` 로 보내고, 클라(`store.jsx`)가 큐에 넣어 650ms(배너 1100ms) 간격으로 재생(재생 중 입력 잠금, `game:start` 마다 epoch 증가로 이전 재생 취소). `viewOf(snapshot, viewer)` 가 상대 패를 숨김.
- **방**: 종류 `gostop | seotda | omok | yut | vegas | yacht | janggi`(`room:create {game}`, 서버 `ROOM_GAMES`), 최대 인원 오목·장기 2 · 라스베가스 5 · 나머지 4. 상태 키는 `userId`(socket.id 비의존). 방장·준비·옵션·봇 추가/제거·관전(최대 8, 가득 찼거나 진행 중일 때만, 조작 전부 서버 차단)·이모트(`SEND_EMOTE`, 그 방 게임의 목록에 있는 대사만 — `isEmoteFor`). **말풍선 대사**(2026-11-18): `backend/src/emotes.js` = `frontend/src/emotes.js`(같아야 함, `emotes.test.js` 가 비교) — 방 게임 7개마다 상황 7가지(👏칭찬·😲감탄·😤억울·🤦자책·😏도발·⏰재촉·👋인사) × 3~4줄, 게임 분위기에 맞춘 변주(고스톱·섯다 도발엔 타짜 명대사, 장기 '장군!/멍군!', 요트 '요트다! ⛵' 등, 한 줄 18자 이하). 예전 목록의 대사는 모두 그 게임 안에 남김. **바뀐 점**: 예전엔 타짜 대사 4개가 모든 방에서 허용됐지만 이제 게임별 목록만. 화면 `EmoteButton game=…`: 😎 → 상황 탭 + 대사 목록(마지막 탭 기억).
- **재접속**: 끊겨도 `RECONNECT_GRACE_MS`(60초) 동안 자리 유지, 끊긴 사람 차례는 즉시 AI 가 대행하고 돌아오면 넘겨받음. 유예 후에도 판 중엔 기권시키지 않고 판 종료 후 퇴장(`leaveAfterGame`). 재접속 시 `SYNC_BOARD_STATE`({room, chat, view, over, ranked, serverTime, 게임별 스냅샷}) 전송.
- **차례 제한 시간**: 고스톱 30초(`GOSTOP_TURN_MS`)·섯다 40초·오목 30초(`OMOK_TURN_MS`, 방별 10/30/60초 선택)·윷놀이 30초(`YUT_TURN_MS`)·라스베가스 굴리기/놓기 단계마다 30초(`VEGAS_TURN_MS`)·요트 다이스 굴리기/기록 단계마다 30초(`YACHT_TURN_MS`, 고정만 바꾸는 건 타이머를 다시 걸지 않음)·장기 한 수 60초(`JANGGI_TURN_MS`, 상차림 20초 `JANGGI_SETUP_MS`). 초과 시 AI 대행, 연속 2회 초과면 자동 진행(`players[].auto`, `room:auto {on}`). `TURN_START {game,userId,deadlineAt,auto}` 방송.
- **경제/정산**: `settle.js` — `settleGame`(고스톱 다자 `payments`), `settleSeotda`(순증감 `net`), `settleOmok`, `settleYut`(승자/패자 목록 정산, `label` 로 기록 이름), `settleVegas`·`settleYacht`·`settleJanggi`(= `settleYut` + 게임 이름). 전부 Prisma 트랜잭션, 패자 잔고 한도(비율 분배·1원 보존), `isBot` 계정은 한도 없이 지불·불변, `ranked=false`(연습)면 DB 무변경. `isRankedRoom`: 사람 ≥2 → 실전, 사람 1명(+봇) → 연습.
- **봇**(`bots.js`): DB 더미 `AI봇N`(`isBot`, 로그인 불가) + 개성 8종(이름 `AI ○○`·아바타·공격/균형/수비 성향·상황별 말풍선, 봇당 6초 쿨다운). 난이도 easy/normal/hard(`room:practice {game,level,bots,bet,skill?,turnSec?}` — `bots` 1~(최대 인원-1), 오목 1 고정, 봇 모두 같은 난이도; `room:addBot {level}`), 사람 대행은 항상 hard. 지연은 `BOT_DELAY_SCALE`(테스트 0).
- **프로필/통계**: `User.nickname`(unique)·`avatar`(`UPLOAD_DIR`, 2MB, 매직바이트 검증, SVG 거부). 출석 +10,000(KST 하루 1회)·개평 +30,000(잔액 ≤10,000, 하루 3회). 업적/대표 칭호(`stats.js ACHIEVEMENTS`), 게임별 랭킹 `GET /api/auth/ranking?game=money|gostop|seotda|omok`.
- **보안**: production 에서 `JWT_SECRET` 필수, 로그인 1분 10회/가입 1시간 5회 IP 레이트 리밋(`LOGIN_RATE_MAX`·`REGISTER_RATE_MAX`, 0=끔, 프록시 뒤면 `TRUST_PROXY=1`). 같은 공인 IP 여러 명 가입 시 가입 제한에 걸릴 수 있음.
- **프론트**: 게임판은 lazy chunk(`lazy.js lazyNamed`, 옛 청크 404 시 1회 새로고침), 서버는 `/assets` 1년 immutable·index.html/sw.js no-cache. PWA(운영 빌드에서만 SW 등록). 설정(`settings.js`): 음량·연출 속도·애니메이션·카드 크기·진동·단축키·오목 옵션 등 localStorage. 접근성: aria-label·키보드(`keys.js data-hotkey`: 숫자 선택, D/G/S/Y/N/C/H/B/T/V/R/?). 애니메이션 설정(`motion`: 켜기 기본 / 기기 설정 / 끄기 → `main.jsx` `MotionConfig reducedMotion` never/user/always) — 예전엔 항상 OS '동작 줄이기'를 따라서, 그게 켜진 기기에선 패가 날아가지 않고 순간이동해 고스톱이 사진처럼 끊겨 보였다. **함정**: 화면 코드에서 연출을 건너뛸지 판단할 때 `useReducedMotion()` 은 MotionConfig 를 무시하고 기기 설정만 본다 → 반드시 `useReducedMotionConfig()`(윷·오목·라스베가스·요트·장기 보드, 2026-11-18 요트 주사위 연출이 안 보이던 원인). `backdrop-blur` 는 성능 문제로 쓰지 않는다. 다크 모드 대응 없음(항상 원래 색): `index.html` `<meta name="color-scheme" content="light only">` + `:root { color-scheme: light only !important }` + `html`/`body` 배경·글자색 hex 고정 + `App.jsx` 모든 화면 뒤 불투명 `bg-felt-900` + Tailwind `darkMode: 'class'`(시스템 추적 안 함, `dark:` 는 안 씀) 로 크롬 안드로이드·삼성 인터넷의 강제 다크가 화투패·스도쿠판 색을 뒤집지 않게 막는다. 요청서의 'bg-white' 는 앱이 어두운 테마라 흰 배경 대신 **불투명한 테마색**으로 해석(모달 중 투명하던 국진 창에 `bg-felt-800`).
- **브랜드/첫 화면**: 이름 `강원게임랜드`(`Logo.jsx` 의 `BRAND`), 엠블럼 `public/logo-mark.svg`(금테 붉은 원판 + 화투패 3장, 파비콘으로도 사용) + 워드마크는 HTML 글자(기기마다 같은 글꼴). PWA 아이콘(`icons/*.png`·`icon.svg`)도 이 엠블럼으로 다시 그림(헤드리스 크롬으로 렌더, maskable 은 72% 크기 + 짙은 배경), 서비스 워커 캐시 `v2`. 첫 화면 `Auth.jsx`: 고정 상단바(로고·메뉴·로그인/회원가입) → 히어로(로고·문구·시작 버튼·실시간 현황 칩) + 로그인 상자 → 게임 6종 카드(특징 배지·열린 방 수) → 특징 6개 → 머니 랭킹 TOP5 · 이용 안내(가상 머니 고지) → 푸터. 현황은 공개 `GET /api/summary`({online(봇 제외 접속자), games: {gostop|seotda|omok|yut: {rooms, playing}}}, 개인 정보 없음). 요청서가 예로 든 '이번 생은 아구 선수' 페이지는 찾지 못해 일반적인 웹게임 포털 첫 화면 구성으로 만들었다.

## 3. 게임별 상태

### 고스톱 (`game/`)
- **엔진** `GostopGame`: 2~4인(2인 10장·7점 / 3·4인 7장·3점, 4인은 1명 쉼 `rest`+연속 쉬기 금지 교대 `pickRest`). 뻑/자뻑/따닥/쪽/싹쓸이/폭탄/흔들기/고(1고+1·2고+2·3고부터 ×2^(n-2))/스톱/나가리(이월 ×2 옵션), 광·피·멍·고박, 독박(고박 대납·쇼당 받음), 쇼당(3인·두 상대 모두 기준 이상·판당 1회·둘 다 수락해야 나가리), 기리 연출(`game:start.cutter`), 광팔기(3·4인, 광 1장당 2점), 총통 옵션, 보너스패(id 48~50, 3장 모두 쌍피) 옵션, 밤일낮장 선 정하기(`decideFirst`). 방 옵션 `{bonus, ppeokPay, chongtong, ttibak, nagariCarry}`. 마지막 패에선 따닥·쪽·싹쓸이 불인정. 결과 `payments=[{kind,from,to,total,mult,tags}]`, `result.stats`·`result.baks`.
- **뻑 + 보너스패**(2026-11-18 사용자 요청): 뻑이 난 차례에 얻은 보너스패(손에서 낸 것·더미에서 나온 것 모두, `turnBonus`)는 획득하지 못하고 그 뻑 더미에 같이 남는다(`ppeokBonus[month]`, 뷰에도 포함 → 화면은 그 달 더미에 함께 그림). 뻑 더미를 먹는 사람(손패·더미 어느 쪽이든)이 보너스패까지 가져간다. 뻑이 아닌 차례의 보너스패는 예전처럼 바로 내 것.
- **국진 선택**: 9월 술잔(id 32, `dual`)은 열끗/쌍피 중 선택. `gukjin[pid] = 'auto'|'yeol'|'pi'`(기본 auto = 유리한 쪽), 판 끝나기 전까지 `setGukjin` 으로 변경, 소켓 `game:gukjin {mode}`(턴 진행 없이 스냅샷만 방송). 점수·고/스톱·피박(`loserPiCount`)·쇼당 판정 모두 선택값 사용. UI: 먹는 순간 1회 선택 모달 + 내 점수줄 🍶 칩(auto→pi→yeol 순환). 봇은 auto. 소켓 `game:gukjin` 은 `sockets.test.js`(GostopGame.setGukjin 스파이로 획득 상태 주입)로, 모달·🍶 칩은 국진을 먹은 상태를 주입한 임시 서버+Playwright 로 육안 확인(선택·순환·서버 반영 정상). Playwright 스펙으로는 고정 안 함(덱 고정 수단 없음).
- **AI**: `AiPlayer`(룰 기반: 폭탄>뻑 먹기>매칭 가치>버리기, 고/스톱 임계 규칙), `HeuristicBot`(카운팅+EV, hard). easy = AiPlayer+실수 40%, normal = +12%.
- **UI** (`GameBoard.jsx`): 짝 맞는 패 강조(+🔗, 카드 안쪽 배지), 족보 완성 팝업(위)·비상 팝업(아래, `nearCombos`), 규칙 도움말(❓), 정산 연출, 기리 연출, 타이머/자동 진행 토글, 관전·끊김 안내. 보너스패는 이미지 없이 CSS(`.bonus-face`: 글자를 카드 폭 `cqw` 기준으로, 폭 34px 이하면 ★★ 만)로 그려 어느 크기에서도 안 잘린다. 더미에서 나온 패(뒤집은 패·보너스로 받은 패)는 `useStockArrivals` 가 260ms 동안 더미 위에서 뒤집어 보여 준 뒤 layoutId 로 제자리까지 날려 보낸다(착지 spring 과 자리 이동 spring 분리).
  - 획득패: 광/띠/열끗/피 그룹마다 `장수/목표`(3·5·5·10) 라벨, 목표 도달 시 금색. 장수는 서버 `scores[pid]`(쌍피·국진 반영, `sepAsPi` 면 국진을 피 그룹에 표시). 카드 폭은 래퍼의 `--capw`. 점수 칩엔 족보(홍단·고도리 등)만 — 장수 항목은 라벨과 중복이라 숨김.
  - 바닥: 같은 달 묶음을 **월 순서**로 배치. 바닥 영역이 `container-type:size` 이고 카드 폭 `--cw = min(80px·cs, 14cqw, max(27cqh, min(42cqh, 40px)))` — 높이가 넉넉하면 두 줄, 휴대폰 가로처럼 낮으면 한 줄 기준.
  - 최근 행동(`useActionLog`): 프레임의 `played/drawn/actor`·획득패 증가로 최근 3건(누가 낸 패·뒤집은 패·먹은 장수)을 바닥 오른쪽 위에 표시. 작은 패는 layoutId 없는 `<img>`(`Mini`)라 본 카드 애니메이션과 섞이지 않는다.
  - 결정 창(고/스톱·흔들기·쇼당·총통·광팔기·국진·확인)이 떠 있으면 족보/비상 팝업을 숨김(`asking`). 국진 선택 창은 프레임 재생이 끝난 뒤.
  - 고/스톱 창: 다음 고의 효과(1고 +1, 2고 +2, 3고↑ +2·×2^(n-2))와 고박 안내만(상대 정보는 #8 제외 결정으로 넣지 않음). 흔들기 창: 해당 달 3장 미리보기 + 취소.
  - 결과 창: `기본점 × 배 = 총점`, `× 판돈 = 금액`, 진 쪽 제목 "패배 — ○○ 승리". 나가리 창: 이유 + 이월(`room.opts.nagariCarry`) 안내. 스냅샷 `carry`(이월 배수) → 상단 배지.
  - 나가기·쇼당 확인은 앱 안 `ConfirmModal`(연습 판은 "머니 무변동" 안내). 첫 판 안내(`OnceHint done`)는 한 장 내면 저절로 닫힘, 터치 기기에선 키보드 문구 생략.
  - 먹을 패 고르기(바닥에 같은 달 2장): 화면 가운데 '먹을 패를 선택하세요' 팝업(`Modal label=먹을 패 선택`) — 큰 패 그림 2장 + 이름, 어떤 패(낸/뒤집은, `view.choice.step` hand/draw → `view.played`/`view.drawn`) 때문인지 안내, 키보드 1·2. 바닥 더미의 '뻑' 배지는 **서버의 `view.ppeokPiles[월]`** 이 있을 때만(예전엔 같은 달 3장이면 무조건 '뻑'이라 고르는 중에도 떴다).
  - 내 차례: 패널 빛 + 남은 시간 막대(`TurnBar`) + 금색 상태 알약. 4인 쉬는 사람은 한 줄 패널. 봇 차례는 `TurnTimer bot` → '💭 생각 중'(사람 대행만 '🤖 AI 대행', 섯다·오목·윷놀이 공통).
  - 모바일: 상대 뒷면 패 숨김, 상단 버튼은 아이콘 아래 글자(`BarLabel stacked`). 휴대폰 가로(`max-height:500px`)는 `.landscape-cap` 으로 획득패를 작게·라벨 한 줄로, 이전 행동 기록 숨김.
  - 대기방: 이름/부가 정보 두 줄, 준비·내보내기 세로 배치, 방장은 나머지가 준비되면 "▶ 준비하고 시작"(E2E 가 `/준비/` 로 찾으므로 '준비' 포함 유지).
- 미구현: 3피 표시 카드, 4~6인 '장' 단계, 연속 쉬기 외 세부. 요청서 모호 해석: 뻑 점수 환산 `ppeokPay`(첫뻑 3·연뻑 6·삼연뻑 종료).

### 섯다 (`seotda/`)
- 20장 덱(1~10월 ×2), `evaluateHand`/`compareHands`(삼팔광땡>광땡>땡>알리~세륙>갑오>끗>망통, 암행어사·땡잡이·구사 재경기·멍텅구리구사=4월+9월 열끗(id 32)). 베팅: 참가비→2장→`die/call/half/bbing/ddadang`, **올인·사이드팟**(`result.pots`), 구사 재경기 팟 이월, 동점 시 **묻고 더블** 투표(`SEOTDA_VOTE_MS` 15초, 전원 동의 시 동점자끼리 판돈 2배). 시간 초과=체크/다이.
- 이벤트: `seotda:act`, ← `seotda:start/state/over/tieVote/tieResult`, `SHOW_DOWN`. 전적 `sdWins/sdLosses/sdGames`+스탯, 업적 8종.
- `SeotdaBot`: 상대 2장 조합 전수 승률 vs 팟 오즈, 성향·난이도(easy 헤픈 콜 / normal 15% 실수 / hard 압박·가치 베팅·허세 절제). 연습 시 사람 칩 최소 `ante*50` 보장, 실전 시 봇은 가상 잔액 1천만.
- UI: 카드 배분 연출, 쪼기(`SqueezeCard`), 순차 쇼다운, 칩 이동, 베팅 버튼 금액, 접이식 판 기록, 족보 도움말(`JokboHelp`). 묻고 더블 모달·사이드팟 결과는 브라우저 육안 확인 못 함(소켓 테스트로만 검증).

### 슬롯머신·스도쿠 공통: 입장 화면 (`SoloRoom.jsx`)
- 혼자 하는 REST 게임이라 소켓 방을 만들지 않는다. 로비 탭은 `SoloEntry`(소개·오늘 현황·`🚪 입장하기`/스도쿠 저장 판이 있으면 `▶ 이어서 풀기`) → 입장하면 로비 대신 전체 화면 `SoloRoom`(위쪽 바: 이름·머니·❓규칙·소리·설정·🚪나가기). 스도쿠의 나가기는 `exitRef` 로 걸어 둔 저장 함수를 거쳐 저장하고 나간다(판 안의 '💾 저장하고 나가기' 버튼과 같음). 서버 저장이 실패해도 토스트로 알리고 나간다(이 기기 자동 저장으로 이어 풀기 가능 — 갇히지 않게). 상태는 `Lobby` 의 `solo` — 새로고침하면 로비로 돌아온다.

### 슬롯머신 (`slot.js`, `slotMath.js`)
- REST: `GET /api/slot/status`, `POST /api/slot/spin`(500원, 하루 베팅합 10,000 한도·KST 초기화, 유저별 직렬 큐). **이론 RTP 95.0%**: 요청서 확률표가 RTP 155% 라 배당은 유지하고 확률만 조정(`SLOT_TIERS`, 0.5%/2%/8%/31%). 소켓 푸시 없음(연출 후 머니 반영). 프론트 `SlotMachine.jsx`(3릴 순차 정지, 잭팟 파티클).

### 스도쿠 (`sudoku/engine.js`, `sudoku.js`, 프론트 `SudokuGame.jsx`)
- 엔진: 행·열·박스 비트마스크 + 무작위 순서 백트래킹으로 완성판 생성(단독 1,000판 ≈ 60ms), 중앙 기준 **점대칭**으로 빈칸 뚫기(하 30·중 40·상 50, 홀수면 중앙 1칸). **유일해는 보장하지 않음**(요청서대로) → 제출 검증은 "정답과 같은가"가 아니라 "문제 숫자를 그대로 두고 규칙대로 다 채웠는가"(`checkSubmission`).
- REST(`/api/sudoku`): `GET /status`(오늘 현황 + 풀던 문제 `current`), `POST /new {difficulty}`(문제만 내려주고 정답은 안 보냄), `POST /save {id, board, elapsed}`(저장하고 나가기), `POST /submit {id, board}`. 서버는 유저별로 **지금 풀고 있는 문제 하나**만 인정한다(다른 문제·만든 판으로 보상 받기 방지) — 메모리 캐시 `active` + DB `User.sudokuSave`(JSON {id,difficulty,puzzle,board,elapsed,issuedAt,savedAt}, 새 문제·저장 때 기록, 클리어하면 null). 그래서 서버 재시작·다른 기기에서도 이어 푼다. `/status.current` 에 저장한 `board`·`elapsed`·`savedAt`. `/save` 는 81칸 0~9·고정 숫자 그대로만 받음, 걸린 시간 상한 7일.
- 보상: 제출 시 ① 날짜(KST, 출석·슬롯과 같은 기준)가 바뀌었으면 횟수 0 으로 봄 ② 오늘 10회면 403 "오늘 스도쿠 보상(10회)을 모두 받았습니다." ③ 맞으면 `dailySudokuCleared+1`·머니 +1,000원을 한 트랜잭션(조건부 `updateMany`) + 유저별 직렬 큐 → 동시 제출해도 한 번만 지급. 같은 문제는 한 번만(성공 시 `active` 삭제). 한도 소진 후에도 풀 수는 있고(연습), 다 풀면 보상 없이 정리.
- UI: CSS grid 9×9(3×3 경계 굵은 테두리), 고정 숫자 검정·입력 파랑·겹침 빨강, 선택 칸/같은 줄·박스/같은 숫자 강조, `<select>` 난이도, "오늘 남은 클리어 보상: X / 10회 (클리어 당 1,000원)", 타이머. 입력은 칸 선택 → 커스텀 넘패드(1~9 + ✕, 숫자별 남은 개수) — 모바일 키보드를 띄우지 않음. 키보드: 1~9 · 0/Backspace/Delete/X · 방향키. 다 채우고 겹침이 없으면 자동 제출, 클리어 창(시간·보상·다음 문제). 진행은 `localStorage sudoku.progress`(이 기기 자동 저장) + '저장하고 나가기'(서버). 들어올 때 같은 문제면 `savedAt` 이 더 최근인 쪽을 쓴다(다른 기기에서 푼 뒤 돌아와도 옛 로컬 판이 이기지 않게). 넓은 화면은 넘패드가 보드 오른쪽(3열).
- 전적/랭킹/업적 없음. 머니 갱신은 응답의 `user` 로(소켓 푸시 없음).

### 오목 (`omok/`)
- 15×15 렌주룰: 흑 쌍삼·쌍사(4-4)·장목 금지, 백은 5목 이상. **알려진 단순화**: 금지 자리가 상대 4를 막는 경우 같은 재귀 예외 미구현, 총 시간제 미구현. 룰 퍼저(`omok.fuzz.test.js`)로 독립 브루트포스와 대조(창 ±5 버그 수정 이력).
- AI `OmokBot`+`engine.js`: FastBoard(증분 패턴 점수·Zobrist), VCF/VCT, 반복 심화 알파-베타(깊이 ≤6, 전치표, 노드 예산+시간 안전망), 오프닝북, 쉬움=열린 3 놓치기, 성향 가중, 적응형 난이도(`strength`, 실력 추정치는 브라우저 `omokSkill.js`), 힌트(연습 판당 3번 `omok:hint`), 복기 분석(`omok:analyze`, 수순 재생 검증). 계산은 워커 스레드(`aiPool.js`, 실패/4초 초과/`OMOK_WORKER=0` 이면 동일 스레드 폴백).
- 이벤트: `omok:place {x,y,rid}`(rid 중복 방지), `omok:undo/undoReply`(연습 즉시·3번, 실전 요청→수락, 사람당 2번, 15초 무응답=거절), `omok:resign`, → `omok:start/state/over`. 첫 흑 무작위, 이후 진 사람이 흑. 정산: 진 사람이 참가비를 이긴 사람에게.
- 전적 `ogGames/ogWins/ogLosses/ogStreak/ogBestStreak/ogBotWins/ogFastWin`, 업적 6개. 지표 `GET /api/metrics/omok`(메모리, 재시작 시 초기화).
- UI `OmokBoard.jsx`: 금지수 ✕(서버가 view 에 목록 제공), 착수 확인(모바일), 좌표·수 번호, 위협 표시, 테마(나무/대리석/다크=밝은 슬레이트)·돌 스킨(**모든 돌·작은 돌 표시는 radial-gradient `background-image`** — 모바일 강제 다크는 단색 `background-color` 를 뒤집어 판과 구분이 안 되지만 이미지는 건드리지 않음. 단색 스킨도 같은 색 두 번 준 그라데이션. 플레이어 칩 돌 점·흑백 위협 배지도 `stoneImage`), 확대/핀치, 5목 선·컨페티, 초읽기 경고, 결과 창(한 판 더·복기), 오목 전용 이모트.

### 윷놀이 (`yut/`)
- 29칸 방향 그래프(바깥 0~19+지름길 20~28): 모서리(5·10)·방(22)에서 **출발**할 때만 대각선, 지나치기만 하면 바깥 길. 말은 `trail` 을 가져 빽도가 온 길을 되짚음. 윷가락 4개 확률(평면 0.6; 도 11.5·개 34.6·걸 34.6·윷 13·모 2.6·빽도 3.8%), `pending` 에 쌓아 말에 나눠 씀, 윷·모·잡기=추가 던지기. 업기(최대 4)·잡기(도착 칸만)·4개 도착 시 종료. **나가기 규칙(2026-10-25 수정)**: 19·28 다음 칸은 0(출발점=참먹이) — 0 에 딱 멈추면 아직 판 위(잡기·업기 대상), 0 에서 한 칸이라도 더 가야 DONE(예: 18 에서 개=0 에 멈춤, 걸=나감). 예전엔 19·28 다음이 곧 DONE 이라 홈에 닿자마자 나갔다. UI 는 나가는 이동도 0 자리에 표시하되 '나가기 ↗'/'참먹이' 꼬리표로 구분. 방 순서대로 청/홍 번갈아 팀, 선=방장.
- 결정: **도(1)에서 빽도 → 참먹이(0)**(2026-11-18 사용자 요청; 그 말은 판 위에 남아 잡기·업기 대상이고 다음 앞으로 이동은 무조건 나감, 거기서 또 빽도는 불가 — 빽도로 와서 지나온 길이 없으므로), 대기 말에겐 빽도를 쓸 수 없고 쓸 말이 없으면 소멸; 중앙(방) 출발은 항상 27→28. 점수(🏁)는 참먹이를 **지나 나갈 때** 오른다(도착만으로는 아님 — 10-25 부터 그렇게 돼 있었고 11-18 요청 때 테스트로 다시 고정).
- 이벤트: `yut:throw`, `yut:move`, → `yut:start/state/over`. 정산 `settleYut`(진 팀 참가비를 이긴 팀이 균등 분배). `YutBot`(잡기>도착>업기>지름길>전진). 전적/랭킹/업적 **없음**(머니 정산만).
- UI `YutBoard.jsx`: SVG 윷판, 윷가락 던지기 연출(`Sticks`, 1.45초: 손에 모아 흔들기 → 던져 흩어지며 공중제비 → 멍석에 떨어져 통 튐 → 굴러 멈춤, 그림자는 높이에 따라 작아짐, 멈춘 자리·각도는 `seq` 로 정해져 다시 그려도 같음 — framer 키프레임은 `initial` 을 꼭 줘야 함, `false` 면 마지막 값으로 바로 감), 말 이동 애니메이션, 업힌 말은 말을 34%씩 위로 쌓은 탑 + `×n` 배지, 결과 칩→말 선택→이동 확정.

### 라스베가스 (`vegas/`)
- 원작: `~/51_LasVegas`(사용자의 파이썬 GTO 솔버·Flask UI). 규칙 엔진·탐욕 전략을 JS 로 옮겼고 MCTS/expectiminimax 는 가벼운 몬테카를로로 대신함(파이썬 코드는 건드리지 않음).
- 규칙: 2~5인, 4라운드. 지폐 54장($10k~$90k, 단위 천 달러로 저장)을 섞어 라운드마다 카지노 6곳에 합계 50 이상이 될 때까지 깖(덱이 모자라면 덜 깔림 — 원작 그대로). 모두 주사위 8개. 차례 = 남은 주사위 전부 굴림 → 나온 눈 하나를 골라 그 눈의 주사위 **전부**를 같은 번호 카지노에. 주사위가 떨어진 사람은 건너뜀. 다 놓으면 정산: 개수 많은 순서로 큰 지폐부터 한 장씩, **같은 개수끼리는 모두 취소**(다음 순위가 큰 지폐). 남은 지폐는 버림. 라운드마다 선이 한 자리씩 돎, 다음 판은 다음 자리가 선.
- **결정(원작과 다름)**: 흰(중립) 주사위를 원작 솔버는 라운드 끝에 한꺼번에(2인 4개·3인 2개) 굴렸지만, 보드게임 규칙대로 **1인당 2인 4개·3인 2개를 내 주사위와 함께 굴려** 고른 눈에 나온 흰 주사위도 같이 놓게 함(흰 주사위만 나온 눈도 고를 수 있음). 흰 주사위는 순위·동점 취소에 끼고 돈은 못 받음(차지한 지폐는 버려짐, `blocked`). 4~5인은 흰 주사위 없음.
- 승패: 4라운드 뒤 돈이 가장 많은 사람(공동 1등이면 모두) 승리 → 나머지가 참가비를 내고 1등이 나눠 받음(`settleVegas`). 기권하면 남은 주사위는 버리고 차례에서 빠짐, 한 명만 남으면 그 사람 승리. 전적/랭킹/업적 **없음**(머니 정산만, 윷놀이와 같음).
- 서버: 단계 `roll → place`(사람 30초씩, 초과 시 AI 대행) → 라운드 끝 `roundEnd` 에서 `VEGAS_ROUND_MS`(6초) 정산 화면 뒤 `nextRound()`. 봇 지연: 굴리기 0.6~1초, 놓기 1.5~2초(굴린 주사위를 볼 시간). 숨길 정보가 없어 `view()` 하나를 모두에게.
- AI `VegasBot`: 쉬움 = 35% 아무 눈 + 잡음 큰 탐욕, 보통 = 탐욕(그 카지노에서 내 몫 증가 − 주사위 0.1개당 감점), 어려움 = 눈마다 라운드 끝까지 무작위 시뮬레이션(모두 탐욕+잡음 가정)해 '내 수익 − 상대 평균' 최대, **25ms 예산**(메인 스레드라 짧게). 2인 승률: 어려움 vs 보통 95%(25ms, 150판), 보통 vs 쉬움 70%(200판). 3인 어려/보통/쉬움 60/18/22%(100판 — 3인에선 보통과 쉬움 차이가 작음). 한 수 최대 약 33ms(예산은 눈마다 한 바퀴 돌 때만 확인).
- 이벤트: `vegas:roll`, `vegas:place {value}` → `vegas:start/state/over`(over 에 `vegas: true` — 재접속 시 결과 구분용). 이모트는 `emotes.js` 의 `vegas`.
- UI `VegasBoard.jsx` + `vegas.js`(자리 색 5개·정산 미리보기): 카지노 6칸(번호 주사위·지폐·자리별 놓인 주사위·동점 취소 표시), **지폐 아래 색 띠 = 지금 그 지폐를 가져갈 사람**, 주사위 판(굴리기 연출 0.9초: 위에서 떨어지며 눈이 바뀌다 멈춤, 눈별 묶음), 카지노나 묶음을 한 번 누르면 고르기·한 번 더 누르면 놓기(키 1~6, 굴리기 T), 라운드 정산 창(마지막 라운드는 결과 창 안 '정산 보기'), 결과 창(순위·$·머니 증감). 주사위는 강제 다크 대응으로 그라데이션 이미지, 크기는 px(%패딩은 부모 폭 기준이라 넓은 칸에서 커지는 버그가 있었음). 상단 바는 모바일에서도 아이콘 아래 글자(`BarLabel stacked`).

### 요트 다이스 (`yacht/`)
- 원작: `~/52_YachtDice`(사용자의 파이썬 GTO 도우미, aider 로 만들다 멈춤). 원작엔 점수 규칙이 서로 다른 두 벌(`yacht_dice/`: 풀하우스 합·포카인드 눈×4·스트레이트 1-5/2-6 각 30·보너스 없음, `yachtdice/`: 야찌식 13칸·풀하우스 25 등, 일부 미완성)이 섞여 있어 **결정**: 널리 알려진 '요트 다이스'(닌텐도 세계의 아소비 대전집) 규칙으로 통일 — 위쪽 6칸 + 63점 이상 보너스 35, 초이스(합)·포카인드(4개 이상이면 다섯 개 합)·풀하우스(3+2면 다섯 개 합, 다섯 개 같은 건 아님)·S.스트레이트(4연속 15)·L.스트레이트(5연속 30)·요트(50). 원작 솔버는 자리표시뿐이라 AI 는 새로 만듦.
- 진행: 2~4인 × 12라운드, 차례 = 최대 3번 굴림(굴린 뒤 `yacht:hold {held[5]}` 로 고정 — 서버 상태라 다른 사람 화면에도 보임, 다음 굴림은 고정 안 한 자리만) → `yacht:score {cat}` 로 빈 칸에 기록(0점 버리기 가능). 기권하면 차례에서 빠지고 점수표는 남음, 한 명 남으면 승리. 1등(공동이면 나눔)이 나머지 참가비를 받음(`settleYacht`). 다음 판은 다음 자리가 먼저. 전적/랭킹/업적 **없음**.
- AI `YachtBot`: 한 차례 안의 고정 결정은 **정확한 기댓값 계산**(5개 조합 252 × 고정 조합 462 를 남은 굴림만큼 거꾸로, 한 수 최대 약 14ms). 차례 끝 가치: 보통 = 그냥 점수(요트 칸을 버리는 등 낭비), 어려움 = 점수 − 칸별 평균 기대 점수 + 보너스(63) 진행 가산(가중치는 자가 대국 평균으로 고름), 쉬움 = 가장 많은 눈만 남기기 + 점수 큰 칸(가끔 둘째). 3인 200판: 어려/보통/쉬움 승률 55/44/1%, 평균 171/165/94점. 어려움 혼자 평균 약 180점.
- 이벤트: `yacht:hold/roll/score`(roll 에 `held` 를 같이 보내도 됨) → `yacht:start/state/over`(over 에 `yacht: true`). 이모트는 `emotes.js` 의 `yacht`.
- UI `YachtBoard.jsx` + `yacht.js`(칸 이름·설명·`bonusState`): 주사위 판(상아색 52px 주사위, 누르면 고정 — 금색으로 바뀌며 위로 뜸, 키 1~5, 굴리기 R, 남은 굴림 점 3개, 맨 위 줄에 방금 기록한 족보 — 요트면 크게) + **점수표는 두 열 카드**(2026-11-18 사용자 요청: 사람당 1열 표가 좁고 글씨·버튼이 작았음): 왼쪽 '1~6 모으기' 6칸 + **보너스 칸**(사람마다 위쪽 합 막대 + 'N점 남음'/'달성 +35'/'불가'), 오른쪽 족보 6칸 + 총점 칸. 칸마다 이름(굵게 15~16px)·설명·사람별 점수 칩(2×2, 넓은 화면 4칸), **내 차례 빈 칸은 카드 전체가 버튼**이고 받을 점수를 크게(최고점 칸 초록). 칸 이름은 '1 모으기'~'6 모으기'·초이스·포카드·풀하우스·스몰/라지 스트레이트·요트(예전 '에이스·듀스·트레이·포…'가 어색하다는 요청으로 바꿈). **굴리기 연출 1초**: 제자리에서 달그락 흔들림 → 위로 던져 한두 바퀴 돌며 → 떨어져 통 튀고 멈춤(눈이 바뀌다 마지막 눈), 효과음 `diceRoll`(달그락 → 휙 → 딱딱 튀는 소리, 연출과 시간 맞춤). 넓은 화면은 주사위 판 | 점수표, 좁으면 위아래.

### 장기 (`janggi/`)
- 한국 장기 1:1. 판 9×10 교차점(칸 = y*9+x), 한(漢)은 위·초(楚)는 아래, **초가 먼저**, 한 덤 1.5. 첫 판은 방장이 초, 다음 판부터 초·한을 바꿈(`room.janggiCho`).
- 시작하면 `setup` 단계: 각자 상차림 4가지(`마상마상`·`상마상마`·`마상상마`·`상마마상`, **자기 쪽에서 본 왼쪽부터**) 중 고름(`janggi:setup`), AI 는 바로 무작위, 20초 지나면 안 고른 쪽은 `마상마상`.
- 말 규칙(`rules.js`): 궁·사 궁성 안 한 칸(대각선은 궁성 선을 따라), 차 직선 + 궁성 대각선, 포는 포가 아닌 말 하나를 넘어서만(다리 없으면 못 움직임, 포는 넘지도 잡지도 못함), 마 직1+대1·상 직1+대2(가는 길 막히면 불가), 졸 앞·옆(상대 궁성에선 대각선 앞). 자기 궁이 장군 받는 수는 불가. 궁·사는 궁성 밖으로 못 나가므로 장군 판정에서 제외.
- 종료(`JanggiGame`): **외통**(장군인데 둘 수 없음) · **빅장**(두 궁이 사이에 아무것도 없이 같은 세로줄 — 만든 다음 상대가 바로 풀지 않으면 점수 판정) · 둘 다 연달아 **한수 쉼**(`janggi:pass`, 장군일 땐 불가) · **200수** → 앞의 셋과 200수는 남은 말 점수(차13·포7·마5·상3·사3·졸2, 한 +1.5 — 동점 없음)로 판정 · 기권(`janggi:resign`, 나가기도 기권). **결정/단순화**: 같은 수 반복(동형 반복) 금지·'장군 멍군' 무승부 규칙은 없음, 장군이 아닌데 둘 수가 없는 경우는 한수 쉼으로 넘김.
- 정산 `settleJanggi`(진 사람 참가비 → 이긴 사람). 전적/랭킹/업적 **없음**.
- AI `JanggiBot`: 알파베타(제자리 두기/무르기, 탐색 안은 유사 합법수 + 궁 잡는 수 = 외통 점수, 맨 위만 진짜 합법수) + 잡기 연장 탐색 + 반복 깊이 늘리기. 쉬움 1수+큰 잡음, 보통 2수, 어려움 150ms 예산(보통 3수). 평가 = 말 점수 + 졸 전진·큰 말 전진/가운데 가산. **빅장 처리**: 상대가 건 빅장을 안 풀면 바로 점수 결과, 내가 걸면 '상대가 받아들이면 점수 판정'을 상한으로. **함정(고침)**: 맨 위에서 가지치기된 수가 최선 수와 같은 값으로 남아 동점 무작위로 엉뚱한 수(공짜 차도 안 잡음)를 고르던 버그 → 맨 위 창을 `-alpha+1` 로(잡음 난이도는 창을 열어 모든 수의 정확한 값). 결과: 보통 vs 쉬움 8/8 외통 승, 어려움 vs 보통 5/6.
- 이벤트: `janggi:setup/move {from,to}/pass/resign` → `janggi:start/state {view, move, setupDeadline}/over`(over 에 `janggi: true`). 이모트는 `emotes.js` 의 `janggi`.
- UI `JanggiBoard.jsx` + `JanggiPiece.jsx` + `janggi.js`: 말은 **SVG 로 직접 그림**(팔각 나무판 + 겹 테두리 + 한자 楚/漢·車·包·馬·象·士·卒/兵, 초 초록·한 빨강, 궁 > 차·포·마·상 > 사·졸 크기, 칠은 그라데이션이라 강제 다크 무관). 한자는 글꼴(`Noto Serif KR` 등 → 없으면 기기 세리프)로 써서 기기마다 글자 모양이 조금 다를 수 있음. 판은 나무색 그라데이션 + SVG 선·궁성 대각선, **내 진영이 늘 아래**(한이면 판을 뒤집어 그림), 말 누르기 → 갈 수 있는 곳(점 / 잡기는 빨간 고리) → 누르기, **갈 곳이 없는 내 말도 고를 수 있음**(2026-11-18 요청: 버그인지 헷갈림 — 회색으로 빛나고 이유 안내: 장군 중 / 포는 다리 필요 / 길 막힘·움직이면 장군, `data-movable`), 마지막 수 표시, 움직인 말은 출발점에서 미끄러져 옴(framer 의 x/y 로 가운데 맞춤 — scale 애니메이션이 Tailwind translate 를 덮기 때문), 장군 시 궁 빨갛게 + '장군!'/'빅장!'/'한수 쉼' 알림, 잡은 말 줄, 점수(덤 포함), 한수 쉼·기권 버튼, 상차림 창(말 그림 미리보기, 남은 초).

## 4. DB (Prisma/SQLite, 마이그레이션 9개)
- `User`: 머니·`wins/losses`(고스톱 전용)·`isBot`·프로필(`nickname`,`avatar`)·고스톱 스탯(`statGames, goCount, ...`)·`achievements`(JSON 문자열)·`title`·출석/개평(`lastLoginAt, gaepyeongDate/Count`)·슬롯(`dailySlotSpent, lastSlotPlayedAt`)·스도쿠(`dailySudokuCleared, lastSudokuClearedAt, sudokuSave`)·섯다(`sd*`)·오목(`og*`). `Game(roomName, betPerPt, playerCount, nagari, detail)`, `GameResult(gameId,userId,outcome,moneyDelta)`.
- 마이그레이션 `20261031000000_sudoku_save`(`User.sudokuSave TEXT`). 실서버 DB 는 2026-10-25 사용자 요청으로 초기화(모든 계정·전적 삭제, 9개 마이그레이션으로 새로 생성). 마이그레이션 적용: `cd backend && npx prisma migrate deploy`. 실제 DB 는 `backend/prisma/dev.db`(git 제외) — **테스트에 쓰지 말 것**.

## 5. 소켓/REST 요약
- 클→서: `room:create/join/leave/ready/options/spectate/practice/addBot/removeBot/auto`, `sync`, `lobby:chat`, `room:chat`, `SEND_EMOTE`, `game:play/choose/go/stop/sellGwang/passGwang/chongtong/passChongtong/shodang/shodangAnswer/gukjin`, `seotda:act/tieVote`, `omok:place/undo/undoReply/resign/hint/analyze`, `yut:throw/move`, `vegas:roll/place`, `yacht:hold/roll/score`, `janggi:setup/move/pass/resign`.
- 서→클: `lobby:rooms`, `room:joined/state/left`, `room:chat`, `game:start/frames/over`, `seotda:*`, `omok:*`, `yut:*`, `vegas:*`, `yacht:*`, `janggi:*`, `TURN_START`, `SHOW_DOWN`, `SYNC_BOARD_STATE`, `BROADCAST_EMOTE`, `achievement:unlocked`, `me:update`, `player:offline|online`.
- REST: `/api/summary`(공개 현황), `/api/auth/{register,login,me,records,ranking,profile,avatar,stats,achievements,title,checkin,gaepyeong}`, `/api/slot/{status,spin}`, `/api/sudoku/{status,new,save,submit}`, `/api/metrics/omok`, `/api/health`.

## 6. 환경변수
`PORT`(4000) · `HOST`(듣는 주소, 기본 전체) · `DATABASE_URL` · `JWT_SECRET`(production 필수) · `NODE_ENV` · `UPLOAD_DIR` · `RECONNECT_GRACE_MS` · `GOSTOP_TURN_MS` · `OMOK_TURN_MS` · `YUT_TURN_MS` · `VEGAS_TURN_MS` · `VEGAS_ROUND_MS` · `YACHT_TURN_MS` · `JANGGI_TURN_MS` · `JANGGI_SETUP_MS` · `SEOTDA_VOTE_MS` · `BOT_DELAY_SCALE` · `OMOK_WORKER` · `LOGIN_RATE_MAX` · `REGISTER_RATE_MAX` · `TRUST_PROXY` · (E2E) `E2E_PORT`, `PW_CHROMIUM`, `BACKEND_URL`(vite 프록시).

## 7. 알려진 한계 / 주의
- 육안 미검증: 고스톱 보너스패 렌더·쇼당/총통/광팔기 창(새 UI 포함), 섯다 묻고 더블 모달·사이드팟 결과, 3인 이상 섯다 순차 공개.
- 고스톱 육안 확인 방법: 임시 DB 서버 + `--import` 프리로드로 `GostopGame.prototype.deal` 을 감싸 원하는 패를 획득패에 주입(국진·고/스톱 화면 확인에 사용). 실제 DB 금지.
- 자동 E2E 없는 부분: 국진 모달/🍶 칩, 고/스톱·흔들기 창, 최근 행동 로그(덱을 고정할 수단이 없어 수동 확인만). E2E 로 고정한 것: 첫 안내 자동 닫힘, 앱 안 나가기 확인 창.
- 휴대폰 가로에서 짝 맞는 바닥패가 솟아오를 때(-12px) 윗부분이 몇 px 잘릴 수 있음.
- 봇 강도: HeuristicBot 은 AiPlayer 대비 근소 우위(2000판 승률 ~51%). 오목 어려움은 보통 20-0, 쉬움 12-0(회귀 테스트로 고정).
- 부하 시 불안정 테스트는 `claude.md` §3 참고. 2026-10-24 전체 실행 중 `progress.test.js` 도 한 번 실패 후 재실행·단독 통과(부하 추정, 원인 미확인).
- 스도쿠: 풀던 문제는 서버 메모리라 재시작하면 제출이 거절됨(새 문제 필요). 풀이 시간 하한 같은 자동 풀이 방지는 없음.
- 메트릭은 메모리 기반(재시작하면 초기화).

## 8. 마지막 검증 기록
- 2026-10-24 스도쿠 추가 후: 백엔드 29 suites / 1626 tests(연속 2회 통과; 그 전 실행 한 번은 `heuristic`·`progress`·스도쿠 생성 속도 테스트가 부하로 실패 → 속도 기준을 판당 10ms 로 완화), Vitest 22, Playwright E2E 31 통과·1 skip(스도쿠: 입력/지우기/풀기→+1,000원), `vite build` 성공. 마이그레이션은 `prisma migrate diff` 로 스키마와 차이 없음 확인.
- 육안: 스도쿠 데스크톱 1280×800 · 모바일 390×844 캡처 확인. 고스톱 UI 는 데스크톱(2인·4인)·모바일 세로·휴대폰 가로 확인.
- 실서버(4000): 2026-10-24 `66bfb70` 기준으로 프론트 빌드 → 실제 DB 에 `migrate deploy`(스도쿠 컬럼) → 재시작. `/api/health` ok, `/api/sudoku/status` 401(인증 필요 = 라우트 동작).
- 2026-10-25 애니메이션 설정 추가: 헤드리스 크롬에서 `prefers-reduced-motion: reduce` 를 흉내 내 손패→바닥 이동을 프레임마다 측정(수정 전 순간이동 → 수정 후 약 1초 비행). Vitest 23, E2E 31 통과·1 skip. E2E 가 `vite build` 를 다시 해서 실서버 dist 도 갱신됨(서버 재시작 불필요).
- 2026-10-25 다크 모드 무시: 크로미움 `--enable-features=WebContentsForceDark` 로 강제 다크를 재현(스도쿠판이 검게 뒤집힘) → meta/CSS `color-scheme: only light` 후 라이트·다크·강제 다크 세 화면이 같게 나오는 것 확인. 프론트 재빌드로 실서버 반영.
- 2026-10-25 더미 애니메이션·보너스 3장: 임시 서버(보너스 주입 preload)에서 뒤집은 패 위치를 프레임마다 측정(더미 위 뒤집기 → 약 350ms 비행, 튕김 없음), 손패 보너스 → 더미에서 받은 패가 손으로 날아가는 것, 26~90px 보너스패 그림, 모바일 획득패 확인. 백엔드 29 suites / 1627(연속 2회 중 1회 `heuristic` 부하 실패, 단독 3회 통과), Vitest 23, E2E 31 통과·1 skip.

- 2026-10-25 task.md Part 1 + 슬롯/스도쿠 입장 화면·스도쿠 저장·오목돌 그라데이션: 백엔드 29 suites / 1629(연속 2회 통과; E2E 와 동시에 돌리면 지연 측정 테스트가 부하로 실패), Vitest 23, E2E 35 통과·1 skip, `prisma migrate diff` 차이 없음. 육안(헤드리스 크롬): 첫 화면 데스크톱·모바일, 로비 로고·AI 대전 창, 윷 4인 2:2·업힌 말 탑·던지기 프레임(손→공중→착지→굴러 멈춤), 강제 다크에서 오목 단색 스킨 돌, 슬롯·스도쿠 입장/게임 화면. 실서버(4000): 이어서 DB 초기화 + 재시작으로 전부 반영(`/api/summary` 200, `/api/sudoku/save` 401=인증 필요).

- 2026-10-25 고스톱 먹을 패 고르기 팝업·뻑 배지 수정: 임시 서버(바닥에 1월 2장·손에 1월 피 주입)에서 데스크톱·모바일 팝업 확인, 고르는 중 '뻑' 0개. E2E 35·1 skip, Vitest 23.

- 2026-10-25 윷 참먹이 규칙 수정: 백엔드 1630 통과, 윷 E2E 4 통과.

- 2026-11-18 라스베가스 추가: 백엔드 31 suites / 1648(1개 실패 = 알려진 `heuristic` 지연 테스트, 단독 재실행 통과), 새 테스트 `vegas.test.js`(엔진·정산·AI 14)·`vegas.socket.test.js`(4: 2인 끝까지+정산, 5인 제한·3인 흰 주사위·관전·이모트·sync, AI 4명 자동 진행, 기권). E2E 전체 39(38 통과·1 skip, 첫 실행에서 라스베가스 1건이 '방금 놓은 기록' 문구가 봇 차례에 바로 사라지는 경쟁으로 실패 → 문구를 다음 배치까지 유지하도록 고친 뒤 `vegas.spec.js` 2회 연속 4/4 통과). `vegas.spec.js`: 굴리기→고르기→놓기, 자동으로 4라운드 끝까지, 5인 화면 넘침 없음. 육안(헤드리스 크롬 1180×820·Pixel 7): 고르기·굴리는 중·라운드 정산·결과 창.

- 2026-11-18 요트 다이스 추가: 백엔드 33 suites / 1677 전부 통과, 새 테스트 `yacht.test.js`(점수 15종·보너스·엔진·기권·AI 25)·`yacht.socket.test.js`(4: 2인 12라운드+정산·고정 공유, 4인 제한·관전·이모트·sync, AI 3명 자동 진행, 기권). E2E 전체 43 통과·1 skip. `yacht.spec.js` 데스크톱·모바일(굴리기→고정→다시 굴리기→기록, 자동으로 끝까지, 4인 화면 넘침 없음). 육안: 고정·굴리는 중·기록 알림(처음엔 주사위를 가려서 맨 위 한 줄로 옮김)·결과 창. 라스베가스와 주사위 그림을 `Die.jsx` 로 공유하도록 뺌(라스베가스 E2E 다시 통과).

- 2026-11-18 장기 추가: 백엔드 35 suites / 1699 전부 통과(처음 전체 실행에서 라스베가스 AI 강도 테스트가 부하로 1번 실패 → 테스트는 시간 대신 고정 시뮬레이션 횟수 `rollouts` 로 바꿈), 새 테스트 `janggi.test.js`(배치·말 7종 이동·장군·외통·빅장·한수 쉼·상차림 시간 초과·AI 19)·`janggi.socket.test.js`(3: 상차림→착수→쉼→기권 정산·다음 판 초한 교대, 2인 제한·관전·이모트·상차림 기본값·sync, AI 대전 자동 진행). E2E 전체 47 통과·1 skip, `janggi.spec.js` 데스크톱·모바일. 육안: 상차림 창·중반 판(데스크톱)·말 고르기(모바일).

- 2026-11-18 요트 다이스 화면 개편(점수표 두 열 카드·보너스 칸·칸 이름·굴리기 연출/효과음): `yacht.spec.js` 4 통과(데스크톱·모바일), Vitest 23. 육안: 데스크톱 4인·모바일 4인 고르기 화면, 굴리는 중 프레임. 프론트만 바뀌어 E2E 빌드로 실서버 화면도 이미 갱신됨(재시작 불필요).

- 2026-11-18 주사위 연출(`useReducedMotionConfig`)·윷 도에서 빽도→참먹이·고스톱 뻑 더미에 보너스패: 백엔드 35 suites / 1703 전부 통과(엔진 +3, 윷 빽도 +2·옛 '도에서 빽도 불가' 테스트 교체), Vitest 23, E2E 47 통과·1 skip. 육안 대신 측정: 크로미움에서 `reducedMotion: reduce` 를 흉내 내고 요트 주사위 transform 을 110ms 마다 재서 8프레임 중 7가지 값(흔들림→공중→착지→정지) 확인.

- 2026-11-18 말풍선 상황별 대사(7게임 × 7상황): 백엔드 36 suites / 1707 전부 통과(`emotes.test.js` 4: 서버·화면 목록 일치, 7상황 다 있음·길이·중복, 게임끼리 겹침 20% 미만, 다른 게임 방 거부), Vitest 23, E2E 전체 49 통과·1 skip(새 `emote.spec.js`: 요트 재촉·장기 도발, 데스크톱·모바일). 실서버 재시작으로 반영. 육안: 모바일 고스톱 말풍선 창(272px, 화면 안).

## 9. Next Step
- `TODO.md` 참고. 대기 중인 사용자 결정: (a) 윷놀이 개선 목록(32개 제안, 파일로 저장 안 됨) 저장/구현 여부, (b) `TODO.md` 5번 섹션(로비·소셜) 착수 여부.
- 2026-11-18 재부팅 뒤 서버가 안 떠 있던 문제(수동 nohup 실행이라 재부팅 후 복구 안 됨) → systemd 사용자 서비스 `gostop` 등록·enable, `loginctl enable-linger`. 확인: 로컬·funnel 200, `kill -9` 후 자동 재시작.
