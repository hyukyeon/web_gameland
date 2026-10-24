import { AiPlayer } from './game/AiPlayer.js';
import { HeuristicBot } from './game/HeuristicBot.js';
import { SeotdaBot } from './seotda/SeotdaBot.js';
import { OmokBot } from './omok/OmokBot.js';

/**
 * AI 봇의 난이도 · 개성(이름/아바타/성향/대사).
 *  - 난이도(level): easy | normal | hard
 *      고스톱  easy = 단순 룰 봇 + 잦은 실수(무작위 패, 무모한 고), normal = 단순 룰 봇 + 가끔 실수, hard = 카드 카운팅 봇(HeuristicBot)
 *      섯다    easy = 승률 계산이 엉성하고 콜이 헤픔, normal = 기존, hard = 상대 압박 반영·허세 절제·가치 베팅
 *  - 성향(style): aggressive | balanced | defensive — 고/스톱 욕심, 섯다 베팅 크기·허세 빈도에 반영
 *  - 사람이 자리를 비워 AI 가 대신 둘 때는 개성 없이 가장 강한 두뇌(hard/balanced)를 쓴다.
 */
export const LEVELS = ['easy', 'normal', 'hard'];
export const DEFAULT_LEVEL = 'normal';
export const LEVEL_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' };
export const STYLE_LABEL = { aggressive: '공격형', balanced: '균형형', defensive: '수비형' };
export const parseLevel = (v) => (LEVELS.includes(v) ? v : DEFAULT_LEVEL);

/** 상황별 대사 키: win/lose/draw(판 결과), go(내가 고), oppGo(상대 고), ppeok(내가 뻑), oppPpeok(상대 뻑), nice(폭탄·싹쓸이·따닥 등),
 *  raise(섯다 크게 올림), oppRaise(상대가 크게 올림), die(섯다 다이) */
const COMMON = {
  win: ['오늘 운이 좋네요!', '감사히 받겠습니다~'],
  lose: ['다음 판엔 안 봐줍니다.', '아이고, 졌네.'],
  draw: ['비겼으니 한 판 더!'],
  go: ['고!', '한 번 더 가 봅시다.'],
  oppGo: ['고를 불러요? 후회할 텐데.'],
  ppeok: ['아… 뻑이네.'],
  oppPpeok: ['뻑! 잘 먹겠습니다~'],
  nice: ['이게 실력이죠.'],
  raise: ['받고 더!'],
  oppRaise: ['오호, 패가 좋은가 봐요?'],
  die: ['이번 판은 쉬어 갑니다.'],
};

