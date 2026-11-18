import { CHO, other, pseudoMoves, legalMoves, bikjang, material, xyOf } from './rules.js';

/**
 * 장기 AI: 알파베타 탐색(제자리 두기/무르기로 빠르게). 탐색 안에서는 '궁을 잡는 수'를 아주 큰 점수로 보고
 * 자기 궁 안전 검사를 생략한다(유사 합법수) — 맨 위에서만 진짜 합법수로 거른다.
 * easy: 1수 + 큰 잡음 · normal: 2수 + 잡기 연장 · hard: 시간 예산 안에서 깊이를 늘림(보통 3~4수) + 잡기 연장.
 */
const MATE = 100000;
const PIECE = { K: 0, R: 1300, C: 700, N: 500, E: 300, A: 300, P: 200 };
const CFG = {
  easy: { depth: 1, noise: 250, qdepth: 0, ms: 50 },
  normal: { depth: 2, noise: 30, qdepth: 2, ms: 120 },
  hard: { depth: 6, noise: 0, qdepth: 4, ms: 150 }, // 메인 스레드에서 돌므로 짧게 (보통 3수까지)
};

/** 판 평가 (side 입장): 말 점수 + 졸이 앞으로 나간 정도 + 궁성 근처 압박 */
function evaluate(b, side) {
  let s = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p) continue;
    let v = PIECE[p.t];
    const [x, y] = xyOf(i);
    if (p.t === 'P') {
      const adv = p.side === CHO ? 6 - y : y - 3; // 강을 건넌 만큼
      v += Math.max(0, adv) * 12 + (x >= 3 && x <= 5 ? 6 : 0);
    } else if (p.t === 'R' || p.t === 'C' || p.t === 'N') {
      // 가운데·상대 진영 쪽에 있으면 약간 가산
      const adv = p.side === CHO ? 9 - y : y;
      v += adv * 3 + (4 - Math.abs(4 - x)) * 2;
    }
    s += p.side === side ? v : -v;
  }
  return s;
}

export class JanggiBot {
  constructor({ level = 'normal', rnd = Math.random, ms } = {}) {
    this.level = CFG[level] ? level : 'normal';
    this.rnd = rnd;
    this.cfg = { ...CFG[this.level], ...(ms != null ? { ms } : {}) };
  }

  #gen(b, side) {
    const out = [];
    for (let i = 0; i < b.length; i++) {
      if (b[i]?.side !== side) continue;
      for (const to of pseudoMoves(b, i)) {
        const cap = b[to];
        // 잡는 수 먼저 (값 큰 말을 값 싼 말로)
        out.push({ from: i, to, order: cap ? 10 * PIECE[cap.t] + (cap.t === 'K' ? MATE : 0) - PIECE[b[i].t] / 10 : 0 });
      }
    }
    return out.sort((a, c) => c.order - a.order);
  }

  #search(b, side, depth, alpha, beta, ply) {
    if (performance.now() > this.deadline) this.timeUp = true;
    if (this.timeUp) return 0;
    this.nodes++;
    if (depth <= 0) return this.#quiesce(b, side, alpha, beta, this.cfg.qdepth, ply);
    const moves = this.#gen(b, side);
    if (!moves.length) return evaluate(b, side); // 둘 수가 없으면 한수 쉼과 같다고 보고 평가
    let best = -Infinity;
    for (const m of moves) {
      const cap = b[m.to];
      if (cap?.t === 'K') return MATE - ply;
      b[m.to] = b[m.from];
      b[m.from] = null;
      const v = -this.#search(b, other(side), depth - 1, -beta, -alpha, ply + 1);
      b[m.from] = b[m.to];
      b[m.to] = cap;
      if (this.timeUp) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** 잡는 수만 더 본다 (수평선 효과 줄이기) */
  #quiesce(b, side, alpha, beta, qd, ply) {
    const stand = evaluate(b, side);
    if (qd <= 0 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    for (const m of this.#gen(b, side)) {
      const cap = b[m.to];
      if (!cap) break; // 잡는 수가 앞에 정렬돼 있다
      if (cap.t === 'K') return MATE - ply;
      b[m.to] = b[m.from];
      b[m.from] = null;
      const v = -this.#quiesce(b, other(side), -beta, -alpha, qd - 1, ply + 1);
      b[m.from] = b[m.to];
      b[m.to] = cap;
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  /**
   * @param bikjangBy 상대가 빅장을 걸어 둔 상태면 상대 쪽 ('cho'|'han') — 풀지 않으면 바로 점수 판정
   * @returns {{from,to}|null} null 이면 한수 쉼 (둘 수가 없을 때)
   */
  decide(board, side, { bikjangBy = null } = {}) {
    const legal = legalMoves(board, side);
    if (!legal.length) return null;
    // 빅장: 점수 판정으로 끝나면 이기는가 (한 덤 포함)
    const scoreWin = (bd) => material(bd, side) > material(bd, other(side));
    const END = MATE / 2;
    const b = board.slice();
    this.deadline = performance.now() + this.cfg.ms;
    this.nodes = 0;
    let scored = legal.map((m) => ({ ...m, v: 0 }));
    // 반복 깊이 늘리기: 시간이 다 되면 마지막으로 끝난 깊이의 결과를 쓴다
    for (let d = 1; d <= this.cfg.depth; d++) {
      this.timeUp = false;
      const cur = [];
      let alpha = -Infinity;
      const order = [...scored].sort((a, c) => c.v - a.v);
      for (const m of order) {
        const cap = b[m.to];
        b[m.to] = b[m.from];
        b[m.from] = null;
        let v;
        const big = bikjang(b);
        if (big && bikjangBy === other(side)) v = scoreWin(b) ? END : -END; // 상대 빅장을 안 풀면 바로 점수 판정
        else {
          // 잡음을 섞는 난이도는 모든 수의 정확한 값이 필요해 창을 열어 두고, 아니면 최선보다 '엄밀히' 나쁜 수만 잘라낸다
          // (같은 값으로 잘린 수가 최선과 동점이 되면 엉뚱한 수를 고르게 된다)
          v = -this.#search(b, other(side), d - 1, -Infinity, this.cfg.noise ? Infinity : -alpha + 1, 1);
          // 내가 빅장을 걸면 상대는 점수 판정을 받아들일 수 있다 → 그 결과보다 좋을 수 없다
          if (big && !this.timeUp) v = Math.min(v, scoreWin(b) ? END : -END);
        }
        b[m.from] = b[m.to];
        b[m.to] = cap;
        if (this.timeUp) break;
        cur.push({ ...m, v });
        if (v > alpha) alpha = v;
      }
      if (this.timeUp && cur.length < order.length) break;
      scored = cur;
      if (Math.max(...scored.map((m) => m.v)) >= MATE - 50) break; // 외통을 찾았다
    }
    const noise = this.cfg.noise;
    let best = null;
    for (const m of scored) {
      const v = m.v + (noise ? (this.rnd() - 0.5) * noise : this.rnd() * 0.5);
      if (!best || v > best.v) best = { ...m, v };
    }
    return { from: best.from, to: best.to };
  }
}
