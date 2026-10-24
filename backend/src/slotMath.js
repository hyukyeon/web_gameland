/**
 * 슬롯머신 확률 모델. 결과는 항상 서버에서 난수로 결정한다.
 *
 * ⚠ 요청서의 표(1%·4%·15%·30%, 배당 40·10·3·1배)를 그대로 계산하면 RTP 가 155% 가 된다
 *   (0.01×40 + 0.04×10 + 0.15×3 + 0.30×1 = 1.55). 목표 RTP 95% 에 맞추려고 배당(금액)은 그대로 두고
 *   확률만 아래처럼 낮췄다:  0.5%×40 + 2%×10 + 8%×3 + 31%×1 = 0.95  (꽝 58.5%).
 *   표를 바꾸려면 SLOT_TIERS 만 고치면 된다. theoreticalRtp() 가 이론 RTP 를 계산해 준다.
 */
export const SLOT_BET = 500;
export const SLOT_DAILY_LIMIT = 10000;

export const SLOT_SYMBOLS = ['똥광', '삼팔광땡', '멧돼지', '홍단', '껍데기'];

// 위에서부터 누적 확률로 뽑는다. payout 은 당첨금(원, 베팅액 포함 금액)
export const SLOT_TIERS = [
  { id: 'jackpot', label: '잭팟', p: 0.005, payout: 20000 }, // 똥광 3개
  { id: 'big', label: '대박', p: 0.02, payout: 5000 }, // 삼팔광땡 3개
  { id: 'mid', label: '중박', p: 0.08, payout: 1500 }, // 멧돼지 3개
  { id: 'small', label: '소박', p: 0.31, payout: 500 }, // 아무 심볼 2개 일치 (본전)
  { id: 'miss', label: '꽝', p: 0.585, payout: 0 }, // 3개 모두 다름
];

export const theoreticalRtp = (tiers = SLOT_TIERS, bet = SLOT_BET) => tiers.reduce((s, t) => s + t.p * t.payout, 0) / bet;

const TRIPLE = { jackpot: '똥광', big: '삼팔광땡', mid: '멧돼지' };
const pickOne = (arr, rng) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 릴 3개의 심볼로 당첨금을 다시 계산한다 (생성 로직과 일치하는지 검증용) */
export function evaluateSymbols(s) {
  const [a, b, c] = s;
  if (a === b && b === c) return { 똥광: 20000, 삼팔광땡: 5000, 멧돼지: 1500 }[a] ?? 500;
  if (a === b || b === c || a === c) return 500;
  return 0;
}

/**
 * 한 번 스핀. rng 는 [0,1) 난수 함수(기본 Math.random, 테스트에서는 시드 난수).
 * @returns {{ resultSymbols: string[], payout: number, tier: string }}
 */
export function spinSlot(rng = Math.random, tiers = SLOT_TIERS) {
  let r = rng();
  let tier = tiers[tiers.length - 1];
  for (const t of tiers) {
    if (r < t.p) {
      tier = t;
      break;
    }
    r -= t.p;
  }
  let reels;
  if (TRIPLE[tier.id]) {
    reels = [TRIPLE[tier.id], TRIPLE[tier.id], TRIPLE[tier.id]];
  } else if (tier.id === 'small') {
    // 같은 심볼 2개 + 다른 심볼 1개, 위치는 무작위
    const pair = pickOne(SLOT_SYMBOLS, rng);
    const other = pickOne(
      SLOT_SYMBOLS.filter((x) => x !== pair),
      rng,
    );
    reels = shuffle([pair, pair, other], rng);
  } else {
    // 꽝: 서로 다른 3개 (우연히 짝이 생기지 않게)
    reels = shuffle(SLOT_SYMBOLS, rng).slice(0, 3);
  }
  return { resultSymbols: reels, payout: tier.payout, tier: tier.id };
}
