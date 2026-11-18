import { CHO, HAN, sq, xyOf, initialBoard, pseudoMoves, legalMoves, inCheck, bikjang, material, FORMATIONS } from '../src/janggi/rules.js';
import { JanggiGame } from '../src/janggi/JanggiGame.js';
import { JanggiBot } from '../src/janggi/JanggiBot.js';

const empty = () => Array(90).fill(null);
const put = (b, x, y, side, t) => (b[sq(x, y)] = { side, t });
const dests = (b, x, y) => pseudoMoves(b, sq(x, y)).map((s) => xyOf(s).join(',')).sort();
/** 양쪽 궁만 있는 판 (서로 마주 보지 않게) */
const kings = () => {
  const b = empty();
  put(b, 4, 8, CHO, 'K');
  put(b, 3, 1, HAN, 'K');
  return b;
};

describe('장기 배치', () => {
  test('말 32개, 초는 아래·한은 위, 상차림대로 마·상', () => {
    const b = initialBoard({ [CHO]: '마상상마', [HAN]: '상마마상' });
    expect(b.filter(Boolean)).toHaveLength(32);
    expect(b[sq(4, 8)]).toEqual({ side: CHO, t: 'K' });
    expect(b[sq(4, 1)]).toEqual({ side: HAN, t: 'K' });
    // 초(아래)는 왼쪽(x=1)부터 마상상마
    expect([1, 2, 6, 7].map((x) => b[sq(x, 9)].t).join('')).toBe('NEEN');
    // 한(위)은 자기 왼쪽(x=7)부터 상마마상
    expect([7, 6, 2, 1].map((x) => b[sq(x, 0)].t).join('')).toBe('ENNE');
    expect(material(b, CHO)).toBe(72);
    expect(material(b, HAN)).toBe(73.5);
    expect(FORMATIONS).toHaveLength(4);
  });
  test('첫 수: 초가 둘 수 있는 수가 있고 장군·빅장은 아니다', () => {
    const b = initialBoard();
    expect(legalMoves(b, CHO).length).toBeGreaterThan(20);
    expect(inCheck(b, CHO)).toBe(false);
    expect(bikjang(b)).toBe(false);
  });
});

describe('장기 말 움직임', () => {
  test('차: 직선으로 막힐 때까지, 상대 말은 잡는다', () => {
    const b = kings();
    put(b, 0, 9, CHO, 'R');
    put(b, 0, 5, HAN, 'P');
    put(b, 2, 9, CHO, 'E');
    expect(dests(b, 0, 9)).toEqual(['0,5', '0,6', '0,7', '0,8', '1,9'].sort());
  });
  test('차: 궁성 대각선을 따라 간다', () => {
    const b = kings();
    put(b, 3, 7, CHO, 'R');
    expect(dests(b, 3, 7)).not.toContain('4,8'); // 자기 궁이 막고 있어
    expect(dests(b, 3, 7)).not.toContain('5,9'); // 그 너머도 못 간다
    const c = empty();
    put(c, 3, 0, CHO, 'R');
    put(c, 4, 9, CHO, 'K');
    put(c, 3, 9, HAN, 'K');
    expect(dests(c, 3, 0)).toEqual(expect.arrayContaining(['4,1', '5,2']));
  });
  test('포: 포가 아닌 말 하나를 넘어서만, 포는 넘지도 잡지도 못한다', () => {
    const b = kings();
    put(b, 1, 7, CHO, 'C');
    put(b, 1, 5, CHO, 'P'); // 다리
    put(b, 1, 2, HAN, 'R');
    expect(dests(b, 1, 7)).toEqual(expect.arrayContaining(['1,4', '1,3', '1,2']));
    expect(dests(b, 1, 7)).not.toContain('1,6');
    b[sq(1, 5)] = { side: HAN, t: 'C' }; // 다리가 포면 못 넘는다
    expect(dests(b, 1, 7).filter((d) => d.startsWith('1,'))).toEqual([]); // 포는 다리 없이는 아예 못 움직인다
    b[sq(1, 5)] = { side: CHO, t: 'P' };
    b[sq(1, 2)] = { side: HAN, t: 'C' }; // 상대 포는 못 잡는다
    expect(dests(b, 1, 7)).not.toContain('1,2');
  });
  test('마: 직선 한 칸이 막히면 그쪽으로 못 간다', () => {
    const b = kings();
    put(b, 4, 5, CHO, 'N');
    expect(dests(b, 4, 5)).toHaveLength(8);
    put(b, 4, 4, HAN, 'P'); // 위쪽 다리 막힘
    expect(dests(b, 4, 5)).not.toEqual(expect.arrayContaining(['3,3']));
    expect(dests(b, 4, 5)).toHaveLength(6);
  });
  test('상: 직선 1 + 대각 2, 중간이 막히면 못 간다', () => {
    const b = kings();
    put(b, 4, 5, CHO, 'E');
    expect(dests(b, 4, 5)).toEqual(expect.arrayContaining(['2,2', '6,2', '1,3', '7,3', '1,7', '7,7', '2,8', '6,8']));
    put(b, 3, 3, HAN, 'P'); // (4,4) → (3,3) 대각 첫 칸 막힘 → (2,2) 불가
    expect(dests(b, 4, 5)).not.toContain('2,2');
    expect(dests(b, 4, 5)).toContain('6,2');
  });
  test('졸: 앞·옆 한 칸(뒤로는 못 감), 상대 궁성에선 대각선 앞으로도', () => {
    const b = kings();
    put(b, 2, 6, CHO, 'P');
    expect(dests(b, 2, 6)).toEqual(['1,6', '2,5', '3,6'].sort());
    put(b, 3, 2, CHO, 'P'); // 한 궁성 모서리
    expect(dests(b, 3, 2)).toContain('4,1');
    put(b, 5, 3, HAN, 'P');
    expect(dests(b, 5, 3)).toEqual(['4,3', '5,4', '6,3'].sort()); // 한 병은 아래로
  });
  test('궁·사: 궁성 안에서만, 대각선은 선을 따라', () => {
    const b = kings();
    expect(dests(b, 4, 8)).toHaveLength(8); // 가운데: 8방향
    put(b, 3, 9, CHO, 'A');
    expect(dests(b, 3, 9)).toEqual(['3,8', '4,9'].sort()); // 4,8 은 자기 궁
    const c = empty();
    put(c, 4, 7, CHO, 'K');
    put(c, 3, 0, HAN, 'K');
    expect(dests(c, 4, 7)).toEqual(['3,7', '4,8', '5,7'].sort()); // 변 가운데는 대각선 없음
  });
});

