import { shuffle } from '../game/cards.js';
import { SEOTDA_DECK, evaluateHand, compareHands, seotdaCard, POWER } from './rules.js';

/**
 * 섯다 한 판(베팅 상태 머신). 서버가 전부 관리하고, 클라이언트에는 view(viewer) 로 내 패만 내려준다.
 *
 * 흐름: 참가비(ante) 징수 → 2장씩 비공개 분배 → 선(dealer)부터 시계 방향으로 베팅 → 쇼다운/전원 다이
 *  - 액션: die(포기) / call(앞사람과 같게. 걸린 금액이 0이면 체크) / half(콜 + 현재 팟의 50%) / bbing(기본 판돈, 선의 첫 베팅만) / ddadang(앞사람 베팅의 2배)
 *  - 레이즈가 나오면 나머지 생존자는 다시 응답해야 한다.
 *  - 올인: 콜할 돈이 모자라면 가진 만큼만 내고 올인. 올인한 사람은 더 이상 행동하지 않고,
 *    쇼다운에서 자기가 낸 금액 수준까지의 팟(메인/사이드팟)만 가져갈 수 있다.
 *    레이즈는 내 잔액과 '아직 행동할 수 있는 다른 사람' 중 가장 많이 낼 수 있는 금액을 넘지 않는다.
 *  - 구사 재경기: 팟을 그대로 두고 판돈(ante)을 다시 걷어 새 판(round+1)을 시작한다.
 *  - 동점(묻고 더블): 동점자 전원이 동의하면 동점자끼리만 판돈 2배로 다시 붙는다(doubleArgs). 진 사람이 낸 돈(outsiders)은 팟에 남는다.
 */
export class SeotdaGame {
  /**
   * @param {number[]} pids 앉은 순서(시계 방향)
   * @param {{ ante:number, balances:Record<number,number>, dealer?:number, rnd?:()=>number, hands?:Record<number,[number,number]>,
   *   carry?:{committed:Record<number,number>, outsiders?:Record<number,number>}, round?:number, double?:number }} o
   */
  constructor(pids, { ante, balances, dealer, rnd = Math.random, hands, carry = null, round = 1, double = 0 }) {
    if (pids.length < 2 || pids.length > 5 || new Set(pids).size !== pids.length) throw new Error('섯다는 2~5명이 필요합니다.');
    this.pids = [...pids];
    this.ante = ante;
    this.balances = { ...balances };
    this.dealer = pids.includes(dealer) ? dealer : pids[0];
    this.round = round;
    this.double = double; // 묻고 더블 횟수
    this.status = Object.fromEntries(pids.map((p) => [p, 'alive']));
    this.committed = Object.fromEntries(pids.map((p) => [p, carry?.committed?.[p] ?? 0])); // 이번 게임(재경기 포함) 누적 투입
    this.outsiders = { ...(carry?.outsiders ?? {}) }; // 이전 판에서 지고 빠진 사람이 남긴 돈 (팟에 포함, 받을 수 없음)
    this.stack = Object.fromEntries(pids.map((p) => [p, Math.max(0, balances[p] - this.committed[p])]));
    this.bet = Object.fromEntries(pids.map((p) => [p, 0])); // 이번 라운드 베팅(참가비 제외)
    this.lastAction = {};
    this.log = [];
    this.result = null;
    this.phase = 'betting';

    // 참가비 징수 (가진 돈이 모자라면 있는 만큼 = 올인)
    for (const p of pids) {
      const pay = Math.min(ante, this.stack[p]);
      this.stack[p] -= pay;
      this.committed[p] += pay;
    }
    // 패 분배: 20장 덱에서 2장씩
    const deck = shuffle(SEOTDA_DECK, rnd);
    this.hands = hands ? Object.fromEntries(pids.map((p) => [p, [...hands[p]]])) : Object.fromEntries(pids.map((p, i) => [p, [deck[i * 2], deck[i * 2 + 1]]]));

    this.currentBet = 0;
    this.needAct = new Set(pids.filter((p) => this.stack[p] > 0));
    this.firstAction = new Set(pids); // 아직 한 번도 행동하지 않은 사람 (삥은 선의 첫 행동만)
    this.turn = this.needAct.has(this.dealer) ? this.dealer : this.nextTurn(this.dealer);
    // 전원이 참가비만으로 올인이면 베팅 없이 바로 쇼다운 (호출 측은 phase === 'ended' 를 확인)
    if (this.turn == null) this.showdown([]);
  }

