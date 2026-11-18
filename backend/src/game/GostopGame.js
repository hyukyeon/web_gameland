import { card, ALL_IDS, BONUS_IDS, shuffle } from './cards.js';
import { computeScore, loserPiCount } from './score.js';

export const GWANG_SALE_PTS_PER_GWANG = 2; // 광팔기: 광 1장당 2점 (선과 인수자를 뺀 플레이어가 지불)

/**
 * 고스톱 엔진 (2~4인). 모든 상태는 서버에서만 관리한다.
 * - 2인(맞고): 10장씩, 바닥 8장, 7점부터 고/스톱
 * - 3인: 7장씩, 바닥 6장, 3점부터 고/스톱
 * - 4인: 4명이 앉고 1명(rest)은 쉰다. 3명이 7장씩 받아 3인과 같이 진행.
 * - 광팔기: 3인/4인에서 첫 패에 광이 3장 이상이면 광을 팔 수 있다.
 *   판 패는 더미에 섞인다. 4인이면 쉬던 사람이 새로 7장을 받아 대신 치고, 3인이면 2인전이 된다.
 *   판 사람은 치지 않고, (선과 인수자를 뺀) 플레이어 각자에게 광 1장당 2점 × 판돈을 받는다.
 * - 옵션 bonus: 보너스 쌍피 3장(48~50)을 덱에 추가
 * - 옵션 ppeokPay: 뻑 칩(첫뻑 3점, 연뻑 6점, 삼연뻑 = 즉시 종료)을 각 상대에게서 받는다
 * - 옵션 ttibak: 승자의 띠가 5장 이상이면 띠박(×2)
 * - 옵션 chongtong: 첫 패에 같은 월 4장(총통)이면 즉시 종료(3점) 선언 가능, 계속해 이기면 ×4. (끄면 다시 섞음)
 * - 옵션 carry: 직전 판이 나가리였을 때의 이월 배수(보통 2)
 *
 * - 독박(3인 이상): 고를 부르고 진 사람, 또는 쇼당을 '받은' 사람이 지면 다른 패자의 몫까지 혼자 낸다.
 * - 쇼당(3인): 내 차례에 두 상대가 모두 기준 점수 이상(언제든 날 수 있는 상태)이면 쇼당을 부를 수 있다(한 판에 한 번).
 *   두 상대에게 차례로 묻고, 둘 다 수락하면 나가리. 한 명이라도 '받으면' 계속하되, 그 사람은 이번 판 독박 책임을 진다.
 *
 * 각 액션은 { ok, frames } 를 돌려주며, frames 는 클라이언트가 순서대로 재생할 스냅샷(애니메이션용)이다.
 * phase: chong(총통 선택) | gwang(광팔기 선택) | play | choose | gostop | shodang(쇼당 응답) | busy | ended
 */
export class GostopGame {
  constructor(pids, { firstPlayer, rnd, bonus = false, rest, ppeokPay = false, ttibak = false, chongtong = false, carry = 1 } = {}) {
    if (pids.length < 2 || pids.length > 4 || new Set(pids).size !== pids.length) {
      throw new Error('플레이어는 서로 다른 2~4명이어야 합니다.');
    }
    this.pids = pids;
    this.rnd = rnd || Math.random;
    this.bonusOn = bonus;
    this.opt = { ppeokPay, ttibak, chongtong, carry };
    this.frames = [];
    this.ctx = null;
    this.gukjin = Object.fromEntries(pids.map((p) => [p, 'auto'])); // 9월 국진: auto | yeol | pi
    this.deal(firstPlayer ?? pids[0], rest);
  }

  /** 현재 치는 플레이어(쉬는 사람 제외) */
  opps(pid) {
    return this.active.filter((p) => p !== pid);
  }

  /** 2인전 호환용: 첫 번째 상대 */
  opp(pid) {
    return this.opps(pid)[0];
  }

  nextOf(pid) {
    const i = this.active.indexOf(pid);
    return this.active[(i + 1) % this.active.length];
  }

