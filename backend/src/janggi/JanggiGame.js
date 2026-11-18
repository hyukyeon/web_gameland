import { CHO, HAN, other, FORMATIONS, initialBoard, legalMoves, inCheck, bikjang, applied, material, xyOf } from './rules.js';

export const MAX_PLIES = 200; // 이만큼 두면 점수로 판정
const NAMES = { K: '궁', A: '사', R: '차', C: '포', N: '마', E: '상', P: '졸' };

/**
 * 장기 한 판 (1:1). 서버가 유일한 진실 — 상차림·착수·한수 쉼·기권·종료 판정을 모두 여기서 검증한다.
 * 단계: setup(두 사람이 상차림 고르기) → playing → ended.
 * 끝나는 경우: 외통(장군인데 둘 수가 없음) · 빅장(궁끼리 마주 보게 만든 뒤 상대가 풀지 않음) · 둘 다 연달아 한수 쉼 ·
 *   MAX_PLIES 수 도달 → 앞의 셋을 뺀 나머지는 남은 말 점수(한 덤 1.5)로 판정 · 기권.
 */
export class JanggiGame {
  constructor({ cho, han, ante = 0 }) {
    this.pids = [cho, han];
    this.side = { [cho]: CHO, [han]: HAN };
    this.ante = ante;
    this.formation = { [CHO]: null, [HAN]: null };
    this.phase = 'setup';
    this.board = null;
    this.turn = cho; // 초가 먼저
    this.moves = []; // { side, from, to, piece, captured, check, pass }
    this.passes = 0; // 연달아 한수 쉼 횟수
    this.bikjangBy = null; // 빅장을 만든 쪽 (상대가 다음 수에 풀지 않으면 점수 판정)
    this.captured = { [CHO]: [], [HAN]: [] }; // 그 쪽이 잡은 상대 말
    this.seq = 0;
    this.result = null;
    this.startedAt = Date.now();
  }

  pidOf(side) { return side === CHO ? this.pids[0] : this.pids[1]; }

  /** 상차림 고르기. 둘 다 고르면 판을 깔고 시작 */
  setup(pid, formation) {
    if (this.phase !== 'setup') return { ok: false, error: '이미 시작한 판입니다.' };
    const side = this.side[pid];
    if (!side) return { ok: false, error: '대국자가 아닙니다.' };
    if (!FORMATIONS.includes(formation)) return { ok: false, error: '없는 상차림입니다.' };
    this.formation[side] = formation;
    this.seq++;
    if (this.formation[CHO] && this.formation[HAN]) this.#begin();
    return { ok: true, started: this.phase === 'playing' };
  }

  /** 시간이 다 되면 안 고른 쪽은 기본 상차림 */
  setupDefaults() {
    if (this.phase !== 'setup') return;
    for (const s of [CHO, HAN]) this.formation[s] ??= FORMATIONS[0];
    this.seq++;
    this.#begin();
  }

