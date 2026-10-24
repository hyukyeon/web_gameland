import { card } from '../game/cards.js';

/**
 * 섯다 족보 엔진. 48장 화투 중 1~10월 각 2장(총 20장)만 쓴다.
 * 카드 id 는 고스톱과 동일(월 m 의 패는 4(m-1)~4(m-1)+3)하므로 이미지(./pics)를 그대로 재사용한다.
 */
// 1월 광·피 / 2월 새·홍단 / 3월 광·피 / 4월 새·피 / 5월 나비·피 / 6월 나비·피 / 7월 멧돼지·피 / 8월 광·새 / 9월 국진(쌍피)·피 / 10월 사슴·피
export const SEOTDA_DECK = [0, 2, 4, 5, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 29, 32, 34, 36, 38];

const KIND_LABEL = { gwang: '광', yeol: '열끗', pi: '피', tti: '띠' };
const ANIMAL = { 4: '새', 12: '새', 16: '나비', 20: '나비', 24: '멧돼지', 29: '새', 36: '사슴' };

export function seotdaCard(id) {
  if (!SEOTDA_DECK.includes(id)) throw new Error(`섯다 덱에 없는 패: ${id}`);
  const c = card(id);
  const label = c.kind === 'gwang' ? '광' : id === 5 ? '홍단' : id === 32 ? '쌍피' : c.kind === 'yeol' ? ANIMAL[id] ?? '열끗' : KIND_LABEL[c.kind] ?? c.kind;
  return { id, month: c.month, kind: c.kind, label: `${c.month}월 ${label}` };
}

// ---- 주요 카드 ----
const GWANG1 = 0;
const GWANG3 = 8;
const GWANG8 = 28;
const YEOL4 = 12; // 4월 새(열끗)
const YEOL7 = 24; // 7월 멧돼지(열끗)
const YEOL9 = 32; // 9월 국진(열끗/쌍피)

// ---- 순위 점수(클수록 강함) ----
export const POWER = {
  GWANG38: 1000,
  GWANG18: 900,
  GWANG13: 890,
  TTAENG_BASE: 800, // n땡 = 800 + n (장땡 810 … 삥땡 801)
  ALI: 700,
  DOKSA: 690,
  GUBBING: 680,
  JANGBBING: 670,
  JANGSA: 660,
  SERYUK: 650,
  GAPO: 600,
  KKEUT_BASE: 500, // n끗 = 500 + n (망통 500)
  AMHAENG_BEATS_GWANG: 950, // 암행어사가 13/18광땡을 잡을 때 (38광땡보다는 약함)
  TTANGJABI_BEATS_TTAENG: 809.5, // 땡잡이가 1~9땡을 잡을 때 (장땡·광땡보다는 약함)
};
const GUSA_REMATCH_MEONGTUNG_MAX = POWER.TTAENG_BASE + 9; // 멍텅구리 구사: 상대 최고 패가 9땡 이하
const GUSA_REMATCH_NORMAL_MAX = POWER.ALI; // 일반 구사: 상대 최고 패가 알리 이하

const MID = [
  [[1, 2], '알리', POWER.ALI],
  [[1, 4], '독사', POWER.DOKSA],
  [[1, 9], '구삥', POWER.GUBBING],
  [[1, 10], '장삥', POWER.JANGBBING],
  [[4, 10], '장사', POWER.JANGSA],
  [[4, 6], '세륙', POWER.SERYUK],
];

const ttaengName = (m) => (m === 10 ? '장땡' : m === 1 ? '삥땡' : `${m}땡`);

/**
 * 두 장의 패를 평가한다.
 * @returns {{ name, power, category, special: null|'amhaeng'|'ttangjabi'|'gusa'|'meongtung_gusa', months:[number,number] }}
 *  power 는 특수 효과를 적용하기 전의 '기본' 점수다. 특수 족보의 실제 승패는 compareHands 에서 가려진다.
 */
export function evaluateHand(pair) {
  if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1]) throw new Error('패는 서로 다른 2장이어야 합니다.');
  const [a, b] = pair.map(seotdaCard);
  const ids = [a.id, b.id];
  const has = (...need) => need.every((n) => ids.includes(n));
  const months = [a.month, b.month].sort((x, y) => x - y);
  const [m1, m2] = months;
  const sum = m1 + m2;
  const mk = (name, power, category, special = null) => ({ name, power, category, special, months });

  if (has(GWANG3, GWANG8)) return mk('삼팔광땡', POWER.GWANG38, 'gwangttaeng');
  if (has(GWANG1, GWANG8)) return mk('18광땡', POWER.GWANG18, 'gwangttaeng');
  if (has(GWANG1, GWANG3)) return mk('13광땡', POWER.GWANG13, 'gwangttaeng');
  if (m1 === m2) return mk(ttaengName(m1), POWER.TTAENG_BASE + m1, 'ttaeng');

  // 특수 족보(기본 점수는 각각 망통/1끗/3끗)
  if (has(GWANG3, YEOL7)) return mk('땡잡이', POWER.KKEUT_BASE + (sum % 10), 'special', 'ttangjabi');
  if (has(YEOL4, YEOL7)) return mk('암행어사', POWER.KKEUT_BASE + (sum % 10), 'special', 'amhaeng');
  if (m1 === 4 && m2 === 9) {
    const meongtung = has(YEOL4, YEOL9); // 동물 그림(열끗) 4 + 9
    return mk(meongtung ? '멍텅구리구사' : '구사', POWER.KKEUT_BASE + (sum % 10), 'special', meongtung ? 'meongtung_gusa' : 'gusa');
  }

  for (const [need, name, power] of MID) if (m1 === need[0] && m2 === need[1]) return mk(name, power, 'jungan');
  if (sum % 10 === 9) return mk('갑오', POWER.GAPO, 'gapo');
  const k = sum % 10;
  return mk(k === 0 ? '망통' : `${k}끗`, POWER.KKEUT_BASE + k, 'kkeut');
}

