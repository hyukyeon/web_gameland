import { newBoard, checkWin, forbiddenReason, patterns, BLACK, WHITE } from '../src/omok/rules.js';
import { OmokGame } from '../src/omok/OmokGame.js';
import { OmokBot, candidates } from '../src/omok/OmokBot.js';

const put = (b, color, pts) => pts.forEach(([x, y]) => { b[y][x] = color; });
const row = (x0, y, n, dx = 1, dy = 0) => Array.from({ length: n }, (_, i) => [x0 + dx * i, y + dy * i]);

describe('오목 승리 판정 checkWin', () => {
  const dirs = { 가로: [1, 0], 세로: [0, 1], '대각선↘': [1, 1], '대각선↗': [1, -1] };
  for (const [name, [dx, dy]] of Object.entries(dirs)) {
    test(`${name} 5목 → 승리 (가운데 돌이 마지막이어도)`, () => {
      const b = newBoard();
      const y0 = dy < 0 ? 9 : 3;
      const pts = row(3, y0, 5, dx, dy);
      put(b, BLACK, pts);
      const w = checkWin(b, pts[2][0], pts[2][1]);
      expect(w?.color).toBe(BLACK);
      expect(w.line).toHaveLength(5);
    });
    test(`${name} 4목은 승리 아님`, () => {
      const b = newBoard();
      const y0 = dy < 0 ? 9 : 3;
      const pts = row(3, y0, 4, dx, dy);
      put(b, WHITE, pts);
      expect(checkWin(b, pts[0][0], pts[0][1])).toBeNull();
    });
  }
  test('흑 6목(장목)은 승리가 아니고 백 6목은 승리', () => {
    const b = newBoard();
    put(b, BLACK, row(2, 5, 6));
    expect(checkWin(b, 4, 5)).toBeNull();
    const c = newBoard();
    put(c, WHITE, row(2, 5, 6));
    expect(checkWin(c, 4, 5)?.color).toBe(WHITE);
  });
  test('판 끝(가장자리)에서도 5목 판정', () => {
    const b = newBoard();
    put(b, WHITE, row(10, 14, 5));
    expect(checkWin(b, 14, 14)?.color).toBe(WHITE);
  });
});

