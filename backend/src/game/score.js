import { card } from './cards.js';

const WIN_THRESHOLD = 7;

function calc(ids, sepAsPi) {
  const cs = ids.map(card);
  const detail = [];
  let total = 0;

  // 광
  const gw = cs.filter((c) => c.kind === 'gwang');
  let gwangPts = 0;
  if (gw.length === 5) gwangPts = 15;
  else if (gw.length === 4) gwangPts = 4;
  else if (gw.length === 3) gwangPts = gw.some((c) => c.bi) ? 2 : 3;
  if (gwangPts) detail.push({ name: `${gw.length}광`, pts: gwangPts });
  total += gwangPts;

  // 열끗
  const yeol = cs.filter((c) => c.kind === 'yeol' && !(sepAsPi && c.dual));
  if (yeol.length >= 5) {
    detail.push({ name: `열끗 ${yeol.length}장`, pts: yeol.length - 4 });
    total += yeol.length - 4;
  }
  if (yeol.filter((c) => c.godori).length === 3) {
    detail.push({ name: '고도리', pts: 5 });
    total += 5;
  }

  // 띠
  const tti = cs.filter((c) => c.kind === 'tti');
  if (tti.length >= 5) {
    detail.push({ name: `띠 ${tti.length}장`, pts: tti.length - 4 });
    total += tti.length - 4;
  }
  for (const [key, name] of [['hong', '홍단'], ['cheong', '청단'], ['cho', '초단']]) {
    if (tti.filter((c) => c.tti === key).length === 3) {
      detail.push({ name, pts: 3 });
      total += 3;
    }
  }

  // 피
  const piCount =
    cs.filter((c) => c.kind === 'pi').length +
    cs.filter((c) => c.kind === 'ssangpi' || c.kind === 'bonus').length * 2 +
    (sepAsPi ? cs.filter((c) => c.dual).length * 2 : 0);
  if (piCount >= 10) {
    detail.push({ name: `피 ${piCount}장`, pts: piCount - 9 });
    total += piCount - 9;
  }

  return {
    total,
    detail,
    gwang: gw.length,
    gwangPts,
    yeol: yeol.length,
    tti: tti.length,
    pi: piCount,
    sepAsPi,
  };
}

// 9월 술잔은 열끗/쌍피 중 유리한 쪽으로 자동 계산
export function computeScore(ids) {
  const a = calc(ids, false);
  if (!ids.some((id) => card(id).dual)) return a;
  const b = calc(ids, true);
  return b.total > a.total ? b : a;
}

// 박 판정에 쓰는 상대의 피 장수: 술잔을 쌍피로 보는 편이 유리하면 그쪽으로
export function loserPiCount(ids) {
  const a = calc(ids, false).pi;
  if (!ids.some((id) => card(id).dual)) return a;
  return Math.max(a, calc(ids, true).pi);
}

export { WIN_THRESHOLD };
