import { dirInfo, C as CEN, WIN_LEN } from './rules.js';

/**
 * 오목 탐색 엔진 (A1·A2·A3).
 *  - FastBoard: 1차원 배열 판 + 5칸 창(window) 점수의 증분 갱신 + Zobrist 해시 + 근접 칸 카운터. 착수/되돌리기가 O(20).
 *  - vcf: 4(포)만 연속으로 두어 이기는 수순 탐색 (상대의 응수가 하나로 강제되므로 좁고 깊게 볼 수 있다)
 *  - vct: 열린 3 으로 시작해 상대의 어떤 응수에도 vcf 가 남는 수 (휴리스틱 방어 후보로 근사)
 *  - search: 반복 심화 알파-베타 (전치표, 노드/시간 예산). 예산은 노드 수가 기본(결정적), 시간은 안전망.
 */
export const N = 15;
const SZ = N * N;
const EMPTY = 0;
const B = 1;
const W = 2;
export const WIN = 1_000_000;
const INF = 10_000_000;
// 5칸 창에 내 돌이 k 개(상대 0)일 때 점수. 4 는 한 칸만 더 두면 5목이라 매우 크다
const T = [0, 2, 12, 80, 700, 100_000];
const D4 = [[1, 0], [0, 1], [1, 1], [1, -1]];
const other = (c) => (c === B ? W : B);

// ----- 5칸 창 테이블 -----
const WINDOWS = [];
const CELL_WINS = Array.from({ length: SZ }, () => []);
for (const [dx, dy] of D4) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const ex = x + 4 * dx;
      const ey = y + 4 * dy;
      if (ex < 0 || ex >= N || ey < 0 || ey >= N) continue;
      const id = WINDOWS.length;
      const cells = [];
      for (let k = 0; k < 5; k++) cells.push((y + k * dy) * N + x + k * dx);
      WINDOWS.push(cells);
      for (const c of cells) CELL_WINS[c].push(id);
    }
  }
}
const NW = WINDOWS.length;
const NEIGH2 = Array.from({ length: SZ }, (_, c) => {
  const x = c % N;
  const y = (c / N) | 0;
  const out = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx;
    const ny = y + dy;
    if ((dx || dy) && nx >= 0 && ny >= 0 && nx < N && ny < N) out.push(ny * N + nx);
  }
  return out;
});

// ----- Zobrist (고정 시드: 재현 가능) -----
let seed = 0x9e3779b9;
const rnd26 = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed >>> 6;
};
const ZA = [null, new Int32Array(SZ), new Int32Array(SZ)];
const ZB = [null, new Int32Array(SZ), new Int32Array(SZ)];
for (const c of [B, W]) for (let i = 0; i < SZ; i++) { ZA[c][i] = rnd26(); ZB[c][i] = rnd26(); }

export const cellOf = (x, y) => y * N + x;
export const xyOf = (c) => [c % N, (c / N) | 0];

export class FastBoard {
  constructor() {
    this.c = new Int8Array(SZ);
    this.nb = new Int8Array(NW);
    this.nw = new Int8Array(NW);
    this.near = new Int8Array(SZ);
    this.sb = 0; // 흑이 가진 창 점수 합 (상대 돌이 없는 창만)
    this.sw = 0;
    this.ha = 0;
    this.hb = 0;
    this.count = 0;
  }

  /** 2차원 배열(0/1/2) 로부터 */
  static from(board) {
    const fb = new FastBoard();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (board[y][x]) fb.place(y * N + x, board[y][x]);
    return fb;
  }

  get key() { return this.ha * 67108864 + this.hb; }