  get pot() {
    return this.pids.reduce((s, p) => s + this.committed[p], 0) + Object.values(this.outsiders).reduce((a, b) => a + b, 0);
  }
  alive() {
    return this.pids.filter((p) => this.status[p] === 'alive');
  }
  isAllIn(p) {
    return this.status[p] === 'alive' && this.stack[p] === 0;
  }

  /** 내 차례에 가능한 행동과 금액 */
  options(pid) {
    if (this.phase !== 'betting' || this.turn !== pid) return null;
    const toCall = Math.min(this.currentBet - this.bet[pid], this.stack[pid]);
    const own = this.bet[pid] + this.stack[pid];
    // 레이즈 상한: 나 말고 아직 돈을 더 낼 수 있는 사람이 맞출 수 있는 최대 금액
    const others = this.alive().filter((p) => p !== pid && this.stack[p] > 0);
    const limit = Math.min(own, others.length ? Math.max(...others.map((p) => this.bet[p] + this.stack[p])) : 0);
    const raise = (target) => {
      const to = Math.min(target, limit);
      return to > this.currentBet ? { raiseTo: to, amount: to - this.bet[pid], allIn: to === own } : null;
    };
    return {
      die: true,
      call: { amount: toCall, allIn: toCall > 0 && toCall === this.stack[pid] },
      bbing: pid === this.dealer && this.currentBet === 0 && this.firstAction.has(pid) ? raise(this.ante) : null,
      half: raise(this.currentBet + Math.floor(this.pot / 2)),
      ddadang: this.currentBet > 0 ? raise(this.currentBet * 2) : null,
    };
  }

  nextTurn(from) {
    const n = this.pids.length;
    const i = this.pids.indexOf(from);
    for (let k = 1; k <= n; k++) {
      const p = this.pids[(i + k) % n];
      if (this.status[p] === 'alive' && this.needAct.has(p)) return p;
    }
    return null;
  }

  /** 베팅 종료 조건 확인 → 쇼다운/전원 다이 처리 */
  settleOrAdvance(from, events) {
    const alive = this.alive();
    if (alive.length === 1) return this.finishByFold(alive[0], events);
    for (const p of [...this.needAct]) if (this.status[p] !== 'alive' || this.stack[p] === 0) this.needAct.delete(p);
    if (this.needAct.size === 0) return this.showdown(events);
    this.turn = this.nextTurn(from);
    events.push({ type: 'turn', pid: this.turn });
    return undefined;
  }

  act(pid, action) {
    if (this.phase !== 'betting') return { ok: false, error: '진행 중인 판이 아닙니다.' };
    if (this.turn !== pid) return { ok: false, error: '내 차례가 아닙니다.' };
    const o = this.options(pid);
    const events = [];
    let amount = 0;
    switch (action) {
      case 'die':
        this.status[pid] = 'died';
        break;
      case 'call': {
        amount = o.call.amount;
        break;
      }
      case 'bbing':
      case 'half':
      case 'ddadang': {
        if (!o[action]) return { ok: false, error: '지금은 할 수 없는 베팅입니다.' };
        amount = o[action].amount;
        this.currentBet = o[action].raiseTo;
        this.needAct = new Set(this.alive().filter((p) => p !== pid && this.stack[p] > 0)); // 레이즈 → 나머지 생존자 재응답
        break;
      }
      default:
        return { ok: false, error: '알 수 없는 행동입니다.' };
    }
    if (amount > 0) {
      this.stack[pid] -= amount;
      this.committed[pid] += amount;
      this.bet[pid] += amount;
    }
    const allIn = action !== 'die' && this.stack[pid] === 0;
    this.needAct.delete(pid);
    this.firstAction.delete(pid);
    this.lastAction[pid] = { action, amount, allIn };
    this.log.push({ pid, action, amount, pot: this.pot, allIn });
    events.push({ type: 'action', pid, action, amount, pot: this.pot, allIn });
    this.settleOrAdvance(pid, events);
    return { ok: true, events };
  }

