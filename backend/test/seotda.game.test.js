import { SeotdaGame } from '../src/seotda/SeotdaGame.js';

const A = 1;
const B = 2;
const C3 = 3;
// 편의: 정해진 패로 게임 생성 (1월 광+피 등은 rules 테스트의 id 표 참고)
const H = {
  alri: [0, 4], // 알리(1+2)
  seryuk: [14, 22], // 세륙(4+6)
  ttaeng8: [28, 29], // 8땡
  ttaeng10: [36, 38], // 장땡
  gusa: [14, 34], // 일반 구사(4피+9피)
  meongGusa: [12, 32], // 멍텅구리구사
  kkeut4: [0, 10], // 1광+3피 = 4끗
};
const mk = (hands, o = {}) => {
  const pids = Object.keys(hands).map(Number);
  return new SeotdaGame(pids, { ante: 100, balances: Object.fromEntries(pids.map((p) => [p, o.balance ?? 10000])), dealer: o.dealer ?? pids[0], hands, ...o });
};
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

describe('섯다 베팅 상태 머신', () => {
  test('시작: 참가비 징수, 팟=참가비×인원, 2장씩 비공개, 선부터 턴', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk, [C3]: H.kkeut4 });
    expect(g.pot).toBe(300);
    expect(g.turn).toBe(A);
    expect(g.stack[A]).toBe(9900);
    const vb = g.view(B);
    expect(vb.players[B].hand).toHaveLength(2);
    expect(vb.players[A].hand).toBeNull(); // 남의 패는 숨김
    expect(vb.players[B].handName).toBe('세륙');
    expect(vb.options).toBeNull(); // 내 차례가 아님
    expect(g.view(A).options.bbing).toMatchObject({ raiseTo: 100, amount: 100 }); // 선만 삥 가능
  });

  test('랜덤 분배: 20장 덱에서 겹치지 않게 2장씩', () => {
    const g = new SeotdaGame([1, 2, 3, 4], { ante: 100, balances: { 1: 5000, 2: 5000, 3: 5000, 4: 5000 } });
    const all = Object.values(g.hands).flat();
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
  });

  test('삥 → 콜 → 쇼다운: 높은 족보가 팟을 가져간다 (제로섬)', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk });
    expect(g.act(A, 'bbing').ok).toBe(true);
    expect(g.turn).toBe(B);
    expect(g.view(B).options.call.amount).toBe(100);
    const r = g.act(B, 'call');
    expect(r.events.some((e) => e.type === 'showdown')).toBe(true);
    expect(g.phase).toBe('ended');
    expect(g.result.kind).toBe('showdown');
    expect(g.result.winners).toEqual([A]); // 알리 > 세륙
    expect(g.result.pot).toBe(400);
    expect(g.result.payouts[A]).toBe(400);
    expect(g.result.net).toEqual({ [A]: 200, [B]: -200 });
    expect(sum(g.result.net)).toBe(0);
    expect(g.result.hands[B].name).toBe('세륙'); // 쇼다운은 전원 공개
    expect(g.view(A).players[B].hand).not.toBeNull();
  });

  test('삥은 선의 첫 베팅에서만 가능', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk, [C3]: H.kkeut4 });
    expect(g.act(B, 'call').ok).toBe(false); // 차례 아님
    g.act(A, 'call'); // 선이 체크
    expect(g.view(B).options.bbing).toBeNull();
    expect(g.act(B, 'bbing').ok).toBe(false);
    // 선이 삥을 친 뒤에도 다른 사람은 삥 불가
    const g2 = mk({ [A]: H.alri, [B]: H.seryuk });
    g2.act(A, 'bbing');
    expect(g2.view(B).options.bbing).toBeNull();
  });

  test('모두 체크하면 베팅 없이 쇼다운', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk, [C3]: H.kkeut4 });
    g.act(A, 'call');
    g.act(B, 'call');
    g.act(C3, 'call');
    expect(g.phase).toBe('ended');
    expect(g.result.winners).toEqual([A]);
    expect(g.result.payouts[A]).toBe(300);
  });

  test('하프: 현재 금액에 팟의 50%를 더해 베팅, 이후 재응답', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk, [C3]: H.kkeut4 });
    g.act(A, 'bbing'); // 팟 400, currentBet 100
    const o = g.view(B).options;
    expect(o.half).toMatchObject({ raiseTo: 100 + 200, amount: 300 }); // 100 + 팟(400)/2
    g.act(B, 'half');
    expect(g.currentBet).toBe(300);
    expect(g.pot).toBe(300 + 100 + 300); // 참가비300 + 선 100 + B 300
    expect(g.turn).toBe(C3);
    g.act(C3, 'call'); // 300
    expect(g.turn).toBe(A); // 레이즈 후 A 도 다시 응답해야 함
    expect(g.view(A).options.call.amount).toBe(200);
    g.act(A, 'call');
    expect(g.phase).toBe('ended');
    expect(g.result.pot).toBe(1200); // 세 명 모두 참가비 100 + 베팅 300
  });

  test('따당: 앞사람 베팅의 2배', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk });
    g.act(A, 'bbing');
    expect(g.view(B).options.ddadang).toMatchObject({ raiseTo: 200, amount: 200 });
    g.act(B, 'ddadang');
    expect(g.currentBet).toBe(200);
    expect(g.view(A).options.call.amount).toBe(100);
    expect(g.view(A).options.ddadang.raiseTo).toBe(400);
    g.act(A, 'ddadang');
    expect(g.currentBet).toBe(400);
  });

  test('다이: 한 명만 남으면 즉시 종료, 팟은 남은 사람이 가져가고 패는 승자만 공개', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk, [C3]: H.kkeut4 });
    g.act(A, 'bbing');
    g.act(B, 'die');
    expect(g.phase).toBe('betting');
    expect(g.turn).toBe(C3); // 다이한 사람은 건너뜀
    const r = g.act(C3, 'die');
    expect(g.phase).toBe('ended');
    expect(g.result.kind).toBe('fold');
    expect(g.result.winners).toEqual([A]);
    expect(g.result.payouts[A]).toBe(400);
    expect(Object.keys(g.result.hands)).toEqual([String(A)]); // 다이한 사람 패는 공개 안 됨
    expect(g.result.net).toEqual({ [A]: 200, [B]: -100, [C3]: -100 }); // A 는 삥 100 + 참가비 100 을 내고 팟 400 을 받음
    expect(r.events.at(-1).type).toBe('showdown');
  });

  test('다이한 사람은 이후 행동 불가, 끝난 판에는 행동 불가', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk, [C3]: H.kkeut4 });
    g.act(A, 'bbing');
    g.act(B, 'die');
    expect(g.act(B, 'call').ok).toBe(false);
    g.act(C3, 'call');
    expect(g.act(A, 'call').ok).toBe(false);
  });

  test('무승부면 팟을 나눈다 (나머지는 앞 순서 승자에게)', () => {
    const g = mk({ [A]: [0, 10], [B]: [2, 8] }); // A: 1광+3피=4끗, B: 1피+3광=4끗
    g.act(A, 'bbing');
    g.act(B, 'call');
    expect(g.result.winners).toEqual([A, B]);
    expect(g.result.payouts[A] + g.result.payouts[B]).toBe(g.result.pot);
    expect(sum(g.result.net)).toBe(0);
  });

  test('레이즈 상한: 상대가 맞출 수 있는 최대 금액까지, 마지막엔 올인 표시', () => {
    const g = new SeotdaGame([A, B], { ante: 100, balances: { [A]: 10000, [B]: 500 }, hands: { [A]: H.alri, [B]: H.seryuk }, dealer: A });
    expect(g.view(A).options.half).toMatchObject({ raiseTo: 100, amount: 100 }); // 팟 200 의 절반
    g.act(A, 'half');
    expect(g.view(B).options.ddadang).toMatchObject({ raiseTo: 200, amount: 200, allIn: false });
    g.act(B, 'ddadang');
    g.act(A, 'ddadang'); // 400 = B 가 낼 수 있는 최대
    expect(g.currentBet).toBe(400);
    expect(g.view(B).options.ddadang).toBeNull();
    expect(g.view(B).options.call).toEqual({ amount: 200, allIn: true });
    g.act(B, 'call');
    expect(g.stack[B]).toBe(0);
    expect(g.committed).toEqual({ [A]: 500, [B]: 500 });
    expect(g.phase).toBe('ended');
    expect(sum(g.result.net)).toBe(0);
  });

  test('올인 콜: 모자라면 가진 만큼만 내고, 나머지 사람끼리 사이드팟', () => {
    // C3 는 참가비 후 200 만 남음. A 가 하프로 크게 올리면 C3 는 200 올인 콜
    const g = new SeotdaGame([A, B, C3], {
      ante: 100,
      balances: { [A]: 10000, [B]: 10000, [C3]: 300 },
      hands: { [A]: H.seryuk, [B]: H.alri, [C3]: H.ttaeng10 }, // C3 장땡(최강), B 알리, A 세륙
      dealer: A,
    });
    g.act(A, 'bbing'); // 100
    g.act(B, 'half'); // 100 + 400/2 = 300
    g.act(C3, 'call'); // 200 만 있음 → 올인
    expect(g.isAllIn(C3)).toBe(true);
    expect(g.lastAction[C3]).toMatchObject({ action: 'call', amount: 200, allIn: true });
    g.act(A, 'call'); // 200 더
    expect(g.phase).toBe('ended');
    // 메인팟: 300 × 3 = 900 (C3 장땡 승), 사이드팟: (400-300) × 2 = 200 (B 알리 > A 세륙)
    expect(g.result.pots).toEqual([
      { amount: 900, eligible: [A, B, C3], winners: [C3] },
      { amount: 200, eligible: [A, B], winners: [B] },
    ]);
    expect(g.result.payouts).toEqual({ [C3]: 900, [B]: 200 });
    expect(g.result.net).toEqual({ [A]: -400, [B]: -200, [C3]: 600 });
    expect(g.result.winners).toEqual([B, C3]);
  });

  test('올인한 사람은 차례가 오지 않고, 나머지가 다 맞추면 쇼다운', () => {
    const g = new SeotdaGame([A, B, C3], { ante: 100, balances: { [A]: 10000, [B]: 10000, [C3]: 100 }, hands: { [A]: H.seryuk, [B]: H.alri, [C3]: H.kkeut4 }, dealer: A });
    expect(g.isAllIn(C3)).toBe(true); // 참가비만으로 올인
    g.act(A, 'call');
    expect(g.turn).toBe(B);
    g.act(B, 'call');
    expect(g.phase).toBe('ended');
    expect(g.result.winners).toEqual([B]);
  });

  test('전원 참가비로 올인이면 생성 즉시 쇼다운', () => {
    const g = new SeotdaGame([A, B], { ante: 100, balances: { [A]: 50, [B]: 100 }, hands: { [A]: H.alri, [B]: H.seryuk }, dealer: A });
    expect(g.phase).toBe('ended');
    expect(g.result.pot).toBe(150);
    expect(g.result.winners).toEqual([A]); // B 의 남은 50 은 돌려받을 뿐 승리가 아님
    expect(g.result.payouts).toEqual({ [A]: 100, [B]: 50 });
    expect(sum(g.result.net)).toBe(0);
  });

  test('다이한 사람이 올인자보다 많이 낸 돈은 마지막 팟으로', () => {
    const g = new SeotdaGame([A, B, C3], { ante: 100, balances: { [A]: 10000, [B]: 10000, [C3]: 200 }, hands: { [A]: H.seryuk, [B]: H.alri, [C3]: H.kkeut4 }, dealer: A });
    g.act(A, 'bbing'); // A 200
    g.act(B, 'half'); // B 100+? → currentBet 100+200=300
    g.act(C3, 'call'); // C3 올인 (100)
    g.act(A, 'die'); // A 는 200 을 내고 다이
    expect(g.phase).toBe('ended'); // B 만 행동 가능, 이미 맞춘 상태
    const pots = g.result.pots;
    expect(sum(Object.fromEntries(pots.map((p, i) => [i, p.amount])))).toBe(g.result.pot);
    expect(sum(g.result.net)).toBe(0);
  });

  test('동점: 최고 족보 동점자가 팟 전체를 나누면 tie 로 표시, doubleArgs 는 동점자끼리 판돈 2배', () => {
    const g = mk({ [A]: [0, 10], [B]: [2, 8], [C3]: H.seryuk }); // A·B 4끗 동점, C3 는 다이
    g.act(A, 'bbing');
    g.act(B, 'call');
    g.act(C3, 'die');
    expect(g.result.tie).toEqual([A, B]);
    const args = g.doubleArgs();
    expect(args.pids).toEqual([A, B]);
    expect(args.ante).toBe(200);
    expect(args.double).toBe(1);
    expect(args.carry.outsiders).toEqual({ [C3]: 100 });
    // 다음 판: 동점자끼리, 이월된 팟 + 판돈 2배
    const g2 = new SeotdaGame(args.pids, { balances: { [A]: 10000, [B]: 10000 }, hands: { [A]: H.ttaeng8, [B]: H.alri }, ...args });
    expect(g2.pot).toBe(500 + 400); // 이전 팟 500 + 참가비 200×2
    g2.act(A, 'call');
    g2.act(B, 'call');
    expect(g2.result.winners).toEqual([A]);
    expect(g2.result.net).toEqual({ [A]: 500, [B]: -400, [C3]: -100 }); // 팟 900 (C3 의 참가비 포함) 을 A 가 가져감
    expect(sum(g2.result.net)).toBe(0);
  });

  test('동점이어도 사이드팟 승자가 다르면 tie 아님 (그냥 나눔)', () => {
    const g = new SeotdaGame([A, B, C3], { ante: 100, balances: { [A]: 10000, [B]: 10000, [C3]: 200 }, hands: { [A]: [0, 10], [B]: [2, 8], [C3]: H.ttaeng10 }, dealer: A });
    g.act(A, 'bbing');
    g.act(B, 'call');
    g.act(C3, 'call'); // 올인
    expect(g.result.tie).toBeNull();
  });

  test('구사 재경기: 팟이 이월되고 참가비를 다시 걷는다', () => {
    const g = mk({ [A]: H.gusa, [B]: H.alri });
    g.act(A, 'bbing');
    g.act(B, 'call');
    expect(g.result.kind).toBe('rematch');
    expect(g.result.rematch).toBe(true);
    expect(g.result.rematchBy).toBe(A);
    expect(g.result.payouts).toEqual({});
    expect(sum(g.result.net)).toBe(0);
    expect(g.result.pot).toBe(400);
    // 새 판: 팟 유지(400) + 참가비 재징수(200) = 600
    const next = new SeotdaGame([A, B], { ante: 100, balances: { [A]: 10000, [B]: 10000 }, hands: { [A]: H.ttaeng8, [B]: H.seryuk }, ...g.rematchArgs() });
    expect(next.round).toBe(2);
    expect(next.pot).toBe(600);
    expect(next.stack[A]).toBe(10000 - 200 - 100);
    next.act(A, 'call');
    next.act(B, 'call');
    expect(next.result.winners).toEqual([A]); // 8땡
    expect(next.result.payouts[A]).toBe(600);
    expect(next.result.net[A]).toBe(300);
    expect(next.result.net[B]).toBe(-300);
  });

  test('이탈(forfeit): 내 차례면 다음 사람으로, 둘 중 하나가 나가면 상대 승리 (낸 돈은 팟에)', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk, [C3]: H.kkeut4 });
    g.act(A, 'bbing');
    const r = g.forfeit(B); // B 차례에 이탈
    expect(r.ok).toBe(true);
    expect(g.turn).toBe(C3);
    g.forfeit(C3);
    expect(g.phase).toBe('ended');
    expect(g.result.winners).toEqual([A]);
    expect(g.result.payouts[A]).toBe(g.pot);
    expect(g.forfeit(A).ok).toBe(false);
  });

  test('시간 초과: 체크 가능하면 체크, 아니면 다이', () => {
    const g = mk({ [A]: H.alri, [B]: H.seryuk });
    g.timeoutAction(); // A: 걸린 금액 0 → 체크
    expect(g.lastAction[A].action).toBe('call');
    expect(g.act(B, 'bbing').ok).toBe(false); // 선이 아니므로 삥 불가
    expect(g.lastAction[B]).toBeUndefined();
  });

  test('1000판 무작위 진행: 항상 종료, 제로섬, 음수 잔액 없음, 규칙 위반 행동은 거부', () => {
    for (let k = 0; k < 1000; k++) {
      const n = 2 + (k % 4);
      const pids = Array.from({ length: n }, (_, i) => i + 1);
      const balances = Object.fromEntries(pids.map((p) => [p, 500 + Math.floor(Math.random() * 3000)]));
      let g = new SeotdaGame(pids, { ante: 100, balances, dealer: pids[k % n] });
      let rounds = 0;
      for (let step = 0; step < 400 && g.phase !== 'ended'; step++) {
        const o = g.options(g.turn);
        const acts = ['die', 'call', 'call', 'call', 'half', 'ddadang', 'bbing'];
        const a = acts[Math.floor(Math.random() * acts.length)];
        const r = g.act(g.turn, a);
        if (!r.ok) expect(o[a === 'die' ? 'die' : a]).toBeFalsy(); // 거부된 건 불가능한 행동이었다
        for (const p of pids) {
          expect(g.stack[p]).toBeGreaterThanOrEqual(0);
          expect(g.committed[p]).toBeLessThanOrEqual(balances[p]);
        }
        if (g.phase === 'ended' && g.result.rematch && rounds < 3) {
          rounds++;
          g = new SeotdaGame(pids, { ante: 100, balances, ...g.rematchArgs() });
        }
      }
      expect(g.phase).toBe('ended');
      expect(sum(g.result.net)).toBe(0);
      expect(sum(g.result.payouts)).toBe(g.result.rematch ? 0 : g.result.pot);
    }
  });
});
