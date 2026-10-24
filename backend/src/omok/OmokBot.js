import { SIZE, EMPTY, BLACK, inBoard, other, patterns, forbiddenReason } from './rules.js';
import { FastBoard, think, xyOf, newState, WIN } from './engine.js';
import { bookMove } from './opening.js';

/**
 * 오목 AI (라즈베리파이용). 노드 수 예산 + 시간 안전망으로 한 수가 수십 ms 안에 끝난다.
 *  - 기본(쉬움·보통): 돌 주변 1~2칸 후보 + 패턴 점수 그리디. 점수(2.2): 내 4 10000 · 상대 열린 3/4 방어 9000 · 내 열린 3 500 · 상대 2 차단 100.
 *    5목 완성과 상대 5목 차단은 항상 최우선.
 *  - 어려움: 오프닝 테이블 → VCF(4 연속 필승) → 상대 VCF 방어 → VCT(열린 3 시작) → 반복 심화 알파-베타(전치표) (engine.js)
 *  - strength(0~1) 로 난이도를 연속적으로 조절한다 (적응형 난이도, A7). easy≈0.1, normal=0.5, hard=1.
 *  - 쉬움의 실수는 무작위 착수가 아니라 사람처럼 "열린 3 을 못 보고 지나치기" + 가끔 차선수.
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

/**
 * color 가 (x,y) 에 두는 것의 휴리스틱 점수. atk/def 는 공격·수비 가중치(성향),
 * blind: 상대의 열린 3(이하) 위협을 못 본 척, combo: 4-3 같은 복합 공격 보너스(공격형)
 */
export function scoreMove(board, x, y, color, { atk = 1, def = 1, attackOnly = false, blind = false, combo = 0 } = {}) {
  const me = patterns(board, x, y, color);
  let s = 0;
  if (me.five) return SCORE.five;
  const op = attackOnly ? null : patterns(board, x, y, other(color));
  if (op?.five) return SCORE.blockFive;
  if (me.open4 || me.fours >= 2) s += SCORE.openFour * atk;
  else if (me.fours) s += SCORE.four * atk;
  s += me.threes * SCORE.three * atk;
  s += me.twos * SCORE.two * atk;
  if (combo && ((me.fours && me.threes) || me.threes >= 2)) s += combo;
  if (op) s += blockScore(op, def, blind);
  s += 7 - Math.max(Math.abs(x - 7), Math.abs(y - 7)); // 중앙 선호 (동점 정리)
  return s;
}

function blockScore(op, def, blind) {
  let s = 0;
  if (op.open4 || op.fours >= 2) s += blind ? SCORE.blockFour * def : SCORE.blockOpen * def; // blind: 열린 3 이 만든 열린 4 위협을 가볍게 봄
  else if (op.fours) s += SCORE.blockFour * def;
  if (!blind) s += op.threes * SCORE.blockThree * def;
  s += op.twos * SCORE.blockTwo * def * 0.5;
  return s;
}

const legal = (board, x, y, color) => !(color === BLACK && forbiddenReason(board, x, y));

