import { FastBoard, newState, cellOf, xyOf, WIN } from './engine.js';

/**
 * 복기 분석 (A9): 기록된 수순을 처음부터 따라가며 각 수 직전 국면에서 "최선 수"와 "실제 둔 수"의 탐색 값을 비교한다.
 * 이벤트 루프를 막지 않도록 수마다 양보(setImmediate)한다. 값은 두는 쪽 입장의 창 점수(승리 ±WIN).
 *  tag: 'blunder'(실수: 이기는 수를 놓침/지는 수를 둠/큰 손해) | 'mistake'(악수) | null
 * @param moves [[x,y]...] 흑이 첫 수, 번갈아
 */
export const LOSS_BLUNDER = 900;
export const LOSS_MISTAKE = 250;
const WIN_THR = WIN - 200;

const yieldLoop = () => new Promise((r) => setImmediate(r));

export async function analyzeGame(moves, { depth = 4, nodes = 3500, ms = 80, topK = 6, yieldFn = yieldLoop } = {}) {
  const fb = new FastBoard();
  const rows = [];
  for (let i = 0; i < moves.length; i++) {
    const side = i % 2 === 0 ? 1 : 2;
    const [px, py] = moves[i];
    const played = cellOf(px, py);
    if (i >= 1) {
      const cand = fb.gen(side, topK);
      if (!cand.includes(played)) cand.push(played);
      const st = newState({ nodes, ms });
      const vals = fb.rootValues(side, depth, cand, st);
      const entries = [...vals.entries()].filter(([, v]) => v != null);
      if (entries.length && vals.get(played) != null) {
        const [bestCell, bestV] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
        const pv = vals.get(played);
        const loss = Math.max(0, bestV - pv);
        let tag = null;
        if (bestV >= WIN_THR && pv < WIN_THR) tag = 'blunder'; // 이길 수 있었는데 놓침
        else if (pv <= -WIN_THR && bestV > -WIN_THR) tag = 'blunder'; // 이 수로 지게 됨
        else if (loss >= LOSS_BLUNDER) tag = 'blunder';
        else if (loss >= LOSS_MISTAKE) tag = 'mistake';
        const [bx, by] = xyOf(bestCell);
        rows.push({ n: i + 1, color: side, x: px, y: py, bestX: bx, bestY: by, loss: Math.min(loss, WIN), tag, bestWin: bestV >= WIN_THR, playedLose: pv <= -WIN_THR });
      }
    }
    fb.place(played, side);
    await yieldFn();
  }
  const sum = (c, t) => rows.filter((r) => r.color === c && r.tag === t).length;
  const summary = {};
  for (const [c, key] of [[1, 'black'], [2, 'white']]) {
    const mine = rows.filter((r) => r.color === c);
    const avgLoss = mine.length ? mine.reduce((s, r) => s + Math.min(r.loss, 2000), 0) / mine.length : 0;
    summary[key] = { moves: mine.length, blunders: sum(c, 'blunder'), mistakes: sum(c, 'mistake'), accuracy: Math.max(0, Math.round(100 - avgLoss / 12)) };
  }
  return { rows, summary };
}
