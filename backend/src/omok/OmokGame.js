import { BLACK, WHITE, SIZE, newBoard, inBoard, checkWin, forbiddenReason, forbiddenCells, threatCells, isFull } from './rules.js';

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
    this.startedAt = Date.now();
    this.lastMoveAt = this.startedAt; // 마지막 착수 시각 (중복 요청 판별·소요 시간용)
    this.cache = null; // view 용 계산 캐시 (착수 수가 바뀌면 무효)
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
    this.lastMoveAt = Date.now();
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

  /**
   * 무르기: pid 의 마지막 수를 되돌린다. 상대가 그 뒤에 두었다면 상대 수까지 함께 (결과적으로 pid 의 차례로 돌아온다).
   * 반환 { ok, removed: 되돌린 수 개수 }
   */
  undo(pid) {
    if (this.phase !== 'playing' || !this.pids.includes(pid)) return { ok: false, error: '무를 수 없습니다.' };
    const mine = this.moves.map((m, i) => (m.pid === pid ? i : -1)).filter((i) => i >= 0).pop();
    if (mine == null) return { ok: false, error: '아직 둔 수가 없습니다.' };
    const removed = this.moves.splice(mine);
    for (const m of removed) this.board[m.y][m.x] = 0;
    this.turn = pid;
    this.cache = null;
    return { ok: true, removed: removed.length };
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
      moveCount: this.moves.length,
      elapsedMs: Date.now() - this.startedAt,
      net: Object.fromEntries(this.pids.map((p) => [p, winner == null ? 0 : p === winner ? this.ante : -this.ante])),
    };
  }

  /** 이 판에서 흑이 둘 수 없는 칸 / 위협 칸 (착수 수가 같으면 캐시) */
  #derived() {
    if (this.cache?.n !== this.moves.length) {
      const blackToMove = this.phase === 'playing' && this.color[this.turn] === BLACK;
      this.cache = {
        n: this.moves.length,
        forbidden: this.renju && blackToMove ? forbiddenCells(this.board) : [],
        threats: this.phase === 'playing' ? threatCells(this.board) : [],
      };
    }
    return this.cache;
  }

  view() {
    const d = this.#derived();
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
      moves: this.moves.map((m) => [m.x, m.y]),
      forbidden: d.forbidden,
      threats: d.threats,
      startedAt: this.startedAt,
      phase: this.phase,
      result: this.result,
    };
  }
}
