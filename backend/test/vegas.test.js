import { VegasGame, resolveCasino, DECK, ROUNDS, DICE, NEUTRAL } from '../src/vegas/VegasGame.js';
import { VegasBot } from '../src/vegas/VegasBot.js';

/** 시드 고정 난수 */
const seeded = (seed = 1) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

/** 끝까지 둔다: 봇(levels[pid]) 또는 기본 normal */
function playOut(game, levels = {}, rnd = seeded(7)) {
  const bots = Object.fromEntries(game.pids.map((p) => [p, new VegasBot({ level: levels[p] ?? 'normal', rnd, rollouts: 120 })]));
  for (let guard = 0; guard < 2000 && game.phase !== 'ended'; guard++) {
    if (game.phase === 'roundEnd') game.nextRound();
    else if (game.phase === 'roll') expect(game.rollDice(game.turn).ok).toBe(true);
    else expect(game.place(game.turn, bots[game.turn].decide(game, game.turn)).ok).toBe(true);
  }
  return game;
}

describe('라스베가스 카지노 정산', () => {
  test('주사위가 많은 순서로 큰 지폐부터 한 장씩', () => {
    const r = resolveCasino([90, 30, 10], { 1: 3, 2: 1, 3: 2 });
    expect(r.payouts).toEqual({ 1: 90, 3: 30, 2: 10 });
  });
  test('같은 개수는 모두 취소되고 다음 사람이 큰 지폐를 받는다', () => {
    const r = resolveCasino([60, 20], { 1: 3, 2: 3, 3: 1 });
    expect(r.payouts).toEqual({ 3: 60 });
    expect(r.ranking.filter((x) => x.tied).map((x) => x.who).sort()).toEqual([1, 2]);
    expect(r.used).toBe(1);
  });
  test('흰 주사위는 동점 취소에 끼고, 차지한 지폐는 아무도 못 받는다', () => {
    // 흰 4개 1등 → 90 은 버려짐, 2등이 50
    const a = resolveCasino([90, 50], { 1: 2 }, 4);
    expect(a.payouts).toEqual({ 1: 50 });
    expect(a.ranking.find((x) => x.who === NEUTRAL).blocked).toBe(90);
    // 흰 2개와 동점이면 둘 다 취소
    expect(resolveCasino([70], { 1: 2 }, 2).payouts).toEqual({});
  });
  test('지폐보다 사람이 많으면 아래 순위는 못 받는다', () => {
    expect(resolveCasino([80], { 1: 4, 2: 2 }).payouts).toEqual({ 1: 80 });
  });
});

