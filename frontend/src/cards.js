// 카드 id = (row-1)*8 + (column-1) → /pics/row-R-column-C.png (백엔드 cards.js 와 동일한 배치)
export const cardImg = (id) => `/pics/row-${Math.floor(id / 8) + 1}-column-${(id % 8) + 1}.png`;
export const isBonus = (id) => id >= 48;
export const monthOf = (id) => (isBonus(id) ? 0 : Math.floor(id / 4) + 1);

const KINDS = [
  ['gwang', 'tti', 'pi', 'pi'],
  ['yeol', 'tti', 'pi', 'pi'],
  ['gwang', 'tti', 'pi', 'pi'],
  ['yeol', 'tti', 'pi', 'pi'],
  ['yeol', 'tti', 'pi', 'pi'],
  ['yeol', 'tti', 'pi', 'pi'],
  ['yeol', 'tti', 'pi', 'pi'],
  ['gwang', 'yeol', 'pi', 'pi'],
  ['yeol', 'tti', 'pi', 'pi'],
  ['yeol', 'tti', 'pi', 'pi'],
  ['gwang', 'ssangpi', 'pi', 'pi'],
  ['gwang', 'yeol', 'tti', 'ssangpi'],
];
export const kindOf = (id) => (isBonus(id) ? 'ssangpi' : KINDS[Math.floor(id / 4)][id % 4]);

const KIND_NAME = { gwang: '광', tti: '띠', yeol: '열끗', pi: '피', ssangpi: '쌍피' };
/** 화면 낭독기용 카드 이름: "3월 광", "보너스 쌍피" */
export const cardName = (id) => (isBonus(id) ? '보너스 쌍피' : `${monthOf(id)}월 ${KIND_NAME[kindOf(id)]}`);

/** 획득패를 광 → 띠 → 멍(열끗) → 피 그룹으로 나눈다. 그룹 안에서는 먹은 순서를 유지해 새 패가 항상 맨 뒤에 붙는다(기존 패는 움직이지 않음). 9월 술잔(32)은 열끗, gukjinAsPi 면 피로 표시 */
export function groupCaptured(ids, gukjinAsPi = false) {
  const g = { gwang: [], tti: [], yeol: [], pi: [] };
  for (const id of ids) {
    const k = kindOf(id);
    if (k === 'gwang') g.gwang.push(id);
    else if (k === 'yeol' && !(gukjinAsPi && id === 32)) g.yeol.push(id);
    else if (k === 'tti') g.tti.push(id);
    else g.pi.push(id);
  }
  return g;
}

// 3장짜리 족보 (백엔드 cards.js 의 tti/godori 와 같은 카드)
const SETS = [
  { name: '홍단', ids: [1, 5, 9] },
  { name: '청단', ids: [21, 33, 37] },
  { name: '초단', ids: [13, 17, 25] },
  { name: '고도리', ids: [4, 12, 29] },
];
const GWANGS = [0, 8, 28, 40, 44];
const GWANG_NEXT = { 2: '삼광', 3: '사광', 4: '오광' };

/**
 * 완성 직전(한 장 남음) 족보: 홍단/청단/초단/고도리 2/3, 광 2~4장.
 * 남은 패를 이미 다른 사람이 먹었으면 완성할 수 없으니 표시하지 않는다.
 * @param captured { pid: 획득패 id[] } @returns {string[]} 예: ['청단', '삼광']
 */
export function nearCombos(captured, pid) {
  const mine = new Set(captured[pid] ?? []);
  const taken = new Set(Object.entries(captured).filter(([p]) => Number(p) !== pid).flatMap(([, ids]) => ids));
  const out = [];
  for (const s of SETS) {
    const miss = s.ids.filter((id) => !mine.has(id));
    if (miss.length === 1 && !taken.has(miss[0])) out.push(s.name);
  }
  const g = GWANGS.filter((id) => mine.has(id)).length;
  if (GWANG_NEXT[g] && GWANGS.some((id) => !mine.has(id) && !taken.has(id))) out.push(GWANG_NEXT[g]);
  return out;
}

export const won =(n) => `${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('ko-KR')}`;
export const signed = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('ko-KR')}`;