  /** 이탈/연결 끊김/시간 초과: 다이로 처리 (이미 낸 돈은 팟에 남는다) */
  forfeit(pid) {
    if (this.phase !== 'betting' || this.status[pid] !== 'alive') return { ok: false };
    const wasTurn = this.turn === pid;
    this.status[pid] = 'died';
    this.needAct.delete(pid);
    this.lastAction[pid] = { action: 'die', amount: 0 };
    this.log.push({ pid, action: 'die', amount: 0, pot: this.pot, forfeit: true });
    const events = [{ type: 'action', pid, action: 'die', amount: 0, pot: this.pot, forfeit: true }];
    if (wasTurn || this.alive().length === 1 || this.needAct.size === 0) this.settleOrAdvance(pid, events);
    return { ok: true, events };
  }

  /** 시간 초과 자동 행동: 걸린 금액이 없으면 체크, 있으면 다이 */
  timeoutAction() {
    const o = this.options(this.turn);
    if (!o) return { ok: false };
    return this.act(this.turn, o.call.amount === 0 ? 'call' : 'die');
  }

  finish(result, events) {
    this.phase = 'ended';
    this.result = result;
    events.push({ type: 'showdown', result });
  }

  finishByFold(winner, events) {
    const pot = this.pot;
    const payouts = { [winner]: pot };
    this.finish(
      {
        kind: 'fold',
        winners: [winner],
        pot,
        payouts,
        net: this.netOf(payouts),
        hands: { [winner]: this.reveal(winner) }, // 모두 다이로 끝나면 이긴 사람 패만 공개
        round: this.round,
        rematch: false,
        tie: null,
      },
      events,
    );
  }

  reveal(pid) {
    const h = evaluateHand(this.hands[pid]);
    return { cards: this.hands[pid].map((id) => seotdaCard(id)), name: h.name, power: h.power, special: h.special };
  }

  /** 순증감(받은 돈 − 낸 돈). 이전 판에서 빠진 사람(outsiders)도 포함한다. */
  netOf(payouts) {
    const net = Object.fromEntries(Object.entries(this.outsiders).map(([p, c]) => [p, -c]));
    for (const p of this.pids) net[p] = (payouts[p] ?? 0) - this.committed[p];
    return net;
  }

  /** 팟 구간 나누기: 쇼다운에 남은 사람들이 낸 금액 수준별로 메인팟/사이드팟을 만든다 */
  sidePots(contenders) {
    const contrib = [...this.pids.map((p) => this.committed[p]), ...Object.values(this.outsiders)];
    const levels = [...new Set(contenders.map((p) => this.committed[p]))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const L of levels) {
      const amount = contrib.reduce((s, c) => s + Math.max(0, Math.min(c, L) - prev), 0);
      pots.push({ amount, eligible: contenders.filter((p) => this.committed[p] >= L) });
      prev = L;
    }
    // 가장 많이 낸 생존자보다 더 낸 다이한 사람의 돈은 마지막 팟에 얹는다
    const over = contrib.reduce((s, c) => s + Math.max(0, c - prev), 0);
    if (pots.length) pots[pots.length - 1].amount += over;
    return pots.filter((p) => p.amount > 0);
  }

  /** 팟 하나의 승자들 (사이드팟 비교에서 구사 재경기는 적용하지 않고 기본 점수로 비교) */
  potWinners(eligible) {
    if (eligible.length === 1) return eligible;
    const cmp = compareHands(Object.fromEntries(eligible.map((p) => [p, this.hands[p]])));
    if (!cmp.rematch) return cmp.winners;
    const top = Math.max(...cmp.ranking.map((r) => r.power));
    return cmp.ranking.filter((r) => r.power === top).map((r) => r.pid);
  }

