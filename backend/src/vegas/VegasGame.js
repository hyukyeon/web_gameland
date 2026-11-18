/**
 * 라스베가스(주사위 보드게임) 엔진. 원작: ~/51_LasVegas (파이썬 GTO 솔버)의 규칙을 옮긴 것.
 * 2~5 명, 4 라운드. 라운드마다 카지노 6곳(1~6)에 지폐를 합계 5만 이상이 되게 깔고, 모두 주사위 8개로 시작한다.
 * 차례: 남은 주사위를 모두 굴림 → 나온 눈 하나를 골라 그 눈의 주사위 '전부'를 같은 번호 카지노에 놓는다.
 * 모두 다 놓으면 정산: 카지노마다 주사위가 많은 순서로 큰 지폐부터 한 장씩. 같은 개수끼리는 모두 취소(아무것도 못 받음).
 * 중립(흰) 주사위: 2인은 1인당 4개, 3인은 2개를 내 주사위와 함께 굴려, 고른 눈에 나온 흰 주사위도 같이 놓는다.
 *   흰 주사위는 순위·동점 취소에 끼지만 돈은 받지 않는다. (원작 솔버는 라운드 끝에 한꺼번에 굴렸지만 보드게임 규칙대로 바꿈)
 * 서버가 유일한 진실: 굴리기·배치·정산 모두 여기서 검증한다. 숨길 정보가 없어 view() 하나를 모두에게 보낸다.
 */
export const CASINOS = 6;
export const ROUNDS = 4;
export const DICE = 8;
export const MIN_CASINO = 50; // 카지노당 최소 지폐 합계 (단위: 천 달러 → 50 = $50,000)
// 지폐 54장: $10k×6, $20k×8, $30k×8, $40k×6, $50k×6, $60k×5, $70k×5, $80k×5, $90k×5
export const DECK = [[10, 6], [20, 8], [30, 8], [40, 6], [50, 6], [60, 5], [70, 5], [80, 5], [90, 5]].flatMap(([v, n]) => Array(n).fill(v));
export const NEUTRAL_PER = { 2: 4, 3: 2 }; // 인원별 1인당 흰 주사위
export const NEUTRAL = 'neutral';

const shuffle = (arr, rnd) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * 카지노 정산. dice = { pid: 개수 }, neutral = 흰 주사위 개수, notes = 큰 것부터.
 * @returns {{ ranking: {who, count, tied, note, blocked}[], payouts: {pid: 금액}, used }} who 는 pid 또는 'neutral', used = 주인이 정해진 지폐 수
 */
export function resolveCasino(notes, dice, neutral = 0) {
  const entries = Object.entries(dice).filter(([, c]) => c > 0).map(([p, c]) => ({ who: Number(p), count: c }));
  if (neutral > 0) entries.push({ who: NEUTRAL, count: neutral });
  const freq = {};
  for (const e of entries) freq[e.count] = (freq[e.count] ?? 0) + 1;
  entries.sort((a, b) => b.count - a.count);
  const sorted = [...notes].sort((a, b) => b - a);
  const payouts = {};
  let k = 0;
  const ranking = entries.map((e) => {
    const tied = freq[e.count] > 1;
    let note = 0;
    if (!tied && k < sorted.length) {
      note = sorted[k++];
      if (e.who !== NEUTRAL) payouts[e.who] = note;
    }
    // 흰 주사위가 차지한 지폐는 아무도 못 받는다 (blocked)
    return { ...e, tied, note: e.who === NEUTRAL ? 0 : note, blocked: e.who === NEUTRAL ? note : 0 };
  });
  return { ranking, payouts, used: k };
}

/** 굴린 결과 배열 → 눈별 개수 [1..6] */
const countFaces = (faces) => {
  const c = Array(CASINOS + 1).fill(0);
  for (const f of faces) c[f]++;
  return c;
};