export const STRENGTH = { easy: 0.1, normal: 0.5, hard: 1 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** strength → 행동 파라미터 */
export function paramsFor(strength) {
  const s = clamp01(strength);
  const low = s < 0.5 ? 1 - s / 0.5 : 0; // 0.5 미만일수록 1 에 가까움
  const hi = s >= 0.7 ? (s - 0.7) / 0.3 : 0;
  return {
    randomRate: 0.3 * low, // 상위 후보 중 무작위
    blindRate: 0.55 * low, // 열린 3 위협을 못 보는 수
    mistake: s < 1 ? 0.12 * Math.min(1, (1 - s) / 0.5) : 0, // 차선수
    book: s >= 0.5,
    search: s >= 0.7,
    nodes: Math.round(2000 + hi * 8000),
    vcfNodes: Math.round(600 + hi * 2400),
    ms: Math.round(12 + hi * 18),
    maxDepth: s >= 0.7 ? 4 + Math.round(hi * 2) : 0,
    vcf: s >= 0.85,
    vct: s >= 0.95,
  };
}

const STYLE = {
  aggressive: { atk: 1.25, def: 0.9, combo: 3000, bonus: 120 },
  balanced: { atk: 1, def: 1, combo: 0, bonus: 0 },
  defensive: { atk: 0.85, def: 1.35, combo: 0, bonus: 0 },
};

export class OmokBot {
  /** @param level easy|normal|hard (strength 가 있으면 strength 가 우선) */
  constructor({ rnd = Math.random, level = 'normal', style = 'balanced', strength = null, nodeScale = 1 } = {}) {
    this.rnd = rnd;
    this.level = STRENGTH[level] != null ? level : 'normal';
    this.strength = strength != null ? clamp01(Number(strength)) : STRENGTH[this.level];
    this.cfg = paramsFor(this.strength);
    this.style = STYLE[style] ?? STYLE.balanced;
    this.nodeScale = nodeScale; // 테스트에서 예산을 줄일 때
    this.last = null; // 마지막 판단 정보 { why, value, depth }
  }

  /** @returns {[number, number]} 착수 좌표 */
  decide(game) {
    return this.pick(game.board, game.color[game.turn], game.moves.length, game.moves);
  }

  pick(board, me, moveCount = 1, moves = null) {
    this.last = null;
    const { cfg, style } = this;
    if (moveCount === 0) return [7, 7];
    if (cfg.book && moves && moves.length <= 2) {
      const b = bookMove(moves, this.rnd, (x, y) => inBoard(x, y) && board[y][x] === EMPTY);
      if (b && legal(board, b[0], b[1], me)) {
        this.last = { why: 'book' };
        return b;
      }
    }
    const cand = candidates(board, 2).filter(([x, y]) => legal(board, x, y, me));
    if (!cand.length) {
      const free = [];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (board[y][x] === EMPTY) free.push([x, y]);
      return free.find(([x, y]) => legal(board, x, y, me)) ?? free[0];
    }
    const blind = this.rnd() < cfg.blindRate;
    const opts = { atk: style.atk, def: style.def, blind, combo: style.combo };
    const scored = cand.map(([x, y]) => ({ x, y, s: scoreMove(board, x, y, me, opts) + this.rnd() })).sort((a, b) => b.s - a.s);
    const best = scored[0];
    // 이기는 수/상대 5목 차단은 쉬움이라도 놓치지 않는다 (너무 바보 같지 않게)
    if (best.s >= SCORE.blockFive) return [best.x, best.y];

    if (cfg.search) {
      const fb = FastBoard.from(board);
      const k = this.nodeScale;
      const r = think(fb, me, {
        nodes: Math.round(cfg.nodes * k), vcfNodes: Math.round(cfg.vcfNodes * k), ms: cfg.ms, maxDepth: cfg.maxDepth,
        useVcf: cfg.vcf, useVct: cfg.vct, atk: style.atk, def: style.def,
      });
      if (r) {
        this.last = { why: r.why, value: r.value, depth: r.depth };
        // 성향: 공격형은 비슷한 값의 수 중 4·3 을 만드는 수를 살짝 선호
        if (r.why === 'search' && style.bonus && r.list?.length > 1) {
          const top = r.list.filter(([, v]) => v >= r.value - 150).slice(0, 4);
          let pickCell = r.cell;
          let bv = -Infinity;
          for (const [cell, v] of top) {
            const [x, y] = xyOf(cell);
            const p = patterns(board, x, y, me);
            const vv = v + (p.fours || p.threes ? style.bonus : 0);
            if (vv > bv) { bv = vv; pickCell = cell; }
          }
          return xyOf(pickCell);
        }
        // 차선수 실수(강도가 낮을수록 잦음): 검색 결과가 필승/방어 같은 확정 수일 땐 하지 않는다
        if (r.why === 'search' && cfg.mistake && r.list?.length > 1 && this.rnd() < cfg.mistake) return xyOf(r.list[1][0]);
        return xyOf(r.cell);
      }
    }

    const { randomRate, mistake } = cfg;
    if (this.rnd() < randomRate) {
      // 실수: 상위 후보 몇 개 중 무작위
      const k = scored[Math.min(scored.length - 1, 1 + Math.floor(this.rnd() * 4))];
      return [k.x, k.y];
    }
    if (mistake && scored.length > 1 && this.rnd() < mistake) return [scored[1].x, scored[1].y];
    if (this.strength < 0.7 || best.s >= SCORE.four) return [best.x, best.y];
    return [best.x, best.y];
  }
}

export { WIN, newState };
