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

export class SeotdaBot {
  constructor(pid, { rnd = Math.random } = {}) {
    this.pid = pid;
    this.rnd = rnd;
    this.boldness = 0.9 + rnd() * 0.2; // 봇마다 약간 다른 성향
  }

  decide(view) {
    const o = view.options;
    if (!o || view.turn !== this.pid) return null;
    const me = view.players[this.pid];
    const hand = me.hand.map((c) => c.id);
    const foes = view.pids.filter((p) => p !== this.pid && view.players[p].status === 'alive').length;
    const toCall = view.currentBet - me.bet;
    const base = equityVsOne(hand) ** Math.max(1, foes);
    // 누가 판돈을 올렸다면 상대 패가 평균보다 강하다고 본다
    const pressure = view.currentBet > view.ante ? Math.min(0.2, (view.currentBet / Math.max(1, view.pot)) * 0.25) : 0;
    const eq = Math.max(0, base - pressure) * this.boldness;
    const bluff = this.rnd() < 0.06;

    if (toCall <= 0) {
      if (o.bbing && (eq > 0.45 || bluff)) return 'bbing';
      if (o.half && (eq > 0.8 || (bluff && eq < 0.3))) return 'half';
      return 'call'; // 체크
    }
    if (o.ddadang && eq > 0.88 && this.rnd() < 0.7) return 'ddadang';
    if (o.half && eq > 0.75 && this.rnd() < 0.5) return 'half';
    const potOdds = toCall / (view.pot + toCall);
    if (eq >= potOdds + 0.08) return 'call';
    if (bluff && o.half && eq > 0.15) return 'half';
    return 'die';
  }
}
