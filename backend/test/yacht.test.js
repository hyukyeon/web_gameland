import { YachtGame, scoreOf, totals, CATS, BONUS } from '../src/yacht/YachtGame.js';
import { YachtBot } from '../src/yacht/YachtBot.js';

const seeded = (seed = 1) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

/** 끝까지 둔다 */
function playOut(game, levels = {}, rnd = seeded(5)) {
  const bots = Object.fromEntries(game.pids.map((p) => [p, new YachtBot({ level: levels[p] ?? 'normal', rnd })]));
  for (let guard = 0; guard < 3000 && game.phase !== 'ended'; guard++) {
    const a = bots[game.turn].decide(game, game.turn);
    if (a.type === 'roll') {
      if (a.held) expect(game.hold(game.turn, a.held).ok).toBe(true);
      expect(game.roll(game.turn).ok).toBe(true);
    } else expect(game.score(game.turn, a.cat).ok).toBe(true);
  }
  return game;
}

describe('요트 다이스 점수', () => {
  test.each([
    ['ones', [1, 1, 3, 1, 6], 3],
    ['sixes', [6, 6, 6, 2, 6], 24],
    ['choice', [1, 2, 3, 4, 6], 16],
    ['fourKind', [5, 5, 5, 5, 2], 22],
    ['fourKind', [5, 5, 5, 5, 5], 25],
    ['fourKind', [5, 5, 5, 2, 2], 0],
    ['fullHouse', [3, 3, 3, 6, 6], 21],
    ['fullHouse', [4, 4, 4, 4, 4], 0], // 다섯 개 같은 건 풀하우스 아님
    ['smallStraight', [1, 2, 3, 4, 6], 15],
    ['smallStraight', [3, 4, 5, 6, 6], 15],
    ['smallStraight', [1, 2, 3, 5, 6], 0],
    ['largeStraight', [2, 3, 4, 5, 6], 30],
    ['largeStraight', [1, 2, 3, 4, 6], 0],
    ['yacht', [2, 2, 2, 2, 2], 50],
    ['yacht', [2, 2, 2, 2, 3], 0],
  ])('%s %j = %i', (cat, dice, pts) => expect(scoreOf(cat, dice)).toBe(pts));

  test('위쪽 합이 63 이상이면 보너스 35', () => {
    const sheet = Object.fromEntries(CATS.map((k) => [k, null]));
    Object.assign(sheet, { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, yacht: 50 });
    expect(totals(sheet)).toEqual({ upper: 63, bonus: BONUS, lower: 50, total: 148 });
    sheet.sixes = 12;
    expect(totals(sheet).bonus).toBe(0);
  });
});

