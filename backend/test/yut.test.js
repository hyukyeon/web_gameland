import { forward, step, coords, NODES, DONE, WAIT } from '../src/yut/board.js';
import { YutGame, throwSticks, THROWS, P_FLAT } from '../src/yut/YutGame.js';
import { YutBot } from '../src/yut/YutBot.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const game = (script, pids = [1, 2]) => new YutGame(pids, { ante: 100, script });
const last = (a) => a[a.length - 1];

describe('윷판 그래프', () => {
  test('29개 노드 · 모든 노드가 좌표를 가진다', () => {
    const c = coords();
    expect(c).toHaveLength(NODES);
    expect(c.every((p) => p && p.every((v) => v >= 0 && v <= 100))).toBe(true);
    expect(new Set(c.map((p) => p.map((v) => Math.round(v)).join())).size).toBe(NODES);
  });
  test('바깥 길: 대기 → 도(1) → … → 19 다음은 참먹이(0), 0 을 넘어야 도착', () => {
    expect(forward(WAIT, [], 3)).toEqual([1, 2, 3]);
    expect(forward(18, [18], 3)).toEqual([19, 0, DONE]);
    expect(forward(18, [18], 2)).toEqual([19, 0]); // 참먹이에 딱 멈추면 아직 판 위
    expect(step(19, null, true)).toBe(0);
    expect(step(0, 19, true)).toBe(DONE);
    expect(forward(0, [19, 0], 1)).toEqual([DONE]); // 참먹이에서 도만 나와도 나간다
  });
  test('우상단 모서리(5)에서 출발하면 대각선, 지나치기만 하면 바깥 길', () => {
    expect(forward(5, [5], 1)).toEqual([20]);
    expect(forward(5, [5], 3)).toEqual([20, 21, 22]);
    expect(forward(3, [3], 3)).toEqual([4, 5, 6]); // 모서리를 지나치기만 하면 바깥
    expect(forward(4, [4], 2)).toEqual([5, 6]);
  });
  test('좌상단 모서리(10)에서 출발하면 대각선 → 방 → 도착 쪽', () => {
    expect(forward(10, [10], 5)).toEqual([25, 26, 22, 27, 28]);
    expect(forward(9, [9], 3)).toEqual([10, 11, 12]);
  });
  test('방(22)에서 출발하면 곧장 도착 쪽 지름길, 방을 지나칠 땐 가던 대각선', () => {
    expect(forward(22, [5, 20, 21, 22], 3)).toEqual([27, 28, 0]);
    expect(forward(22, [5, 20, 21, 22], 4)).toEqual([27, 28, 0, DONE]);
    expect(forward(21, [5, 20, 21], 3)).toEqual([22, 23, 24]); // 우상단 대각선은 좌하단(15)으로
    expect(forward(24, [5, 20, 21, 22, 23, 24], 2)).toEqual([15, 16]);
    expect(forward(26, [10, 25, 26], 3)).toEqual([22, 27, 28]);
  });
  test('도착은 넘어가도 도착', () => {
    expect(forward(19, [19], 5)).toEqual([0, DONE]);
    expect(forward(28, [28], 4)).toEqual([0, DONE]);
    expect(forward(19, [19], 1)).toEqual([0]);
    expect(forward(28, [28], 1)).toEqual([0]);
  });
});

describe('윷 던지기', () => {
  test('가락 4개 → 결과 분류, 빽도는 표시 가락만 평면일 때', () => {
    const r = (flats) => { const it = flats[Symbol.iterator](); return throwSticks(() => (it.next().value ? 0 : 1)).kind; };
    expect(r([0, 0, 0, 0])).toBe('mo');
    expect(r([1, 1, 1, 1])).toBe('yut');
    expect(r([1, 1, 1, 0])).toBe('geol');
    expect(r([1, 1, 0, 0])).toBe('gae');
    expect(r([0, 1, 0, 0])).toBe('do');
    expect(r([1, 0, 0, 0])).toBe('back'); // 0 번 가락(표시)만 평면
  });
  test('확률이 전통 비율에 가깝다 (도 ~12 · 개 ~35 · 걸 ~35 · 윷 ~13 · 모 ~3 · 빽도 ~4 %)', () => {
    const N = 40000;
    const cnt = {};
    for (let i = 0; i < N; i++) { const k = throwSticks().kind; cnt[k] = (cnt[k] ?? 0) + 1; }
    const pct = (k) => (cnt[k] / N) * 100;
    expect(P_FLAT).toBe(0.6);
    expect(pct('gae')).toBeGreaterThan(32); expect(pct('gae')).toBeLessThan(37);
    expect(pct('geol')).toBeGreaterThan(32); expect(pct('geol')).toBeLessThan(37);
    expect(pct('yut')).toBeGreaterThan(11); expect(pct('yut')).toBeLessThan(15);
    expect(pct('mo')).toBeGreaterThan(1.5); expect(pct('mo')).toBeLessThan(4);
    expect(pct('do')).toBeGreaterThan(10); expect(pct('do')).toBeLessThan(13.5);
    expect(pct('back')).toBeGreaterThan(2.8); expect(pct('back')).toBeLessThan(5);
  });
});