export class VegasGame {
  constructor(pids, { ante = 0, first = pids[0], rnd = Math.random, script = [] } = {}) {
    if (pids.length < 2 || pids.length > 5) throw new Error('라스베가스는 2~5명이 합니다.');
    this.pids = [...pids];
    this.ante = ante;
    this.rnd = rnd;
    this.script = [...script]; // 테스트용: { own:[눈…], neutral:[눈…] } 를 앞에서부터 굴린 결과로 쓴다
    this.neutralPer = NEUTRAL_PER[pids.length] ?? 0;
    this.firstIdx = Math.max(0, this.pids.indexOf(first));
    this.deck = shuffle(DECK, rnd);
    this.round = 0; // 0~3
    this.scores = Object.fromEntries(this.pids.map((p) => [p, 0]));
    this.won = Object.fromEntries(this.pids.map((p) => [p, []])); // 받은 지폐 (동점 판정·표시용)
    this.gone = new Set();
    this.seq = 0;
    this.turns = 0;
    this.rounds = []; // 라운드별 정산 기록
    this.result = null;
    this.startedAt = Date.now();
    this.#startRound();
  }

  get alive() { return this.pids.filter((p) => !this.gone.has(p)); }
  diceLeft(pid) { const d = this.dice[pid]; return d.own + d.neutral; }

