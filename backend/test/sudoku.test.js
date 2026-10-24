import { jest } from '@jest/globals';
import { useTempDb } from './helpers/db.js';
import { DIFFICULTIES, generateSolution, makePuzzle, newPuzzle, isValidSolution, checkSubmission } from '../src/sudoku/engine.js';

process.env.BCRYPT_ROUNDS = '4';
jest.setTimeout(60000);

// 재현 가능한 시드 난수 (mulberry32)
const seeded = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 테스트용 풀이기: 빈칸을 백트래킹으로 채운다 (서버는 정답을 내려주지 않으므로 직접 푼다) */
function solve(puzzle) {
  const b = [...puzzle];
  const ok = (i, d) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    for (let k = 0; k < 9; k++) {
      if (b[r * 9 + k] === d || b[k * 9 + c] === d) return false;
      const br = Math.floor(r / 3) * 3 + Math.floor(k / 3);
      const bc = Math.floor(c / 3) * 3 + (k % 3);
      if (b[br * 9 + bc] === d) return false;
    }
    return true;
  };
  const go = (i) => {
    if (i === 81) return true;
    if (b[i]) return go(i + 1);
    for (let d = 1; d <= 9; d++) {
      if (!ok(i, d)) continue;
      b[i] = d;
      if (go(i + 1)) return true;
    }
    b[i] = 0;
    return false;
  };
  go(0);
  return b;
}