describe('YutGame 턴·이동', () => {
  test('던지기 → 이동 → 차례 교대, 순서 위반 거절', () => {
    const g = game(['gae']);
    expect(g.throw(2).ok).toBe(false); // 내 차례 아님
    expect(g.move(1, 0, 0).ok).toBe(false); // 아직 안 던짐
    expect(g.throw(1).ok).toBe(true);
    expect(g.phase).toBe('move');
    expect(g.throw(1).ok).toBe(false); // 먼저 말을 움직여야
    expect(g.move(1, 4, 0).ok).toBe(false); // 상대 말
    expect(g.move(1, 0, 0).ok).toBe(true);
    expect(g.pieces[0].pos).toBe(2);
    expect(g.turn).toBe(2);
    expect(g.phase).toBe('throw');
  });
  test('윷·모는 한 번 더 던진다 (extraTurn), 결과는 쌓였다가 나눠 쓴다', () => {
    const g = game(['yut', 'mo', 'do']);
    expect(g.extraTurn).toBe(0);
    g.throw(1); // 윷
    expect(g.phase).toBe('throw');
    expect(g.extraTurn).toBe(1);
    g.throw(1); // 모
    expect(g.extraTurn).toBe(1);
    g.throw(1); // 도 → 이제 이동
    expect(g.extraTurn).toBe(0);
    expect(g.phase).toBe('move');
    expect(g.pending).toEqual(['yut', 'mo', 'do']);
    expect(g.move(1, 0, 1).ok).toBe(true); // 모(5) → 우상단 모서리
    expect(g.pieces[0].pos).toBe(5);
    expect(g.turn).toBe(1); // 아직 내 차례
    expect(g.move(1, 0, 0).ok).toBe(true); // 윷(4): 5 에서 출발 → 대각선 20,21,22(방을 지나쳐 우상단 대각선 그대로),23
    expect(g.pieces[0].pos).toBe(23);
    expect(g.move(1, 0, 0).ok).toBe(true); // 도 → 24
    expect(g.pieces[0].pos).toBe(24);
    expect(g.turn).toBe(2);
  });
  test('우상단 모서리에 도착한 말이 다음 이동에서 대각선으로 들어간다', () => {
    const g = game(['mo', 'gae', 'do', 'do']);
    g.throw(1); g.throw(1); // 모(보너스) + 개
    g.move(1, 0, 0); // 모 → 5
    expect(g.pieces[0].pos).toBe(5);
    g.move(1, 1, 0); // 개: 다른 말을 내보내 차례 종료
    g.throw(2); g.move(2, 4, 0);
    g.throw(1);
    g.move(1, 0, 0); // 도 → 20 (대각선)
    expect(g.pieces[0].pos).toBe(20);
  });
});

/** 말 위치를 직접 놓는다: put(g, { 0: 1, 4: 3 }) = 말0 → 1번 칸, 말4 → 3번 칸 */
const put = (g, spots) => {
  for (const [id, pos] of Object.entries(spots)) {
    const p = g.pieces[id];
    p.pos = pos;
    p.trail = pos === WAIT || pos === DONE ? [] : [pos];
  }
};