describe('장기 판정', () => {
  test('장군이면 그것을 피하는 수만 둘 수 있다', () => {
    const b = kings();
    put(b, 4, 0, HAN, 'R'); // 4번 줄로 장군
    expect(inCheck(b, CHO)).toBe(true);
    for (const m of legalMoves(b, CHO)) expect(xyOf(m.to)[0]).not.toBe(4);
  });
  test('외통: 둘 수가 없으면 장군을 건 쪽이 이긴다', () => {
    const g = new JanggiGame({ cho: 1, han: 2, ante: 100 });
    g.setup(1, '마상마상');
    g.setup(2, '마상마상');
    const b = empty();
    put(b, 4, 9, CHO, 'K');
    put(b, 3, 2, HAN, 'K');
    put(b, 0, 8, HAN, 'R'); // 8번 줄 막음
    put(b, 8, 1, HAN, 'R'); // 이 차가 9번 줄로 내려와 외통
    put(b, 0, 0, CHO, 'P');
    g.board = b;
    g.turn = 2;
    const r = g.move(2, sq(8, 1), sq(8, 9));
    expect(r.ok).toBe(true);
    expect(g.phase).toBe('ended');
    expect(g.result).toMatchObject({ winner: 2, loser: 1, kind: 'checkmate' });
    expect(g.result.net).toEqual({ 1: -100, 2: 100 });
  });
  test('빅장: 마주 보게 만든 뒤 상대가 풀지 않으면 점수로 판정 (한 덤 1.5)', () => {
    const g = new JanggiGame({ cho: 1, han: 2 });
    g.setup(1, '마상마상');
    g.setup(2, '마상마상');
    const b = empty();
    put(b, 4, 8, CHO, 'K');
    put(b, 3, 1, HAN, 'K');
    put(b, 0, 9, CHO, 'P');
    put(b, 8, 0, HAN, 'P');
    g.board = b;
    expect(g.move(1, sq(0, 9), sq(0, 8)).ok).toBe(true); // 초: 아무 수
    expect(g.move(2, sq(3, 1), sq(4, 1)).ok).toBe(true); // 한 궁이 4번 줄로 → 빅장
    expect(g.view().bikjang).toBe(true);
    expect(g.bikjangBy).toBe(HAN);
    expect(g.move(1, sq(0, 8), sq(0, 7)).ok).toBe(true); // 초가 안 풂 → 점수
    expect(g.result.kind).toBe('bikjang');
    expect(g.result.score).toEqual({ [CHO]: 2, [HAN]: 3.5 });
    expect(g.result.winner).toBe(2);
  });
  test('한수 쉼: 장군일 땐 못 쉬고, 둘 다 연달아 쉬면 점수 판정', () => {
    const g = new JanggiGame({ cho: 1, han: 2 });
    expect(g.move(1, 0, 1).ok).toBe(false); // 상차림 전
    g.setup(1, '상마상마');
    expect(g.phase).toBe('setup');
    expect(g.setup(1, '없음').ok).toBe(false);
    g.setup(2, '마상상마');
    expect(g.phase).toBe('playing');
    expect(g.pass(2).ok).toBe(false); // 초 차례
    expect(g.pass(1).ok).toBe(true);
    expect(g.pass(2).ok).toBe(true);
    expect(g.result).toMatchObject({ kind: 'passes', winner: 2 }); // 같은 말이면 덤 1.5 로 한 승
  });
  test('상차림 시간 초과: 안 고른 쪽은 기본 상차림', () => {
    const g = new JanggiGame({ cho: 1, han: 2 });
    g.setup(2, '상마마상');
    g.setupDefaults();
    expect(g.formation).toEqual({ [CHO]: FORMATIONS[0], [HAN]: '상마마상' });
    expect(g.phase).toBe('playing');
  });
  test('잘못된 수·남의 차례·기권', () => {
    const g = new JanggiGame({ cho: 1, han: 2 });
    g.setupDefaults();
    expect(g.move(2, sq(0, 3), sq(0, 4)).ok).toBe(false); // 한은 아직
    expect(g.move(1, sq(0, 9), sq(0, 3)).ok).toBe(false); // 졸 위로 차가 못 넘는다
    expect(g.move(1, sq(0, 6), sq(0, 5)).ok).toBe(true);
    expect(g.view().last).toMatchObject({ side: CHO, piece: 'P' });
    expect(g.resign(2).ok).toBe(true);
    expect(g.result).toMatchObject({ winner: 1, kind: 'resign' });
  });
});

