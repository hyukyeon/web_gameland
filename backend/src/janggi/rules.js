/**
 * 장기 규칙 (한국 장기). 판은 가로 9줄(x 0~8) × 세로 10줄(y 0~9)의 교차점, 칸 번호 = y*9+x.
 * 한(漢)은 위(y 0~3), 초(楚)는 아래(y 6~9)에서 시작하고 초가 먼저 둔다. 궁성은 x 3~5 × (y 0~2 | y 7~9), 대각선 포함.
 * 말: K 궁 · A 사 · R 차 · C 포 · N 마 · E 상 · P 졸/병. 점수: 차 13 · 포 7 · 마 5 · 상 3 · 사 3 · 졸 2, 한은 덤 1.5.
 */
export const W = 9;
export const H = 10;
export const CHO = 'cho';
export const HAN = 'han';
export const other = (s) => (s === CHO ? HAN : CHO);
export const VALUE = { K: 0, R: 13, C: 7, N: 5, E: 3, A: 3, P: 2 };
export const HAN_BONUS = 1.5;
export const FORMATIONS = ['마상마상', '상마상마', '마상상마', '상마마상']; // 내 쪽에서 볼 때 왼쪽부터

export const sq = (x, y) => y * W + x;
export const xyOf = (s) => [s % W, Math.floor(s / W)];
const inBoard = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
const inPalace = (x, y) => x >= 3 && x <= 5 && ((y >= 0 && y <= 2) || (y >= 7 && y <= 9));
// 궁성 대각선 위의 점: 네 모서리와 가운데
const onDiag = (x, y) => inPalace(x, y) && (x === 4) === (y === 1 || y === 8);
const palaceOf = (side) => (side === HAN ? [0, 2] : [7, 9]);
const inOwnPalace = (side, x, y) => {
  const [a, b] = palaceOf(side);
  return x >= 3 && x <= 5 && y >= a && y <= b;
};
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
/** 궁성 안에서 (x,y) → (x+dx,y+dy) 대각선 한 칸이 선을 따라 가는가 */
const diagStep = (x, y, dx, dy) => onDiag(x, y) && onDiag(x + dx, y + dy) && inPalace(x + dx, y + dy) && ((x === 4) !== (x + dx === 4)) && Math.floor(y / 5) === Math.floor((y + dy) / 5);

/** 처음 배치. formation: { cho, han } 각각 FORMATIONS 중 하나 */
export function initialBoard(formation = {}) {
  const b = Array(W * H).fill(null);
  const put = (x, y, side, t) => (b[sq(x, y)] = { side, t });
  for (const side of [HAN, CHO]) {
    const back = side === HAN ? 0 : 9;
    const dir = side === HAN ? 1 : -1;
    put(0, back, side, 'R');
    put(8, back, side, 'R');
    put(3, back, side, 'A');
    put(5, back, side, 'A');
    put(4, back + dir, side, 'K');
    put(1, back + 2 * dir, side, 'C');
    put(7, back + 2 * dir, side, 'C');
    for (const x of [0, 2, 4, 6, 8]) put(x, back + 3 * dir, side, 'P');
    // 상차림: 내 쪽에서 본 왼쪽부터. 초(아래)의 왼쪽은 x=1, 한(위)의 왼쪽은 x=7
    const f = FORMATIONS.includes(formation[side]) ? formation[side] : FORMATIONS[0];
    const slots = side === CHO ? [1, 2, 6, 7] : [7, 6, 2, 1];
    [...f].forEach((ch, i) => put(slots[i], back, side, ch === '마' ? 'N' : 'E'));
  }
  return b;
}

