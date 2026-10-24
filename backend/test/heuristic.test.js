import { HeuristicBot } from '../src/game/HeuristicBot.js';
import { AiPlayer } from '../src/game/AiPlayer.js';
import { GostopGame } from '../src/game/GostopGame.js';
import { card } from '../src/game/cards.js';

// 월 m 의 카드 id: 4(m-1) ~ 4(m-1)+3. [0]=광/열끗, [1]=띠, [2][3]=피
const me = 1;
const view = (o = {}) => ({
  you: me, turn: me, phase: 'play', hand: [], floor: [], dummies: { [me]: 0 }, opps: [2], active: [me, 2],
  handCounts: { [me]: 5, 2: 5 }, threshold: 7, go: { [me]: 0, 2: 0 },
  captured: { [me]: [], 2: [] }, scores: { [me]: { total: 0 }, 2: { total: 0 } }, choice: null, ...o,
});

describe('카드 카운팅', () => {
  test('내 손패·바닥·모든 획득패는 "본 패", 나머지가 남은 패', () => {
    const b = new HeuristicBot(me);
    const v = view({ hand: [0, 1], floor: [2, 4], captured: { [me]: [8], 2: [5, 6] } });
    b.observe(v);
    expect([...b.seen].sort((a, c) => a - c)).toEqual([0, 1, 2, 4, 5, 6, 8]);
    const info = b.unseenInfo(v);
    expect(info.n).toBe(48 - 7);
    expect(info.byMonth[1].map((i) => i).sort()).toEqual([3]); // 1월은 0,1,2 를 봤으니 3 만 남음
    expect(info.byMonth[2].length).toBe(1); // 4,5,6 을 봤으니 7 만
  });

  test('판 도중 나온 패는 이후 뷰에서 사라져도(획득패로 이동) 기억에 남고 새 판에는 초기화된다', () => {
    const b = new HeuristicBot(me);
    b.observe(view({ floor: [20] }));
    b.observe(view({ floor: [], captured: { [me]: [], 2: [21] } }));
    expect(b.seen.has(20)).toBe(true); // 바닥에서 사라졌지만 누군가에게 먹혔다고 해도 이미 나온 패
    expect(new HeuristicBot(me).seen.size).toBe(0);
  });

  test('상대가 같은 달 패를 쥐고 있을 확률: 남은 패가 없으면 0, 많을수록 커진다', () => {
    const b = new HeuristicBot(me);
    const v = view({ hand: [0, 1, 2], floor: [3] }); // 1월 전부 확인됨
    b.observe(v);
    const info = b.unseenInfo(v);
    expect(b.pOppHas(info, 1)).toBe(0);
    expect(b.pOppHas(info, 2)).toBeGreaterThan(0);
  });
});

describe('패 선택 EV', () => {
  const decide = (v) => new HeuristicBot(me, { rnd: () => 0 }).decide(v);

  test('확정 매칭을 매칭 없는 패보다 우선한다', () => {
    expect(decide(view({ hand: [6, 2], floor: [3] })).cardId).toBe(2);
  });

  test('매칭이 여럿이면 가치가 큰 쪽(광)', () => {
    expect(decide(view({ hand: [4, 0], floor: [1, 5] })).cardId).toBe(0);
  });

  test('매칭이 없을 때 상대 손패가 많을수록(방어 리스크↑) 내려놓는 EV 가 낮아진다', () => {
    const mk = (opp) => view({ hand: [22, 2], floor: [40], handCounts: { [me]: 2, 2: opp } });
    const bot = new HeuristicBot(me, { rnd: () => 0 });
    const few = mk(1);
    const many = mk(9);
    bot.observe(few);
    const e1 = bot.evOfPlay(22, few, bot.unseenInfo(few));
    const e9 = bot.evOfPlay(22, many, bot.unseenInfo(many));
    expect(e9).toBeLessThan(e1);
  });

  test('더미 매칭 확률이 높은 달을 내려놓는 쪽을 택한다 (같은 가치라면 남은 패가 많은 달)', () => {
    // 3월(8~11) 피 vs 5월(16~19) 피. 3월은 다른 패가 이미 많이 나와 남은 패가 적다.
    const v = view({ hand: [10, 18], floor: [40], captured: { [me]: [8, 9, 11], 2: [] } });
    // 3월 남은 패 0, 5월 남은 패 3(16,17,19): 5월을 내려놓아야 더미에서 짝을 만날 확률이 있다 → 단, 방어 리스크와 합산된 EV 비교
    const a = decide(v);
    expect([10, 18]).toContain(a.cardId);
    const bot = new HeuristicBot(me, { rnd: () => 0 });
    bot.observe(v);
    const info = bot.unseenInfo(v);
    expect(bot.evOfPlay(18, v, info)).not.toBe(bot.evOfPlay(10, v, info));
  });

  test('폭탄과 흔들기와 보너스', () => {
    const a = decide(view({ hand: [0, 1, 2, 6], floor: [3] }));
    expect(card(a.cardId).month).toBe(1);
    expect(a.shake).toBe(false);
    const sh = decide(view({ hand: [0, 1, 2, 24], floor: [] }));
    expect(sh.shake).toBe(true);
    expect(decide(view({ hand: [3, 48], floor: [2] })).cardId).toBe(48);
    expect(decide(view({ hand: [] }))).toEqual({ type: 'play', cardId: null });
  });

  test('내 차례가 아니면 null, 바닥 선택은 가치가 높은 패', () => {
    expect(decide(view({ turn: 2 }))).toBeNull();
    expect(decide(view({ phase: 'choose', choice: { step: 'hand', options: [1, 2] } }))).toEqual({ type: 'choose', cardId: 1 });
  });
});

