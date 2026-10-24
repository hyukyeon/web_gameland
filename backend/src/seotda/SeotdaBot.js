import { SEOTDA_DECK, compareHands } from './rules.js';

/**
 * 섯다 AI. `decide(view)` 는 사람이 보는 것과 같은 뷰(`SeotdaGame.view`)만 보고 행동 문자열 하나를 돌려준다.
 *  - 내 패 + 이미 공개된 정보(내 패)를 뺀 18장에서 상대가 가질 수 있는 모든 2장 조합과 직접 겨뤄 승률(equity)을 구한다.
 *  - 승률을 팟 오즈와 비교해 콜/다이, 아주 강하면 따당·하프, 가끔 허세(블러프).
 */
const equityCache = new Map();

/** 내 패가 상대 한 명(무작위 2장)을 이길 확률. 재경기는 반승으로 친다. */
export function equityVsOne(hand) {
  const key = [...hand].sort((a, b) => a - b).join(',');
  if (equityCache.has(key)) return equityCache.get(key);
  const rest = SEOTDA_DECK.filter((id) => !hand.includes(id));
  let score = 0;
  let n = 0;
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const r = compareHands({ 1: hand, 2: [rest[i], rest[j]] });
      n += 1;
      if (r.rematch) score += 0.5;
      else if (r.winners.includes(1)) score += r.winners.length === 1 ? 1 : 0.5;
    }
  }
  const eq = score / n;
  equityCache.set(key, eq);
  return eq;
}

/**
 * level: easy(콜이 헤프고 상대 수를 무시) | normal | hard(압박 반영·허세 절제·가치 베팅)
 * boldness/bluff: 성향(공격형은 크게, 수비형은 작게). normal 은 봇마다 약간 흔들린다.
 */
export class SeotdaBot {
  constructor(pid, { rnd = Math.random, level = 'normal', boldness = 1, bluff = 0.06 } = {}) {
    this.pid = pid;
    this.rnd = rnd;
    this.level = level;
    this.boldness = level === 'normal' ? boldness * (0.9 + rnd() * 0.2) : boldness;
    this.bluffRate = level === 'easy' ? Math.max(bluff, 0.12) : level === 'hard' ? bluff * 0.8 : bluff;
  }

  decide(view) {
    const a = this.think(view);
    // 보통은 가끔 실수한다: 죽어야 할 때 따라가거나, 올려야 할 때 그냥 콜
    if (this.level === 'normal' && a && view.options?.call && this.rnd() < 0.15 && (a === 'die' || a === 'half' || a === 'ddadang')) return 'call';
    return a;
  }

  think(view) {
    const o = view.options;
    if (!o || view.turn !== this.pid) return null;
    const me = view.players[this.pid];
    const hand = me.hand.map((c) => c.id);
    const foes = view.pids.filter((p) => p !== this.pid && view.players[p].status === 'alive').length;
    const toCall = view.currentBet - me.bet;
    const easy = this.level === 'easy';
    const hard = this.level === 'hard';
    const base = equityVsOne(hand) ** (easy ? 1 : Math.max(1, foes));
    // 누가 판돈을 올렸다면 상대 패가 평균보다 강하다고 본다 (쉬움은 무시, 어려움은 더 크게 반영)
    const raised = view.currentBet > view.ante;
    const pressure = easy || !raised ? 0 : Math.min(hard ? 0.3 : 0.2, (view.currentBet / Math.max(1, view.pot)) * (hard ? 0.35 : 0.25));
    const eq = Math.max(0, base - pressure) * this.boldness;
    const bluff = this.rnd() < this.bluffRate;
    const potOdds = toCall / (view.pot + toCall);

    if (easy) {
      // 쉬움: 패 세기와 상관없이 자주 따라가고, 가끔 아무 때나 올린다
      if (toCall <= 0) {
        if (o.bbing && (eq > 0.35 || bluff)) return 'bbing';
        if (o.half && bluff) return 'half';
        return 'call';
      }
      if (o.half && (bluff || eq > 0.9) && this.rnd() < 0.5) return 'half';
      if (eq >= potOdds - 0.12 || this.rnd() < 0.25) return 'call';
      return 'die';
    }

    if (toCall <= 0) {
      if (o.bbing && (eq > 0.45 || bluff)) return 'bbing';
      if (o.half && (eq > (hard ? 0.72 : 0.8) || (bluff && eq < 0.3))) return 'half';
      return 'call'; // 체크
    }
    if (o.ddadang && eq > (hard ? 0.84 : 0.88) && this.rnd() < 0.7) return 'ddadang';
    if (o.half && eq > (hard ? 0.7 : 0.75) && this.rnd() < 0.5) return 'half';
    if (eq >= potOdds + (hard ? 0.05 : 0.08)) return 'call';
    if (bluff && o.half && eq > 0.15) return 'half';
    return 'die';
  }
}