export const PERSONAS = [
  {
    key: 'boss', name: '박사장', emoji: '💼', color: '#7c3aed', style: 'aggressive', chatty: 0.75,
    lines: { win: ['돈 냄새가 나는구먼!', '사업이나 판이나 기세가 중요해.'], lose: ['허허, 수업료 낸 셈 치지.'], go: ['고! 사장은 멈추지 않아.'], raise: ['통 크게 갑시다!', '따당! 어디 한번 따라와 봐.'], oppRaise: ['젊은 친구가 배짱이 좋아.'] },
  },
  {
    key: 'granny', name: '순자 할매', emoji: '👵', color: '#db2777', style: 'defensive', chatty: 0.65,
    lines: { win: ['아이고 고맙다, 손주 용돈 생겼네.'], lose: ['할매 돈 따니까 좋나?'], oppPpeok: ['뻑 했네~ 우짜노.'], oppGo: ['욕심내면 체한다, 아가.'], die: ['늙으면 조심해야 돼.'] },
  },
  {
    key: 'rookie', name: '신입 민수', emoji: '🧑‍💻', color: '#0284c7', style: 'balanced', chatty: 0.85,
    lines: { win: ['헉, 제가 이긴 거예요?', '초심자의 행운!'], lose: ['아직 배우는 중이에요 ㅠㅠ'], ppeok: ['뻑이 뭐였더라…?'], nice: ['오, 이게 되네요?!'], oppRaise: ['무, 무섭다…'] },
  },
  {
    key: 'shark', name: '샤크', emoji: '🦈', color: '#0f766e', style: 'aggressive', chatty: 0.6,
    lines: { win: ['피 냄새를 맡았지.'], lose: ['…다음엔 물어뜯는다.'], go: ['멈추는 법은 몰라.'], raise: ['겁나면 죽어.'], oppGo: ['미끼를 물었군.'] },
  },
  {
    key: 'prof', name: '김교수', emoji: '🧓', color: '#475569', style: 'defensive', chatty: 0.55,
    lines: { win: ['확률대로 됐군요.'], lose: ['표본이 부족했습니다.'], oppGo: ['기댓값이 음수일 텐데요.'], die: ['승률이 안 나오네요.'], nice: ['계산대로입니다.'] },
  },
  {
    key: 'lucky', name: '행운이', emoji: '🍀', color: '#16a34a', style: 'balanced', chatty: 0.7,
    lines: { win: ['럭키~!', '오늘은 클로버 데이!'], lose: ['운이 잠깐 쉬는 중…'], nice: ['역시 행운!'], ppeok: ['행운도 쉴 때가 있죠.'] },
  },
  {
    key: 'gambler', name: '한탕 최씨', emoji: '🎲', color: '#b91c1c', style: 'aggressive', chatty: 0.8,
    lines: { win: ['인생은 한 방이여!'], lose: ['다 잃어도 한 판만 더!'], go: ['고! 고! 고!'], raise: ['올인 각이다!'], die: ['…이번만 참는다.'] },
  },
  {
    key: 'monk', name: '스님', emoji: '🧘', color: '#ca8a04', style: 'defensive', chatty: 0.45,
    lines: { win: ['나무아미타불.'], lose: ['비움도 수행이지요.'], oppPpeok: ['인과응보로다.'], oppRaise: ['욕심은 번뇌의 근원입니다.'], die: ['내려놓겠습니다.'] },
  },
];
export const personaByKey = (k) => PERSONAS.find((p) => p.key === k) ?? PERSONAS[0];

/** 방에 아직 없는 개성 중 하나를 무작위로 */
export function pickPersona(usedKeys = [], rnd = Math.random) {
  const free = PERSONAS.filter((p) => !usedKeys.includes(p.key));
  const pool = free.length ? free : PERSONAS;
  return pool[Math.floor(rnd() * pool.length)];
}

export const botDisplayName = (persona) => `AI ${persona.name}`;
export const botAvatar = (persona) => `/bots/${persona.key}.svg`;

/** 상황 키에 맞는 대사 하나 (개성 전용 대사 우선, 없으면 공통) */
export function botLine(persona, situation, rnd = Math.random) {
  const own = persona?.lines?.[situation] ?? [];
  const pool = own.length && (rnd() < 0.75 || !COMMON[situation]) ? own : COMMON[situation] ?? [];
  return pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
}

// ---------- 고스톱 두뇌 ----------
const GO_MARGIN = { aggressive: -0.4, balanced: 0.25, defensive: 1.2 }; // HeuristicBot: goValue 가 stop + margin 보다 커야 고

/**
 * 단순 룰 봇(AiPlayer) + 성향 + 실수.
 *  - mistake: 낼 패를 무작위로 고르는 확률 (쉬움 0.4, 보통 0.12)
 *  - reckless: 고/스톱을 따지지 않고 무모하게 고 (쉬움)
 */
class StyledAiPlayer extends AiPlayer {
  constructor(pid, opts = {}) {
    super(pid, opts);
    this.style = opts.style ?? 'balanced';
    this.mistake = opts.mistake ?? 0;
    this.reckless = !!opts.reckless;
  }

  decide(view) {
    if (view.turn !== this.pid) return null;
    const r = this.rnd;
    if (view.phase === 'play' && view.hand.length && r() < this.mistake) return { type: 'play', cardId: view.hand[Math.floor(r() * view.hand.length)] };
    if (view.phase === 'choose' && r() < this.mistake) return { type: 'choose', cardId: view.choice.options[Math.floor(r() * view.choice.options.length)] };
    if (view.phase === 'gostop' && this.reckless) return { type: view.go[this.pid] < 4 && r() < 0.65 ? 'go' : 'stop' };
    return super.decide(view);
  }