describe('흑 금지수 (쌍삼 · 장목)', () => {
  test('열린 3 두 개가 동시에 생기는 자리는 쌍삼 금지', () => {
    const b = newBoard();
    // (7,7) 에 두면 가로 (5,7)(6,7) + 세로 (7,5)(7,6) 이 열린 3 두 개
    put(b, BLACK, [[5, 7], [6, 7], [7, 5], [7, 6]]);
    expect(forbiddenReason(b, 7, 7)).toMatch(/쌍삼/);
  });
  test('띄운 3(X.XX) 도 열린 3 으로 센다', () => {
    const b = newBoard();
    put(b, BLACK, [[5, 7], [7, 7], [7, 5], [7, 6]]); // 가로 5,_,7,8? → (8,7) 에 두면 5.78 = 띄운 3, 세로 7,5 7,6 7,7?
    // (8,7)에 두면 가로: 5,7,8 (6 비어있음) = 띄운 3. 세로는 8열이라 없음 → 단일 3 이므로 금지 아님
    expect(forbiddenReason(b, 8, 7)).toBeNull();
    // (6,7) 은 가로 5,6,7 = 연속 3 + 세로 없음 → 금지 아님
    expect(forbiddenReason(b, 6, 7)).toBeNull();
  });
  test('열린 3 하나뿐이면 허용', () => {
    const b = newBoard();
    put(b, BLACK, [[5, 7], [6, 7]]);
    expect(forbiddenReason(b, 7, 7)).toBeNull();
  });
  test('막힌 3(한쪽이 백돌) 두 개는 쌍삼이 아님', () => {
    const b = newBoard();
    put(b, BLACK, [[5, 7], [6, 7], [7, 5], [7, 6]]);
    put(b, WHITE, [[4, 7]]); // 가로가 막힘 → 열린 3 아님
    expect(forbiddenReason(b, 7, 7)).toBeNull();
  });
  test('5목이 완성되는 수는 쌍삼이어도 허용(승리 우선)', () => {
    const b = newBoard();
    put(b, BLACK, [[3, 7], [4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]);
    expect(forbiddenReason(b, 7, 7)).toBeNull();
    expect(patterns(b, 7, 7, BLACK).five).toBe(true);
  });
  test('장목(6목)이 되는 자리는 흑 금지', () => {
    const b = newBoard();
    put(b, BLACK, [[3, 7], [4, 7], [5, 7], [7, 7], [8, 7]]);
    expect(forbiddenReason(b, 6, 7)).toMatch(/장목/);
  });
  test('백은 제한 없음 / OmokGame 이 흑의 쌍삼 착수를 거절한다', () => {
    const g = new OmokGame([1, 2], { ante: 100 });
    g.board[7][5] = BLACK; g.board[7][6] = BLACK; g.board[5][7] = BLACK; g.board[6][7] = BLACK;
    const r = g.place(1, 7, 7);
    expect(r.ok).toBe(false);
    expect(r.forbidden).toBe(true);
    expect(g.board[7][7]).toBe(0);
    expect(g.turn).toBe(1); // 턴 유지
    const g2 = new OmokGame([1, 2], { renju: false });
    g2.board[7][5] = BLACK; g2.board[7][6] = BLACK; g2.board[5][7] = BLACK; g2.board[6][7] = BLACK;
    expect(g2.place(1, 7, 7).ok).toBe(true);
  });
});

describe('OmokGame 상태 머신', () => {
  test('턴 교대 · 중복/범위/턴 오류', () => {
    const g = new OmokGame([1, 2], { first: 2 });
    expect(g.black).toBe(2);
    expect(g.place(1, 7, 7).ok).toBe(false); // 흑(2) 차례
    expect(g.place(2, 7, 7).ok).toBe(true);
    expect(g.turn).toBe(1);
    expect(g.place(1, 7, 7).ok).toBe(false); // 이미 돌
    expect(g.place(1, -1, 0).ok).toBe(false);
    expect(g.place(1, 15, 0).ok).toBe(false);
    expect(g.place(1, 1.5, 0).ok).toBe(false);
    expect(g.place(1, 8, 7).ok).toBe(true);
    expect(g.board[7][7]).toBe(BLACK);
    expect(g.board[7][8]).toBe(WHITE);
  });
  test('5목으로 끝나고 정산 net · 끝난 뒤 착수 거절', () => {
    const g = new OmokGame([1, 2], { ante: 500 });
    for (let i = 0; i < 4; i++) {
      expect(g.place(1, i, 0).ok).toBe(true);
      expect(g.place(2, i, 5).ok).toBe(true);
    }
    const r = g.place(1, 4, 0);
    expect(r.ended).toBe(true);
    expect(g.result).toMatchObject({ winner: 1, kind: 'five', net: { 1: 500, 2: -500 } });
    expect(g.result.line).toHaveLength(5);
    expect(g.place(2, 9, 9).ok).toBe(false);
  });
  test('기권 → 상대 승리', () => {
    const g = new OmokGame([1, 2], { ante: 100 });
    g.forfeit(1);
    expect(g.result).toMatchObject({ winner: 2, kind: 'forfeit' });
  });
});

describe('오목 AI', () => {
  const bot = (level = 'hard') => new OmokBot({ level });
  test('내 4 가 있으면 5목을 완성한다', () => {
    const g = new OmokGame([1, 2]);
    g.turn = 1;
    put(g.board, BLACK, [[3, 7], [4, 7], [5, 7], [6, 7]]);
    put(g.board, WHITE, [[3, 9], [4, 9], [8, 9]]);
    g.moves.length = 7;
    const [x, y] = bot().decide(g);
    expect(y).toBe(7);
    expect([2, 7]).toContain(x);
  });
  for (const level of ['easy', 'normal', 'hard']) {
    test(`[${level}] 상대 4 는 반드시 막는다`, () => {
      const g = new OmokGame([1, 2]);
      g.turn = 2;
      put(g.board, BLACK, [[5, 5], [6, 5], [7, 5], [8, 5]]);
      put(g.board, WHITE, [[5, 6], [6, 6], [10, 10]]);
      g.moves.length = 7;
      const [x, y] = bot(level).decide(g);
      expect(y).toBe(5);
      expect([4, 9]).toContain(x);
    });
  }
  test('상대의 열린 3 을 막는다', () => {
    const g = new OmokGame([1, 2]);
    g.turn = 2;
    put(g.board, BLACK, [[6, 7], [7, 7], [8, 7]]);
    put(g.board, WHITE, [[7, 6], [10, 10]]);
    g.moves.length = 5;
    const [x, y] = bot().decide(g);
    expect(y).toBe(7);
    expect([5, 9]).toContain(x);
  });
  test('후보군은 돌 주변 2칸 이내로 압축된다', () => {
    const b = newBoard();
    b[7][7] = BLACK;
    const c = candidates(b, 2);
    expect(c).toHaveLength(24);
    expect(c.every(([x, y]) => Math.abs(x - 7) <= 2 && Math.abs(y - 7) <= 2)).toBe(true);
    expect(candidates(newBoard())).toEqual([[7, 7]]);
  });
  test('봇끼리 둔 판은 항상 합법이고 끝난다 · 한 수 연산이 50ms 이내(평균)', () => {
    const times = [];
    let finished = 0;
    for (let n = 0; n < 6; n++) {
      const g = new OmokGame([1, 2], { ante: 100 });
      const bots = { 1: new OmokBot({ level: n % 2 ? 'hard' : 'normal' }), 2: new OmokBot({ level: 'hard', style: 'aggressive' }) };
      while (g.phase === 'playing') {
        const t0 = process.hrtime.bigint();
        const [x, y] = bots[g.turn].decide(g);
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
        const r = g.place(g.turn, x, y);
        expect(r.ok).toBe(true);
      }
      finished++;
    }
    expect(finished).toBe(6);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    console.log(`omok bot: ${times.length}수 평균 ${avg.toFixed(2)}ms 최대 ${max.toFixed(1)}ms`);
    expect(avg).toBeLessThan(50);
    expect(max).toBeLessThan(200); // 부하로 흔들려도 이벤트 루프를 길게 막지 않는다
  });
});

describe('오목 AI 난이도', () => {
  const play = (a, b) => {
    const g = new OmokGame([1, 2], { ante: 1 });
    const bots = { 1: a, 2: b };
    while (g.phase === 'playing') {
      const [x, y] = bots[g.turn].decide(g);
      if (!g.place(g.turn, x, y).ok) throw new Error('불법 수');
    }
    return g.result.winner;
  };
  // 선공(흑) 이점이 크므로 선후공을 번갈아 겨룬다
  const versus = (la, lb, n) => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      const A = new OmokBot({ level: la });
      const B = new OmokBot({ level: lb });
      const w = i % 2 ? play(A, B) : play(B, A);
      if (w == null) continue;
      if (w === (i % 2 ? 1 : 2)) a++;
      else b++;
    }
    return [a, b];
  };
  test('어려움 > 쉬움, 보통 > 쉬움', () => {
    const [h, e] = versus('hard', 'easy', 24);
    expect(h).toBeGreaterThan(e * 2);
    const [n, e2] = versus('normal', 'easy', 24);
    expect(n).toBeGreaterThan(e2 * 2);
  });
  test('어려움 > 보통', () => {
    const [h, n] = versus('hard', 'normal', 30);
    expect(h).toBeGreaterThan(n * 1.3);
  });
});
