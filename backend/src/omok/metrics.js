/**
 * 오목 운영 지표 (Q5): 서버 메모리에 누적하는 간단한 카운터. 재시작하면 0 부터 다시 센다.
 * GET /api/metrics/omok 로 조회 (개인정보 없음, 집계 수치만).
 */
const m = {
  since: Date.now(),
  games: 0,
  ranked: 0,
  practice: 0,
  byKind: { five: 0, forfeit: 0, full: 0 },
  totalMoves: 0,
  timeouts: 0, // 제한 시간 초과로 AI 가 대신 둔 수
  turns: 0, // 사람 차례(타이머가 걸린) 수
  undos: { asked: 0, granted: 0, declined: 0 },
  aiMoves: 0,
  aiMsTotal: 0,
  aiMsMax: 0,
};

export const noteTurn = () => { m.turns++; };
export const noteTimeout = () => { m.timeouts++; };
export const noteAi = (ms) => {
  m.aiMoves++;
  m.aiMsTotal += ms;
  if (ms > m.aiMsMax) m.aiMsMax = ms;
};
export const noteUndo = (kind) => { m.undos[kind]++; };
export function noteGame({ ranked, kind, moves }) {
  m.games++;
  if (ranked) m.ranked++; else m.practice++;
  if (m.byKind[kind] != null) m.byKind[kind]++;
  m.totalMoves += moves;
}

export const snapshot = () => ({
  sinceMs: Date.now() - m.since,
  games: m.games,
  ranked: m.ranked,
  practice: m.practice,
  byKind: { ...m.byKind },
  avgMoves: m.games ? +(m.totalMoves / m.games).toFixed(1) : 0,
  timeoutRate: m.turns ? +(m.timeouts / m.turns).toFixed(4) : 0,
  undos: { ...m.undos },
  ai: { moves: m.aiMoves, avgMs: m.aiMoves ? +(m.aiMsTotal / m.aiMoves).toFixed(1) : 0, maxMs: Math.round(m.aiMsMax) },
});

export const resetMetrics = () => {
  m.since = Date.now();
  m.games = m.ranked = m.practice = m.totalMoves = m.timeouts = m.turns = m.aiMoves = m.aiMsTotal = m.aiMsMax = 0;
  m.byKind = { five: 0, forfeit: 0, full: 0 };
  m.undos = { asked: 0, granted: 0, declined: 0 };
};
