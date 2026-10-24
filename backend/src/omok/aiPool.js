import { Worker } from 'node:worker_threads';
import { OmokBot } from './OmokBot.js';
import { OmokGame } from './OmokGame.js';
import { analyzeGame } from './analysis.js';

/**
 * AI 연산 풀 (Q3). 기본은 워커 스레드 1개. 워커를 못 쓰거나(OMOK_WORKER=0) 오류·시간 초과면 같은 스레드에서 계산한다.
 * 인터페이스는 항상 Promise 이고, 같은 입력이면 워커/메인 어느 쪽이든 같은 종류의 결과를 낸다.
 */
const TIMEOUT_MS = 4000;
const USE_WORKER = process.env.OMOK_WORKER !== '0';

let worker = null;
let seq = 0;
const pending = new Map();
const stats = { worker: 0, inline: 0, fallback: 0 };

function spawn() {
  const w = new Worker(new URL('./aiWorker.js', import.meta.url));
  w.on('message', (m) => {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    p.resolve(m);
  });
  const dead = () => {
    if (worker === w) worker = null;
    for (const [id, p] of pending) if (p.worker === w) { pending.delete(id); clearTimeout(p.timer); p.resolve({ ok: false, error: 'worker down' }); }
  };
  w.on('error', dead);
  w.on('exit', dead);
  w.unref(); // 워커가 살아 있어도 프로세스(테스트 포함)가 끝날 수 있게 (message 리스너를 단 뒤에 해야 포트까지 풀린다)
  return w;
}

function call(msg) {
  if (!USE_WORKER) return Promise.resolve({ ok: false, error: 'disabled' });
  try {
    worker ??= spawn();
  } catch {
    return Promise.resolve({ ok: false, error: 'spawn failed' });
  }
  const w = worker;
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: 'timeout' }); }, TIMEOUT_MS);
    timer.unref?.();
    pending.set(id, { resolve, timer, worker: w });
    w.postMessage({ id, ...msg });
  });
}

const replay = (moves) => {
  const g = new OmokGame([1, 2]);
  for (const [x, y] of moves) g.place(g.turn, x, y);
  return g;
};

/** 다음 수 계산. cfg: OmokBot 생성 옵션({level, style, strength}). 반환: [x, y] */
export async function pickMove(moves, cfg) {
  const r = await call({ type: 'pick', moves, cfg });
  if (r.ok) { stats.worker++; return r.move; }
  if (USE_WORKER) stats.fallback++; else stats.inline++;
  return new OmokBot(cfg).decide(replay(moves));
}

/** 복기 분석 */
export async function analyze(moves) {
  const r = await call({ type: 'analyze', moves });
  if (r.ok) { stats.worker++; return r.analysis; }
  if (USE_WORKER) stats.fallback++; else stats.inline++;
  return analyzeGame(moves);
}

export const poolStats = () => ({ ...stats, workerUp: !!worker });
export function closePool() {
  worker?.terminate();
  worker = null;
}
