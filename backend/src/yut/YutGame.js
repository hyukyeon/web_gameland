import { WAIT, DONE, forward } from './board.js';

/** 던진 결과 → 이동 칸 수. 빽도는 -1 */
export const THROWS = {
  back: { name: '빽도', n: -1 },
  do: { name: '도', n: 1 },
  gae: { name: '개', n: 2 },
  geol: { name: '걸', n: 3 },
  yut: { name: '윷', n: 4 },
  mo: { name: '모', n: 5 },
};
export const bonusThrow = (k) => k === 'yut' || k === 'mo';

/** 윷가락 평면이 위로 올 확률. 0.6 이면 도 ≈ 11.5% · 개 ≈ 34.6% · 걸 ≈ 34.6% · 윷 ≈ 13% · 모 ≈ 2.6% · 빽도 ≈ 3.8% */
export const P_FLAT = 0.6;
export const PIECES = 4;

/** 윷가락 4개(0 번이 빽도 표시가 있는 가락)를 던진다. 평면이 위인 가락 수로 결과가 정해진다. */
export function throwSticks(rnd = Math.random) {
  const sticks = [0, 1, 2, 3].map(() => rnd() < P_FLAT);
  const flat = sticks.filter(Boolean).length;
  const kind = flat === 0 ? 'mo' : flat === 4 ? 'yut' : flat === 3 ? 'geol' : flat === 2 ? 'gae' : sticks[0] ? 'back' : 'do';
  return { sticks, kind };
}

/**
 * 가족 윷놀이. 2~4 명, 자리 순서대로 청(0)·홍(1) 팀에 번갈아 들어간다. 팀마다 말 4개.
 * 서버가 유일한 진실: 던지기·이동·업기·잡기·승리를 모두 여기서 검증한다.
 * 한 차례: 던지기(윷·모면 한 번 더) → 쌓인 결과를 말에 나눠 쓰기 → (상대 말을 잡았으면 한 번 더 던지기).
 */
export class YutGame {
  constructor(pids, { ante = 0, first = pids[0], rnd = Math.random, script = [] } = {}) {
    if (pids.length < 2 || pids.length > 4) throw new Error('윷놀이는 2~4명이 합니다.');
    this.pids = [...pids];
    this.ante = ante;
    this.rnd = rnd;
    this.script = [...script]; // 테스트용: 앞에서부터 정해진 결과를 먼저 쓴다
    this.team = {};
    this.members = [[], []];
    this.pids.forEach((p, i) => {
      this.team[p] = i % 2;
      this.members[i % 2].push(p);
    });
    this.gone = new Set(); // 기권·퇴장한 사람 (차례에서 건너뜀)
    this.pieces = [0, 1].flatMap((t) => Array.from({ length: PIECES }, (_, i) => ({ id: t * PIECES + i, team: t, pos: WAIT, trail: [] })));
    this.idx = [0, 0]; // 팀 안에서 다음 차례 순번
    this.turn = this.pids.includes(first) ? first : this.pids[0];
    this.curTeam = this.team[this.turn];
    this.idx[this.curTeam] = this.members[this.curTeam].indexOf(this.turn) + 1;
    this.phase = 'throw'; // throw | move | ended
    this.throwsLeft = 1; // 남은 던지기
    this.thrown = false; // 이번 차례에 이미 던졌는가
    this.pending = []; // 아직 쓰지 않은 결과 ['do','yut',…]
    this.lastThrow = null; // { kind, name, sticks, pid }
    this.lastMove = null; // { pid, pieceIds, from, path, captured: [ids], finished }
    this.log = []; // 던진 결과 기록 (복기·통계용)
    this.turns = 1;
    this.seq = 0; // 던지기·이동마다 +1 (클라이언트가 새 연출인지 알아보는 번호)
    this.result = null;
    this.startedAt = Date.now();
  }

  get extraTurn() { return Math.max(0, this.throwsLeft - (this.thrown ? 0 : 1)); } // 이번 차례에 첫 던지기 말고 더 얻은 횟수
  get score() { return [0, 1].map((t) => this.pieces.filter((p) => p.team === t && p.pos === DONE).length); }
  opponentTeam(t) { return 1 - t; }
  #alive(t) { return this.members[t].filter((p) => !this.gone.has(p)); }

