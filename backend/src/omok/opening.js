// 오프닝 테이블 (A4): 흑 첫 수는 천원(중앙), 백의 두 번째 수와 흑의 세 번째 수만 정석 계열로 단순화해 변화를 준다.
// 정석 이름을 모두 구현한 것은 아니고, "중앙 가까이에서 서로 이어지는 모양"만 골라 쓴다.
const C = 7;
const pick = (list, rnd) => {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
};

/**
 * @param moves  [{x,y,color}] 지금까지의 수 (흑이 첫 수)
 * @param isFree (x,y) => 빈칸이고 판 안인가
 * @returns [x,y] | null (책에 없으면 null)
 */
export function bookMove(moves, rnd = Math.random, isFree = () => true) {
  if (moves.length === 0) return [C, C];
  const m0 = moves[0];
  if (m0.x !== C || m0.y !== C) return null;
  let out = null;
  if (moves.length === 1) {
    // 백 두 번째 수: 직접(상하좌우 인접) 40% / 간접(대각 인접) 60%
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const diags = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const d = rnd() < 0.4 ? dirs[Math.floor(rnd() * 4)] : diags[Math.floor(rnd() * 4)];
    out = [C + d[0], C + d[1]];
  } else if (moves.length === 2) {
    const rx = moves[1].x - C;
    const ry = moves[1].y - C;
    if (Math.abs(rx) > 1 || Math.abs(ry) > 1) return null;
    if (rx === 0 || ry === 0) {
      // 직접형: 백의 옆 대각(화월 계열) 우세, 중앙 옆(직각) 보조
      const px = -ry;
      const py = rx;
      const s = rnd() < 0.5 ? 1 : -1;
      out = pick([[[C + rx + px * s, C + ry + py * s], 0.65], [[C + px * s, C + py * s], 0.35]], rnd);
    } else {
      // 간접형: 중앙·백 둘 다에 이어지는 칸, 또는 반대 대각 이웃
      out = pick([[[C + rx, C], 0.35], [[C, C + ry], 0.35], [[C + rx, C - ry], 0.15], [[C - rx, C + ry], 0.15]], rnd);
    }
  } else return null;
  return isFree(out[0], out[1]) ? out : null;
}