  #startRound() {
    this.casinos = Array.from({ length: CASINOS }, (_, i) => {
      const notes = [];
      while (this.deck.length && notes.reduce((a, b) => a + b, 0) < MIN_CASINO) notes.push(this.deck.shift());
      return { value: i + 1, notes: notes.sort((a, b) => b - a), dice: Object.fromEntries(this.pids.map((p) => [p, 0])), neutral: 0 };
    });
    this.dice = Object.fromEntries(this.pids.map((p) => [p, this.gone.has(p) ? { own: 0, neutral: 0 } : { own: DICE, neutral: this.neutralPer }]));
    // 라운드마다 선이 한 자리씩 돈다
    const n = this.pids.length;
    let i = (this.firstIdx + this.round) % n;
    for (let k = 0; k < n && this.gone.has(this.pids[i]); k++) i = (i + 1) % n;
    this.turn = this.pids[i];
    this.phase = 'roll'; // roll | place | roundEnd | ended
    this.roll = null; // { own:[눈…], neutral:[눈…] }
    this.lastPlace = null;
    this.turns++;
  }

  /** 지금 놓을 수 있는 눈 (굴린 주사위에 나온 눈) */
  legalValues() {
    if (this.phase !== 'place' || !this.roll) return [];
    return [...new Set([...this.roll.own, ...this.roll.neutral])].sort((a, b) => a - b);
  }

  rollDice(pid) {
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: '내 차례가 아닙니다.' };
    if (this.phase !== 'roll') return { ok: false, error: this.phase === 'place' ? '먼저 주사위를 놓으세요.' : '라운드 정산 중입니다.' };
    const d = this.dice[pid];
    const die = () => 1 + Math.floor(this.rnd() * CASINOS);
    const s = this.script.shift();
    this.roll = s
      ? { own: s.own.slice(0, d.own), neutral: (s.neutral ?? []).slice(0, d.neutral) }
      : { own: Array.from({ length: d.own }, die), neutral: Array.from({ length: d.neutral }, die) };
    this.roll.pid = pid;
    this.roll.seq = ++this.seq;
    this.phase = 'place';
    this.lastPlace = null;
    return { ok: true, roll: this.roll };
  }

  /** 굴린 주사위 중 value 눈을 전부 value 번 카지노에 놓는다 */
  place(pid, value) {
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: '내 차례가 아닙니다.' };
    if (this.phase !== 'place') return { ok: false, error: '먼저 주사위를 굴리세요.' };
    const v = Number(value);
    if (!this.legalValues().includes(v)) return { ok: false, error: '굴린 주사위에 없는 눈입니다.' };
    const own = this.roll.own.filter((f) => f === v).length;
    const neutral = this.roll.neutral.filter((f) => f === v).length;
    const c = this.casinos[v - 1];
    c.dice[pid] += own;
    c.neutral += neutral;
    this.dice[pid].own -= own;
    this.dice[pid].neutral -= neutral;
    this.lastPlace = { pid, value: v, own, neutral, roll: this.roll, seq: ++this.seq };
    this.roll = null;
    const next = this.#nextPlayer(pid);
    if (next == null) {
      this.#endRound();
      return { ok: true, place: this.lastPlace, roundEnd: true, ended: this.phase === 'ended' };
    }
    this.turn = next;
    this.phase = 'roll';
    this.turns++;
    return { ok: true, place: this.lastPlace, roundEnd: false, ended: false };
  }

  #nextPlayer(after) {
    const n = this.pids.length;
    const i0 = this.pids.indexOf(after);
    for (let k = 1; k <= n; k++) {
      const p = this.pids[(i0 + k) % n];
      if (!this.gone.has(p) && this.diceLeft(p) > 0) return p;
    }
    return null;
  }

  #endRound() {
    const gains = Object.fromEntries(this.pids.map((p) => [p, 0]));
    const casinos = this.casinos.map((c) => {
      const { ranking, payouts, used } = resolveCasino(c.notes, c.dice, c.neutral);
      for (const [p, amt] of Object.entries(payouts)) {
        gains[p] += amt;
        this.scores[p] += amt;
        this.won[p].push(amt);
      }
      return { value: c.value, notes: c.notes, ranking, left: c.notes.slice(used) }; // left: 주인 없이 버려지는 지폐
    });
    this.rounds.push({ round: this.round + 1, casinos, gains, scores: { ...this.scores } });
    this.phase = 'roundEnd';
    this.roll = null;
    if (this.round + 1 >= ROUNDS) this.#end('finish');
  }

  /** 라운드 정산 화면이 끝나면 서버가 부른다 */
  nextRound() {
    if (this.phase !== 'roundEnd') return { ok: false };
    this.round++;
    this.#startRound();
    return { ok: true };
  }

  /** 순위: 돈이 많은 순 (나간 사람은 맨 뒤). 같은 돈이면 공동 순위 — 1등이 여럿이면 함께 이긴다 */
  standings() {
    return [...this.pids].sort((a, b) => (this.gone.has(a) - this.gone.has(b)) || this.scores[b] - this.scores[a]);
  }

  #end(kind) {
    this.phase = 'ended';
    const alive = this.alive;
    const top = Math.max(...alive.map((p) => this.scores[p]));
    const winners = kind === 'forfeit' ? alive : alive.filter((p) => this.scores[p] === top);
    const losers = this.pids.filter((p) => !winners.includes(p));
    const net = Object.fromEntries(this.pids.map((p) => [p, 0]));
    for (const p of losers) net[p] = -this.ante;
    const pool = this.ante * losers.length;
    winners.forEach((p) => (net[p] = Math.floor(pool / winners.length)));
    this.result = { winners, losers, kind, net, scores: { ...this.scores }, standings: this.standings(), rounds: this.rounds.length, turns: this.turns };
  }

  /** 기권·퇴장: 남은 주사위는 버리고 차례에서 빠진다. 한 명만 남으면 그 사람 승리 */
  forfeit(pid) {
    if (this.phase === 'ended' || !this.pids.includes(pid) || this.gone.has(pid)) return { ok: false };
    this.gone.add(pid);
    this.dice[pid] = { own: 0, neutral: 0 };
    if (this.alive.length < 2) {
      this.#end('forfeit');
      return { ok: true, ended: true };
    }
    if (this.turn === pid && (this.phase === 'roll' || this.phase === 'place')) {
      this.roll = null;
      const next = this.#nextPlayer(pid);
      if (next == null) {
        this.#endRound();
        return { ok: true, ended: this.phase === 'ended', roundEnd: true };
      }
      this.turn = next;
      this.phase = 'roll';
    }
    return { ok: true, ended: false };
  }

  view() {
    return {
      pids: this.pids,
      round: this.round,
      rounds: ROUNDS,
      turn: this.turn,
      phase: this.phase,
      casinos: this.casinos.map((c) => ({ value: c.value, notes: c.notes, dice: { ...c.dice }, neutral: c.neutral })),
      dice: Object.fromEntries(this.pids.map((p) => [p, { ...this.dice[p] }])),
      neutralPer: this.neutralPer,
      roll: this.roll,
      legal: this.legalValues(),
      lastPlace: this.lastPlace,
      lastRound: this.rounds.at(-1) ?? null,
      scores: { ...this.scores },
      won: Object.fromEntries(this.pids.map((p) => [p, [...this.won[p]]])),
      deckLeft: this.deck.length,
      seq: this.seq,
      ante: this.ante,
      turns: this.turns,
      gone: [...this.gone],
      result: this.result,
    };
  }
}
