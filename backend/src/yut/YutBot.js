import { WAIT, DONE, forward } from './board.js';
import { THROWS } from './YutGame.js';

/**
 * 윷놀이 AI. 가능한 (말, 결과) 수를 점수로 비교한다.
 * 잡기 > 도착 > 업기 > 지름길 진입 > 앞선 말 전진. 상대에게 잡히기 쉬운 자리(바로 앞 1~5칸 안)는 감점.
 * level: easy 는 점수에 큰 잡음을 섞는다.
 */
export class YutBot {
  constructor({ level = 'normal', rnd = Math.random } = {}) {
    this.level = level;
    this.rnd = rnd;
  }

  decide(game) {
    const moves = game.legalMoves();
    if (!moves.length) return null;
    const noise = this.level === 'easy' ? 40 : this.level === 'normal' ? 2 : 0;
    let best = null;
    for (const m of moves) {
      const s = this.#score(game, m) + this.rnd() * noise;
      if (!best || s > best.s) best = { s, m };
    }
    return best.m;
  }

  #score(game, m) {
    const piece = game.pieces.find((p) => p.id === m.pieceId);
    const t = piece.team;
    const n = THROWS[m.kind].n;
    const path = n < 0 ? [piece.trail.length >= 2 ? piece.trail[piece.trail.length - 2] : 0] : forward(piece.pos, piece.trail, n); // 도에서 빽도는 참먹이(0)
    const dest = path[path.length - 1];
    const group = game.groupOf(piece).length;
    let s = 0;
    if (dest === DONE) return 100 + group * 10;
    const foes = game.pieces.filter((p) => p.team !== t && p.pos === dest);
    if (foes.length) s += 60 + foes.length * 8;
    if (game.pieces.some((p) => p.team === t && p.pos === dest && !game.groupOf(piece).includes(p))) s += 14;
    if (path.some((x) => x === 20 || x === 25 || x === 27) || dest === 22) s += 9; // 지름길
    s += Math.max(0, n) * 1.5 + group * 2; // 앞으로 가기, 업힌 말은 같이 전진
    if (piece.pos === WAIT) s += 4; // 말을 판에 내보내기
    // 위험: 도착 칸 바로 뒤(1~5칸 이내)에 상대 말이 있으면 잡힐 수 있다
    const near = game.pieces.filter((p) => p.team !== t && p.pos !== WAIT && p.pos !== DONE && this.#reach(p, dest));
    s -= near.length * (4 + group * 2);
    if (n < 0) s -= 6;
    return s;
  }

  #reach(foe, node) {
    for (let k = 1; k <= 5; k++) if (forward(foe.pos, foe.trail, k).at(-1) === node) return true;
    return false;
  }
}
