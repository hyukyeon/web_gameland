import { card } from './cards.js';
import { cardValue } from './AiPlayer.js';

/**
 * 카드 카운팅 + 기댓값(EV) 휴리스틱 AI. (MCTS 같은 무작위 시뮬레이션은 쓰지 않아 한 번 결정에 O(손패×월) 정도만 든다)
 *
 *  - 카운팅: 한 판 동안 인스턴스를 유지하며 매 결정마다 `observe(view)` 로 "이미 나온 패"(내 손패 + 바닥 + 모든 획득패)를
 *    누적하고, 남은 패(unseen: 더미 + 상대 손패)의 월별 수량·가치를 계산한다.
 *  - 패 선택 EV = 확정 매칭 점수 + 더미 매칭 기대치(Odds) − 상대에게 내주는 리스크(방어) − 뻑 위험
 *  - 고/스톱: 지금 스톱하는 점수와, 고를 불렀을 때의 기대치(추가 득점 확률 vs 상대 역전 확률)를 비교
 */
const FULL = 48; // 보너스패(48,49)는 월이 없어 카운팅 대상에서 제외

export class HeuristicBot {
  constructor(pid, { rnd = Math.random } = {}) {
    this.pid = pid;
    this.rnd = rnd;
    this.seen = new Set(); // 이번 판에 확인된 패
    this.lastTurnKey = null;
    this.stats = { decisions: 0, ms: 0, maxMs: 0 }; // 지연 점검용
  }

  // ---------- 상태 추적 ----------
  observe(view) {
    for (const id of view.hand) this.seen.add(id);
    for (const id of view.floor) this.seen.add(id);
    for (const p of Object.keys(view.captured)) for (const id of view.captured[p]) this.seen.add(id);
    if (view.played != null) this.seen.add(view.played);
    if (view.drawn != null) this.seen.add(view.drawn);
  }

  /** 아직 보이지 않은 패(더미 + 상대 손패)의 월별 정보 */
  unseenInfo(view) {
    const byMonth = Array.from({ length: 13 }, () => []);
    let n = 0;
    for (let id = 0; id < FULL; id++) {
      if (this.seen.has(id)) continue;
      byMonth[card(id).month].push(id);
      n++;
    }
    const oppHand = view.opps.reduce((s, p) => s + (view.handCounts?.[p] ?? 0), 0);
    return { byMonth, n: Math.max(1, n), oppHand };
  }

  /** 월 m 의 안 보인 패 중 하나라도 상대 손에 있을 확률 */
  pOppHas(info, m) {
    const k = info.byMonth[m].length;
    if (!k) return 0;
    const q = Math.min(1, info.oppHand / info.n);
    return 1 - (1 - q) ** k;
  }

  avgUnseenValue(info, m) {
    const l = info.byMonth[m];
    return l.length ? l.reduce((s, id) => s + cardValue(id), 0) / l.length : 0;
  }

  // ---------- 결정 ----------
  decide(view) {
    if (view.turn !== this.pid) return null;
    const t0 = performance.now();
    this.observe(view);
    let act;
    switch (view.phase) {
      case 'chong':
        act = { type: 'chongtong' };
        break;
      case 'gwang':
        act = { type: this.shouldSellGwang(view) ? 'sellGwang' : 'passGwang' };
        break;
      case 'play':
        act = this.shouldShodang(view) ? { type: 'shodang' } : this.choosePlay(view);
        break;
      case 'shodang':
        act = { type: 'shodangAnswer', accept: this.acceptShodang(view) };
        break;
      case 'choose':
        act = { type: 'choose', cardId: this.chooseFloor(view) };
        break;
      case 'gostop':
        act = { type: this.goEV(view).go ? 'go' : 'stop' };
        break;
      default:
        act = null;
    }
    const ms = performance.now() - t0;
    this.stats.decisions++;
    this.stats.ms += ms;
    this.stats.maxMs = Math.max(this.stats.maxMs, ms);
    return act;
  }

  /** 쇼당: 두 상대가 모두 날 수 있는데 내 점수는 기준에 한참 못 미치면 부른다 */
  shouldShodang(view) {
    return !!view.shodangOk && view.scores[this.pid].total < view.threshold - 1;
  }

  /** 쇼당 응답: 내가 상대(나머지 한 명)보다 앞서 있으면 받아서(계속) 승부, 아니면 나가리 수락 */
  acceptShodang(view) {
    const other = view.active.find((p) => p !== this.pid && p !== view.shodangBy);
    return view.scores[this.pid].total <= (view.scores[other]?.total ?? 0);
  }

  shouldSellGwang(view) {
    const gw = view.hand.filter((id) => card(id).kind === 'gwang');
    return gw.length === 3 && gw.some((id) => card(id).bi);
  }