  #begin() {
    this.board = initialBoard(this.formation);
    this.phase = 'playing';
    this.turn = this.pidOf(CHO);
  }

  legal(pid = this.turn) {
    if (this.phase !== 'playing' || pid !== this.turn) return [];
    return legalMoves(this.board, this.side[pid]);
  }

  #check(pid, err) {
    if (this.phase === 'setup') return { ok: false, error: '상차림을 먼저 고르세요.' };
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: err ?? '내 차례가 아닙니다.' };
    return null;
  }

  move(pid, from, to) {
    const bad = this.#check(pid);
    if (bad) return bad;
    const side = this.side[pid];
    if (!this.legal(pid).some((m) => m.from === from && m.to === to)) return { ok: false, error: '둘 수 없는 수입니다.' };
    const piece = this.board[from];
    const cap = this.board[to];
    this.board = applied(this.board, from, to);
    if (cap) this.captured[side].push(cap.t);
    this.passes = 0;
    return this.#after({ side, from, to, piece: piece.t, captured: cap?.t ?? null });
  }

  /** 한수 쉼: 장군을 받고 있을 때는 못 쉰다 */
  pass(pid) {
    const bad = this.#check(pid);
    if (bad) return bad;
    const side = this.side[pid];
    if (inCheck(this.board, side)) return { ok: false, error: '장군을 받고 있어서 쉴 수 없어요.' };
    this.passes++;
    return this.#after({ side, pass: true });
  }

  #after(mv) {
    const side = mv.side;
    const opp = other(side);
    mv.check = inCheck(this.board, opp);
    const big = bikjang(this.board);
    mv.bikjang = big;
    mv.seq = ++this.seq;
    this.moves.push(mv);
    this.turn = this.pidOf(opp);
    // 외통: 상대가 둘 수가 없고 장군이면 끝 (장군이 아니면 한수 쉼으로 넘긴다)
    if (mv.check && legalMoves(this.board, opp).length === 0) return this.#end(side, 'checkmate', mv);
    // 빅장: 상대가 만든 빅장을 이번 수로 풀지 않았으면 점수 판정
    if (this.bikjangBy && this.bikjangBy !== side && big) return this.#end(this.#scoreWinner(), 'bikjang', mv);
    this.bikjangBy = big ? side : null;
    if (this.passes >= 2) return this.#end(this.#scoreWinner(), 'passes', mv);
    if (this.moves.length >= MAX_PLIES) return this.#end(this.#scoreWinner(), 'limit', mv);
    return { ok: true, move: mv, ended: false };
  }

  #scoreWinner() { return material(this.board, CHO) > material(this.board, HAN) ? CHO : HAN; }

  #end(winSide, kind, mv) {
    this.phase = 'ended';
    const winner = this.pidOf(winSide);
    const loser = this.pidOf(other(winSide));
    const score = this.board ? { [CHO]: material(this.board, CHO), [HAN]: material(this.board, HAN) } : null;
    this.result = { winner, loser, winners: [winner], losers: [loser], winSide, kind, score, plies: this.moves.length, net: { [winner]: this.ante, [loser]: -this.ante } };
    return { ok: true, move: mv ?? null, ended: true };
  }

  resign(pid) {
    if (this.phase === 'ended' || !this.side[pid]) return { ok: false, error: '진행 중인 판이 없습니다.' };
    return this.#end(other(this.side[pid]), 'resign');
  }

  forfeit(pid) {
    const r = this.resign(pid);
    return r.ok ? { ok: true, ended: true } : { ok: false };
  }

  /** 기보 한 줄 (사람이 읽는 표기) */
  static notation(mv) {
    if (mv.pass) return '한수 쉼';
    const [fx, fy] = xyOf(mv.from);
    const [tx, ty] = xyOf(mv.to);
    return `${NAMES[mv.piece]} ${fx + 1}${fy}→${tx + 1}${ty}${mv.captured ? ` ${NAMES[mv.captured]} 잡음` : ''}`;
  }

  view() {
    const playing = this.phase === 'playing';
    const toMove = playing ? this.side[this.turn] : null;
    return {
      pids: this.pids,
      side: this.side,
      phase: this.phase,
      turn: this.turn,
      formation: { ...this.formation },
      board: this.board,
      legal: playing ? legalMoves(this.board, toMove) : [],
      check: playing ? inCheck(this.board, toMove) : false,
      bikjang: this.board ? bikjang(this.board) : false,
      bikjangBy: this.bikjangBy,
      last: this.moves.at(-1) ?? null,
      plies: this.moves.length,
      maxPlies: MAX_PLIES,
      captured: { [CHO]: [...this.captured[CHO]], [HAN]: [...this.captured[HAN]] },
      score: this.board ? { [CHO]: material(this.board, CHO), [HAN]: material(this.board, HAN) } : null,
      seq: this.seq,
      ante: this.ante,
      result: this.result,
    };
  }
}