  deal(first, rest) {
    const pids = this.pids;
    this.rest = null;
    if (pids.length === 4) {
      this.rest = rest && rest !== first && pids.includes(rest) ? rest : [...pids].reverse().find((p) => p !== first);
    }
    this.active = pids.filter((p) => p !== this.rest);
    if (!this.active.includes(first)) first = this.active[0];
    const n = this.active.length;
    const handSize = n === 2 ? 10 : 7;
    const floorSize = n === 2 ? 8 : 6;
    this.threshold = n === 2 ? 7 : 3;

    const monthMax = (ids) => {
      const m = {};
      ids.forEach((id) => {
        const mo = card(id).month;
        if (mo) m[mo] = (m[mo] || 0) + 1;
      });
      return Math.max(0, ...Object.values(m));
    };
    for (;;) {
      const deck = shuffle(this.bonusOn ? [...ALL_IDS, ...BONUS_IDS] : ALL_IDS, this.rnd);
      const hands = Object.fromEntries(pids.map((p) => [p, []]));
      this.active.forEach((p, i) => (hands[p] = deck.slice(i * handSize, (i + 1) * handSize)));
      const off = n * handSize;
      const floor = deck.slice(off, off + floorSize);
      // 바닥 4장 동월 / 손패 4장 동월(총통)이면 다시 섞는다
      if (monthMax(floor) >= 4) continue;
      if (!this.opt.chongtong && Object.values(hands).some((g) => monthMax(g) >= 4)) continue;
      this.hands = hands;
      this.floor = floor;
      this.stock = deck.slice(off + floorSize);
      break;
    }
    const per = (f) => Object.fromEntries(pids.map((p) => [p, f()]));
    this.captured = per(() => []);
    this.go = per(() => 0);
    this.lastGoBase = per(() => 0);
    this.shakes = per(() => 0);
    this.shaken = per(() => []);
    this.bombs = per(() => 0);
    this.dummies = per(() => 0);
    this.ppeok = per(() => 0);
    this.ppeokPiles = {}; // month -> 뻑 낸 사람
    this.ppeokBonus = {}; // month -> 그 뻑 더미에 같이 깔린 보너스패 (뻑 더미를 먹는 사람이 함께 가져간다)
    this.turnBonus = []; // 이번 차례에 얻은 보너스패 (뻑이 나면 뻑 더미에 같이 남는다)
    this.dead = [];
    this.ppeokStreak = per(() => 0);
    this.ppeokMax = per(() => 0); // 판 중 최대 연속 뻑
    this.stopper = null; // 스톱을 선언한 사람 (통계용)
    this.baks = {}; // 패자별 박 이름 (통계/업적용)
    this.extraPayments = []; // 뻑 칩 등 판 도중 확정된 지불
    this.chongHolders = [];
    this.sale = null; // { seller, buyer, payers, pts }
    this.shodang = null; // 진행 중인 쇼당 { by, queue }
    this.shodangUsed = []; // 이번 판에 쇼당을 부른 사람
    this.shodangReceiver = null; // 쇼당을 받은(계속하기로 한) 사람 → 지면 독박
    this.shodangBy = null;
    this.dokbak = null; // 독박을 쓴 사람
    this.result = null;
    this.drawn = null;
    this.played = null;
    this.actor = null;
    // 바닥에 깔린 보너스패는 선이 가져가고 대신 더미에서 채운다
    while (this.floor.some((id) => card(id).kind === 'bonus')) {
      const b = this.floor.find((id) => card(id).kind === 'bonus');
      this.floor.splice(this.floor.indexOf(b), 1);
      this.captured[first].push(b);
      this.floor.push(this.stock.shift());
    }

    const sellers = n >= 3 ? this.active.filter((p) => this.hands[p].filter((id) => card(id).kind === 'gwang').length >= 3) : [];
    const chong = this.opt.chongtong ? this.active.filter((p) => monthMax(this.hands[p]) >= 4) : [];
    this.ctx = { queue: sellers, first, chongQueue: chong };
    this.advanceSetup();
  }

  /** 시작 전 단계 진행: 총통 → 광팔기 → 플레이 */
  advanceSetup() {
    const ctx = this.ctx;
    if (ctx.chongQueue.length) {
      this.phase = 'chong';
      this.turn = ctx.chongQueue[0];
    } else if (ctx.queue.length) {
      this.phase = 'gwang';
      this.turn = ctx.queue[0];
    } else {
      this.startPlay();
    }
  }

  /** 총통 선언: 즉시 종료, 다른 플레이어 각각에게 3점 */
  callChongtong(pid) {
    if (this.phase !== 'chong' || this.turn !== pid) return { ok: false, error: '총통을 선언할 수 없습니다.' };
    this.frames = [];
    this.actor = pid;
    this.ctx = null;
    this.finish({
      draw: false,
      winner: pid,
      loser: this.opps(pid).length === 1 ? this.opp(pid) : null,
      losers: this.opps(pid),
      base: 3,
      goBonus: 0,
      mult: 1,
      tags: ['총통'],
      detail: [],
      total: 3 * this.opps(pid).length,
      chongtong: true,
      payments: this.opps(pid).map((from) => ({ kind: 'game', from, to: pid, mult: 1, tags: ['총통'], total: 3 })),
    });
    return this.flush();
  }

