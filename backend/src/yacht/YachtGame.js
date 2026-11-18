/**
 * 요트 다이스 엔진. 원작: ~/52_YachtDice (파이썬 GTO 도우미). 원작 코드엔 점수 규칙이 서로 다른 두 벌이 섞여 있어
 * 널리 알려진 '요트 다이스'(닌텐도 세계의 아소비 대전집) 규칙으로 정했다:
 *   위쪽 6칸(1~6 눈의 합) + 합계 63 이상이면 보너스 35, 아래쪽 초이스(합)·포카인드(같은 눈 4개 이상이면 다섯 개 합)·
 *   풀하우스(3+2 면 다섯 개 합)·스몰 스트레이트(4개 연속 15)·라지 스트레이트(5개 연속 30)·요트(5개 같음 50).
 * 2~4 명이 번갈아 12 라운드. 한 차례: 최대 3번 굴림(굴린 뒤엔 원하는 주사위를 '고정'하고 나머지만 다시 굴림) → 빈 칸 하나에 기록.
 * 서버가 유일한 진실: 굴리기·고정·기록·점수 계산을 모두 여기서 검증한다. 숨길 정보가 없어 view() 하나를 모두에게 보낸다.
 */
export const DICE = 5;
export const ROLLS = 3;
export const UPPER = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER = ['choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
export const CATS = [...UPPER, ...LOWER];
export const BONUS_AT = 63;
export const BONUS = 35;

const counts = (dice) => {
  const c = Array(7).fill(0);
  for (const d of dice) c[d]++;
  return c;
};
const sum = (dice) => dice.reduce((a, b) => a + b, 0);
const run = (c, from, len) => {
  for (let v = from; v < from + len; v++) if (!c[v]) return false;
  return true;
};

/** 이 주사위로 이 칸에 기록하면 몇 점인가 */
export function scoreOf(cat, dice) {
  const c = counts(dice);
  const ui = UPPER.indexOf(cat);
  if (ui >= 0) return c[ui + 1] * (ui + 1);
  switch (cat) {
    case 'choice': return sum(dice);
    case 'fourKind': return c.some((n) => n >= 4) ? sum(dice) : 0;
    case 'fullHouse': return c.includes(3) && c.includes(2) ? sum(dice) : 0;
    case 'smallStraight': return run(c, 1, 4) || run(c, 2, 4) || run(c, 3, 4) ? 15 : 0;
    case 'largeStraight': return run(c, 1, 5) || run(c, 2, 5) ? 30 : 0;
    case 'yacht': return c.some((n) => n === 5) ? 50 : 0;
    default: throw new Error(`unknown category ${cat}`);
  }
}

/** 점수표 합계: 위쪽 합·보너스·전체 */
export function totals(sheet) {
  const upper = UPPER.reduce((a, k) => a + (sheet[k] ?? 0), 0);
  const bonus = upper >= BONUS_AT ? BONUS : 0;
  const lower = LOWER.reduce((a, k) => a + (sheet[k] ?? 0), 0);
  return { upper, bonus, lower, total: upper + bonus + lower };
}

const blankSheet = () => Object.fromEntries(CATS.map((k) => [k, null]));

export class YachtGame {
  constructor(pids, { ante = 0, first = pids[0], rnd = Math.random, script = [] } = {}) {
    if (pids.length < 2 || pids.length > 4) throw new Error('요트 다이스는 2~4명이 합니다.');
    this.pids = [...pids];
    this.ante = ante;
    this.rnd = rnd;
    this.script = [...script]; // 테스트용: 굴릴 때마다 앞에서부터 [주사위 5개] 를 쓴다 (고정한 자리는 무시)
    this.sheets = Object.fromEntries(this.pids.map((p) => [p, blankSheet()]));
    this.firstIdx = Math.max(0, this.pids.indexOf(first));
    this.turn = this.pids[this.firstIdx];
    this.round = 0; // 0~11
    this.gone = new Set();
    this.seq = 0;
    this.turns = 1;
    this.lastScore = null; // { pid, cat, score, dice, seq }
    this.result = null;
    this.startedAt = Date.now();
    this.#resetTurn();
  }

  get alive() { return this.pids.filter((p) => !this.gone.has(p)); }

  #resetTurn() {
    this.dice = [0, 0, 0, 0, 0]; // 0 = 아직 안 굴림
    this.held = [false, false, false, false, false];
    this.rollsLeft = ROLLS;
    this.phase = 'roll'; // roll(한 번도 안 굴림) | decide(굴림 — 고정·다시 굴리기·기록) | ended
    this.lastRoll = null;
  }

  /** 지금 주사위로 기록할 수 있는 칸과 점수 */
  options(pid = this.turn) {
    if (this.phase !== 'decide' || pid !== this.turn) return {};
    const sheet = this.sheets[pid];
    return Object.fromEntries(CATS.filter((k) => sheet[k] == null).map((k) => [k, scoreOf(k, this.dice)]));
  }

  /** 굴린 뒤 고정할 주사위 표시 (held: 5개 true/false) */
  hold(pid, held) {
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: '내 차례가 아닙니다.' };
    if (this.phase !== 'decide') return { ok: false, error: '먼저 주사위를 굴리세요.' };
    if (!Array.isArray(held) || held.length !== DICE) return { ok: false, error: '고정 정보가 잘못됐습니다.' };
    this.held = held.map(Boolean);
    this.seq++;
    return { ok: true };
  }

  roll(pid) {
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: '내 차례가 아닙니다.' };
    if (this.rollsLeft <= 0) return { ok: false, error: '이번 차례엔 더 굴릴 수 없어요. 칸을 골라 기록하세요.' };
    if (this.phase === 'decide' && this.held.every(Boolean)) return { ok: false, error: '모두 고정돼 있어요.' };
    const s = this.script.shift();
    const rolled = [];
    this.dice = this.dice.map((d, i) => {
      if (this.phase === 'decide' && this.held[i]) return d;
      rolled.push(i);
      return s ? s[i] : 1 + Math.floor(this.rnd() * 6);
    });
    if (this.phase === 'roll') this.held = [false, false, false, false, false];
    this.rollsLeft--;
    this.phase = 'decide';
    this.lastRoll = { pid, rolled, n: ROLLS - this.rollsLeft, seq: ++this.seq };
    return { ok: true, roll: this.lastRoll };
  }

  /** 빈 칸 하나에 지금 주사위 점수를 기록하고 차례를 넘긴다 */
  score(pid, cat) {
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: '내 차례가 아닙니다.' };
    if (this.phase !== 'decide') return { ok: false, error: '먼저 주사위를 굴리세요.' };
    if (!CATS.includes(cat)) return { ok: false, error: '없는 칸입니다.' };
    if (this.sheets[pid][cat] != null) return { ok: false, error: '이미 기록한 칸입니다.' };
    const pts = scoreOf(cat, this.dice);
    this.sheets[pid][cat] = pts;
    this.lastScore = { pid, cat, score: pts, dice: [...this.dice], seq: ++this.seq };
    this.#next();
    return { ok: true, score: this.lastScore, ended: this.phase === 'ended' };
  }

  #next() {
    if (this.alive.every((p) => CATS.every((k) => this.sheets[p][k] != null))) return this.#end('finish');
    const n = this.pids.length;
    let i = this.pids.indexOf(this.turn);
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (i === this.firstIdx) this.round++;
      if (!this.gone.has(this.pids[i])) break;
    }
    this.turn = this.pids[i];
    this.turns++;
    this.#resetTurn();
    return undefined;
  }

  total(pid) { return totals(this.sheets[pid]).total; }

  standings() {
    return [...this.pids].sort((a, b) => (this.gone.has(a) - this.gone.has(b)) || this.total(b) - this.total(a));
  }

  #end(kind) {
    this.phase = 'ended';
    const alive = this.alive;
    const top = Math.max(...alive.map((p) => this.total(p)));
    const winners = kind === 'forfeit' ? alive : alive.filter((p) => this.total(p) === top);
    const losers = this.pids.filter((p) => !winners.includes(p));
    const net = Object.fromEntries(this.pids.map((p) => [p, 0]));
    for (const p of losers) net[p] = -this.ante;
    winners.forEach((p) => (net[p] = Math.floor((this.ante * losers.length) / winners.length)));
    const scores = Object.fromEntries(this.pids.map((p) => [p, this.total(p)]));
    this.result = { winners, losers, kind, net, scores, standings: this.standings(), turns: this.turns };
  }

  /** 기권·퇴장: 차례에서 빠진다 (점수표는 남김). 한 명만 남으면 그 사람 승리 */
  forfeit(pid) {
    if (this.phase === 'ended' || !this.pids.includes(pid) || this.gone.has(pid)) return { ok: false };
    this.gone.add(pid);
    if (this.alive.length < 2) {
      this.#end('forfeit');
      return { ok: true, ended: true };
    }
    if (this.turn === pid) this.#next();
    return { ok: true, ended: this.phase === 'ended' };
  }

  view() {
    return {
      pids: this.pids,
      turn: this.turn,
      round: this.round,
      rounds: CATS.length,
      phase: this.phase,
      dice: [...this.dice],
      held: [...this.held],
      rollsLeft: this.rollsLeft,
      options: this.options(),
      sheets: Object.fromEntries(this.pids.map((p) => [p, { ...this.sheets[p] }])),
      totals: Object.fromEntries(this.pids.map((p) => [p, totals(this.sheets[p])])),
      lastRoll: this.lastRoll,
      lastScore: this.lastScore,
      seq: this.seq,
      ante: this.ante,
      turns: this.turns,
      gone: [...this.gone],
      result: this.result,
    };
  }
}