  showdown(events) {
    const contenders = this.alive();
    const cmp = compareHands(Object.fromEntries(contenders.map((p) => [p, this.hands[p]])));
    const hands = Object.fromEntries(contenders.map((p) => [p, this.reveal(p)]));
    const pot = this.pot;
    if (cmp.rematch) {
      // 구사 재경기: 팟 유지, 아무도 돈을 받지 않는다
      const zero = Object.fromEntries(Object.keys(this.netOf({})).map((p) => [p, 0]));
      return this.finish({ kind: 'rematch', winners: [], pot, payouts: {}, net: zero, hands, round: this.round, rematch: true, rematchBy: cmp.rematchBy, tie: null }, events);
    }
    const seat = (ids) => this.pids.filter((p) => ids.includes(p)); // 앉은 순서대로
    const payouts = {};
    const pots = this.sidePots(contenders).map(({ amount, eligible }) => {
      const winners = seat(this.potWinners(eligible));
      const share = Math.floor(amount / winners.length);
      winners.forEach((p) => (payouts[p] = (payouts[p] ?? 0) + share));
      payouts[winners[0]] += amount - share * winners.length; // 나머지 1원 단위는 앞 순서 승자에게
      return { amount, eligible: seat(eligible), winners };
    });
    // 승자: 두 명 이상이 걸린 팟을 이긴 사람 (혼자 남은 사이드팟은 돌려받는 돈일 뿐)
    const contested = pots.filter((p) => p.eligible.length >= 2).flatMap((p) => p.winners);
    const winners = seat(contested.length ? contested : Object.keys(payouts).map(Number));
    // 동점: 최고 족보가 2명 이상이고, 모든 팟을 그 동점자들이 똑같이 나눠 가질 때만 '묻고 더블' 대상
    const top = seat(cmp.winners);
    const same = (a) => a.length === top.length && a.every((p, i) => p === top[i]);
    const tie = top.length >= 2 && pots.every((p) => same(p.winners)) ? top : null;
    return this.finish({ kind: 'showdown', winners, pot, payouts, net: this.netOf(payouts), hands, round: this.round, rematch: false, tie, pots }, events);
  }

  /** 재경기 시작용 인자 (팟을 그대로 이월) */
  rematchArgs() {
    return { carry: { committed: { ...this.committed }, outsiders: { ...this.outsiders } }, round: this.round + 1, dealer: this.dealer, pids: [...this.pids], ante: this.ante, double: this.double, kind: 'rematch' };
  }

  /** 묻고 더블: 동점자끼리만, 판돈 2배로. 나머지 사람의 낸 돈은 팟에 남는다. */
  doubleArgs() {
    const tie = this.result?.tie;
    if (!tie) return null;
    const outsiders = { ...this.outsiders };
    for (const p of this.pids) if (!tie.includes(p)) outsiders[p] = this.committed[p];
    return {
      carry: { committed: Object.fromEntries(tie.map((p) => [p, this.committed[p]])), outsiders },
      round: this.round + 1,
      dealer: tie.includes(this.dealer) ? this.dealer : tie[0],
      pids: [...tie],
      ante: this.ante * 2,
      double: this.double + 1,
      kind: 'double',
    };
  }

  /** 판 종료 후 스탯/업적용 참가자 정보 (caught: 암행어사·땡잡이가 실제로 잡을 패를 만났는지) */
  statsInfo() {
    const revealed = this.result?.hands ?? {};
    const players = {};
    for (const p of this.pids) {
      const h = evaluateHand(this.hands[p]);
      const others = Object.entries(revealed).filter(([q]) => Number(q) !== p).map(([, r]) => r.power);
      let caught = false;
      if (h.special === 'amhaeng') caught = others.some((w) => w === POWER.GWANG18 || w === POWER.GWANG13);
      if (h.special === 'ttangjabi') caught = others.some((w) => w > POWER.TTAENG_BASE && w < POWER.TTAENG_BASE + 10);
      players[p] = { name: h.name, power: h.power, category: h.category, special: h.special, died: this.status[p] === 'died', allIn: this.isAllIn(p), caught };
    }
    return { double: this.double, players };
  }

  view(viewer) {
    const ended = this.phase === 'ended';
    const showAll = ended && this.result ? this.result.hands : {};
    return {
      game: 'seotda',
      you: viewer,
      pids: this.pids,
      dealer: this.dealer,
      turn: ended ? null : this.turn,
      phase: this.phase,
      round: this.round,
      double: this.double,
      ante: this.ante,
      pot: this.pot,
      currentBet: this.currentBet,
      players: Object.fromEntries(
        this.pids.map((p) => [
          p,
          {
            status: this.status[p],
            allIn: this.isAllIn(p),
            bet: this.bet[p],
            stack: this.stack[p],
            committed: this.committed[p],
            lastAction: this.lastAction[p] ?? null,
            // 내 패는 항상, 다른 사람 패는 쇼다운으로 공개된 경우에만
            hand: p === viewer ? this.hands[p].map((id) => seotdaCard(id)) : showAll[p]?.cards ?? null,
            handName: p === viewer ? evaluateHand(this.hands[p]).name : showAll[p]?.name ?? null,
          },
        ]),
      ),
      options: this.options(viewer),
      result: this.result,
      log: this.log.slice(-40),
    };
  }
}