  /** 총통을 선언하지 않고 계속 (이기면 ×4) */
  passChongtong(pid) {
    if (this.phase !== 'chong' || this.turn !== pid) return { ok: false, error: '선택할 수 없습니다.' };
    this.frames = [];
    this.actor = pid;
    this.chongHolders.push(pid);
    this.ctx.chongQueue.shift();
    this.advanceSetup();
    this.snap();
    return this.flush();
  }

  /** 밤일낮장: 각자 한 장씩 뒤집어 선을 정한다. night=true 면 낮은 월, false 면 높은 월이 선 (동월이면 먼저 앉은 사람) */
  static decideFirst(pids, { rnd = Math.random, night = true } = {}) {
    const deck = shuffle(ALL_IDS, rnd);
    const flips = pids.map((p, i) => ({ p, m: card(deck[i]).month, id: deck[i] }));
    const best = flips.reduce((a, b) => ((night ? b.m < a.m : b.m > a.m) ? b : a));
    return { first: best.p, flips };
  }

  // ---------- 스냅샷 / 뷰 ----------
  snapshot(banner = null) {
    const scores = {};
    for (const pid of this.pids) scores[pid] = this.scoreInfo(pid);
    return structuredClone({
      pids: this.pids,
      active: this.active,
      rest: this.rest,
      threshold: this.threshold,
      carry: this.opt.carry,
      sale: this.sale,
      deadCount: this.dead.length,
      chongHolders: this.chongHolders,
      floor: this.floor,
      stockCount: this.stock.length,
      turn: this.turn,
      phase: this.phase,
      hands: this.hands,
      captured: this.captured,
      gukjin: this.gukjin,
      go: this.go,
      shakes: this.shakes,
      shaken: this.shaken,
      bombs: this.bombs,
      dummies: this.dummies,
      ppeok: this.ppeok,
      ppeokPiles: this.ppeokPiles,
      ppeokBonus: this.ppeokBonus,
      drawn: this.drawn,
      played: this.played,
      actor: this.actor,
      choice: this.phase === 'choose' ? this.ctx.choice : null,
      shodangOk: this.canShodang(this.turn) ? this.turn : null,
      shodangBy: this.shodang?.by ?? this.shodangBy,
      shodangReceiver: this.shodangReceiver,
      scores,
      result: this.result,
      banner,
    });
  }

  snap(banner = null) {
    this.frames.push(this.snapshot(banner));
  }

  /** 스냅샷을 viewer 기준 뷰로 변환 (다른 사람 손패는 숨김) */
  static viewOf(s, viewer, pids) {
    const opps = s.active.filter((p) => p !== viewer);
    const handCounts = Object.fromEntries(pids.map((p) => [p, s.hands[p].length]));
    const oppId = opps[0] ?? null;
    return {
      you: viewer,
      oppId,
      opps,
      active: s.active,
      rest: s.rest,
      threshold: s.threshold,
      sale: s.sale,
      gwangAsk: s.phase === 'gwang' ? s.turn : null,
      chongAsk: s.phase === 'chong' ? s.turn : null,
      hand: s.hands[viewer] ?? [], // 관전자는 손패가 없다
      oppHandCount: oppId == null ? 0 : s.hands[oppId].length,
      handCounts,
      floor: s.floor,
      stockCount: s.stockCount,
      turn: s.turn,
      phase: s.phase,
      captured: s.captured,
      gukjin: s.gukjin,
      go: s.go,
      shakes: s.shakes,
      shaken: s.shaken,
      bombs: s.bombs,
      dummies: s.dummies,
      ppeok: s.ppeok,
      ppeokPiles: s.ppeokPiles,
      ppeokBonus: s.ppeokBonus,
      drawn: s.drawn,
      played: s.played,
      actor: s.actor,
      choice: s.choice && s.turn === viewer ? s.choice : null,
      shodangOk: s.shodangOk === viewer, // 지금 내가 쇼당을 부를 수 있는지
      shodangAsk: s.phase === 'shodang' ? s.turn : null, // 쇼당에 답할 사람
      shodangBy: s.shodangBy ?? null,
      shodangReceiver: s.shodangReceiver ?? null,
      scores: s.scores,
      result: s.result,
      banner: s.banner,
    };
  }

  view(viewer) {
    return GostopGame.viewOf(this.snapshot(), viewer, this.pids);
  }

  /** 국진(9월 술잔)을 열끗/쌍피 중 어느 쪽으로 셀지 고른다. 'auto' 면 유리한 쪽 */
  setGukjin(pid, mode) {
    if (!this.pids.includes(pid) || !['auto', 'yeol', 'pi'].includes(mode)) return { ok: false, error: '잘못된 선택입니다.' };
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (!this.captured[pid].some((id) => card(id).dual)) return { ok: false, error: '국진을 먹지 않았습니다.' };
    this.gukjin[pid] = mode;
    return { ok: true, frames: [this.snapshot()] };
  }

