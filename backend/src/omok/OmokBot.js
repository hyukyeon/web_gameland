import { SIZE, EMPTY, BLACK, inBoard, other, patterns, forbiddenReason } from './rules.js';

/**
 * 오목 AI (라즈베리파이용): 돌 주변 1~2칸 후보 + 패턴 점수 그리디, 어려움은 상대 최선 응수까지 보는 깊이 2.
 * 한 수에 수십 ms 안에 끝나도록 후보를 점수 상위 몇 개로 줄인다.
 *
 * 점수(2.2): 내 4(열린/닫힌) 10000 · 상대 열린 3/4 방어 9000 · 내 열린 3 500 · 상대 2 차단 100.
 * 5목 완성(내 승리)과 상대 5목 차단은 항상 최우선.
 */
export const SCORE = { five: 1_000_000, blockFive: 500_000, four: 10_000, openFour: 20_000, blockOpen: 9_000, blockFour: 1_500, three: 500, blockThree: 300, two: 60, blockTwo: 100 };

/** 돌 주변 radius 칸 이내의 빈칸 (빈 판이면 중앙) */
export function candidates(board, radius = 2) {
  const seen = new Set();
  const out = [];
  let any = false;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (board[y][x] === EMPTY) continue;
      any = true;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inBoard(nx, ny) || board[ny][nx] !== EMPTY) continue;
          const k = ny * SIZE + nx;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push([nx, ny]);
        }
      }
    }
  }
  return any ? out : [[7, 7]];
}

/** color 가 (x,y) 에 두는 것의 휴리스틱 점수. atk/def 는 공격·수비 가중치(성향) */
export function scoreMove(board, x, y, color, { atk = 1, def = 1, attackOnly = false } = {}) {
  const me = patterns(board, x, y, color);
  let s = 0;
  if (me.five) return SCORE.five;
  const op = attackOnly ? null : patterns(board, x, y, other(color));
  if (op?.five) return SCORE.blockFive;
  if (me.open4 || me.fours >= 2) s += SCORE.openFour * atk;
  else if (me.fours) s += SCORE.four * atk;
  s += me.threes * SCORE.three * atk;
  s += me.twos * SCORE.two * atk;
  if (op) {
    // 상대가 여기에 두면 열린 4(= 지금 열린 3 이 있음)·4·3·2 가 되는 자리 = 막아야 할 자리
    s += blockScore(op, def);
  }
  s += 7 - Math.max(Math.abs(x - 7), Math.abs(y - 7)); // 중앙 선호 (동점 정리)
  return s;
}

function blockScore(op, def) {
  let s = 0;
  if (op.open4 || op.fours >= 2) s += SCORE.blockOpen * def;
  else if (op.fours) s += SCORE.blockFour * def;
  s += op.threes * SCORE.blockThree * def;
  s += op.twos * SCORE.blockTwo * def * 0.5;
  return s;
}

const legal = (board, x, y, color) => !(color === BLACK && forbiddenReason(board, x, y));

const LEVEL = {
  easy: { randomRate: 0.35, topPick: 4, depth: 1 },
  normal: { randomRate: 0, mistake: 0.1, topPick: 1, depth: 1 },
  hard: { randomRate: 0, topPick: 1, depth: 2, breadth: 8 },
};
const STYLE = { aggressive: { atk: 1.25, def: 0.9 }, balanced: { atk: 1, def: 1 }, defensive: { atk: 0.85, def: 1.2 } };

export class OmokBot {
  constructor({ rnd = Math.random, level = 'normal', style = 'balanced' } = {}) {
    this.rnd = rnd;
    this.level = LEVEL[level] ? level : 'normal';
    this.cfg = LEVEL[this.level];
    this.w = STYLE[style] ?? STYLE.balanced;
  }

  /** @returns {[number, number]} 착수 좌표 */
  decide(game) {
    const board = game.board;
    const me = game.color[game.turn];
    return this.pick(board, me, game.moves.length);
  }

  pick(board, me, moveCount = 1) {
    if (moveCount === 0) return [7, 7];
    const cand = candidates(board, 2).filter(([x, y]) => legal(board, x, y, me));
    if (!cand.length) {
      const free = [];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (board[y][x] === EMPTY) free.push([x, y]);
      return free.find(([x, y]) => legal(board, x, y, me)) ?? free[0];
    }
    const scored = cand.map(([x, y]) => ({ x, y, s: scoreMove(board, x, y, me, this.w) + this.rnd() })).sort((a, b) => b.s - a.s);
    const best = scored[0];
    // 이기는 수/상대 5목 차단은 쉬움이라도 놓치지 않는다 (너무 바보 같지 않게)
    if (best.s >= SCORE.blockFive) return [best.x, best.y];
    const { randomRate, mistake = 0, topPick, depth, breadth = 8 } = this.cfg;
    if (this.rnd() < randomRate) {
      // 실수: 상위 후보 몇 개 중 무작위
      const k = scored[Math.min(scored.length - 1, Math.floor(this.rnd() * Math.max(2, topPick + 2)))];
      return [k.x, k.y];
    }
    if (mistake && scored.length > 1 && this.rnd() < mistake) return [scored[1].x, scored[1].y];
    if (depth < 2 || best.s >= SCORE.four) return [best.x, best.y];
    // 깊이 2: 상위 후보마다 상대의 최선 응수 점수를 빼서 비교
    const opp = other(me);
    let top = null;
    for (const c of scored.slice(0, breadth)) {
      board[c.y][c.x] = me;
      let reply = 0;
      for (const [x, y] of candidates(board, 1)) {
        if (!legal(board, x, y, opp)) continue;
        const r = scoreMove(board, x, y, opp, { attackOnly: true }); // 상대가 공격으로 얻을 수 있는 최대치
        if (r > reply) reply = r;
      }
      board[c.y][c.x] = EMPTY;
      const v = c.s - 0.6 * Math.min(reply, SCORE.five);
      if (!top || v > top.v) top = { ...c, v };
    }
    return [top.x, top.y];
  }
}
