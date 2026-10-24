import { parentPort } from 'node:worker_threads';
import { OmokBot } from './OmokBot.js';
import { OmokGame } from './OmokGame.js';
import { analyzeGame } from './analysis.js';

// AI 연산 전용 스레드: 메인(소켓) 스레드가 AI 계산으로 막히지 않게 한다.
//  { id, type: 'pick', moves, cfg: { level, style, strength } } → { id, ok, move: [x, y] }
//  { id, type: 'analyze', moves }                                → { id, ok, analysis }
const replay = (moves) => {
  const g = new OmokGame([1, 2]);
  for (const [x, y] of moves) if (!g.place(g.turn, x, y).ok) throw new Error('bad moves');
  return g;
};

parentPort.on('message', async ({ id, type, moves, cfg }) => {
  try {
    if (type === 'pick') {
      const g = replay(moves);
      return parentPort.postMessage({ id, ok: true, move: new OmokBot(cfg).decide(g) });
    }
    if (type === 'analyze') return parentPort.postMessage({ id, ok: true, analysis: await analyzeGame(moves) });
    return parentPort.postMessage({ id, ok: false, error: 'unknown' });
  } catch (e) {
    return parentPort.postMessage({ id, ok: false, error: String(e?.message ?? e) });
  }
});