  scoreInfo(pid) {
    const s = computeScore(this.captured[pid], this.gukjin[pid]);
    return { total: s.total, detail: s.detail, gwang: s.gwang, yeol: s.yeol, tti: s.tti, pi: s.pi, sepAsPi: s.sepAsPi };
  }

  // ---------- 보조 ----------
  insertNear(id) {
    const m = card(id).month;
    let idx = -1;
    this.floor.forEach((f, i) => {
      if (card(f).month === m) idx = i;
    });
    if (idx === -1) this.floor.push(id);
    else this.floor.splice(idx + 1, 0, id);
  }

  removeFromFloor(id) {
    const i = this.floor.indexOf(id);
    if (i >= 0) this.floor.splice(i, 1);
  }

  /** 각 상대에게서 피(일반 피 우선)를 n장씩 가져온다. 가져온 총 장수를 반환 */
  stealPi(pid, n) {
    let stolen = 0;
    for (const opp of this.opps(pid)) {
      for (let i = 0; i < n; i++) {
        const pool = this.captured[opp].filter((id) => ['pi', 'ssangpi'].includes(card(id).kind));
        if (!pool.length) break;
        pool.sort((x, y) => (card(x).kind === 'pi' ? 0 : 1) - (card(y).kind === 'pi' ? 0 : 1));
        const take = pool[0];
        this.captured[opp] = this.captured[opp].filter((id) => id !== take);
        this.captured[pid].push(take);
        stolen++;
      }
    }
    return stolen;
  }

  takeCards(pid, ids) {
    ids.forEach((id) => {
      this.removeFromFloor(id);
      this.captured[pid].push(id);
    });
  }

  /** 뻑 더미를 먹었을 때의 피 갈취량(상대 한 명당)과 더미에 같이 깔려 있던 보너스패 */
  ppeokEatSteal(pid, month) {
    const owner = this.ppeokPiles[month];
    if (owner === undefined) return { n: 0, text: null, bonus: [] };
    delete this.ppeokPiles[month];
    const bonus = this.ppeokBonus[month] ?? [];
    delete this.ppeokBonus[month];
    return owner === pid ? { n: 2, text: '자뻑!', bonus } : { n: 1, text: '뻑 먹기!', bonus };
  }

  isExhausted() {
    return this.stock.length === 0 && this.active.every((p) => this.hands[p].length === 0);
  }

  // ---------- 광팔기 ----------
  startPlay() {
    this.phase = 'play';
    this.turn = this.ctx.first;
    this.ctx = null;
  }

  sellGwang(pid) {
    if (this.phase !== 'gwang' || this.turn !== pid) return { ok: false, error: '광을 팔 수 없습니다.' };
    this.frames = [];
    this.actor = pid;
    const hand = this.hands[pid];
    const gwang = hand.filter((id) => card(id).kind === 'gwang').length;
    const idx = this.active.indexOf(pid);
    // 판 패는 더미에 섞어 넣는다
    this.stock = shuffle([...this.stock, ...hand], this.rnd);
    this.hands[pid] = [];
    let buyer = null;
    if (this.rest) {
      buyer = this.rest;
      this.hands[buyer] = this.stock.splice(0, hand.length);
      this.active[idx] = buyer;
    } else {
      this.active.splice(idx, 1);
    }
    this.rest = pid;
    this.threshold = this.active.length === 2 ? 7 : 3;
    if (this.ctx.first === pid) this.ctx.first = buyer ?? this.active[0];
    // 광 1장당 2점씩, 선(先)과 대신 들어온 사람을 뺀 나머지가 지불한다
    this.sale = {
      seller: pid,
      buyer,
      gwang,
      payers: this.active.filter((p) => p !== buyer && p !== this.ctx.first),
      pts: GWANG_SALE_PTS_PER_GWANG * gwang,
    };
    this.startPlay();
    this.snap({ text: '광팔기!', kind: 'sale', pid });
    return this.flush();
  }

  passGwang(pid) {
    if (this.phase !== 'gwang' || this.turn !== pid) return { ok: false, error: '선택할 수 없습니다.' };
    this.frames = [];
    this.actor = pid;
    this.ctx.queue.shift();
    if (this.ctx.queue.length) this.turn = this.ctx.queue[0];
    else this.startPlay();
    this.snap();
    return this.flush();
  }

  // ---------- 쇼당 ----------
  canShodang(pid) {
    if (this.phase !== 'play' || this.turn !== pid || this.active.length !== 3) return false;
    if (this.hands[pid].length < 2 || this.go[pid] > 0 || this.shodangUsed.includes(pid) || this.shodangReceiver != null) return false;
    return this.opps(pid).every((o) => computeScore(this.captured[o], this.gukjin[o]).total >= this.threshold);
  }

