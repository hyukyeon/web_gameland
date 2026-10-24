import { BLACK, WHITE, SIZE, newBoard, inBoard, checkWin, forbiddenReason, isFull } from './rules.js';

/**
 * 2인 오목. 흑(선공)/백. 서버가 유일한 진실: 모든 착수는 여기서 검증한다.
 * 결과: { winner: pid|null, kind: 'five'|'forfeit'|'full', line?: [[x,y]...], net: {pid: ±ante} }
 */
export class OmokGame {
  constructor(pids, { ante = 0, first = pids[0], renju = true } = {}) {
    if (pids.length !== 2) throw new Error('오목은 2명이 합니다.');
    this.pids = [...pids];
    this.ante = ante;
    this.renju = renju;
    const black = pids.includes(first) ? first : pids[0];
    this.color = { [black]: BLACK, [pids.find((p) => p !== black)]: WHITE };
    this.board = newBoard();
    this.turn = black;
    this.moves = []; // { x, y, pid, color }
    this.phase = 'playing';
    this.result = null;
  }

  get black() { return this.pids.find((p) => this.color[p] === BLACK); }
  get white() { return this.pids.find((p) => this.color[p] === WHITE); }
  opponent(pid) { return this.pids.find((p) => p !== pid); }
  get last() { return this.moves[this.moves.length - 1] ?? null; }

  place(pid, x, y) {
    if (this.phase !== 'playing') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: '내 차례가 아닙니다.' };
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inBoard(x, y)) return { ok: false, error: '바둑판 밖입니다.' };
    if (this.board[y][x] !== 0) return { ok: false, error: '이미 돌이 있는 자리입니다.' };
    const color = this.color[pid];
    if (this.renju && color === BLACK) {
      const why = forbiddenReason(this.board, x, y);
      if (why) return { ok: false, forbidden: true, error: `흑은 ${why} 자리에 둘 수 없습니다.` };
    }
    this.board[y][x] = color;
    const move = { x, y, pid, color };
    this.moves.push(move);
    const win = checkWin(this.board, x, y);
    if (win) this.#end(pid, 'five', win.line);
    else if (isFull(this.board)) this.#end(null, 'full');
    else if (this.#stuck(this.opponent(pid))) this.#end(null, 'full'); // 남은 칸이 전부 흑 금지수면 무승부
    else this.turn = this.opponent(pid);
    return { ok: true, move, ended: this.phase === 'ended' };
  }

  /** 다음 사람이 둘 수 있는 칸이 하나도 없는가 (판이 거의 찼을 때 흑의 금지수만 남는 경우) */
  #stuck(next) {
    if (!this.renju || this.color[next] !== BLACK || this.moves.length < SIZE * SIZE - 30) return false;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (this.board[y][x] === 0 && !forbiddenReason(this.board, x, y)) return false;
    return true;
  }

  /** 기권/퇴장: 상대 승리 */
  forfeit(pid) {
    if (this.phase !== 'playing' || !this.pids.includes(pid)) return { ok: false };
    this.#end(this.opponent(pid), 'forfeit');
    return { ok: true, ended: true };
  }

  #end(winner, kind, line = null) {
    this.phase = 'ended';
    this.result = {
      winner,
      kind,
      line,
      net: Object.fromEntries(this.pids.map((p) => [p, winner == null ? 0 : p === winner ? this.ante : -this.ante])),
    };
  }

  view() {
    return {
      size: SIZE,
      board: this.board,
      turn: this.turn,
      black: this.black,
      white: this.white,
      ante: this.ante,
      renju: this.renju,
      last: this.last,
      moveCount: this.moves.length,
      phase: this.phase,
      result: this.result,
    };
  }
}