  shouldGo(view) {
    const base = super.shouldGo(view);
    const me = this.pid;
    const th = view.threshold;
    const oppBest = Math.max(0, ...view.opps.map((p) => view.scores[p].total));
    // 공격형: 상대가 바짝 붙지 않았으면 2고까지는 밀어붙인다
    if (this.style === 'aggressive' && !base && view.hand.length >= 2 && view.go[me] < 3 && oppBest < th - 1) return true;
    // 수비형: 상대가 조금이라도 점수가 있거나 이미 1고면 확정
    if (this.style === 'defensive' && base && (oppBest >= th - 3 || view.go[me] >= 1)) return false;
    return base;
  }
}

/** 어려움: 카드 카운팅 봇 + 성향별 고 기준 */
class StyledHeuristicBot extends HeuristicBot {
  constructor(pid, opts = {}) {
    super(pid, opts);
    this.goMargin = GO_MARGIN[opts.style ?? 'balanced'] ?? GO_MARGIN.balanced;
  }

  goEV(view) {
    const r = super.goEV(view);
    return { ...r, go: Number.isFinite(r.goValue) && r.goValue > r.stop + this.goMargin };
  }
}

export function makeGostopBrain(pid, { level = DEFAULT_LEVEL, style = 'balanced', rnd } = {}) {
  if (level === 'easy') return new StyledAiPlayer(pid, { rnd, style, mistake: 0.4, reckless: true });
  if (level === 'hard') return new StyledHeuristicBot(pid, { rnd, style });
  return new StyledAiPlayer(pid, { rnd, style, mistake: 0.12 });
}

// ---------- 섯다 두뇌 ----------
const SD_STYLE = {
  aggressive: { bold: 1.12, bluff: 0.11 },
  balanced: { bold: 1, bluff: 0.06 },
  defensive: { bold: 0.9, bluff: 0.03 },
};

export function makeSeotdaBrain(pid, { level = DEFAULT_LEVEL, style = 'balanced', rnd } = {}) {
  const s = SD_STYLE[style] ?? SD_STYLE.balanced;
  return new SeotdaBot(pid, { rnd, level, boldness: s.bold, bluff: s.bluff });
}

// ---------- 오목 두뇌 ----------
export const makeOmokBrain = (pid, { level = DEFAULT_LEVEL, style = 'balanced', rnd } = {}) => new OmokBot({ rnd, level, style });

/** 사람 대신 둘 때(시간 초과·끊김·자동 진행)의 두뇌 */
export const proxyGostopBrain = (pid) => new HeuristicBot(pid);
export const proxySeotdaBrain = (pid) => new SeotdaBot(pid, { level: 'hard' });
export const proxyOmokBrain = () => new OmokBot({ level: 'hard' });

// ---------- 상황 반응 ----------
const NICE_KINDS = new Set(['bomb', 'sweep', 'special']);

/** 고스톱 프레임 묶음에서 봇별 반응 상황을 뽑는다. [{ pid, situation, frameIndex }] */
export function gostopReactions(frames, botIds) {
  const out = [];
  frames.forEach((f, i) => {
    const b = f.banner;
    if (!b || b.pid == null) return;
    for (const bot of botIds) {
      const mine = b.pid === bot;
      let s = null;
      if (b.kind === 'ppeok') s = mine ? 'ppeok' : 'oppPpeok';
      else if (b.kind === 'go') s = mine ? 'go' : 'oppGo';
      else if (mine && NICE_KINDS.has(b.kind) && b.text !== '쇼당!' && b.text !== '쇼당 받음!' && b.text !== '독박!') s = 'nice';
      if (s) out.push({ pid: bot, situation: s, frameIndex: i });
    }
  });
  return out;
}

/** 섯다 액션 이벤트에서 봇별 반응 상황. 크게 올림 = 하프/따당/올인 */
export function seotdaReactions(events, botIds) {
  const out = [];
  for (const e of events) {
    if (e.type !== 'action') continue;
    const big = e.action === 'ddadang' || e.action === 'half' || e.allIn;
    for (const bot of botIds) {
      const mine = e.pid === bot;
      if (mine && e.action === 'die' && !e.forfeit) out.push({ pid: bot, situation: 'die' });
      else if (big) out.push({ pid: bot, situation: mine ? 'raise' : 'oppRaise' });
    }
  }
  return out;
}