  callShodang(pid) {
    if (!this.canShodang(pid)) return { ok: false, error: '지금은 쇼당을 부를 수 없습니다.' };
    this.frames = [];
    this.actor = pid;
    this.drawn = null;
    this.played = null;
    this.shodangUsed.push(pid);
    this.shodang = { by: pid, queue: this.opps(pid) }; // 다음 사람부터 차례로 묻는다
    this.phase = 'shodang';
    this.turn = this.shodang.queue[0];
    this.snap({ text: '쇼당!', kind: 'special', pid });
    return this.flush();
  }

  /** 쇼당 응답: accept=true 면 나가리에 동의, false 면 '받아서' 계속(독박 책임) */
  answerShodang(pid, accept) {
    if (this.phase !== 'shodang' || this.turn !== pid) return { ok: false, error: '쇼당에 답할 차례가 아닙니다.' };
    this.frames = [];
    this.actor = pid;
    const sd = this.shodang;
    if (!accept) {
      this.shodang = null;
      this.shodangBy = sd.by;
      this.shodangReceiver = pid;
      this.phase = 'play';
      this.turn = sd.by;
      this.snap({ text: '쇼당 받음!', kind: 'special', pid });
      return this.flush();
    }
    sd.queue.shift();
    if (sd.queue.length) {
      this.turn = sd.queue[0];
      this.snap();
      return this.flush();
    }
    this.shodang = null;
    this.shodangBy = sd.by;
    this.finish({ draw: true, winner: null, loser: null, losers: [], total: 0, tags: ['쇼당'], detail: [], payments: [], shodang: true });
    return this.flush();
  }

  // ---------- 액션: 패 내기 ----------
  play(pid, cardId, { shake = false } = {}) {
    if (this.phase !== 'play' || this.turn !== pid) return { ok: false, error: '내 차례가 아닙니다.' };
    const hand = this.hands[pid];
    this.frames = [];
    this.drawn = null;
    this.played = null;
    this.actor = pid;
    this.ctx = { actor: pid, hPair: null, hPlaced: null, choice: null };

    if (cardId == null) {
      if (!(hand.length === 0 || this.dummies[pid] > 0)) return { ok: false, error: '낼 패를 선택하세요.' };
      if (this.dummies[pid] > 0) this.dummies[pid]--;
      this.drawStep();
      return this.flush();
    }
    if (!hand.includes(cardId)) return { ok: false, error: '가지고 있지 않은 패입니다.' };

    if (card(cardId).kind === 'bonus') {
      // 보너스패: 즉시 획득하고 더미에서 한 장을 손으로 받아 같은 턴을 이어간다
      this.hands[pid] = hand.filter((id) => id !== cardId);
      this.captured[pid].push(cardId);
      this.turnBonus.push(cardId);
      this.played = cardId;
      this.snap({ text: '보너스!', kind: 'bonus', pid });
      if (this.stock.length) {
        this.hands[pid].push(this.stock.shift());
        this.snap();
      }
      this.ctx = null;
      return this.flush();
    }

    const M = card(cardId).month;
    const handM = hand.filter((id) => card(id).month === M);
    const floorM = this.floor.filter((id) => card(id).month === M);
    const isBomb = handM.length === 3 && floorM.length === 1;
    if (shake && !isBomb && handM.length < 3) return { ok: false, error: '흔들 수 없는 패입니다.' };

    this.phase = 'busy';

    if (isBomb) {
      this.hands[pid] = hand.filter((id) => !handM.includes(id));
      this.played = cardId;
      handM.forEach((id) => this.insertNear(id));
      this.bombs[pid]++;
      this.dummies[pid] += 2;
      this.snap({ text: '폭탄!', kind: 'bomb', pid });
      this.takeCards(pid, [...handM, ...floorM]);
      const st = this.stealPi(pid, 1);
      this.snap(st ? { text: '피 획득', kind: 'steal', pid } : null);
      this.drawStep();
      return this.flush();
    }

    if (shake && handM.length >= 3) {
      this.shakes[pid]++;
      this.shaken[pid].push(M);
      this.snap({ text: '흔들기!', kind: 'shake', pid });
    }

    this.hands[pid] = hand.filter((id) => id !== cardId);
    this.played = cardId;

    if (floorM.length === 0) {
      this.floor.push(cardId);
      this.ctx.hPlaced = cardId;
      this.snap();
    } else if (floorM.length === 1) {
      this.insertNear(cardId);
      this.ctx.hPair = [cardId, floorM[0]];
      this.snap();
    } else if (floorM.length === 2) {
      this.insertNear(cardId);
      if (card(floorM[0]).kind === card(floorM[1]).kind) {
        this.ctx.hPair = [cardId, floorM[0]];
        this.snap();
      } else {
        this.phase = 'choose';
        this.ctx.choice = { step: 'hand', options: floorM };
        this.snap();
        return this.flush();
      }
    } else {
      // 바닥에 3장 (뻑 더미): 4장 모두 획득
      this.insertNear(cardId);
      this.snap();
      const eat = this.ppeokEatSteal(pid, M);
      this.takeCards(pid, [cardId, ...floorM, ...eat.bonus]);
      if (eat.n) this.stealPi(pid, eat.n);
      this.snap(eat.text ? { text: eat.text, kind: 'special', pid } : null);
    }
    this.drawStep();
    return this.flush();
  }

