// 오목 AI 강도 매트릭스 (A10). 사용: node scripts/omok-strength.mjs [판수(기본 20)] [easy,normal,hard 또는 0.3 같은 strength 목록]
// 선후공을 번갈아 두고 (행 = 이긴 쪽) 승/무/패를 출력한다.
import { OmokGame } from '../src/omok/OmokGame.js';
import { OmokBot } from '../src/omok/OmokBot.js';

export function play(a, b) {
  const g = new OmokGame([1, 2], { ante: 1 });
  const bots = { 1: a, 2: b };
  let ms = 0;
  let n = 0;
  let maxMs = 0;
  while (g.phase === 'playing') {
    const t0 = performance.now();
    const [x, y] = bots[g.turn].decide(g);
    const d = performance.now() - t0;
    ms += d; n++; maxMs = Math.max(maxMs, d);
    if (!g.place(g.turn, x, y).ok) throw new Error(`불법 수 ${x},${y}`);
  }
  return { winner: g.result.winner, ms, n, maxMs };
}

export const mk = (spec, opts = {}) => (/^[\d.]+$/.test(spec) ? new OmokBot({ strength: Number(spec), ...opts }) : new OmokBot({ level: spec, ...opts }));

/** a 입장 [승, 무, 패] + 평균/최대 ms */
export function versus(specA, specB, games, opts = {}) {
  let w = 0, d = 0, l = 0, ms = 0, n = 0, maxMs = 0;
  for (let i = 0; i < games; i++) {
    const A = mk(specA, opts);
    const B = mk(specB, opts);
    const aBlack = i % 2 === 0;
    const r = aBlack ? play(A, B) : play(B, A);
    ms += r.ms; n += r.n; maxMs = Math.max(maxMs, r.maxMs);
    if (r.winner == null) d++;
    else if ((r.winner === 1) === aBlack) w++;
    else l++;
  }
  return { w, d, l, avgMs: ms / n, maxMs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = Number(process.argv[2]) || 20;
  const specs = (process.argv[3] || 'easy,normal,hard').split(',');
  console.log(`선후공 교대 ${games}판. 칸 = 행 기준 승-무-패`);
  console.log(['', ...specs].map((s) => s.padEnd(12)).join(''));
  for (const a of specs) {
    const cells = [];
    for (const b of specs) {
      if (a === b) { cells.push('-'.padEnd(12)); continue; }
      const r = versus(a, b, games);
      cells.push(`${r.w}-${r.d}-${r.l} (${r.avgMs.toFixed(0)}ms)`.padEnd(12));
    }
    console.log(a.padEnd(12) + cells.join(''));
  }
}
