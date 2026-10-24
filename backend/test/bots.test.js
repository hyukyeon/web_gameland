import { GostopGame } from '../src/game/GostopGame.js';
import { SeotdaGame } from '../src/seotda/SeotdaGame.js';
import {
  LEVELS, PERSONAS, pickPersona, botLine, makeGostopBrain, makeSeotdaBrain, gostopReactions, seotdaReactions, parseLevel,
} from '../src/bots.js';

function act(g, id, a) {
  switch (a?.type) {
    case 'play': return g.play(id, a.cardId, { shake: a.shake === true });
    case 'choose': return g.choose(id, a.cardId);
    case 'go': return g.callGo(id);
    case 'stop': return g.callStop(id);
    case 'sellGwang': return g.sellGwang(id);
    case 'passGwang': return g.passGwang(id);
    case 'chongtong': return g.callChongtong(id);
    case 'passChongtong': return g.passChongtong(id);
    case 'shodang': return g.callShodang(id);
    case 'shodangAnswer': return g.answerShodang(id, a.accept === true);
    default: return { ok: false };
  }
}

/** 고스톱 n판 → 1번 자리의 (승수, 상대 승수) */
function gostopMatch(cfg1, cfg2, n) {
  const w = { 1: 0, 2: 0 };
  for (let k = 0; k < n; k++) {
    const g = new GostopGame([1, 2], { firstPlayer: (k % 2) + 1 });
    const b = { 1: makeGostopBrain(1, cfg1), 2: makeGostopBrain(2, cfg2) };
    for (let st = 0; g.phase !== 'ended'; st++) {
      if (st > 500) throw new Error('무한 루프');
      const r = act(g, g.turn, b[g.turn].decide(g.view(g.turn)));
      if (!r.ok) throw new Error(`거부: ${g.phase}`);
    }
    if (g.result.winner) w[g.result.winner] += 1;
  }
  return w;
}

/** 섯다 n판 → 1번 자리의 순수익 */
function seotdaMatch(cfg1, cfg2, n) {
  let net = 0;
  for (let k = 0; k < n; k++) {
    const g = new SeotdaGame([1, 2], { ante: 100, balances: { 1: 100000, 2: 100000 }, dealer: (k % 2) + 1 });
    const b = { 1: makeSeotdaBrain(1, cfg1), 2: makeSeotdaBrain(2, cfg2) };
    for (let guard = 0; g.phase === 'betting'; guard++) {
      if (guard > 60) throw new Error('무한 루프');
      const r = g.act(g.turn, b[g.turn].decide(g.view(g.turn)));
      if (!r.ok) throw new Error('거부');
    }
    net += g.result.net?.[1] ?? 0;
  }
  return net;
}