  choose(pid, cardId) {
    if (this.phase !== 'choose' || this.turn !== pid) return { ok: false, error: '선택할 수 없는 상태입니다.' };
    const ch = this.ctx.choice;
    if (!ch.options.includes(cardId)) return { ok: false, error: '고를 수 없는 패입니다.' };
    this.frames = [];
    this.phase = 'busy';
    this.ctx.choice = null;
    if (ch.step === 'hand') {
      const H = this.played;
      this.removeFromFloor(H);
      const i = this.floor.indexOf(cardId);
      this.floor.splice(i + 1, 0, H);
      this.ctx.hPair = [H, cardId];
      this.snap();
      this.drawStep();
    } else {
      this.captureDraw([this.ctx.S, cardId], null);
    }
    return this.flush();
  }

  // ---------- 더미 뒤집기 ----------
  drawStep() {
    const ctx = this.ctx;
    const pid = ctx.actor;
    if (this.stock.length === 0) return this.finishTurn(ctx.hPair || [], null);

    let S = this.stock.shift();
    // 더미에서 보너스패가 나오면 획득하고 한 장 더 뒤집는다
    while (card(S).kind === 'bonus') {
      this.captured[pid].push(S);
      this.turnBonus.push(S);
      this.drawn = S;
      this.snap({ text: '보너스!', kind: 'bonus', pid });
      if (this.stock.length === 0) return this.finishTurn(ctx.hPair || [], null);
      S = this.stock.shift();
    }
    ctx.S = S;
    this.drawn = S;
    this.insertNear(S);
    this.snap();

    const Ms = card(S).month;
    const pair = ctx.hPair || [];
    const pairMonth = pair.length ? card(pair[0]).month : null;
    const cand = this.floor.filter((id) => id !== S && card(id).month === Ms && !pair.includes(id));

    if (pair.length && pairMonth === Ms && cand.length === 0) {
      // 뻑: 한 월의 패 3장이 바닥에 쌓인 채 턴 종료
      this.ppeokPiles[Ms] = pid;
      this.ppeok[pid]++;
      this.ppeokStreak[pid]++;
      this.ppeokMax[pid] = Math.max(this.ppeokMax[pid], this.ppeokStreak[pid]);
      ctx.ppeokNow = true;
      ctx.hPair = null;
      // 이번 차례에 얻은 보너스패도 획득하지 못하고 뻑 더미에 같이 남는다
      if (this.turnBonus.length) {
        this.captured[pid] = this.captured[pid].filter((id) => !this.turnBonus.includes(id));
        for (const b of this.turnBonus) {
          const i = this.floor.lastIndexOf(S);
          this.floor.splice(i + 1, 0, b);
        }
        this.ppeokBonus[Ms] = [...(this.ppeokBonus[Ms] ?? []), ...this.turnBonus];
        this.turnBonus = [];
      }
      this.snap({ text: this.ppeokStreak[pid] >= 3 ? '삼연뻑!' : this.ppeokStreak[pid] === 2 ? '연뻑!' : '뻑!', kind: 'ppeok', pid });
      return this.finishTurn([], null);
    }
    if (cand.length === 0) return this.finishTurn(pair, null);

    if (cand.length === 1) {
      let special = null;
      // 따닥/쪽은 마지막 패에서는 인정되지 않는다
      const lastCard = this.isExhausted();
      if (pair.length && pairMonth === Ms) special = lastCard ? null : { text: '따닥!', kind: 'ttadak', steal: 1 };
      else if (ctx.hPlaced && cand[0] === ctx.hPlaced) special = lastCard ? null : { text: '쪽!', kind: 'jjok', steal: 1 };
      return this.captureDraw([S, cand[0]], special);
    }
    if (cand.length === 2) {
      if (card(cand[0]).kind === card(cand[1]).kind) return this.captureDraw([S, cand[0]], null);
      this.phase = 'choose';
      ctx.choice = { step: 'draw', options: cand };
      this.snap();
      return undefined;
    }
    // 3장: 뻑 더미 먹기
    const eat = this.ppeokEatSteal(pid, Ms);
    return this.captureDraw([S, ...cand, ...eat.bonus], eat.n ? { text: eat.text, kind: 'special', steal: eat.n } : null);
  }