  /** 이 말과 같은 칸에 있는 같은 팀 말 전부(업힌 말). 대기 중인 말은 혼자 움직인다 */
  groupOf(piece) {
    if (piece.pos === WAIT || piece.pos === DONE) return [piece];
    return this.pieces.filter((p) => p.team === piece.team && p.pos === piece.pos);
  }

  /** 이 결과로 이 말(과 업힌 말들)이 갈 수 있는가 → 경로. 불가능하면 null */
  #plan(piece, kind) {
    if (piece.pos === DONE) return null;
    const n = THROWS[kind].n;
    if (n < 0) {
      if (piece.pos === WAIT) return null; // 아직 안 나온 말은 뒤로 갈 곳이 없다
      // 도(1)에서 빽도: 참먹이(0)로 간다 — 판 위에 남고, 거기서 한 칸이라도 더 가야 나간다
      if (piece.trail.length < 2) return piece.pos === 1 ? { path: [0], back: true } : null;
      return { path: [piece.trail[piece.trail.length - 2]], back: true };
    }
    return { path: forward(piece.pos, piece.trail, n), back: false };
  }

  /** 지금 둘 수 있는 (말, 결과) 조합 */
  legalMoves() {
    if (this.phase !== 'move') return [];
    const out = [];
    const seen = new Set();
    for (const p of this.pieces.filter((x) => x.team === this.curTeam)) {
      // 같은 칸의 업힌 말은 하나로 센다
      const key = p.pos === WAIT ? `w${p.id}` : p.pos === DONE ? null : `n${p.pos}`;
      if (key == null || seen.has(key)) continue;
      seen.add(key);
      this.pending.forEach((kind, i) => {
        const plan = this.#plan(p, kind);
        if (plan) out.push({ pieceId: p.id, index: i, kind, path: plan.path });
      });
    }
    // 같은 종류의 결과는 한 번만 제시
    return out.filter((m, i) => out.findIndex((o) => o.pieceId === m.pieceId && o.kind === m.kind) === i);
  }

  throw(pid, forced) {
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: '내 차례가 아닙니다.' };
    if (this.phase !== 'throw') return { ok: false, error: '먼저 말을 움직이세요.' };
    const t = forced ? { sticks: [true, true, true, true], kind: forced } : this.script.length ? { sticks: [], kind: this.script.shift() } : throwSticks(this.rnd);
    this.throwsLeft--;
    this.thrown = true;
    this.pending.push(t.kind);
    this.lastThrow = { pid, kind: t.kind, name: THROWS[t.kind].name, sticks: t.sticks, seq: ++this.seq };
    this.lastMove = null;
    this.log.push(t.kind);
    if (bonusThrow(t.kind)) this.throwsLeft++; // 윷·모는 한 번 더
    this.#afterThrowOrMove();
    return { ok: true, throw: this.lastThrow };
  }

  /** pieceId 의 말(업힌 말 포함)을 pending[index] 결과만큼 움직인다 */
  move(pid, pieceId, index) {
    if (this.phase === 'ended') return { ok: false, error: '이미 끝난 판입니다.' };
    if (pid !== this.turn) return { ok: false, error: '내 차례가 아닙니다.' };
    if (this.phase !== 'move') return { ok: false, error: '먼저 윷을 던지세요.' };
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (!piece || piece.team !== this.curTeam) return { ok: false, error: '내 팀의 말이 아닙니다.' };
    const kind = this.pending[index];
    if (!kind) return { ok: false, error: '쓸 수 있는 결과가 아닙니다.' };
    const plan = this.#plan(piece, kind);
    if (!plan) return { ok: false, error: '그 말은 그 결과로 움직일 수 없습니다.' };

    const group = this.groupOf(piece);
    const from = piece.pos;
    const dest = plan.path[plan.path.length - 1];
    this.pending.splice(index, 1);
    const captured = [];
    if (dest === DONE) {
      for (const g of group) {
        g.pos = DONE;
        g.trail = [];
      }
    } else {
      // 잡기: 도착 칸의 상대 말은 모두 대기실로
      for (const o of this.pieces.filter((x) => x.team !== piece.team && x.pos === dest)) {
        captured.push(o.id);
        o.pos = WAIT;
        o.trail = [];
      }
      // 업기: 도착 칸의 우리 말과 한 덩어리가 되어 같은 경로 기록을 쓴다
      const trail = plan.back ? piece.trail.slice(0, -1) : [...piece.trail, ...plan.path];
      for (const g of [...group, ...this.pieces.filter((x) => x.team === piece.team && x.pos === dest && !group.includes(x))]) {
        g.pos = dest;
        g.trail = [...trail];
      }
    }
    if (captured.length) this.throwsLeft++; // 잡으면 한 번 더
    this.lastMove = { pid, pieceIds: group.map((g) => g.id), from, path: plan.path, kind, captured, finished: dest === DONE, seq: ++this.seq };
    if (this.score[piece.team] === PIECES) {
      this.#end(piece.team, 'finish');
      return { ok: true, move: this.lastMove, ended: true };
    }
    this.#afterThrowOrMove();
    return { ok: true, move: this.lastMove, ended: false };
  }

  /** 던지기/이동 뒤 다음 단계를 정한다: 더 던질 수 있으면 던지기, 쓸 결과가 있으면 이동, 없으면 차례 넘김 */
  #afterThrowOrMove() {
    if (this.phase === 'ended') return;
    if (this.throwsLeft > 0) {
      this.phase = 'throw';
      return;
    }
    this.phase = 'move';
    if (this.pending.length && this.legalMoves().length) return;
    this.pending = []; // 쓸 수 없는 결과(예: 대기 말뿐일 때의 빽도)는 버린다
    this.#nextTurn();
  }

  #nextTurn() {
    this.curTeam = this.opponentTeam(this.curTeam);
    if (!this.#alive(this.curTeam).length) this.curTeam = this.opponentTeam(this.curTeam);
    const alive = this.#alive(this.curTeam);
    const list = this.members[this.curTeam];
    for (let i = 0; i < list.length; i++) {
      const c = list[(this.idx[this.curTeam] + i) % list.length];
      if (alive.includes(c)) {
        this.turn = c;
        this.idx[this.curTeam] = (this.idx[this.curTeam] + i + 1) % list.length;
        break;
      }
    }
    this.phase = 'throw';
    this.throwsLeft = 1;
    this.thrown = false;
    this.pending = [];
    this.turns++;
  }

  #end(winnerTeam, kind) {
    this.phase = 'ended';
    const winners = this.members[winnerTeam];
    const losers = this.members[this.opponentTeam(winnerTeam)];
    const net = {};
    for (const p of this.pids) net[p] = 0;
    for (const p of winners) net[p] = this.ante;
    for (const p of losers) net[p] = -this.ante;
    this.result = { winnerTeam, winners: [...winners], losers: [...losers], kind, net, score: this.score, turns: this.turns, throws: this.log.length };
  }

  /** 기권·퇴장: 팀원이 남아 있으면 그 팀은 계속(AI 가 대신), 팀 전원이 나가면 상대 팀 승리 */
  forfeit(pid) {
    if (this.phase === 'ended' || !this.pids.includes(pid) || this.gone.has(pid)) return { ok: false };
    this.gone.add(pid);
    const t = this.team[pid];
    if (!this.#alive(t).length) {
      this.#end(this.opponentTeam(t), 'forfeit');
      return { ok: true, ended: true };
    }
    if (this.turn === pid) this.#passTurnFromGone();
    return { ok: true, ended: false };
  }

  /** 차례인 사람이 나갔을 때 같은 팀의 다른 사람에게 이어서 (던지기 상태 유지) */
  #passTurnFromGone() {
    const mate = this.#alive(this.curTeam)[0];
    this.turn = mate;
  }

  /** 클라이언트에 보낼 상태 (숨길 정보 없음) */
  view() {
    return {
      pids: this.pids,
      team: this.team,
      turn: this.turn,
      curTeam: this.curTeam,
      phase: this.phase,
      throwsLeft: this.throwsLeft,
      extraTurn: this.extraTurn,
      pending: [...this.pending],
      pieces: this.pieces.map((p) => ({ id: p.id, team: p.team, pos: p.pos })),
      score: this.score,
      lastThrow: this.lastThrow,
      lastMove: this.lastMove,
      legal: this.legalMoves().map((m) => ({ pieceId: m.pieceId, index: m.index, kind: m.kind, path: m.path })),
      seq: this.seq,
      ante: this.ante,
      turns: this.turns,
      gone: [...this.gone],
      result: this.result,
    };
  }
}