  /** 바닥 선택: 먹었을 때 가치가 큰 쪽. 같은 월의 남은 패(내 손에 있는 것 포함)가 많은 쪽을 남기는 게 유리하므로 가치+보정 */
  chooseFloor(view) {
    const info = this.unseenInfo(view);
    let best = null;
    for (const id of view.choice.options) {
      // 먹지 않고 남기는 패는 상대가 가져갈 수 있다 → 남기는 쪽의 위험을 빼서 비교
      const others = view.choice.options.filter((o) => o !== id);
      const leftRisk = others.reduce((s, o) => s + this.pOppHas(info, card(o).month) * cardValue(o), 0);
      const g = cardValue(id) - leftRisk * 0.5 + this.rnd() * 0.01;
      if (!best || g > best.g) best = { id, g };
    }
    return best.id;
  }

  /** 더미를 뒤집었을 때 기대 이득: floor(내 패를 낸 뒤의 바닥) 와 맞는 월이 나올 확률 × 가치 */
  drawEV(floorAfter, info, exceptHand = []) {
    let ev = 0;
    for (let m = 1; m <= 12; m++) {
      const k = info.byMonth[m].length;
      if (!k) continue;
      const onFloor = floorAfter.filter((f) => card(f).month === m);
      if (!onFloor.length) continue;
      const p = k / info.n;
      const gain = Math.max(...onFloor.map(cardValue)) + this.avgUnseenValue(info, m);
      ev += p * gain;
    }
    return ev;
  }

  /** 패 하나를 냈을 때의 기대값 */
  evOfPlay(id, view, info) {
    const m = card(id).month;
    const v = cardValue(id);
    const hand = view.hand;
    const handM = hand.filter((h) => card(h).month === m);
    const floorM = view.floor.filter((f) => card(f).month === m);
    const floorOther = view.floor.filter((f) => card(f).month !== m);
    const k = info.byMonth[m].length; // 이 달의 남은 패 수
    const pm = k / info.n; // 더미에서 같은 달이 나올 확률

    // 폭탄: 손패 3장 + 바닥 1장
    if (handM.length === 3 && floorM.length === 1) {
      return 40 + v + cardValue(floorM[0]) + handM.reduce((s, h) => s + cardValue(h), 0);
    }
    // 뻑 더미 먹기 (바닥 3장)
    if (floorM.length === 3) {
      return 25 + v + floorM.reduce((s, f) => s + cardValue(f), 0) + this.drawEV(floorOther, info);
    }

    let immediate = 0;
    let risk = 0;
    let floorAfter;
    if (floorM.length >= 1) {
      // 확정 매칭
      const pick = floorM.length === 2 && card(floorM[0]).kind !== card(floorM[1]).kind ? Math.max(...floorM.map(cardValue)) : cardValue(floorM[0]);
      immediate = 10 + v + pick;
      floorAfter = floorM.length === 2 ? [...floorOther, floorM.find((f) => cardValue(f) !== pick) ?? floorM[1]] : floorOther;
      // 같은 달이 더미에서 또 나오면 뻑(손패 매칭 후 한 장 남는 구조) — 이 달에 남은 패가 있고 내 손에 더 없을 때 위험
      if (floorM.length === 1 && handM.length === 1) risk += pm * 6;
      // 따닥 보너스: 손패에 같은 달이 더 있고 더미에서 나오면 연속 획득
      if (floorM.length === 1 && handM.length >= 2) immediate += pm * 4;
    } else {
      // 바닥에 내려놓기: 더미에서 같은 달이 나오면 둘 다 먹는다
      immediate = -v * 0.6 + pm * (v + this.avgUnseenValue(info, m)) * 1.2;
      floorAfter = [...view.floor, id];
      // 방어: 상대가 이 달을 쥐고 있으면 가져간다. 내가 같은 달을 더 쥐고 있으면(내 손의 같은 달 수만큼) 다음에 내가 가져갈 수 있어 위험이 줄어든다
      risk += this.pOppHas(info, m) * v * (handM.length > 1 ? 0.6 : 1);
    }
    // 내 패를 낸 뒤 바닥에 남은 패가 상대에게 넘어갈 위험 (내가 쥔 달은 상대가 못 가져가게 막고 있으므로 제외)
    const myMonths = new Set(hand.filter((h) => h !== id).map((h) => card(h).month));
    for (const f of floorAfter) {
      const fm = card(f).month;
      if (myMonths.has(fm)) continue;
      risk += this.pOppHas(info, fm) * cardValue(f) * 0.35;
    }
    return immediate + this.drawEV(floorAfter, info) - risk;
  }

