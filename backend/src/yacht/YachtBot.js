import { CATS, UPPER, BONUS, BONUS_AT, scoreOf, totals } from './YachtGame.js';

/**
 * 요트 다이스 AI. 원작 솔버(~/52_YachtDice)는 휴리스틱 자리표시만 있어 새로 만들었다.
 * - 한 차례 안의 결정(무엇을 고정할지)은 정확한 기댓값 계산: 주사위 5개 조합 252개 × 고정 조합 462개를
 *   남은 굴림 수만큼 거꾸로 계산한다(한 번에 수 ms).
 * - 차례가 끝날 때의 가치 V0 = 빈 칸 중 가장 좋은 기록값.
 *   easy: 가장 많은 눈만 남기고 다시 굴림 · 점수 큰 칸(가끔 둘째) — 계산 없음
 *   normal: 위 기댓값 계산 + V0 = 그냥 점수 (요트 칸을 0점으로 버리는 등 낭비가 있음)
 *   hard: 기댓값 계산 + V0 = 점수 − 칸의 평균 기대 점수(희귀한 칸을 아껴 둠) + 위쪽 보너스(63) 진행 가산
 */
// 칸별로 '나중에 기록하면 평균 이 정도'(대략값): 낮은 점수를 받고 쓰기엔 아까운 칸일수록 크다
// 가중치: 2인 150판 자가 대국 평균으로 골랐다 (평균 기대치 빼기 0 → 165점, 지금 값 → 약 180점)
const TUNE = { base: 1, upper: 0.9, bonus: 0.8 };
const BASELINE = { ones: 2.1, twos: 5.3, threes: 8.5, fours: 12.2, fives: 15.6, sixes: 19.2, choice: 22, fourKind: 13, fullHouse: 11, smallStraight: 10.5, largeStraight: 12, yacht: 15 };

// ---- 주사위 조합(눈별 개수) 미리 계산 ----
const FACT = [1, 1, 2, 6, 24, 120];
const keyOf = (c) => c[1] + c[2] * 6 + c[3] * 36 + c[4] * 216 + c[5] * 1296 + c[6] * 7776;
/** 개수 n 의 모든 조합과 그 확률 (n 개를 굴렸을 때) */
function multisets(n) {
  const out = [];
  const c = [0, 0, 0, 0, 0, 0, 0];
  const rec = (v, left) => {
    if (v === 6) {
      c[6] = left;
      let ways = FACT[n];
      for (let k = 1; k <= 6; k++) ways /= FACT[c[k]];
      out.push({ c: [...c], p: ways / 6 ** n });
      return;
    }
    for (let k = 0; k <= left; k++) {
      c[v] = k;
      rec(v + 1, left - k);
    }
  };
  rec(1, n);
  return out;
}
const ROLL_OUT = [0, 1, 2, 3, 4, 5].map(multisets); // ROLL_OUT[n] = n 개 굴린 결과 분포
const FULL = ROLL_OUT[5].map((x) => x.c); // 5개 조합 252
const diceOf = (c) => c.flatMap((n, v) => Array(v ? n : 0).fill(v));
const countsOf = (dice) => {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
};
/** c 의 부분 조합(고정할 수 있는 것) 전부 */
function subsets(c) {
  const out = [];
  const k = [0, 0, 0, 0, 0, 0, 0];
  const rec = (v) => {
    if (v === 7) return out.push([...k]);
    for (let n = 0; n <= c[v]; n++) {
      k[v] = n;
      rec(v + 1);
    }
    return undefined;
  };
  rec(1);
  return out;
}

export class YachtBot {
  constructor({ level = 'normal', rnd = Math.random } = {}) {
    this.level = level;
    this.rnd = rnd;
  }