describe('업기 · 잡기', () => {
  test('같은 팀 말이 있는 칸에 도착하면 업혀 함께 움직인다', () => {
    const g = game(['do', 'gae', 'gae']);
    put(g, { 0: 1 });
    g.throw(1); g.move(1, 1, 0); // 말1 이 1 번 칸에 도착 → 업기
    expect(g.groupOf(g.pieces[0]).map((p) => p.id).sort()).toEqual([0, 1]);
    g.throw(2); g.move(2, 4, 0);
    g.throw(1); // 개
    g.move(1, 0, 0); // 업힌 둘이 함께 이동
    expect(g.pieces[0].pos).toBe(3);
    expect(g.pieces[1].pos).toBe(3);
    expect(g.lastMove.pieceIds.sort()).toEqual([0, 1]);
  });
  test('최대 4개까지 업는다', () => {
    const g = game(Array(6).fill('do'));
    put(g, { 0: 1, 1: 1, 2: 1 });
    g.throw(1); g.move(1, 3, 0);
    expect(g.groupOf(g.pieces[0])).toHaveLength(4);
    expect(g.pieces.filter((p) => p.team === 0 && p.pos === 1)).toHaveLength(4);
  });
  test('상대 말을 잡으면 그 말은 대기실로, 추가 턴 +1', () => {
    const g = game(['do', 'do']);
    put(g, { 0: 1 });
    g.turn = 2; g.curTeam = 1;
    g.throw(2);
    expect(g.extraTurn).toBe(0);
    expect(g.move(2, 4, 0).ok).toBe(true); // 대기 말 → 1 : 청 말0 잡기
    expect(g.lastMove.captured).toEqual([0]);
    expect(g.pieces[0].pos).toBe(WAIT);
    expect(g.turn).toBe(2); // 잡았으니 한 번 더
    expect(g.phase).toBe('throw');
    expect(g.extraTurn).toBe(1);
  });
  test('업힌 상대 말 여럿은 한꺼번에 잡힌다', () => {
    const g = game(['gae']);
    put(g, { 0: 2, 1: 2, 2: 2 });
    g.turn = 2; g.curTeam = 1;
    g.throw(2); g.move(2, 4, 0);
    expect(g.lastMove.captured.sort()).toEqual([0, 1, 2]);
    expect(g.pieces.slice(0, 3).every((p) => p.pos === WAIT)).toBe(true);
    expect(g.extraTurn).toBe(1); // 잡은 횟수가 아니라 던지기 +1
  });
  test('잡은 뒤 던진 것이 윷이면 던질 기회가 더 쌓인다', () => {
    const g = game(['do', 'yut']);
    put(g, { 0: 1 });
    g.turn = 2; g.curTeam = 1;
    g.throw(2); g.move(2, 4, 0); // 잡기
    g.throw(2); // 윷
    expect(g.phase).toBe('throw');
    expect(g.extraTurn).toBe(1);
    expect(g.pending).toEqual(['yut']);
  });
  test('통과만 하는 칸의 상대 말은 잡지 않는다 (도착한 칸만)', () => {
    const g = game(['geol']);
    put(g, { 0: 2, 4: WAIT });
    g.turn = 2; g.curTeam = 1;
    g.throw(2); g.move(2, 4, 0); // 1,2,3 : 2 번 칸은 지나가기만
    expect(g.lastMove.captured).toEqual([]);
    expect(g.pieces[0].pos).toBe(2);
    expect(g.pieces[4].pos).toBe(3);
  });
});