describe('요트 다이스 엔진', () => {
  test('차례: 굴리기 → 고정 → 다시 굴리기(최대 3번) → 기록 → 다음 사람', () => {
    const g = new YachtGame([1, 2], { script: [[6, 6, 2, 3, 6], [1, 1, 5, 5, 1], [4, 4, 6, 4, 4]] });
    expect(g.turn).toBe(1);
    expect(g.score(1, 'choice').ok).toBe(false); // 굴리기 전
    expect(g.hold(1, [true, false, false, false, false]).ok).toBe(false); // 굴리기 전 고정 불가
    expect(g.roll(2).ok).toBe(false);
    expect(g.roll(1).ok).toBe(true);
    expect(g.dice).toEqual([6, 6, 2, 3, 6]);
    expect(g.rollsLeft).toBe(2);
    expect(g.options()).toMatchObject({ sixes: 18, choice: 23, yacht: 0 });
    expect(g.hold(1, [true, true, false, false, true]).ok).toBe(true);
    expect(g.roll(1).ok).toBe(true);
    expect(g.dice).toEqual([6, 6, 5, 5, 6]); // 고정한 6 세 개는 그대로
    expect(g.lastRoll.rolled).toEqual([2, 3]);
    expect(g.options().fullHouse).toBe(28);
    g.hold(1, [true, true, true, true, true]);
    expect(g.roll(1).ok).toBe(false); // 모두 고정
    g.hold(1, [true, true, false, false, true]);
    expect(g.roll(1).ok).toBe(true);
    expect(g.rollsLeft).toBe(0);
    expect(g.roll(1).ok).toBe(false); // 3번 다 굴림
    expect(g.score(1, 'nope').ok).toBe(false);
    expect(g.score(1, 'sixes').ok).toBe(true);
    expect(g.sheets[1].sixes).toBe(24);
    expect(g.lastScore).toMatchObject({ pid: 1, cat: 'sixes', score: 24, dice: [6, 6, 6, 4, 6] }); // 셋째 굴림: 풀린 두 자리만 바뀜
    expect(g.turn).toBe(2);
    expect(g.phase).toBe('roll');
    expect(g.rollsLeft).toBe(3);
    expect(g.held).toEqual([false, false, false, false, false]);
  });

  test('이미 기록한 칸에는 다시 못 쓰고, 0점 기록(버리기)은 된다', () => {
    const g = new YachtGame([1, 2], { script: [[1, 2, 3, 4, 6], [1, 1, 1, 1, 1], [2, 3, 4, 5, 1]] });
    g.roll(1);
    expect(g.score(1, 'yacht').ok).toBe(true);
    expect(g.sheets[1].yacht).toBe(0);
    g.roll(2);
    g.score(2, 'yacht');
    g.roll(1);
    expect(g.score(1, 'yacht').ok).toBe(false);
  });

  test('12라운드 끝까지: 1등이 참가비를 모으고 순위·점수가 남는다 (2~4인)', () => {
    for (const n of [2, 3, 4]) {
      const pids = Array.from({ length: n }, (_, i) => i + 1);
      const g = playOut(new YachtGame(pids, { ante: 300, rnd: seeded(n) }));
      expect(g.phase).toBe('ended');
      for (const p of pids) expect(CATS.every((k) => g.sheets[p][k] != null)).toBe(true);
      expect(g.turns).toBe(12 * n);
      expect(g.round).toBe(11);
      const top = Math.max(...pids.map((p) => g.total(p)));
      expect(g.result.winners.every((p) => g.total(p) === top)).toBe(true);
      for (const p of g.result.losers) expect(g.result.net[p]).toBe(-300);
      expect(g.result.standings[0]).toBe(g.result.winners[0]);
    }
  });

  test('기권: 차례에서 빠지고, 한 명만 남으면 그 사람 승리', () => {
    const g = new YachtGame([1, 2, 3], { ante: 100 });
    g.roll(1);
    expect(g.forfeit(1).ok).toBe(true);
    expect(g.turn).toBe(2);
    expect(g.phase).toBe('roll');
    expect(g.forfeit(3).ended).toBe(true);
    expect(g.result).toMatchObject({ winners: [2], kind: 'forfeit' });
  });

  test('3인 중 한 명이 나가도 남은 두 사람이 끝까지 하고 끝난다', () => {
    const g = new YachtGame([1, 2, 3], { rnd: seeded(9) });
    g.forfeit(2);
    playOut(g);
    expect(g.result.kind).toBe('finish');
    expect(g.result.losers).toContain(2);
    expect(CATS.some((k) => g.sheets[2][k] == null)).toBe(true);
  });
});

describe('요트 다이스 AI', () => {
  test('항상 올바른 행동을 고른다 (모든 난이도)', () => {
    for (const level of ['easy', 'normal', 'hard']) {
      const g = new YachtGame([1, 2], { rnd: seeded(3) });
      const bot = new YachtBot({ level });
      expect(bot.decide(g, 1)).toEqual({ type: 'roll' });
      g.roll(1);
      const a = bot.decide(g, 1);
      expect(['roll', 'score']).toContain(a.type);
      if (a.type === 'score') expect(Object.keys(g.options())).toContain(a.cat);
      else expect(a.held).toHaveLength(5);
    }
  });

  test('요트가 나오면 바로 요트에 기록한다', () => {
    const g = new YachtGame([1, 2], { script: [[4, 4, 4, 4, 4]] });
    g.roll(1);
    for (const level of ['normal', 'hard']) expect(new YachtBot({ level }).decide(g, 1)).toEqual({ type: 'score', cat: 'yacht' });
  });

  test('네 개가 같으면 그 네 개를 고정하고 다시 굴린다', () => {
    const g = new YachtGame([1, 2], { script: [[6, 6, 1, 6, 6]] });
    g.roll(1);
    const a = new YachtBot({ level: 'hard' }).decide(g, 1);
    expect(a).toEqual({ type: 'roll', held: [true, true, false, true, true] });
  });

  test('어려움 > 쉬움, 평균 점수도 어려움이 높다', () => {
    let hardWins = 0;
    let hardSum = 0;
    let easySum = 0;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const g = playOut(new YachtGame(i % 2 ? [2, 1] : [1, 2], { rnd: seeded(50 + i) }), { 1: 'hard', 2: 'easy' }, seeded(80 + i));
      if (g.result.winners.includes(1)) hardWins++;
      hardSum += g.total(1);
      easySum += g.total(2);
    }
    expect(hardWins / n).toBeGreaterThan(0.75);
    expect(hardSum).toBeGreaterThan(easySum);
  });
});