/**
 * 쇼다운: 남은 사람들의 패를 비교한다.
 *  - 암행어사: 상대 중 13광땡/18광땡이 있으면 승리(= 950점으로 취급). 38광땡은 못 잡는다. 없으면 1끗.
 *  - 땡잡이: 상대 중 1~9땡이 있으면 승리(= 809.5점). 장땡·광땡은 못 잡는다. 없으면 망통.
 *  - 구사: 멍텅구리구사는 상대 최고 패가 9땡 이하, 일반 구사는 알리 이하이면 재경기(무효판). 아니면 3끗.
 *  - 점수가 같으면 공동 승자(팟을 나눠 가진다).
 * @param {Record<number, [number, number]>} hands pid → 패 2장
 * @returns {{ rematch: boolean, rematchBy: number|null, winners: number[], ranking: {pid, hand, power}[] }}
 */
export function compareHands(hands) {
  const pids = Object.keys(hands).map(Number);
  const raw = Object.fromEntries(pids.map((p) => [p, evaluateHand(hands[p])]));

  // 1) 구사 재경기 판정 (상대의 '기본' 점수 기준)
  for (const p of pids) {
    const sp = raw[p].special;
    if (sp !== 'gusa' && sp !== 'meongtung_gusa') continue;
    const maxOther = Math.max(...pids.filter((q) => q !== p).map((q) => raw[q].power));
    const limit = sp === 'meongtung_gusa' ? GUSA_REMATCH_MEONGTUNG_MAX : GUSA_REMATCH_NORMAL_MAX;
    if (maxOther <= limit) {
      return { rematch: true, rematchBy: p, winners: [], ranking: pids.map((q) => ({ pid: q, hand: raw[q], power: raw[q].power })) };
    }
  }

  // 2) 특수 효과를 적용한 실제 점수
  const ranking = pids.map((p) => {
    const others = pids.filter((q) => q !== p).map((q) => raw[q]);
    let power = raw[p].power;
    if (raw[p].special === 'amhaeng' && others.some((h) => h.power === POWER.GWANG18 || h.power === POWER.GWANG13)) power = POWER.AMHAENG_BEATS_GWANG;
    if (raw[p].special === 'ttangjabi' && others.some((h) => h.category === 'ttaeng' && h.power < POWER.TTAENG_BASE + 10)) power = POWER.TTANGJABI_BEATS_TTAENG;
    return { pid: p, hand: raw[p], power };
  });
  const top = Math.max(...ranking.map((r) => r.power));
  return { rematch: false, rematchBy: null, winners: ranking.filter((r) => r.power === top).map((r) => r.pid), ranking };
}

/** 족보 도움말(화면 표시용 상성표 데이터) — 프론트에도 같은 내용을 쓰지만 서버가 기준이다 */
export const JOKBO_TABLE = [
  { group: '광땡', rows: [['삼팔광땡', '3월 광 + 8월 광', '무조건 최강 (암행어사도 못 잡음)'], ['18광땡', '1월 광 + 8월 광', ''], ['13광땡', '1월 광 + 3월 광', '']] },
  { group: '땡', rows: [['장땡 ~ 삥땡', '같은 월 두 장 (10땡 > 9땡 > … > 1땡)', '']] },
  { group: '중간 족보', rows: [['알리', '1+2', ''], ['독사', '1+4', ''], ['구삥', '1+9', ''], ['장삥', '1+10', ''], ['장사', '4+10', ''], ['세륙', '4+6', '']] },
  { group: '끗', rows: [['갑오', '두 월의 합 끝자리 9', ''], ['8끗 ~ 1끗', '합의 끝자리', ''], ['망통', '합의 끝자리 0', '']] },
  {
    group: '특수 족보',
    rows: [
      ['암행어사', '4월 열끗 + 7월 열끗', '13광땡·18광땡을 잡음 (38광땡은 못 잡음). 못 잡는 상황에선 1끗'],
      ['땡잡이', '3월 광 + 7월 열끗', '1땡~9땡을 잡음 (장땡·광땡은 못 잡음). 못 잡는 상황에선 망통'],
      ['멍텅구리구사', '4월 열끗 + 9월 열끗', '상대 최고 패가 9땡 이하이면 재경기'],
      ['구사', '그 외 4+9', '상대 최고 패가 알리 이하이면 재경기'],
    ],
  },
];
