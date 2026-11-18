import { CASINOS, resolveCasino } from './VegasGame.js';

/**
 * 라스베가스 AI. 원작 솔버(~/51_LasVegas)의 탐욕 전략 + MCTS 대신 가벼운 몬테카를로 시뮬레이션.
 * - easy: 자주 아무 눈이나 고르고, 나머지는 잡음 섞인 탐욕
 * - normal: 탐욕 — 이 카지노에서 내 몫이 얼마나 늘어나는지 (주사위를 많이 쓰면 약간 감점)
 * - hard: 고를 수 있는 눈마다 라운드 끝까지 무작위로 굴려 보며(모두 탐욕+잡음으로 둔다고 가정)
 *         '내 수익 − 상대 평균 수익' 이 가장 큰 눈. 시간 예산 안에서만 시뮬레이션한다.
 */
const HARD_MS = 25; // 메인 스레드에서 돌므로 짧게 (2인 기준 보통 상대 승률 9할 이상)
const HARD_MAX_ROLLOUTS = 2400;

/** 엔진 상태를 시뮬레이션용 배열로 복사 */
function snapshot(game) {
  const pids = game.pids;
  return {
    pids,
    notes: game.casinos.map((c) => c.notes),
    dice: game.casinos.map((c) => pids.map((p) => c.dice[p])),
    neutral: game.casinos.map((c) => c.neutral),
    own: pids.map((p) => game.dice[p].own),
    neu: pids.map((p) => game.dice[p].neutral),
  };
}

const payoutOf = (notes, row, neutral, i) => {
  const dice = {};
  row.forEach((c, k) => (dice[k] = c));
  return resolveCasino(notes, dice, neutral).payouts[i] ?? 0;
};

/** 탐욕 점수: value 눈(내 주사위 own 개 + 흰 주사위 neu 개)을 놓으면 그 카지노에서 내 몫이 얼마나 느나 */
function greedyScore(s, i, value, own, neu) {
  const c = value - 1;
  const before = payoutOf(s.notes[c], s.dice[c], s.neutral[c], i);
  const row = [...s.dice[c]];
  row[i] += own;
  const after = payoutOf(s.notes[c], row, s.neutral[c] + neu, i);
  return after - before - 0.1 * own;
}

const countBy = (faces, v) => faces.reduce((a, f) => a + (f === v), 0);

function apply(s, i, value, own, neu) {
  const c = value - 1;
  s.dice[c][i] += own;
  s.neutral[c] += neu;
  s.own[i] -= own;
  s.neu[i] -= neu;
}

/** 시뮬레이션: i 다음 사람부터 라운드 끝까지 탐욕+잡음으로 두고 최종 수익 배열을 돌려준다 */
function rollout(s, after, rnd, gone) {
  const n = s.pids.length;
  let cur = after;
  for (let guard = 0; guard < 200; guard++) {
    let next = -1;
    for (let k = 1; k <= n; k++) {
      const j = (cur + k) % n;
      if (!gone[j] && s.own[j] + s.neu[j] > 0) { next = j; break; }
    }
    if (next < 0) break;
    cur = next;
    const own = Array.from({ length: s.own[cur] }, () => 1 + Math.floor(rnd() * CASINOS));
    const neu = Array.from({ length: s.neu[cur] }, () => 1 + Math.floor(rnd() * CASINOS));
    let best = null;
    for (const v of new Set([...own, ...neu])) {
      const o = countBy(own, v);
      const u = countBy(neu, v);
      const sc = greedyScore(s, cur, v, o, u) + rnd() * 12;
      if (!best || sc > best.sc) best = { sc, v, o, u };
    }
    apply(s, cur, best.v, best.o, best.u);
  }
  const gain = Array(n).fill(0);
  for (let c = 0; c < CASINOS; c++) {
    const dice = {};
    s.dice[c].forEach((x, k) => (dice[k] = x));
    for (const [k, amt] of Object.entries(resolveCasino(s.notes[c], dice, s.neutral[c]).payouts)) gain[k] += amt;
  }
  return gain;
}

const clone = (s) => ({ ...s, dice: s.dice.map((r) => [...r]), neutral: [...s.neutral], own: [...s.own], neu: [...s.neu] });

export class VegasBot {
  constructor({ level = 'normal', rnd = Math.random, ms = HARD_MS, rollouts = null } = {}) {
    this.level = level;
    this.rnd = rnd;
    this.ms = ms; // hard 의 생각 시간
    this.rollouts = rollouts; // 주면 시간 대신 이 횟수만큼 (테스트: 부하에 따라 강도가 바뀌지 않게)
  }

  /** @returns 놓을 눈(1~6) 또는 null */
  decide(game, pid) {
    const values = game.legalValues();
    if (!values.length) return null;
    if (values.length === 1) return values[0];
    const roll = game.roll;
    const s = snapshot(game);
    const i = game.pids.indexOf(pid);
    const opts = values.map((v) => ({ v, own: countBy(roll.own, v), neu: countBy(roll.neutral, v) }));
    if (this.level === 'easy') {
      if (this.rnd() < 0.35) return values[Math.floor(this.rnd() * values.length)];
      return this.#best(opts, (o) => greedyScore(s, i, o.v, o.own, o.neu) + this.rnd() * 25);
    }
    if (this.level !== 'hard') return this.#best(opts, (o) => greedyScore(s, i, o.v, o.own, o.neu) + this.rnd() * 2);
    // hard: 몬테카를로
    const gone = game.pids.map((p) => game.gone.has(p));
    const total = opts.map(() => 0);
    const runs = opts.map(() => 0);
    const deadline = performance.now() + this.ms;
    const max = this.rollouts ?? HARD_MAX_ROLLOUTS;
    for (let r = 0; r < max; r++) {
      const k = r % opts.length;
      if (this.rollouts == null && k === 0 && r > 0 && performance.now() > deadline) break;
      const o = opts[k];
      const sim = clone(s);
      apply(sim, i, o.v, o.own, o.neu);
      const g = rollout(sim, i, this.rnd, gone);
      const others = g.filter((_, j) => j !== i && !gone[j]);
      total[k] += g[i] - (others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0);
      runs[k]++;
    }
    return this.#best(opts, (o, k) => total[k] / Math.max(1, runs[k]));
  }

  #best(opts, score) {
    let best = null;
    opts.forEach((o, k) => {
      const sc = score(o, k);
      if (!best || sc > best.sc) best = { sc, v: o.v };
    });
    return best.v;
  }
}