  captureDraw(ids, special) {
    this.finishTurn([...ids, ...(this.ctx.hPair || [])], special);
  }

  // ---------- 턴 마무리 ----------
  finishTurn(captureIds, special) {
    const pid = this.ctx.actor;
    this.turnBonus = [];
    if (!this.ctx.ppeokNow) this.ppeokStreak[pid] = 0;
    else if (this.opt.ppeokPay) {
      const streak = this.ppeokStreak[pid];
      if (streak >= 3) return this.endSamyeonppeok(pid);
      const pts = streak === 2 ? 6 : 3;
      for (const from of this.opps(pid)) this.extraPayments.push({ kind: 'ppeok', from, to: pid, mult: 1, tags: [streak === 2 ? '연뻑' : '첫뻑'], total: pts });
    }
    const captured = captureIds.length > 0;
    if (captureIds.length) {
      this.takeCards(pid, captureIds);
      if (special?.steal) this.stealPi(pid, special.steal);
      this.snap(special ? { text: special.text, kind: special.kind, pid } : null);
    }
    this.ctx.hPair = null;
    if (captured && this.floor.length === 0 && !this.isExhausted()) {
      this.stealPi(pid, 1);
      this.snap({ text: '싹쓸이!', kind: 'sweep', pid });
    }
    this.afterTurn(pid);
  }

  afterTurn(pid) {
    const base = computeScore(this.captured[pid], this.gukjin[pid]).total;
    const exhausted = this.isExhausted();
    const decision = this.go[pid] === 0 ? base >= this.threshold : base > this.lastGoBase[pid];
    if (decision) {
      this.ctx.base = base;
      if (exhausted) return this.endGame(pid);
      this.phase = 'gostop';
      this.turn = pid;
      this.snap();
      return undefined;
    }
    return this.advanceTurn(pid);
  }

  advanceTurn(pid) {
    // 패가 남았거나 더미가 남은 다음 사람에게 턴을 넘긴다
    const n = this.active.length;
    const i = this.active.indexOf(pid);
    for (let k = 1; k <= n; k++) {
      const c = this.active[(i + k) % n];
      if (this.hands[c].length > 0 || this.stock.length > 0) {
        this.turn = c;
        this.phase = 'play';
        this.snap();
        return undefined;
      }
    }
    return this.endDraw();
  }

  callGo(pid) {
    if (this.phase !== 'gostop' || this.turn !== pid) return { ok: false, error: '고/스톱을 선택할 수 없습니다.' };
    this.frames = [];
    this.actor = pid;
    this.drawn = null;
    this.played = null;
    this.go[pid]++;
    this.lastGoBase[pid] = this.ctx.base;
    this.phase = 'busy';
    this.snap({ text: `${this.go[pid]}고!`, kind: 'go', pid });
    this.advanceTurn(pid);
    return this.flush();
  }

  callStop(pid) {
    if (this.phase !== 'gostop' || this.turn !== pid) return { ok: false, error: '고/스톱을 선택할 수 없습니다.' };
    this.frames = [];
    this.actor = pid;
    this.drawn = null;
    this.played = null;
    this.stopper = pid;
    this.endGame(pid);
    return this.flush();
  }

  // ---------- 종료 ----------
  /** 삼연뻑: 즉시 종료. 뻑 낸 사람이 3점으로 승리 (이미 확정된 첫뻑/연뻑 칩은 그대로 지불) */
  endSamyeonppeok(pid) {
    const losers = this.opps(pid);
    this.finish({
      draw: false,
      winner: pid,
      loser: losers.length === 1 ? losers[0] : null,
      losers,
      base: 3,
      goBonus: 0,
      mult: 1,
      tags: ['삼연뻑'],
      detail: [],
      total: 3 * losers.length,
      payments: losers.map((from) => ({ kind: 'game', from, to: pid, mult: 1, tags: ['삼연뻑'], total: 3 })),
    });
  }