describe('난이도·성향별 두뇌', () => {
  const styles = ['aggressive', 'balanced', 'defensive'];
  test.each(LEVELS)('고스톱 %s: 모든 성향이 2~4인에서 합법 수만 두고 끝까지 진행', (level) => {
    for (const n of [2, 3, 4]) {
      for (let k = 0; k < 15; k++) {
        const pids = Array.from({ length: n }, (_, i) => i + 1);
        const g = new GostopGame(pids, { firstPlayer: 1, rest: n === 4 ? 4 : undefined, bonus: k % 2 === 0 });
        const b = Object.fromEntries(pids.map((p, i) => [p, makeGostopBrain(p, { level, style: styles[(i + k) % 3] })]));
        for (let st = 0; g.phase !== 'ended'; st++) {
          if (st > 500) throw new Error('무한 루프');
          const a = b[g.turn].decide(g.view(g.turn));
          const r = act(g, g.turn, a);
          if (!r.ok) throw new Error(`거부 ${level} ${JSON.stringify(a)} ${r.error} phase=${g.phase}`);
        }
      }
    }
  });

  test.each(LEVELS)('섯다 %s: 3인 무작위 판에서 합법 행동만', (level) => {
    for (let k = 0; k < 200; k++) {
      const g = new SeotdaGame([1, 2, 3], { ante: 100, balances: { 1: 3000, 2: 5000, 3: 8000 }, dealer: 1 });
      const b = Object.fromEntries([1, 2, 3].map((p) => [p, makeSeotdaBrain(p, { level, style: styles[p - 1] })]));
      for (let guard = 0; g.phase === 'betting'; guard++) {
        if (guard > 60) throw new Error('무한 루프');
        expect(g.act(g.turn, b[g.turn].decide(g.view(g.turn))).ok).toBe(true);
      }
    }
  });

  // 통계적 확인 (판 수를 넉넉히 잡아 우연히 뒤집힐 확률은 매우 낮다)
  test('고스톱: 어려움 > 쉬움, 보통 > 쉬움', () => {
    const hv = gostopMatch({ level: 'hard' }, { level: 'easy' }, 300);
    const nv = gostopMatch({ level: 'normal' }, { level: 'easy' }, 300);
    expect(hv[1]).toBeGreaterThan(hv[2] * 1.4);
    expect(nv[1]).toBeGreaterThan(nv[2] * 1.4);
  });

  test('섯다: 어려움·보통이 쉬움에게서 돈을 딴다', () => {
    expect(seotdaMatch({ level: 'hard' }, { level: 'easy' }, 6000)).toBeGreaterThan(0);
    expect(seotdaMatch({ level: 'normal' }, { level: 'easy' }, 6000)).toBeGreaterThan(0);
  });

  test('parseLevel: 모르는 값은 보통', () => {
    expect(parseLevel('hard')).toBe('hard');
    expect(parseLevel('x')).toBe('normal');
    expect(parseLevel(undefined)).toBe('normal');
  });
});

describe('봇 개성', () => {
  test('방에서 이미 쓰는 개성은 피한다 (다 쓰면 아무거나)', () => {
    const used = PERSONAS.slice(0, PERSONAS.length - 1).map((p) => p.key);
    for (let i = 0; i < 20; i++) expect(pickPersona(used).key).toBe(PERSONAS.at(-1).key);
    expect(PERSONAS.map((p) => p.key)).toContain(pickPersona(PERSONAS.map((p) => p.key)).key);
  });

  test('모든 개성이 모든 상황에 대사를 낸다 (전용 대사가 없으면 공통)', () => {
    const situations = ['win', 'lose', 'draw', 'go', 'oppGo', 'ppeok', 'oppPpeok', 'nice', 'raise', 'oppRaise', 'die'];
    for (const p of PERSONAS) for (const s of situations) for (const r of [0, 0.5, 0.99]) expect(typeof botLine(p, s, () => r)).toBe('string');
    expect(botLine(PERSONAS[0], 'unknown')).toBeNull();
  });

  test('고스톱 반응: 뻑·고·폭탄 배너를 봇 입장에서 분류', () => {
    const frames = [
      { banner: null },
      { banner: { text: '뻑!', kind: 'ppeok', pid: 1 } },
      { banner: { text: '1고!', kind: 'go', pid: 2 } },
      { banner: { text: '폭탄!', kind: 'bomb', pid: 2 } },
      { banner: { text: '쇼당!', kind: 'special', pid: 2 } },
    ];
    expect(gostopReactions(frames, [2])).toEqual([
      { pid: 2, situation: 'oppPpeok', frameIndex: 1 },
      { pid: 2, situation: 'go', frameIndex: 2 },
      { pid: 2, situation: 'nice', frameIndex: 3 },
    ]);
  });

  test('섯다 반응: 크게 올림/상대가 올림/다이(시간 초과 기권 제외)', () => {
    const ev = [
      { type: 'action', pid: 1, action: 'ddadang' },
      { type: 'action', pid: 2, action: 'die' },
      { type: 'action', pid: 2, action: 'die', forfeit: true },
      { type: 'action', pid: 1, action: 'call' },
    ];
    expect(seotdaReactions(ev, [2])).toEqual([{ pid: 2, situation: 'oppRaise' }, { pid: 2, situation: 'die' }]);
  });
});