/** 말 하나의 이동 가능한 칸(자기 궁 안전은 따지지 않음) */
export function pseudoMoves(b, from) {
  const p = b[from];
  if (!p) return [];
  const [x, y] = xyOf(from);
  const out = [];
  const can = (tx, ty) => {
    if (!inBoard(tx, ty)) return false;
    const q = b[sq(tx, ty)];
    return !q || q.side !== p.side;
  };
  const push = (tx, ty) => out.push(sq(tx, ty));
  switch (p.t) {
    case 'K':
    case 'A': {
      for (const [dx, dy] of ORTHO) if (inOwnPalace(p.side, x + dx, y + dy) && can(x + dx, y + dy)) push(x + dx, y + dy);
      for (const [dx, dy] of DIAG) if (inOwnPalace(p.side, x + dx, y + dy) && diagStep(x, y, dx, dy) && can(x + dx, y + dy)) push(x + dx, y + dy);
      break;
    }
    case 'R': {
      for (const [dx, dy] of ORTHO) {
        for (let tx = x + dx, ty = y + dy; inBoard(tx, ty); tx += dx, ty += dy) {
          const q = b[sq(tx, ty)];
          if (!q) push(tx, ty);
          else {
            if (q.side !== p.side) push(tx, ty);
            break;
          }
        }
      }
      for (const [dx, dy] of DIAG) {
        for (let tx = x, ty = y; diagStep(tx, ty, dx, dy); ) {
          tx += dx;
          ty += dy;
          const q = b[sq(tx, ty)];
          if (!q) push(tx, ty);
          else {
            if (q.side !== p.side) push(tx, ty);
            break;
          }
        }
      }
      break;
    }
    case 'C': {
      // 포: 포가 아닌 말 하나를 넘어서 간다. 포는 넘을 수도 잡을 수도 없다
      const lines = ORTHO.map(([dx, dy]) => {
        const pts = [];
        for (let tx = x + dx, ty = y + dy; inBoard(tx, ty); tx += dx, ty += dy) pts.push([tx, ty]);
        return pts;
      });
      for (const [dx, dy] of DIAG) {
        const pts = [];
        for (let tx = x, ty = y; diagStep(tx, ty, dx, dy); ) {
          tx += dx;
          ty += dy;
          pts.push([tx, ty]);
        }
        lines.push(pts);
      }
      for (const pts of lines) {
        let screen = false;
        for (const [tx, ty] of pts) {
          const q = b[sq(tx, ty)];
          if (!screen) {
            if (q) {
              if (q.t === 'C') break;
              screen = true;
            }
          } else if (!q) push(tx, ty);
          else {
            if (q.side !== p.side && q.t !== 'C') push(tx, ty);
            break;
          }
        }
      }
      break;
    }
    case 'N':
    case 'E': {
      // 마: 직선 1 + 대각 1, 상: 직선 1 + 대각 2. 지나가는 자리가 막히면 못 간다
      const diagSteps = p.t === 'N' ? 1 : 2;
      for (const [dx, dy] of ORTHO) {
        if (!inBoard(x + dx, y + dy) || b[sq(x + dx, y + dy)]) continue;
        for (const s of [-1, 1]) {
          const ex = dx === 0 ? s : dx;
          const ey = dy === 0 ? s : dy;
          let cx = x + dx;
          let cy = y + dy;
          let ok = true;
          for (let k = 1; k <= diagSteps; k++) {
            cx += ex;
            cy += ey;
            if (!inBoard(cx, cy)) { ok = false; break; }
            if (k < diagSteps && b[sq(cx, cy)]) { ok = false; break; }
          }
          if (ok && can(cx, cy)) push(cx, cy);
        }
      }
      break;
    }
    case 'P': {
      const fwd = p.side === CHO ? -1 : 1;
      for (const [dx, dy] of [[0, fwd], [1, 0], [-1, 0]]) if (can(x + dx, y + dy)) push(x + dx, y + dy);
      // 상대 궁성 안에서는 앞쪽 대각선(선을 따라)도
      for (const dx of [-1, 1]) if (diagStep(x, y, dx, fwd) && can(x + dx, y + fwd)) push(x + dx, y + fwd);
      break;
    }
    default:
  }
  return out;
}

export const kingOf = (b, side) => b.findIndex((p) => p && p.side === side && p.t === 'K');

/** side 의 궁이 공격받고 있는가 (장군) */
export function inCheck(b, side) {
  const k = kingOf(b, side);
  if (k < 0) return true;
  for (let i = 0; i < b.length; i++) {
    const p = b[i];
    if (!p || p.side === side || p.t === 'K' || p.t === 'A') continue; // 궁·사는 궁성 밖으로 못 나가 상대 궁을 칠 수 없다
    if (pseudoMoves(b, i).includes(k)) return true;
  }
  return false;
}

/** 두 궁이 같은 세로줄에서 사이에 아무것도 없이 마주 보는가 (빅장) */
export function bikjang(b) {
  const a = kingOf(b, HAN);
  const c = kingOf(b, CHO);
  if (a < 0 || c < 0 || a % W !== c % W) return false;
  for (let s = a + W; s < c; s += W) if (b[s]) return false;
  return true;
}

/** 수를 두면 바뀐 판 (원래 판은 그대로) */
export function applied(b, from, to) {
  const n = b.slice();
  n[to] = n[from];
  n[from] = null;
  return n;
}

/** side 가 둘 수 있는 모든 수 [{from,to}] — 두고 나서 자기 궁이 장군이면 안 된다 */
export function legalMoves(b, side) {
  const out = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i]?.side !== side) continue;
    for (const to of pseudoMoves(b, i)) if (!inCheck(applied(b, i, to), side)) out.push({ from: i, to });
  }
  return out;
}

/** 남은 말 점수 (한은 덤 포함) */
export function material(b, side) {
  let s = side === HAN ? HAN_BONUS : 0;
  for (const p of b) if (p && p.side === side) s += VALUE[p.t];
  return s;
}