describe('빽도', () => {
  test('판에 말이 없으면 빽도는 버려지고 차례가 넘어간다', () => {
    const g = game(['back']);
    g.throw(1);
    expect(g.turn).toBe(2);
    expect(g.pending).toEqual([]);
  });
  test('도(1번 칸)에서 빽도: 참먹이(0)로 간다 — 판 위에 남고, 거기서 한 칸이라도 더 가야 나간다', () => {
    const g = game(['back', 'do']);
    put(g, { 0: 1 });
    g.throw(1);
    expect(g.legalMoves()).toEqual([{ pieceId: 0, index: 0, kind: 'back', path: [0] }]);
    expect(g.move(1, 0, 0).ok).toBe(true);
    expect(g.pieces[0].pos).toBe(0); // 참먹이 — 아직 점수 아님
    expect(g.score[0]).toBe(0);
    expect(g.turn).toBe(2);
    // 상대 차례가 지나고 다시 내 차례: 도만 나와도 참먹이를 넘어 나간다
    g.turn = 1; g.curTeam = 0; g.phase = 'throw'; g.throwsLeft = 1; g.thrown = false;
    g.throw(1);
    expect(g.legalMoves().find((m) => m.pieceId === 0).path).toEqual([DONE]);
    g.move(1, 0, 0);
    expect(g.pieces[0].pos).toBe(DONE);
    expect(g.score[0]).toBe(1);
  });
  test('도에서 빽도로 참먹이에 간 말은 다시 빽도를 쓸 수 없고, 거기 있는 상대 말은 잡는다', () => {
    const g = game(['back']);
    put(g, { 0: 1, 4: 0 }); // 상대(홍) 말이 참먹이에 멈춰 있음
    g.pieces[4].trail = [19, 0];
    g.throw(1);
    g.move(1, 0, 0);
    expect(g.pieces[0].pos).toBe(0);
    expect(g.pieces[4].pos).toBe(WAIT); // 잡힘
    expect(g.phase).toBe('throw'); // 잡으면 한 번 더
    g.script.push('back');
    g.throw(1);
    expect(g.legalMoves().filter((m) => m.pieceId === 0)).toEqual([]); // 참먹이(빽도로 온 말)에선 뒤로 못 감
  });
  test('빽도는 한 칸 뒤로: 보통 칸', () => {
    const g = game(['back']);
    g.pieces[0].pos = 4; g.pieces[0].trail = [3, 4];
    g.throw(1);
    expect(g.phase).toBe('move');
    g.move(1, 0, 0);
    expect(g.pieces[0].pos).toBe(3);
  });
  test('빽도는 온 길을 되짚는다 (지름길 진입 직후 → 모서리)', () => {
    const g = game(['back']);
    g.pieces[0].pos = 20; g.pieces[0].trail = [3, 4, 5, 20];
    g.throw(1); g.move(1, 0, 0);
    expect(g.pieces[0].pos).toBe(5);
    expect(g.pieces[0].trail).toEqual([3, 4, 5]);
  });
  test('방에서 빽도: 어느 대각선으로 왔는지에 맞게', () => {
    const g = game(['back']);
    g.pieces[0].pos = 22; g.pieces[0].trail = [9, 10, 25, 26, 22];
    g.throw(1); g.move(1, 0, 0);
    expect(g.pieces[0].pos).toBe(26);
  });
  test('빽도로도 상대 말을 잡는다', () => {
    const g = game(['back']);
    g.pieces[0].pos = 4; g.pieces[0].trail = [3, 4];
    put(g, { 4: 3 });
    g.throw(1); g.move(1, 0, 0);
    expect(g.lastMove.captured).toEqual([4]);
    expect(g.extraTurn).toBe(1);
  });
  test('빽도는 업힌 말이 함께 움직인다', () => {
    const g = game(['back']);
    for (const i of [0, 1]) { g.pieces[i].pos = 7; g.pieces[i].trail = [6, 7]; }
    g.throw(1); g.move(1, 0, 0);
    expect(g.pieces[0].pos).toBe(6);
    expect(g.pieces[1].pos).toBe(6);
  });
});