  choosePlay(view) {
    const hand = view.hand;
    if (hand.length === 0) return { type: 'play', cardId: null };
    const bonus = hand.find((id) => card(id).kind === 'bonus');
    if (bonus != null) return { type: 'play', cardId: bonus };

    const info = this.unseenInfo(view);
    let best = null;
    for (const id of hand) {
      const ev = this.evOfPlay(id, view, info) + this.rnd() * 0.01;
      if (!best || ev > best.ev) best = { id, ev };
    }
    if (view.dummies?.[this.pid] > 0 && best.ev < 0) return { type: 'play', cardId: null };

    // 좋은 매칭이 없고 같은 달 3장이면 흔들기 (바닥 1장이면 폭탄이라 위에서 이미 선택됨)
    if (best.ev < 8) {
      const months = [...new Set(hand.map((h) => card(h).month))];
      const m = months.find((mm) => hand.filter((h) => card(h).month === mm).length >= 3);
      if (m != null && !(view.floor.filter((f) => card(f).month === m).length === 1)) {
        const cards = hand.filter((h) => card(h).month === m);
        const low = cards.reduce((x, y) => (cardValue(y) < cardValue(x) ? y : x));
        return { type: 'play', cardId: low, shake: true };
      }
    }
    const M = card(best.id).month;
    const handM = hand.filter((h) => card(h).month === M).length;
    const floorM = view.floor.filter((f) => card(f).month === M).length;
    return { type: 'play', cardId: best.id, shake: handM >= 3 && !(handM === 3 && floorM === 1) };
  }

  // ---------- 고/스톱 ----------
  /** 획득패에서 아직 완성되지 않은 족보 중 "남은 패로 완성 가능한" 것의 수 (득점 임박도) */
  nearSets(captured, info) {
    const has = new Set(captured);
    const unseenHas = (id) => !this.seen.has(id);
    const sets = [
      { ids: [0, 8, 28, 40, 44], need: 3, kind: 'gwang' },
      { ids: [4, 12, 29], need: 3 }, // 고도리
      { ids: [1, 5, 9], need: 3 }, // 홍단
      { ids: [21, 33, 37], need: 3 }, // 청단
      { ids: [13, 17, 25], need: 3 }, // 초단
    ];
    let near = 0;
    for (const s of sets) {
      const got = s.ids.filter((id) => has.has(id)).length;
      const remain = s.ids.filter((id) => !has.has(id) && unseenHas(id)).length;
      if (got + remain >= s.need && got >= s.need - 1 && got < s.need && remain > 0) near += 1;
    }
    const pi = captured.filter((id) => ['pi', 'ssangpi', 'bonus'].includes(card(id).kind)).length;
    if (pi >= 7 && pi < 10) near += 0.5;
    return near;
  }

  /**
   * 고 vs 스톱의 기댓값.
   * stop = 지금 확정되는 점수, go = (1-상대역전) × (현재 + 고 가산 + 추가득점 기대) − 상대역전 × 손실
   */
  goEV(view) {
    const me = this.pid;
    const info = this.unseenInfo(view);
    const left = view.hand.length;
    const mine = view.scores[me].total;
    const goCount = view.go[me];
    const th = view.threshold;
    const stop = mine + Math.min(goCount, 2);

    if (left < 2) return { go: false, stop, goValue: -Infinity };
    if (goCount >= 3) return { go: false, stop, goValue: -Infinity };

    // 내 추가 득점 확률: 임박한 족보 수와 남은 턴 수
    const myRate = 0.3 + 0.35 * this.nearSets(view.captured[me], info);
    const pGain = 1 - Math.exp(-myRate * left * 0.6);
    const avgGain = 1.3;

    // 상대 역전 확률: 점수 부족분 대비 상대의 득점 속도
    let pOpp = 0;
    let oppMax = 0;
    for (const p of view.opps) {
      const s = view.scores[p].total;
      oppMax = Math.max(oppMax, s);
      const need = Math.max(1, th - s);
      const rate = 0.1 + 0.35 * this.nearSets(view.captured[p], info) + 0.07 * s;
      const turns = Math.max(1, view.handCounts?.[p] ?? left);
      const reach = 1 - Math.exp(-(rate * turns * 0.9) / need);
      pOpp = 1 - (1 - pOpp) * (1 - reach);
    }
    // 고박: 고를 부르고 지면 상대 몫까지 내야 한다 → 손실은 임계 점수의 1.5배 수준
    const loss = 1.5 * Math.max(th, oppMax + 1);
    const oppGoPenalty = view.opps.some((p) => view.go[p] > 0) ? 1.25 : 1; // 상대도 고를 불렀으면 판이 커진다
    const goValue = (1 - pOpp) * (stop + 1 + pGain * avgGain) - pOpp * loss * oppGoPenalty;
    return { go: goValue > stop + 0.25, stop, goValue, pOpp, pGain };
  }
}