describe('장기 AI', () => {
  test('공짜로 잡을 수 있는 차는 잡는다 (모든 난이도)', () => {
    const b = kings();
    put(b, 0, 9, CHO, 'R');
    put(b, 0, 2, HAN, 'R');
    put(b, 8, 9, CHO, 'P');
    for (const level of ['easy', 'normal', 'hard']) {
      expect(new JanggiBot({ level, ms: 60 }).decide(b, CHO)).toEqual({ from: sq(0, 9), to: sq(0, 2) });
    }
  });
  test('외통수가 있으면 둔다', () => {
    const b = empty();
    put(b, 4, 9, CHO, 'K');
    put(b, 3, 2, HAN, 'K');
    put(b, 0, 8, HAN, 'R');
    put(b, 8, 1, HAN, 'R');
    put(b, 0, 0, CHO, 'P');
    expect(new JanggiBot({ level: 'normal' }).decide(b, HAN)).toEqual({ from: sq(8, 1), to: sq(8, 9) });
  });
  test('둘 수가 없으면 한수 쉼(null)', () => {
    const b = empty();
    put(b, 4, 8, CHO, 'K');
    put(b, 3, 1, HAN, 'K');
    // 초 궁 주변을 모두 막는다: 상대 차 두 개가 7·9 줄을 지키고, 자기 말이 나머지를 막음
    put(b, 0, 7, HAN, 'R');
    put(b, 0, 9, HAN, 'R');
    put(b, 3, 8, CHO, 'A');
    put(b, 5, 8, CHO, 'A');
    put(b, 2, 8, HAN, 'P');
    put(b, 6, 8, HAN, 'P');
    const legal = legalMoves(b, CHO);
    if (legal.length === 0) expect(new JanggiBot({ level: 'easy' }).decide(b, CHO)).toBeNull();
  });
  test('보통 > 쉬움 (2판)', () => {
    let wins = 0;
    for (let i = 0; i < 2; i++) {
      const g = new JanggiGame({ cho: 1, han: 2 });
      g.setupDefaults();
      const bots = { 1: new JanggiBot({ level: i ? 'easy' : 'normal', ms: 40 }), 2: new JanggiBot({ level: i ? 'normal' : 'easy', ms: 40 }) };
      while (g.phase === 'playing') {
        const m = bots[g.turn].decide(g.board, g.side[g.turn], { bikjangBy: g.bikjangBy });
        expect((m ? g.move(g.turn, m.from, m.to) : g.pass(g.turn)).ok).toBe(true);
      }
      if (g.result.winner === (i ? 2 : 1)) wins++;
    }
    expect(wins).toBe(2);
  });
});