describe('스도쿠 엔진', () => {
  test('완성판은 행·열·박스 모두 1~9 한 번씩 (난이도별 300판)', () => {
    const rnd = seeded(11);
    let bad = 0;
    for (let i = 0; i < 300; i++) {
      const s = generateSolution(rnd);
      if (!isValidSolution(s)) bad++;
      for (let r = 0; r < 9; r++) {
        const row = s.slice(r * 9, r * 9 + 9);
        if (new Set(row).size !== 9) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  test('난이도별 빈칸 개수(하 30 · 중 40 · 상 50), 남은 숫자는 정답과 같고 점대칭', () => {
    const rnd = seeded(5);
    for (const [key, d] of Object.entries(DIFFICULTIES)) {
      for (let i = 0; i < 100; i++) {
        const { puzzle, solution } = newPuzzle(key, rnd);
        expect(puzzle.filter((x) => x === 0)).toHaveLength(d.holes);
        puzzle.forEach((x, k) => {
          if (x !== 0) expect(x).toBe(solution[k]);
          expect(x === 0).toBe(puzzle[80 - k] === 0);
        });
        // 문제 자체가 규칙을 어기지 않는다 (정답으로 채우면 통과)
        expect(checkSubmission(puzzle, solution).ok).toBe(true);
      }
    }
  });

  // 단독 실행 시 1,000판 ≈ 60ms. 전체 테스트를 병렬로 돌리면 수십 배 느려지므로 넉넉하게 판당 10ms 로 본다
  test('생성이 가볍다: 200판 < 2초', () => {
    const t = performance.now();
    for (let i = 0; i < 200; i++) newPuzzle('hard');
    expect(performance.now() - t).toBeLessThan(2000);
  });

  test('홀수 빈칸이면 중앙 한 칸까지 지운다', () => {
    const p = makePuzzle(generateSolution(seeded(1)), 31, seeded(2));
    expect(p.filter((x) => x === 0)).toHaveLength(31);
    expect(p[40]).toBe(0);
  });

  test('제출 검증: 빈칸·중복·문제 숫자 변경·형식 오류를 거르고, 정답과 다른 유효한 풀이도 인정', () => {
    const { puzzle, solution } = newPuzzle('easy', seeded(9));
    expect(checkSubmission(puzzle, solution).ok).toBe(true);
    expect(checkSubmission(puzzle, puzzle).error).toMatch(/빈칸/);
    expect(checkSubmission(puzzle, solution.slice(0, 80)).ok).toBe(false);
    expect(checkSubmission(puzzle, 'x').ok).toBe(false);
    // 빈칸 두 개의 숫자를 서로 바꾸면 행/열 중복
    const holes = puzzle.map((x, i) => (x === 0 ? i : -1)).filter((i) => i >= 0);
    const a = holes.find((i) => solution[i] !== solution[holes[0]]);
    const dup = [...solution];
    [dup[holes[0]], dup[a]] = [dup[a], dup[holes[0]]];
    expect(checkSubmission(puzzle, dup).ok).toBe(false);
    // 문제에 있던 숫자를 바꾸면 거절 (규칙상 완성판이어도)
    const given = puzzle.findIndex((x) => x !== 0);
    const tampered = [...solution];
    tampered[given] = (tampered[given] % 9) + 1;
    expect(checkSubmission(puzzle, tampered).error).toMatch(/바꿀 수 없/);
    // 0~9 범위 밖·소수
    expect(isValidSolution(solution.map((x, i) => (i === 0 ? 1.5 : x)))).toBe(false);
  });
});

describe('스도쿠 일일 보상 API', () => {
  let server, base, prisma;
  let seq = 0;
  beforeAll(async () => {
    useTempDb();
    ({ prisma } = await import('../src/db.js'));
    const { createServer } = await import('../src/app.js');
    ({ server } = createServer());
    await new Promise((r) => server.listen(0, r));
    base = `http://localhost:${server.address().port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  });

  const req = async (method, p, token, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const signup = async () => (await req('POST', '/api/auth/register', null, { username: `sd${++seq}`, password: 'pw1234' })).body;
  const fresh = async (token, difficulty = 'easy') => (await req('POST', '/api/sudoku/new', token, { difficulty })).body;

  test('인증 필요 · 잘못된 난이도 400 · 문제만 내려주고 정답은 보내지 않는다', async () => {
    expect((await req('GET', '/api/sudoku/status')).status).toBe(401);
    const { token } = await signup();
    expect((await req('POST', '/api/sudoku/new', token, { difficulty: 'insane' })).status).toBe(400);
    const p = await fresh(token, 'hard');
    expect(p.puzzle).toHaveLength(81);
    expect(p.puzzle.filter((x) => x === 0)).toHaveLength(50);
    expect(p.solution).toBeUndefined();
    const st = (await req('GET', '/api/sudoku/status', token)).body;
    expect(st.sudoku).toEqual({ cleared: 0, limit: 10, left: 10, reward: 1000 });
    expect(st.current.id).toBe(p.id); // 새로고침해도 이어서 풀 수 있다
  });

  test('오답·빈칸·다른 문제 id 는 보상 없음, 정답이면 +1,000원·횟수 +1, 같은 문제로 두 번 못 받음', async () => {
    const { token, user } = await signup();
    const p = await fresh(token);
    const sol = solve(p.puzzle);
    let r = await req('POST', '/api/sudoku/submit', token, { id: p.id, board: p.puzzle });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/빈칸/);
    r = await req('POST', '/api/sudoku/submit', token, { id: 'other', board: sol });
    expect(r.status).toBe(400);
    r = await req('POST', '/api/sudoku/submit', token, { id: p.id, board: sol });
    expect(r.status).toBe(200);
    expect(r.body.user.money).toBe(user.money + 1000);
    expect(r.body.sudoku).toMatchObject({ cleared: 1, left: 9 });
    r = await req('POST', '/api/sudoku/submit', token, { id: p.id, board: sol });
    expect(r.status).toBe(400);
    const db = await prisma.user.findUnique({ where: { id: user.id } });
    expect(db.money).toBe(user.money + 1000);
    expect(db.dailySudokuCleared).toBe(1);
  });

  test('하루 10회까지만 보상, 11번째는 403 · 머니 그대로', async () => {
    const { token, user } = await signup();
    for (let i = 1; i <= 10; i++) {
      const p = await fresh(token);
      const r = await req('POST', '/api/sudoku/submit', token, { id: p.id, board: solve(p.puzzle) });
      expect(r.status).toBe(200);
      expect(r.body.sudoku.cleared).toBe(i);
    }
    const p = await fresh(token);
    const r = await req('POST', '/api/sudoku/submit', token, { id: p.id, board: solve(p.puzzle) });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('오늘 스도쿠 보상(10회)을 모두 받았습니다.');
    expect(r.body.sudoku).toMatchObject({ cleared: 10, left: 0 });
    const db = await prisma.user.findUnique({ where: { id: user.id } });
    expect(db.money).toBe(user.money + 10000);
    expect(db.dailySudokuCleared).toBe(10);
  });

  test('날짜(KST)가 바뀌면 횟수가 0 으로 초기화된다', async () => {
    const { token, user } = await signup();
    await prisma.user.update({ where: { id: user.id }, data: { dailySudokuCleared: 10, lastSudokuClearedAt: new Date(Date.now() - 36 * 3600 * 1000) } });
    expect((await req('GET', '/api/sudoku/status', token)).body.sudoku.cleared).toBe(0);
    const p = await fresh(token);
    const r = await req('POST', '/api/sudoku/submit', token, { id: p.id, board: solve(p.puzzle) });
    expect(r.status).toBe(200);
    expect(r.body.sudoku.cleared).toBe(1);
  });

  test('같은 정답을 동시에 여러 번 보내도 보상은 한 번', async () => {
    const { token, user } = await signup();
    const p = await fresh(token);
    const sol = solve(p.puzzle);
    const rs = await Promise.all(Array.from({ length: 5 }, () => req('POST', '/api/sudoku/submit', token, { id: p.id, board: sol })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    const db = await prisma.user.findUnique({ where: { id: user.id } });
    expect(db.money).toBe(user.money + 1000);
    expect(db.dailySudokuCleared).toBe(1);
  });
});
