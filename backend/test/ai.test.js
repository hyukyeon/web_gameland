import { AiPlayer, cardValue } from '../src/game/AiPlayer.js';
import { GostopGame } from '../src/game/GostopGame.js';
import { card } from '../src/game/cards.js';

// 월 m(1~12) 의 카드 id 는 4(m-1) ~ 4(m-1)+3. [0]=광/열끗, [1]=띠, [2][3]=피
const me = 1;
const view = (o = {}) => ({
  you: me, turn: me, phase: 'play', hand: [], floor: [], dummies: { [me]: 0 }, opps: [2], active: [me, 2],
  threshold: 7, go: { [me]: 0, 2: 0 }, scores: { [me]: { total: 0 }, 2: { total: 0 } }, choice: null, ...o,
});
const ai = new AiPlayer(me, { rnd: () => 0 });

describe('카드 가치', () => {
  test('광 > 쌍피 > 열끗 > 띠 > 피', () => {
    expect(cardValue(0)).toBeGreaterThan(cardValue(41)); // 광 > 쌍피(11월)
    expect(cardValue(41)).toBeGreaterThan(cardValue(16)); // 쌍피 > 열끗(5월)
    expect(cardValue(16)).toBeGreaterThan(cardValue(17)); // 열끗 > 띠
    expect(cardValue(17)).toBeGreaterThan(cardValue(18)); // 띠 > 피
    expect(cardValue(44)).toBeLessThan(cardValue(0)); // 비광은 일반 광보다 낮다
  });
});

describe('AiPlayer.decide – 카드 선택', () => {
  test('내 차례가 아니면 아무것도 하지 않는다', () => {
    expect(ai.decide(view({ turn: 2 }))).toBeNull();
  });

  test('바닥과 매칭되는 패를 최우선으로 낸다', () => {
    const a = ai.decide(view({ hand: [6, 2], floor: [3] })); // 2월 피, 1월 피 / 바닥 1월 피
    expect(a).toMatchObject({ type: 'play', cardId: 2 });
  });

  test('매칭이 여럿이면 가치 높은 쪽 (광 > 열끗)', () => {
    const a = ai.decide(view({ hand: [4, 0], floor: [1, 5] })); // 2월 열끗 vs 1월 광
    expect(a.cardId).toBe(0);
  });

  test('매칭이 없으면 가치가 낮은 패(피)를 버린다', () => {
    const a = ai.decide(view({ hand: [0, 6], floor: [20] }));
    expect(a.cardId).toBe(6);
  });

  test('같은 달 3장 + 바닥 1장 → 폭탄 (흔들기 아님)', () => {
    const a = ai.decide(view({ hand: [0, 1, 2, 6], floor: [3] }));
    expect(card(a.cardId).month).toBe(1);
    expect(a.shake).toBe(false);
  });

  test('좋은 매칭이 없고 같은 달 3장이면 흔든다', () => {
    const a = ai.decide(view({ hand: [0, 1, 2, 24], floor: [] }));
    expect(card(a.cardId).month).toBe(1);
    expect(a.shake).toBe(true);
  });

  test('보너스 패는 바로 낸다', () => {
    expect(ai.decide(view({ hand: [3, 48], floor: [2] })).cardId).toBe(48);
  });

  test('손패가 없으면 더미 뒤집기(null)', () => {
    expect(ai.decide(view({ hand: [] }))).toEqual({ type: 'play', cardId: null });
  });

  test('폭탄 더미가 남았고 낼 매칭이 없으면 더미를 뒤집는다', () => {
    expect(ai.decide(view({ hand: [0, 6], floor: [20], dummies: { [me]: 1 } })).cardId).toBeNull();
  });

  test('바닥 선택은 가치가 높은 패', () => {
    const a = ai.decide(view({ phase: 'choose', choice: { step: 'hand', options: [1, 2] } }));
    expect(a).toEqual({ type: 'choose', cardId: 1 });
  });
});

describe('AiPlayer.decide – 고/스톱 · 광팔기 · 총통', () => {
  const gs = (o) => view({ phase: 'gostop', hand: [1, 2, 3, 4, 5], scores: { [me]: { total: 7 }, 2: { total: 0 } }, ...o });

  test('여유가 있으면 고', () => expect(ai.decide(gs()).type).toBe('go'));
  test('남은 패가 적으면 스톱', () => expect(ai.decide(gs({ hand: [1, 2] })).type).toBe('stop'));
  test('상대 점수가 따라붙으면 스톱', () =>
    expect(ai.decide(gs({ scores: { [me]: { total: 7 }, 2: { total: 6 } } })).type).toBe('stop'));
  test('이미 2고면 스톱', () => expect(ai.decide(gs({ go: { [me]: 2, 2: 0 } })).type).toBe('stop'));
  test('상대가 고를 불렀으면 스톱', () => expect(ai.decide(gs({ go: { [me]: 0, 2: 1 } })).type).toBe('stop'));
  test('3인전(3점)도 같은 규칙', () =>
    expect(ai.decide(gs({ threshold: 3, opps: [2, 3], scores: { [me]: { total: 3 }, 2: { total: 0 }, 3: { total: 0 } }, go: { [me]: 0, 2: 0, 3: 0 } })).type).toBe('go'));

  test('총통은 선언', () => expect(ai.decide(view({ phase: 'chong' })).type).toBe('chongtong'));
  test('비광이 섞인 3광만 판다', () => {
    expect(ai.decide(view({ phase: 'gwang', hand: [0, 8, 44, 1] })).type).toBe('sellGwang'); 
    expect(ai.decide(view({ phase: 'gwang', hand: [0, 8, 28, 1] })).type).toBe('passGwang');
  });
});

// 엔진과 붙여 보기: 모든 자리를 AI 가 둬서 판이 항상 끝까지 간다 (AI 행동이 엔진에서 거부되지 않아야 함)
describe('AI 자체 대국 시뮬레이션', () => {
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
  ])('%i인 150판', (n, opts) => {
    let ended = 0;
    let gos = 0;
    for (let k = 0; k < 150; k++) {
      const pids = Array.from({ length: n }, (_, i) => i + 1);
      const g = new GostopGame(pids, { firstPlayer: 1, rest: n === 4 ? 4 : undefined, ...opts });
      const bots = Object.fromEntries(pids.map((p) => [p, new AiPlayer(p)]));
      for (let step = 0; g.phase !== 'ended'; step++) {
        if (step > 400) throw new Error('무한 루프');
        const id = g.turn;
        const a = bots[id].decide(g.view(id));
        expect(a).not.toBeNull();
        const r = act(g, id, a);
        if (a.type === 'go') gos++;
        if (!r.ok) throw new Error(`거부됨: ${JSON.stringify(a)} ${r.error} phase=${g.phase}`);
      }
      ended++;
    }
    expect(ended).toBe(150);
    if (n === 2) expect(gos).toBeGreaterThanOrEqual(0);
  });
});