  /** 기록 가치: 이 주사위로 끝낼 때 가장 좋은 칸과 그 값 */
  #best(sheet, dice) {
    const open = CATS.filter((k) => sheet[k] == null);
    const t = totals(sheet);
    const upperLeft = UPPER.filter((k) => sheet[k] == null);
    // 보너스를 아직 못 받았고 받을 가능성이 있으면 위쪽 칸에 가산
    const maxUpper = t.upper + upperLeft.reduce((a, k) => a + (UPPER.indexOf(k) + 1) * 5, 0);
    const chasing = t.upper < BONUS_AT && maxUpper >= BONUS_AT;
    let best = null;
    for (const k of open) {
      const s = scoreOf(k, dice);
      let v = s;
      if (this.level === 'hard') {
        v -= BASELINE[k] * TUNE.base;
        const ui = UPPER.indexOf(k);
        if (ui >= 0 && chasing) {
          const face = ui + 1;
          v += (s - 3 * face) * TUNE.upper; // 눈당 3개 기준보다 많이 모을수록 보너스에 가까워진다
          if (t.upper + s >= BONUS_AT) v += BONUS * TUNE.bonus;
        }
      }
      if (!best || v > best.v) best = { k, v, s };
    }
    return best;
  }

  /** 남은 굴림 r 번일 때 각 조합의 가치표 (V[r][key]) 와 고정 조합 기댓값 (E[r][key]) */
  #tables(sheet, maxR) {
    const V = [new Map()];
    for (const c of FULL) V[0].set(keyOf(c), this.#best(sheet, diceOf(c)).v);
    const E = [];
    for (let r = 1; r <= maxR; r++) {
      const memo = new Map();
      const prev = V[r - 1];
      const expect = (k) => {
        const key = keyOf(k);
        if (memo.has(key)) return memo.get(key);
        const n = 5 - (k[1] + k[2] + k[3] + k[4] + k[5] + k[6]);
        let e = 0;
        for (const o of ROLL_OUT[n]) {
          const s = [0, k[1] + o.c[1], k[2] + o.c[2], k[3] + o.c[3], k[4] + o.c[4], k[5] + o.c[5], k[6] + o.c[6]];
          e += o.p * prev.get(keyOf(s));
        }
        memo.set(key, e);
        return e;
      };
      E[r] = expect;
      if (r < maxR) {
        const cur = new Map();
        for (const c of FULL) {
          let v = prev.get(keyOf(c));
          for (const k of subsets(c)) v = Math.max(v, expect(k));
          cur.set(keyOf(c), v);
        }
        V[r] = cur;
      }
    }
    return { V, E };
  }

  /**
   * 다음 행동. game.phase === 'roll' 이면 { type: 'roll' },
   * 'decide' 면 { type: 'roll', held } (고정하고 다시 굴림) 또는 { type: 'score', cat }
   */
  decide(game, pid) {
    if (game.phase === 'roll') return { type: 'roll' };
    const sheet = game.sheets[pid];
    const dice = game.dice;
    const r = game.rollsLeft;
    if (this.level === 'easy') {
      if (r > 0 && this.rnd() < 0.85) {
        const c = countsOf(dice);
        let face = 6;
        for (let v = 6; v >= 1; v--) if (c[v] > c[face]) face = v;
        const held = dice.map((d) => d === face);
        if (!held.every(Boolean)) return { type: 'roll', held };
      }
      const open = CATS.filter((k) => sheet[k] == null).map((k) => ({ k, s: scoreOf(k, dice) })).sort((a, b) => b.s - a.s);
      const pickIdx = open.length > 1 && this.rnd() < 0.3 ? 1 : 0;
      return { type: 'score', cat: open[pickIdx].k };
    }
    if (r > 0) {
      const { E } = this.#tables(sheet, r);
      const c = countsOf(dice);
      const stop = this.#best(sheet, dice).v;
      let bestK = null;
      let bestE = -Infinity;
      for (const k of subsets(c)) {
        const e = E[r](k);
        if (e > bestE) { bestE = e; bestK = k; }
      }
      const noise = this.level === 'normal' ? this.rnd() * 0.5 : 0;
      if (bestE > stop + 1e-9 + noise && keyOf(bestK) !== keyOf(c)) {
        // 고정할 눈 개수만큼 앞에서부터 표시
        const left = [...bestK];
        const held = dice.map((d) => (left[d] > 0 ? (left[d]--, true) : false));
        return { type: 'roll', held };
      }
    }
    return { type: 'score', cat: this.#best(sheet, dice).k };
  }
}