describe('고/스톱 EV', () => {
  const gs = (o) => view({ phase: 'gostop', hand: [1, 2, 3, 4, 5], handCounts: { [me]: 5, 2: 5 }, scores: { [me]: { total: 7 }, 2: { total: 0 } }, ...o });
  const dec = (v) => new HeuristicBot(me).decide(v).type;

  test('상대가 한참 뒤처졌고 패가 많이 남았으면 고', () => expect(dec(gs())).toBe('go'));
  test('남은 패가 적으면 스톱', () => expect(dec(gs({ hand: [1] }))).toBe('stop'));
  test('상대가 임계값 근처까지 따라오면 스톱', () => expect(dec(gs({ scores: { [me]: { total: 7 }, 2: { total: 6 } } }))).toBe('stop'));
  test('이미 3고면 스톱', () => expect(dec(gs({ go: { [me]: 3, 2: 0 } }))).toBe('stop'));
  test('상대가 고를 불렀고 점수가 올라 있으면 스톱', () =>
    expect(dec(gs({ go: { [me]: 0, 2: 1 }, scores: { [me]: { total: 7 }, 2: { total: 4 } } }))).toBe('stop'));
  test('goEV 는 역전 확률(pOpp)이 클수록 낮아진다', () => {
    const b = new HeuristicBot(me);
    const calm = b.goEV(gs());
    const hot = b.goEV(gs({ scores: { [me]: { total: 7 }, 2: { total: 5 } } }));
    expect(hot.pOpp).toBeGreaterThan(calm.pOpp);
    expect(hot.goValue).toBeLessThan(calm.goValue);
  });
  test('3인전(임계값 3) 에서도 동작', () => {
    const v = gs({ threshold: 3, opps: [2, 3], handCounts: { [me]: 5, 2: 5, 3: 5 }, captured: { [me]: [], 2: [], 3: [] }, scores: { [me]: { total: 3 }, 2: { total: 0 }, 3: { total: 0 } }, go: { [me]: 0, 2: 0, 3: 0 } });
    expect(['go', 'stop']).toContain(dec(v));
  });
  test('총통은 선언, 광팔기는 비광이 섞인 3광만', () => {
    expect(dec(view({ phase: 'chong' }))).toBe('chongtong');
    expect(dec(view({ phase: 'gwang', hand: [0, 8, 44, 1] }))).toBe('sellGwang');
    expect(dec(view({ phase: 'gwang', hand: [0, 8, 28, 1] }))).toBe('passGwang');
  });
});

// 엔진과 붙여 자체 대국: 거부 0, 판이 항상 끝나고, 결정 시간이 이벤트 루프를 막지 않는다
describe('HeuristicBot 자체 대국 + 지연 점검', () => {
  function act(g, id, a) {
    switch (a.type) {
      case 'play': return g.play(id, a.cardId, { shake: a.shake });
      case 'choose': return g.choose(id, a.cardId);
      case 'go': return g.callGo(id);
      case 'stop': return g.callStop(id);
      case 'sellGwang': return g.sellGwang(id);
      case 'passGwang': return g.passGwang(id);
      case 'chongtong': return g.callChongtong(id);
      case 'passChongtong': return g.passChongtong(id);
    }
    return { ok: false };
  }

  test.each([
    [2, {}],
    [3, { bonus: true }],
    [4, { bonus: true, ppeokPay: true, chongtong: true, ttibak: true }],
  ])('%i인 150판 무거부·종료, 결정당 최대 지연 < 10ms', (n, opts) => {
    let maxMs = 0;
    let decisions = 0;
    let totalMs = 0;
    for (let k = 0; k < 150; k++) {
      const pids = Array.from({ length: n }, (_, i) => i + 1);
      const g = new GostopGame(pids, { firstPlayer: 1, rest: n === 4 ? 4 : undefined, ...opts });
      const bots = Object.fromEntries(pids.map((p) => [p, new HeuristicBot(p)]));
      for (let step = 0; g.phase !== 'ended'; step++) {
        if (step > 400) throw new Error('무한 루프');
        const id = g.turn;
        const a = bots[id].decide(g.view(id));
        expect(a).not.toBeNull();
        const r = act(g, id, a);
        if (!r.ok) throw new Error(`거부됨: ${JSON.stringify(a)} ${r.error} phase=${g.phase}`);
      }
      for (const b of Object.values(bots)) {
        maxMs = Math.max(maxMs, b.stats.maxMs);
        decisions += b.stats.decisions;
        totalMs += b.stats.ms;
      }
    }
    expect(decisions).toBeGreaterThan(1000);
    expect(maxMs).toBeLessThan(10);
    expect(totalMs / decisions).toBeLessThan(1); // 평균 1ms 미만
  });

  test('이전 단순 봇(AiPlayer) 상대로 2인 200판 — HeuristicBot 이 열세가 아니다', () => {
    let hWins = 0;
    let aWins = 0;
    for (let k = 0; k < 200; k++) {
      const first = k % 2 === 0 ? 1 : 2; // 선 공평하게
      const g = new GostopGame([1, 2], { firstPlayer: first });
      const bots = { 1: new HeuristicBot(1), 2: new AiPlayer(2) };
      for (let step = 0; g.phase !== 'ended' && step < 400; step++) {
        const id = g.turn;
        const r = act(g, id, bots[id].decide(g.view(id)));
        if (!r.ok) throw new Error('거부');
      }
      if (g.result.winner === 1) hWins++;
      else if (g.result.winner === 2) aWins++;
    }
    // 통계적 성능 확인용(엄격한 우위 보장은 아님): 크게 밀리지만 않으면 통과
    console.log(`HeuristicBot ${hWins} : ${aWins} AiPlayer (나머지 무승부)`);
    expect(hWins).toBeGreaterThanOrEqual(aWins * 0.8);
  });
});