  place(cell, color) {
    this.c[cell] = color;
    const wins = CELL_WINS[cell];
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      const b = this.nb[w];
      const h = this.nw[w];
      if (h === 0 && b > 0) this.sb -= T[b];
      else if (b === 0 && h > 0) this.sw -= T[h];
      if (color === B) this.nb[w] = b + 1; else this.nw[w] = h + 1;
      const b2 = this.nb[w];
      const h2 = this.nw[w];
      if (h2 === 0 && b2 > 0) this.sb += T[b2];
      else if (b2 === 0 && h2 > 0) this.sw += T[h2];
    }
    this.ha ^= ZA[color][cell];
    this.hb ^= ZB[color][cell];
    const ne = NEIGH2[cell];
    for (let i = 0; i < ne.length; i++) this.near[ne[i]]++;
    this.count++;
  }

  undo(cell) {
    const color = this.c[cell];
    this.c[cell] = EMPTY;
    const wins = CELL_WINS[cell];
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      const b = this.nb[w];
      const h = this.nw[w];
      if (h === 0 && b > 0) this.sb -= T[b];
      else if (b === 0 && h > 0) this.sw -= T[h];
      if (color === B) this.nb[w] = b - 1; else this.nw[w] = h - 1;
      const b2 = this.nb[w];
      const h2 = this.nw[w];
      if (h2 === 0 && b2 > 0) this.sb += T[b2];
      else if (b2 === 0 && h2 > 0) this.sw += T[h2];
    }
    this.ha ^= ZA[color][cell];
    this.hb ^= ZB[color][cell];
    const ne = NEIGH2[cell];
    for (let i = 0; i < ne.length; i++) this.near[ne[i]]--;
    this.count--;
  }

  /** side 입장의 정적 평가 (내 창 점수 − 상대 창 점수) */
  eval(side) { return side === B ? this.sb - this.sw : this.sw - this.sb; }

  /** (cell) 에서 dir 방향으로 color 가 이어진 길이 (cell 자신 제외) */
  #ray(cell, dx, dy, color) {
    let x = (cell % N) + dx;
    let y = ((cell / N) | 0) + dy;
    let n = 0;
    while (x >= 0 && y >= 0 && x < N && y < N && this.c[y * N + x] === color) { n++; x += dx; y += dy; }
    return n;
  }

  /** color 가 cell(빈칸) 에 두면 5목 승리인가 (흑은 정확히 5, 백은 5 이상) */
  wouldWin(cell, color) {
    for (const [dx, dy] of D4) {
      const len = 1 + this.#ray(cell, dx, dy, color) + this.#ray(cell, -dx, -dy, color);
      if (color === B ? len === 5 : len >= 5) return true;
    }
    return false;
  }

  /** 흑이 cell 에 두면 금지수(장목·쌍삼·쌍사)인가. 5목 완성은 금지가 아님 */
  isForbiddenBlack(cell) {
    if (this.wouldWin(cell, B)) return false;
    const x = cell % N;
    const y = (cell / N) | 0;
    let threes = 0;
    let fourz = 0;
    for (const [dx, dy] of D4) {
      const a = new Array(WIN_LEN);
      for (let i = -CEN; i <= CEN; i++) {
        if (i === 0) { a[CEN] = 'X'; continue; }
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) a[i + CEN] = 'O';
        else { const v = this.c[ny * N + nx]; a[i + CEN] = v === B ? 'X' : v === EMPTY ? '.' : 'O'; }
      }
      const info = dirInfo(a, true);
      if (info.over) return true;
      if (info.len < 5) {
        fourz += info.four;
        if (!info.pts.length && info.three) threes++;
      }
    }
    return threes >= 2 || fourz >= 2;
  }

  legal(cell, color) { return this.c[cell] === EMPTY && !(color === B && this.isForbiddenBlack(cell)); }

  /** color 가 한 칸만 두면 이기는 칸들 */
  fiveCells(color) {
    const mine = color === B ? this.nb : this.nw;
    const theirs = color === B ? this.nw : this.nb;
    let out = null;
    for (let w = 0; w < NW; w++) {
      if (mine[w] !== 4 || theirs[w] !== 0) continue;
      for (const cell of WINDOWS[w]) {
        if (this.c[cell] !== EMPTY || (out && out.includes(cell))) continue;
        if (this.wouldWin(cell, color)) (out ??= []).push(cell);
      }
    }
    return out ?? [];
  }

  /** color 가 두면 '4' 가 될 수 있는 칸 (내 돌 3개 + 상대 없음인 창의 빈칸) */
  fourCandidates(color) {
    const mine = color === B ? this.nb : this.nw;
    const theirs = color === B ? this.nw : this.nb;
    const out = [];
    const seen = new Set();
    for (let w = 0; w < NW; w++) {
      if (mine[w] !== 3 || theirs[w] !== 0) continue;
      for (const cell of WINDOWS[w]) if (this.c[cell] === EMPTY && !seen.has(cell)) { seen.add(cell); out.push(cell); }
    }
    return out;
  }

  /** 빠른 착수 순서 점수: 내 창을 키우는 값 + 상대 창을 막는 값 */
  quick(cell, me, atk = 1, def = 1) {
    const mine = me === B ? this.nb : this.nw;
    const theirs = me === B ? this.nw : this.nb;
    const wins = CELL_WINS[cell];
    let a = 0;
    let d = 0;
    for (let i = 0; i < wins.length; i++) {
      const w = wins[i];
      const m = mine[w];
      const t = theirs[w];
      if (t === 0) a += T[m + 1] - T[m];
      if (m === 0) d += T[t + 1] - T[t];
    }
    return a * atk + d * def * 0.9;
  }

  /** side 의 후보 수 상위 k 개 (돌 주변 2칸, 흑은 금지수 제외) */
  gen(side, k, atk = 1, def = 1) {
    const list = [];
    for (let cell = 0; cell < SZ; cell++) {
      if (this.c[cell] !== EMPTY || this.near[cell] === 0) continue;
      list.push([this.quick(cell, side, atk, def), cell]);
    }
    if (!list.length) return this.count === 0 ? [112] : [];
    list.sort((p, q) => q[0] - p[0]);
    const out = [];
    for (const [, cell] of list) {
      if (out.length >= k) break;
      if (side === B && this.isForbiddenBlack(cell)) continue;
      out.push(cell);
    }
    return out;
  }

  // ---------- VCF ----------
  /** me 차례에서 4 만 이어 두어 이기는 첫 수(cell) 또는 -1. st = { nodes, max, deadline, abort } */
  vcf(me, depth, st) {
    if (++st.nodes > st.max || ((st.nodes & 31) === 0 && now() > st.deadline)) { st.abort = true; return -1; }
    const mine = this.fiveCells(me);
    if (mine.length) return mine[0];
    if (depth <= 0) return -1;
    const opp = other(me);
    if (this.fiveCells(opp).length) return -1; // 상대가 먼저 5목을 낼 수 있으면 4 로는 늦다
    for (const c of this.fourCandidates(me)) {
      if (me === B && this.isForbiddenBlack(c)) continue;
      this.place(c, me);
      const R = this.fiveCells(me);
      let win = false;
      if (R.length >= 2) win = true; // 두 곳에서 5목 → 막을 수 없음
      else if (R.length === 1) {
        const r = R[0];
        if (opp === B && this.isForbiddenBlack(r)) win = true; // 흑 수비가 금지수 자리면 막을 수 없다
        else if (!this.wouldWin(r, opp)) {
          this.place(r, opp);
          win = this.vcf(me, depth - 1, st) >= 0;
          this.undo(r);
        }
      }
      this.undo(c);
      if (win) return c;
      if (st.abort) return -1;
    }
    return -1;
  }

  // ---------- VCT (열린 3 → 상대 어떤 응수에도 VCF) ----------
  vct(me, st, { threeK = 6, replyK = 12, vcfDepth = 8, vcfNodes = 400 } = {}) {
    const opp = other(me);
    if (this.fiveCells(opp).length) return -1;
    const cands = [];
    for (let cell = 0; cell < SZ; cell++) {
      if (this.c[cell] !== EMPTY || this.near[cell] === 0) continue;
      cands.push([this.quick(cell, me, 1.2, 0.3), cell]);
    }
    cands.sort((p, q) => q[0] - p[0]);
    let tried = 0;
    for (const [, c] of cands) {
      if (tried >= threeK || st.abort) break;
      if (me === B && this.isForbiddenBlack(c)) continue;
      this.place(c, me);
      const makesThree = this.#hasOpenThreeAt(c, me);
      if (!makesThree) { this.undo(c); continue; }
      tried++;
      // 상대의 응수 후보: 막는 칸 위주(상위 replyK) + 상대의 4 만들기(역공)
      const replies = new Set(this.gen(opp, replyK, 0.6, 1.2));
      for (const f of this.fourCandidates(opp)) replies.add(f);
      let all = replies.size > 0;
      for (const r of replies) {
        if (opp === B && this.isForbiddenBlack(r)) continue; // 둘 수 없는 응수
        this.place(r, opp);
        let ok;
        if (this.wouldWin(r, opp)) ok = false;
        else {
          const sub = { nodes: 0, max: vcfNodes, deadline: st.deadline, abort: false };
          ok = this.vcf(me, vcfDepth, sub) >= 0;
          st.nodes += sub.nodes;
          if (sub.abort && now() > st.deadline) st.abort = true;
        }
        this.undo(r);
        if (!ok || st.abort) { all = false; break; }
      }
      this.undo(c);
      if (all && !st.abort) return c;
      if (st.nodes > st.max) { st.abort = true; break; }
    }
    return -1;
  }

  /** cell 에 방금 둔 me 의 돌이 열린 3(다음에 열린 4 가 되는 3)을 만들었나 */
  #hasOpenThreeAt(cell, me) {
    const x = cell % N;
    const y = (cell / N) | 0;
    for (const [dx, dy] of D4) {
      const a = new Array(WIN_LEN);
      for (let i = -CEN; i <= CEN; i++) {
        if (i === 0) { a[CEN] = 'X'; continue; }
        const nx = x + dx * i;
        const ny = y + dy * i;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) a[i + CEN] = 'O';
        else { const v = this.c[ny * N + nx]; a[i + CEN] = v === me ? 'X' : v === EMPTY ? '.' : 'O'; }
      }
      const info = dirInfo(a, me === B);
      if (info.len < 5 && !info.pts.length && info.three) return true;
    }
    return false;
  }

  // ---------- 알파-베타 ----------
  /** 부모 입장에서 본 side 의 값. 승리 = WIN − ply (빠를수록 큼) */
  search(side, depth, alpha, beta, ply, st) {
    if (++st.nodes > st.max || ((st.nodes & 63) === 0 && now() > st.deadline)) { st.abort = true; return 0; }
    const opp = other(side);
    if (this.fiveCells(side).length) return WIN - ply;
    const th = this.fiveCells(opp);
    if (th.length >= 2) return -(WIN - ply - 1);
    if (depth <= 0) return this.eval(side);
    let moves;
    if (th.length === 1) {
      if (side === B && this.isForbiddenBlack(th[0])) return -(WIN - ply - 1);
      moves = th;
    } else {
      const key = this.key * 2 + (side === B ? 0 : 1);
      const e = st.tt.get(key);
      if (e && e.d >= depth) {
        if (e.f === 0) return e.v;
        if (e.f === 1 && e.v >= beta) return e.v;
        if (e.f === 2 && e.v <= alpha) return e.v;
      }
      moves = this.gen(side, K_BY_DEPTH[Math.min(depth, K_BY_DEPTH.length - 1)], st.atk, st.def);
      if (e?.m != null && moves.includes(e.m)) moves = [e.m, ...moves.filter((m) => m !== e.m)];
    }
    if (!moves.length) return 0;
    const a0 = alpha;
    let best = -INF;
    let bm = moves[0];
    for (const m of moves) {
      this.place(m, side);
      const v = -this.search(opp, depth - 1, -beta, -alpha, ply + 1, st);
      this.undo(m);
      if (st.abort) return 0;
      if (v > best) { best = v; bm = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (th.length !== 1) {
      st.tt.set(this.key * 2 + (side === B ? 0 : 1), { d: depth, v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0, m: bm });
    }
    return best;
  }

  /** 반복 심화 루트 탐색. 반환 { move, value, depth, list: [[cell, value]...] } (값은 side 입장) */
  searchRoot(side, st, { maxDepth = 6, rootK = 12 } = {}) {
    const opp = other(side);
    let moves = this.gen(side, rootK, st.atk, st.def);
    let result = null;
    for (let d = 2; d <= maxDepth; d++) {
      const vals = [];
      let alpha = -INF;
      for (const m of moves) {
        this.place(m, side);
        const v = -this.search(opp, d - 1, -INF, -alpha + 1, 1, st); // 첫 후보 이후엔 alpha 를 넘는 수만 의미 있음
        this.undo(m);
        if (st.abort) break;
        vals.push([m, v]);
        if (v > alpha) alpha = v;
      }
      if (st.abort) break;
      vals.sort((p, q) => q[1] - p[1]);
      result = { move: vals[0][0], value: vals[0][1], depth: d, list: vals };
      moves = vals.map((p) => p[0]);
      if (Math.abs(vals[0][1]) >= WIN - 100) break; // 승패가 보이면 더 깊이 볼 필요 없음
    }
    return result;
  }

  /** 지정한 수들의 값을 각각 정확한 창(−INF..INF)으로 평가 (복기 분석용). 반환 Map(cell → value, side 입장) */
  rootValues(side, depth, cells, st) {
    const opp = other(side);
    const out = new Map();
    for (const m of cells) {
      if (this.wouldWin(m, side)) { out.set(m, WIN); continue; }
      this.place(m, side);
      const v = -this.search(opp, depth - 1, -INF, INF, 1, st);
      this.undo(m);
      out.set(m, st.abort ? null : v);
      if (st.abort) break;
    }
    return out;
  }
}

const K_BY_DEPTH = [0, 8, 8, 7, 6, 5, 5];
const now = () => performance.now();

export const newState = ({ nodes = 8000, ms = 40, atk = 1, def = 1 } = {}) => ({ nodes: 0, max: nodes, deadline: now() + ms, abort: false, tt: new Map(), atk, def });

/**
 * 한 수 고르기 (최상위 두뇌).
 *  ① 내 5목 ② 상대 5목 막기 ③ 내 VCF ④ 상대 VCF 방어 ⑤ 내 VCT ⑥ 반복 심화 알파-베타(+ 상대 VCF 를 허용하는 수 제외)
 * @returns {{cell:number, why:string, value?:number, depth?:number}|null}
 */
export function think(fb, me, { nodes = 8000, vcfNodes = 3000, ms = 40, maxDepth = 6, useVcf = true, useVct = true, atk = 1, def = 1 } = {}) {
  const opp = other(me);
  const mine = fb.fiveCells(me);
  if (mine.length) return { cell: mine[0], why: 'five' };
  const theirs = fb.fiveCells(opp);
  if (theirs.length) {
    const legalBlock = theirs.find((c) => fb.legal(c, me));
    return legalBlock == null ? null : { cell: legalBlock, why: 'block-five' }; // 흑이 막을 칸이 금지수면 막을 수 없다(어차피 패)
  }
  const deadline = now() + ms;
  const vst = () => ({ nodes: 0, max: vcfNodes, deadline, abort: false });
  if (useVcf) {
    const c = fb.vcf(me, 12, vst());
    if (c >= 0 && fb.legal(c, me)) return { cell: c, why: 'vcf' };
  }
  // 상대에게 VCF 가 있으면 반드시 막는다: 후보 중 상대 VCF 가 사라지는 수
  let oppVcf = -1;
  if (useVcf) oppVcf = fb.vcf(opp, 12, vst());
  if (oppVcf >= 0) {
    const cands = [oppVcf, ...fb.gen(me, 14, atk, 1.4)];
    const seen = new Set();
    for (const c of cands) {
      if (seen.has(c) || !fb.legal(c, me)) continue;
      seen.add(c);
      fb.place(c, me);
      const safe = fb.vcf(opp, 12, vst()) < 0 || fb.fiveCells(me).length > 0;
      fb.undo(c);
      if (safe) return { cell: c, why: 'defend-vcf' };
    }
  }
  if (useVct && now() < deadline) {
    const st = { nodes: 0, max: Math.floor(nodes), deadline: Math.min(deadline, now() + ms * 0.4), abort: false };
    const c = fb.vct(me, st);
    if (c >= 0 && fb.legal(c, me)) return { cell: c, why: 'vct' };
  }
  const st = newState({ nodes, ms: Math.max(4, deadline - now()), atk, def });
  const r = fb.searchRoot(me, st, { maxDepth });
  if (!r) return null;
  // 가장 좋은 수가 상대 VCF 를 허용하면 다음 후보로
  if (useVcf) {
    for (const [cell, value] of r.list) {
      if (!fb.legal(cell, me)) continue;
      fb.place(cell, me);
      const bad = value < WIN - 100 && fb.vcf(opp, 10, { nodes: 0, max: 800, deadline, abort: false }) >= 0;
      fb.undo(cell);
      if (!bad) return { cell, why: 'search', value, depth: r.depth, list: r.list };
    }
  }
  return { cell: r.move, why: 'search', value: r.value, depth: r.depth, list: r.list };
}