describe('라스베가스 엔진', () => {
  test('준비: 지폐 54장, 카지노마다 5만 이상, 주사위 8개 + 인원별 흰 주사위', () => {
    expect(DECK).toHaveLength(54);
    expect(DECK.reduce((a, b) => a + b, 0)).toBe(2500);
    const g = new VegasGame([1, 2], { rnd: seeded(3) });
    for (const c of g.casinos) {
      expect(c.notes.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(50);
      expect(c.notes).toEqual([...c.notes].sort((a, b) => b - a));
    }
    expect(g.dice[1]).toEqual({ own: DICE, neutral: 4 });
    expect(new VegasGame([1, 2, 3]).dice[1].neutral).toBe(2);
    expect(new VegasGame([1, 2, 3, 4]).dice[1].neutral).toBe(0);
    expect(() => new VegasGame([1])).toThrow();
    expect(() => new VegasGame([1, 2, 3, 4, 5, 6])).toThrow();
  });

  test('차례 검증 → 굴리기 → 고른 눈의 주사위를 (흰 주사위까지) 전부 놓기 → 다음 사람', () => {
    const g = new VegasGame([1, 2], { script: [{ own: [3, 3, 5, 1, 3, 6, 2, 2], neutral: [3, 4, 4, 6] }] });
    expect(g.turn).toBe(1);
    expect(g.place(1, 3).ok).toBe(false); // 아직 안 굴림
    expect(g.rollDice(2).ok).toBe(false); // 내 차례 아님
    expect(g.rollDice(1).ok).toBe(true);
    expect(g.rollDice(1).ok).toBe(false); // 두 번 굴리기 불가
    expect(g.legalValues()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(g.place(1, 7).ok).toBe(false);
    const r = g.place(1, 3);
    expect(r.ok).toBe(true);
    expect(g.casinos[2].dice[1]).toBe(3);
    expect(g.casinos[2].neutral).toBe(1);
    expect(g.dice[1]).toEqual({ own: 5, neutral: 3 });
    expect(g.lastPlace).toMatchObject({ pid: 1, value: 3, own: 3, neutral: 1 });
    expect(g.turn).toBe(2);
    expect(g.phase).toBe('roll');
  });

  test('흰 주사위만 나온 눈도 고를 수 있다 (내 주사위는 그대로)', () => {
    const g = new VegasGame([1, 2], { script: [{ own: [1, 1, 1, 1, 1, 1, 1, 1], neutral: [6, 6, 6, 6] }] });
    g.rollDice(1);
    expect(g.place(1, 6).ok).toBe(true);
    expect(g.dice[1]).toEqual({ own: 8, neutral: 0 });
    expect(g.casinos[5].neutral).toBe(4);
  });

  test('주사위가 떨어진 사람은 건너뛰고, 모두 놓으면 라운드 정산 → 다음 라운드는 선이 한 자리 돈다', () => {
    const all = (v) => ({ own: Array(8).fill(v), neutral: [] });
    const g = new VegasGame([1, 2, 3, 4], { script: [all(1), all(2), all(3), all(4)] });
    const notes = g.casinos.map((c) => c.notes[0]);
    for (const p of [1, 2, 3, 4]) {
      expect(g.turn).toBe(p);
      g.rollDice(p);
      expect(g.place(p, p).ok).toBe(true);
    }
    expect(g.phase).toBe('roundEnd');
    expect(g.lastPlace.value).toBe(4);
    // 혼자 놓은 카지노의 가장 큰 지폐를 받았다
    expect(g.scores).toEqual({ 1: notes[0], 2: notes[1], 3: notes[2], 4: notes[3] });
    expect(g.view().lastRound.gains[1]).toBe(notes[0]);
    expect(g.rollDice(1).ok).toBe(false); // 정산 중엔 조작 불가
    expect(g.nextRound().ok).toBe(true);
    expect(g.round).toBe(1);
    expect(g.turn).toBe(2);
    expect(g.dice[3].own).toBe(8);
    expect(g.casinos.every((c) => Object.values(c.dice).every((x) => x === 0))).toBe(true);
  });

  test('4라운드 끝까지: 1등이 참가비를 모아 받고, 판 기록이 남는다 (인원 2~5)', () => {
    for (const n of [2, 3, 4, 5]) {
      const pids = Array.from({ length: n }, (_, i) => i + 1);
      const g = playOut(new VegasGame(pids, { ante: 500, rnd: seeded(n) }));
      expect(g.phase).toBe('ended');
      expect(g.rounds).toHaveLength(ROUNDS);
      const res = g.result;
      const top = Math.max(...pids.map((p) => g.scores[p]));
      expect(res.winners.every((p) => g.scores[p] === top)).toBe(true);
      expect(res.winners.length + res.losers.length).toBe(n);
      for (const p of res.losers) expect(res.net[p]).toBe(-500);
      expect(res.standings[0]).toBe(res.winners[0]);
      // 라운드마다 받은 돈 합 = 최종 점수
      for (const p of pids) expect(g.rounds.reduce((a, r) => a + r.gains[p], 0)).toBe(g.scores[p]);
    }
  });

  test('기권: 남은 주사위를 버리고 차례에서 빠진다, 한 명만 남으면 그 사람 승리', () => {
    const g = new VegasGame([1, 2, 3], { ante: 100 });
    expect(g.forfeit(1).ok).toBe(true); // 차례인 사람이 나감 → 다음 사람
    expect(g.turn).toBe(2);
    expect(g.dice[1]).toEqual({ own: 0, neutral: 0 });
    expect(g.forfeit(1).ok).toBe(false);
    const r = g.forfeit(3);
    expect(r.ended).toBe(true);
    expect(g.result).toMatchObject({ winners: [2], kind: 'forfeit' });
    expect(g.result.losers.sort()).toEqual([1, 3]);
  });

  test('view 에 정산·주사위 정보가 다 들어 있고 숨길 정보는 없다', () => {
    const g = new VegasGame([5, 9]);
    g.rollDice(5);
    const v = g.view();
    expect(v.roll.own).toHaveLength(8);
    expect(v.roll.neutral).toHaveLength(4);
    expect(v.legal.length).toBeGreaterThan(0);
    expect(v.casinos).toHaveLength(6);
    expect(v.dice[9]).toEqual({ own: 8, neutral: 4 });
    expect(v.rounds).toBe(4);
  });
});

describe('라스베가스 AI', () => {
  test('항상 굴린 눈 중 하나를 고른다 (모든 난이도)', () => {
    for (const level of ['easy', 'normal', 'hard']) {
      const g = new VegasGame([1, 2, 3], { rnd: seeded(11) });
      g.rollDice(1);
      const v = new VegasBot({ level }).decide(g, 1);
      expect(g.legalValues()).toContain(v);
    }
  });

  test('보통: 혼자 1등이 되는 큰 지폐 카지노를 고른다', () => {
    const g = new VegasGame([1, 2], { script: [{ own: [1, 1, 6, 6, 2, 3, 4, 5], neutral: [] }] });
    g.casinos[0].notes = [90];
    g.casinos[5].notes = [10];
    g.casinos[5].dice[2] = 5; // 6번은 상대가 이미 5개
    g.rollDice(1);
    expect(new VegasBot({ level: 'normal' }).decide(g, 1)).toBe(1);
  });

  test('어려움 > 보통 > 쉬움 (2인 대국 승률)', () => {
    const rate = (a, b, n) => {
      let w = 0;
      for (let i = 0; i < n; i++) {
        const pids = i % 2 ? [2, 1] : [1, 2]; // 선 번갈아
        const g = playOut(new VegasGame(pids, { rnd: seeded(100 + i) }), { 1: a, 2: b }, seeded(200 + i));
        if (g.result.winners.includes(1)) w += 1 / g.result.winners.length;
      }
      return w / n;
    };
    expect(rate('hard', 'normal', 30)).toBeGreaterThan(0.65);
    expect(rate('normal', 'easy', 40)).toBeGreaterThan(0.55);
  });
});
