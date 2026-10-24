import { card } from './cards.js';

// 카드 가치: 광 > 쌍피 > 열끗 > 띠 > 피
const BASE = { gwang: 6, ssangpi: 4, bonus: 4, yeol: 3, tti: 2.5, pi: 1 };

export function cardValue(id) {
  const c = card(id);
  let v = BASE[c.kind];
  if (c.bi) v -= 1.5; // 비광은 점수가 낮다
  if (c.godori) v += 1; // 고도리 후보
  if (c.dual) v = 3.5; // 9월 술잔: 열끗/쌍피 겸용
  if (c.kind === 'tti' && c.tti) v += 0.3; // 홍단/청단/초단 후보
  return v;
}

/**
 * 룰 기반 AI. `decide(view)` 는 사람이 보는 것과 똑같은 뷰(`GostopGame.viewOf`)만 보고
 * 내 차례의 행동 `{type, ...}` 하나를 돌려준다. 내 차례가 아니면 null.
 *  - play: 바닥과 매칭되는 패 최우선(폭탄 > 뻑 먹기 > 매칭 가치 합), 매칭이 없으면 가치가 낮은 패부터 버림
 *  - choose: 가치가 높은 바닥패 선택
 *  - gostop: 임계값 도달 시 남은 패·고 횟수·상대 점수로 판단
 */
export class AiPlayer {
  constructor(pid, { rnd = Math.random } = {}) {
    this.pid = pid;
    this.rnd = rnd;
  }

  decide(view) {
    if (view.turn !== this.pid) return null;
    switch (view.phase) {
      case 'chong':
        return { type: 'chongtong' };
      case 'gwang':
        return { type: this.shouldSellGwang(view) ? 'sellGwang' : 'passGwang' };
      case 'play':
        return this.choosePlay(view);
      case 'choose':
        return { type: 'choose', cardId: this.bestOf(view.choice.options) };
      case 'gostop':
        return { type: this.shouldGo(view) ? 'go' : 'stop' };
      case 'shodang': {
        // 쇼당 응답: 남은 상대보다 앞서 있지 않으면 나가리 수락
        const other = view.active.find((p) => p !== this.pid && p !== view.shodangBy);
        return { type: 'shodangAnswer', accept: view.scores[this.pid].total <= (view.scores[other]?.total ?? 0) };
      }
      default:
        return null;
    }
  }

  /** 광이 3장인데 비광이 섞여 약한 패(2점)일 때만 판다. 4장 이상이나 순수 3광은 그대로 친다. */
  shouldSellGwang(view) {
    const gw = view.hand.filter((id) => card(id).kind === 'gwang');
    return gw.length === 3 && gw.some((id) => card(id).bi);
  }

  bestOf(ids) {
    return ids.reduce((a, b) => (cardValue(b) > cardValue(a) ? b : a));
  }

  /** 이 패를 냈을 때 기대 이득. 매칭이 있으면 양수, 없으면 버리는 패의 가치만큼 음수. */
  gainOf(id, view) {
    const m = card(id).month;
    const hand = view.hand;
    const handM = hand.filter((h) => card(h).month === m);
    const floorM = view.floor.filter((f) => card(f).month === m);
    const v = cardValue(id);
    if (handM.length === 3 && floorM.length === 1) return 40 + v + cardValue(floorM[0]) + handM.reduce((s, h) => s + cardValue(h), 0);
    if (floorM.length === 3) return 25 + v + floorM.reduce((s, f) => s + cardValue(f), 0);
    if (floorM.length === 2) return 10 + v + Math.max(...floorM.map(cardValue));
    if (floorM.length === 1) return 10 + v + cardValue(floorM[0]);
    // 매칭 없음: 가치가 낮은 패를 먼저 버린다. 같은 달 패를 여러 장 쥐고 있으면 아껴 둔다.
    return -v - (handM.length - 1) * 0.5;
  }

  choosePlay(view) {
    const hand = view.hand;
    if (hand.length === 0) return { type: 'play', cardId: null };

    const bonus = hand.find((id) => card(id).kind === 'bonus');
    if (bonus != null) return { type: 'play', cardId: bonus };

    let best = null;
    for (const id of hand) {
      const g = this.gainOf(id, view) + this.rnd() * 0.01; // 동점이면 무작위
      if (!best || g > best.g) best = { id, g };
    }
    // 폭탄 후 남은 더미 뒤집기 기회가 있고 낼 만한 매칭이 없으면 더미를 뒤집는다
    if (view.dummies?.[this.pid] > 0 && best.g < 0) return { type: 'play', cardId: null };

    // 좋은 매칭이 없고 같은 달 3장을 쥐고 있으면 흔들어서 점수 배수를 노린다 (바닥 1장이면 폭탄이라 위에서 이미 선택됨)
    if (best.g < 10) {
      const months = [...new Set(hand.map((h) => card(h).month))];
      const m = months.find((mm) => hand.filter((h) => card(h).month === mm).length >= 3);
      if (m != null) {
        const cards = hand.filter((h) => card(h).month === m);
        const low = cards.reduce((x, y) => (cardValue(y) < cardValue(x) ? y : x));
        return { type: 'play', cardId: low, shake: true };
      }
    }

    const M = card(best.id).month;
    const handM = hand.filter((h) => card(h).month === M).length;
    const floorM = view.floor.filter((f) => card(f).month === M).length;
    const isBomb = handM === 3 && floorM === 1;
    return { type: 'play', cardId: best.id, shake: handM >= 3 && !isBomb };
  }

  shouldGo(view) {
    const me = this.pid;
    const left = view.hand.length;
    const mine = view.scores[me].total;
    const goCount = view.go[me];
    const oppBest = Math.max(0, ...view.opps.map((p) => view.scores[p].total));
    const th = view.threshold;
    if (left < 3) return false; // 남은 패가 적으면 더 늘리기 어렵다
    if (goCount >= 2) return false; // 3고부터는 욕심내지 않는다
    if (oppBest >= th - 1) return false; // 상대가 따라붙었다
    if (view.opps.some((p) => view.go[p] > 0)) return false; // 상대가 고를 불렀으면 고박 위험
    if (mine >= th + 4) return false; // 충분히 큰 점수는 확정
    return true;
  }
}
