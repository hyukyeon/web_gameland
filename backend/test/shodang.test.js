import { GostopGame } from '../src/game/GostopGame.js';
import { computeScore } from '../src/game/score.js';

const [A, B, C] = [1, 2, 3];
const GWANG3 = [0, 8, 28]; // 1·3·8월 광 = 3광 3점
const GODORI = [4, 12, 29]; // 고도리 5점

/** 3인, A 차례(play). B·C 는 이미 기준 점수(3점) 이상 */
function mk({ capB = GWANG3, capC = GODORI } = {}) {
  const g = new GostopGame([A, B, C], { firstPlayer: A });
  g.hands = { [A]: [16, 20, 24], [B]: [17, 21, 25], [C]: [18, 22, 26] };
  g.captured = { [A]: [], [B]: [...capB], [C]: [...capC] };
  g.floor = [36, 37];
  g.stock = [38, 39, 40, 41, 42, 43];
  g.phase = 'play';
  g.ctx = null;
  g.sale = null;
  g.turn = A;
  return g;
}

describe('쇼당', () => {
  test('두 상대가 모두 날 수 있는 상태면 내 차례에 쇼당 가능 (뷰에 표시)', () => {
    const g = mk();
    expect(computeScore(g.captured[B]).total).toBeGreaterThanOrEqual(3);
    expect(g.canShodang(A)).toBe(true);
    expect(g.view(A).shodangOk).toBe(true);
    expect(g.view(B).shodangOk).toBe(false);
    expect(mk({ capC: [] }).canShodang(A)).toBe(false); // 한 명만 날 수 있으면 불가
  });

  test('둘 다 수락하면 나가리 (쇼당 태그)', () => {
    const g = mk();
    const r = g.callShodang(A);
    expect(r.ok).toBe(true);
    expect(r.frames.at(-1).banner).toMatchObject({ text: '쇼당!', pid: A });
    expect(g.phase).toBe('shodang');
    expect(g.turn).toBe(B);
    expect(g.view(B).shodangAsk).toBe(B);
    expect(g.answerShodang(C, true).ok).toBe(false); // 차례 아님
    g.answerShodang(B, true);
    expect(g.turn).toBe(C);
    g.answerShodang(C, true);
    expect(g.phase).toBe('ended');
    expect(g.result).toMatchObject({ draw: true, nagari: true, shodang: true, tags: ['쇼당'] });
  });

  test("한 명이 '받으면' 계속, 받은 사람이 지면(다른 상대가 나면) 독박", () => {
    const g = mk();
    g.callShodang(A);
    g.answerShodang(B, false); // B 가 받음
    expect(g.phase).toBe('play');
    expect(g.turn).toBe(A); // 쇼당 부른 사람이 그대로 낸다
    expect(g.shodangReceiver).toBe(B);
    expect(g.canShodang(A)).toBe(false); // 한 판에 한 번
    // C 가 스톱으로 승리 → B 가 A 의 몫까지 낸다
    g.phase = 'gostop';
    g.turn = C;
    g.ctx = { base: computeScore(g.captured[C]).total };
    g.callStop(C);
    expect(g.result.winner).toBe(C);
    expect(g.result.payments.filter((p) => p.kind === 'game').every((p) => p.from === B)).toBe(true);
    expect(g.result.payments.some((p) => p.tags.includes('독박 (쇼당 받음)'))).toBe(true);
    expect(g.result.dokbak).toBe(B);
  });

  test('쇼당 부른 사람이 나면 독박 없음', () => {
    const g = mk({ capB: GWANG3 });
    g.callShodang(A);
    g.answerShodang(B, false);
    g.captured[A] = [40, 41, 42, 43, 44, 45, 46, 47, 0, 8, 28]; // 아무 점수
    g.phase = 'gostop';
    g.turn = A;
    g.ctx = { base: computeScore(g.captured[A]).total };
    g.callStop(A);
    expect(g.result.dokbak).toBeNull();
    expect(new Set(g.result.payments.filter((p) => p.kind === 'game').map((p) => p.from))).toEqual(new Set([B, C]));
  });

  test('2인전에서는 쇼당 불가', () => {
    const g = new GostopGame([A, B], { firstPlayer: A });
    g.phase = 'play';
    g.turn = A;
    g.captured[B] = [...GWANG3];
    expect(g.canShodang(A)).toBe(false);
    expect(g.callShodang(A).ok).toBe(false);
  });
});