describe('승리 · 기권', () => {
  const nearlyWon = (g, team) => {
    for (const p of g.pieces.filter((x) => x.team === team).slice(0, 3)) p.pos = DONE;
    const last = g.pieces.filter((x) => x.team === team)[3];
    last.pos = 0; // 참먹이(출발점)에 멈춰 있는 마지막 말 — 한 칸만 더 가면 나간다
    last.trail = [19, 0];
  };
  test('말 4개가 모두 도착하면 그 팀 승리 · 정산 net', () => {
    const g = game(['do']);
    nearlyWon(g, 0);
    g.throw(1);
    expect(g.move(1, 3, 0).ok).toBe(true);
    expect(g.phase).toBe('ended');
    expect(g.result).toMatchObject({ winnerTeam: 0, kind: 'finish', winners: [1], losers: [2], net: { 1: 100, 2: -100 } });
    expect(g.throw(1).ok).toBe(false);
  });
  test('업은 말이 함께 도착한다', () => {
    const g = game(['gae']);
    put(g, { 0: 19, 1: 19, 2: DONE, 3: DONE }); // 19 → 0(참먹이) → 나감: 개(2칸)
    g.throw(1); g.move(1, 0, 0);
    expect(g.score[0]).toBe(4);
    expect(g.phase).toBe('ended');
  });
  test('참먹이(출발점)에 딱 멈추면 나가지 않고 판 위에 남는다 · 거기서 잡힐 수 있다', () => {
    const g = game(['gae', 'do']);
    put(g, { 0: 18, 4: 19 });
    g.throw(1); g.move(1, 0, 0); // 청: 18 + 2 = 0(참먹이)
    expect(g.pieces[0].pos).toBe(0);
    expect(g.score[0]).toBe(0);
    expect(g.phase).not.toBe('ended');
    g.throw(2); g.move(2, 4, 0); // 홍: 19 + 1 = 0 → 청 말을 잡는다
    expect(g.pieces[4].pos).toBe(0);
    expect(g.pieces[0].pos).toBe(WAIT);
  });
  test('2:2 — 팀은 번갈아, 팀 안에서도 돌아가며 던진다', () => {
    const g = game(Array(8).fill('back'), [1, 2, 3, 4]);
    expect(g.team).toEqual({ 1: 0, 2: 1, 3: 0, 4: 1 });
    const order = [];
    for (let i = 0; i < 6; i++) {
      order.push(g.turn);
      g.throw(g.turn); // 판에 말이 없어 빽도는 소멸 → 차례 넘김
    }
    expect(order).toEqual([1, 2, 3, 4, 1, 2]);
  });
  test('기권: 팀원이 남으면 계속, 팀 전원이 나가면 상대 승리', () => {
    const g = game([], [1, 2, 3, 4]);
    expect(g.forfeit(3)).toMatchObject({ ok: true, ended: false });
    expect(g.phase).toBe('throw');
    expect(g.forfeit(1)).toMatchObject({ ok: true, ended: true });
    expect(g.result).toMatchObject({ winnerTeam: 1, kind: 'forfeit' });
    const h = game([], [1, 2]);
    h.forfeit(1);
    expect(h.result.winners).toEqual([2]);
  });
  test('나간 사람의 차례는 같은 팀 다른 사람에게', () => {
    const g = game([], [1, 2, 3, 4]);
    g.forfeit(1);
    expect(g.turn).toBe(3);
  });
});

describe('AI · 무작위 대국', () => {
  test('봇끼리 둔 판은 항상 합법이고 끝난다 (2·3·4인, 모든 난이도)', () => {
    for (const pids of [[1, 2], [1, 2, 3], [1, 2, 3, 4]]) {
      for (let n = 0; n < 30; n++) {
        const g = new YutGame(pids, { ante: 10 });
        const bots = [new YutBot({ level: 'hard' }), new YutBot({ level: n % 2 ? 'easy' : 'normal' })];
        let c = 0;
        while (g.phase !== 'ended') {
          if (c++ > 6000) throw new Error('끝나지 않음');
          if (g.phase === 'throw') expect(g.throw(g.turn).ok).toBe(true);
          else {
            const m = bots[g.curTeam].decide(g);
            expect(m).not.toBeNull();
            expect(g.move(g.turn, m.pieceId, m.index).ok).toBe(true);
          }
          // 불변식: 한 칸의 말은 한 팀뿐, 같은 팀 말 4개
          const on = {};
          for (const p of g.pieces) if (p.pos >= 0 && p.pos !== DONE) { on[p.pos] ??= new Set(); on[p.pos].add(p.team); }
          expect(Object.values(on).every((s) => s.size === 1)).toBe(true);
        }
        expect(g.score[g.result.winnerTeam]).toBe(4);
      }
    }
  });
  test('잡을 수 있으면 잡고, 도착할 수 있으면 도착한다', () => {
    const g = game(['do']);
    g.pieces[0].pos = 3; g.pieces[0].trail = [3]; // 청
    g.pieces[4].pos = 2; g.pieces[4].trail = [2]; // 홍
    g.pieces[5].pos = WAIT;
    g.turn = 2; g.curTeam = 1;
    g.throw(2);
    const m = new YutBot({ level: 'hard' }).decide(g);
    expect(m.pieceId).toBe(4); // 2 + 1 = 3 : 청 말을 잡는 수
    const h = game(['do']);
    h.pieces[0].pos = 0; h.pieces[0].trail = [19, 0]; // 참먹이에서 도 → 나감
    h.throw(1);
    expect(new YutBot({ level: 'hard' }).decide(h).pieceId).toBe(0);
  });
});