  endGame(winner) {
    const losers = this.opps(winner);
    const ws = computeScore(this.captured[winner], this.gukjin[winner]);
    const goN = this.go[winner];
    const goBonus = Math.min(goN, 2);
    let common = 1;
    const commonTags = [];
    if (this.opt.carry > 1) {
      common *= this.opt.carry;
      commonTags.push(`나가리 이월 ×${this.opt.carry}`);
    }
    if (this.chongHolders.includes(winner)) {
      common *= 4;
      commonTags.push('총통 ×4');
    }
    if (goN >= 3) {
      common *= 2 ** (goN - 2);
      commonTags.push(`${goN}고 ×${2 ** (goN - 2)}`);
    }
    const sb = this.shakes[winner] + this.bombs[winner];
    if (sb) {
      common *= 2 ** sb;
      commonTags.push(`흔들기/폭탄 ×${2 ** sb}`);
    }
    const bakNames = { gwangbak: '광박', pibak: '피박', meongbak: '멍박', gobak: '고박', ttibak: '띠박' };
    const payments = losers.map((loser) => {
      const loserGwang = this.captured[loser].filter((id) => card(id).kind === 'gwang').length;
      const bak = {
        gwangbak: ws.gwangPts > 0 && loserGwang === 0,
        pibak: ws.pi >= 10 && loserPiCount(this.captured[loser], this.gukjin[loser]) < 6,
        meongbak: ws.yeol >= 7,
        gobak: this.go[loser] > 0,
        ttibak: this.opt.ttibak && ws.tti >= 5,
      };
      let mult = common;
      const tags = [...commonTags];
      this.baks[loser] = Object.keys(bak).filter((k) => bak[k]).map((k) => bakNames[k]);
      for (const k of Object.keys(bak)) {
        if (bak[k]) {
          mult *= 2;
          tags.push(`${bakNames[k]} ×2`);
        }
      }
      return { kind: 'game', from: loser, to: winner, mult, tags, total: (ws.total + goBonus) * mult };
    });
    // 독박(3인 이상): 쇼당을 받은 사람(쇼당 부른 사람이 아닌 다른 사람이 났을 때) 또는 고를 부르고 진 사람이 다른 패자의 몫까지 혼자 낸다
    const receiver = this.shodangReceiver != null && losers.includes(this.shodangReceiver) && winner !== this.shodangBy ? this.shodangReceiver : null;
    const gobaker = losers.find((l) => this.go[l] > 0);
    const dokbak = receiver ?? gobaker;
    if (dokbak != null && losers.length > 1) {
      const why = receiver != null ? '독박 (쇼당 받음)' : '독박 (고박)';
      for (const pay of payments) {
        if (pay.from !== dokbak) {
          pay.from = dokbak;
          pay.tags = [...pay.tags, why];
        }
      }
      this.dokbak = dokbak;
    }
    this.finish({
      draw: false,
      winner,
      loser: losers.length === 1 ? losers[0] : null,
      losers,
      base: ws.total,
      goBonus,
      mult: payments[0].mult,
      tags: payments[0].tags,
      detail: ws.detail,
      total: payments.reduce((a, p) => a + p.total, 0),
      payments,
    });
  }

  endDraw() {
    this.finish({ draw: true, winner: null, loser: null, losers: [], total: 0, tags: [], detail: [], payments: [] });
  }

  /** 기권/이탈: 남은 플레이어 각각에게 기준 점수만큼 지불한다 */
  forfeit(loser) {
    if (this.phase === 'ended' || !this.active.includes(loser)) return { ok: false };
    this.frames = [];
    this.actor = null;
    const others = this.opps(loser);
    this.finish({
      draw: false,
      winner: others.length === 1 ? others[0] : null,
      loser,
      losers: [loser],
      base: this.threshold,
      goBonus: 0,
      mult: 1,
      tags: ['기권승'],
      detail: [],
      total: this.threshold * others.length,
      forfeit: true,
      payments: others.map((to) => ({ kind: 'forfeit', from: loser, to, mult: 1, tags: ['기권승'], total: this.threshold })),
    });
    return this.flush();
  }

  finish(result) {
    if (this.sale) {
      result.sale = this.sale;
      for (const p of this.sale.payers) {
        result.payments.push({ kind: 'sale', from: p, to: this.sale.seller, mult: 1, tags: ['광팔기'], total: this.sale.pts });
      }
    }
    result.payments.push(...this.extraPayments);
    result.nagari = result.draw;
    result.dokbak = this.dokbak ?? null;
    // 판 통계: 포커 스타일 스탯·업적 집계용 (쉬는 사람은 active=false)
    result.baks = this.baks;
    result.stats = Object.fromEntries(
      this.pids.map((p) => {
        const sc = this.scoreInfo(p);
        return [p, { active: this.active.includes(p), go: this.go[p], stop: this.stopper === p ? 1 : 0, ppeok: this.ppeok[p], ppeokMax: this.ppeokMax[p], bomb: this.bombs[p], shake: this.shakes[p], score: sc.total, gwang: sc.gwang }];
      }),
    );
    this.result = result;
    this.phase = 'ended';
    if (this.dokbak != null) this.snap({ text: '독박!', kind: 'special', pid: this.dokbak });
    this.snap({ text: result.shodang ? '쇼당 나가리' : result.draw ? '나가리' : '게임 종료', kind: 'end', pid: result.winner });
  }

  flush() {
    const frames = this.frames;
    this.frames = [];
    return { ok: true, frames };
  }
}
