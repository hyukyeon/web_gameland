// 카드 id = (row-1)*8 + (column-1)  →  pics/row-R-column-C.png
// 월별 4장씩 순서대로: id 0~3 = 1월, 4~7 = 2월 ...
// kind: gwang(광) | yeol(열끗) | tti(띠) | pi(피) | ssangpi(쌍피)
// tti: hong(홍단) | cheong(청단) | cho(초단) | null
const LAYOUT = [
  ['gwang', 'tti:hong', 'pi', 'pi'], // 1월 송학
  ['yeol', 'tti:hong', 'pi', 'pi'], // 2월 매조
  ['gwang', 'tti:hong', 'pi', 'pi'], // 3월 벚꽃
  ['yeol', 'tti:cho', 'pi', 'pi'], // 4월 흑싸리
  ['yeol', 'tti:cho', 'pi', 'pi'], // 5월 난초
  ['yeol', 'tti:cheong', 'pi', 'pi'], // 6월 모란
  ['yeol', 'tti:cho', 'pi', 'pi'], // 7월 홍싸리
  ['gwang', 'yeol', 'pi', 'pi'], // 8월 공산
  ['yeol', 'tti:cheong', 'pi', 'pi'], // 9월 국화 (열끗은 술잔: 쌍피로도 사용 가능)
  ['yeol', 'tti:cheong', 'pi', 'pi'], // 10월 단풍
  ['gwang', 'ssangpi', 'pi', 'pi'], // 11월 오동
  ['gwang', 'yeol', 'tti', 'ssangpi'], // 12월 비
];

const GODORI = new Set([4, 12, 29]); // 2월 새, 4월 새, 8월 기러기

export const CARDS = [];
LAYOUT.forEach((row, m) => {
  row.forEach((spec, k) => {
    const [kind, tti] = spec.split(':');
    const id = m * 4 + k;
    CARDS.push({
      id,
      month: m + 1,
      kind,
      tti: tti || null,
      bi: id === 44, // 12월 비광
      godori: GODORI.has(id),
      dual: id === 32, // 9월 술잔
    });
  });
});

// 보너스 쌍피(옵션, 이미지 없음 → UI 에서 CSS 로 렌더). month 0 이라 어떤 패와도 매칭되지 않는다.
export const BONUS_IDS = [48, 49];
const BONUS_CARDS = BONUS_IDS.map((id) => ({ id, month: 0, kind: 'bonus', tti: null, bi: false, godori: false, dual: false }));
const TABLE = [...CARDS, ...BONUS_CARDS];

export const card = (id) => TABLE[id];
export const ALL_IDS = CARDS.map((c) => c.id);

export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
