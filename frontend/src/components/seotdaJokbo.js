// 족보 도우미 데이터 (서버 src/seotda/rules.js 의 규칙과 같은 내용). ids 는 ./pics 카드 id.
export const JOKBO_GROUPS = [
  {
    title: '광땡 (최강)',
    rows: [
      { name: '삼팔광땡', desc: '3월 광 + 8월 광', note: '무조건 최강. 암행어사도 못 잡아요', ids: [8, 28] },
      { name: '18광땡', desc: '1월 광 + 8월 광', note: '', ids: [0, 28] },
      { name: '13광땡', desc: '1월 광 + 3월 광', note: '', ids: [0, 8] },
    ],
  },
  {
    title: '땡',
    rows: [
      { name: '장땡 ~ 삥땡', desc: '같은 월 두 장 (10땡 > 9땡 > … > 1땡)', note: '예) 10월 사슴 + 10월 피 = 장땡', ids: [36, 38] },
    ],
  },
  {
    title: '중간 족보',
    rows: [
      { name: '알리', desc: '1월 + 2월', note: '', ids: [0, 4] },
      { name: '독사', desc: '1월 + 4월', note: '', ids: [2, 12] },
      { name: '구삥', desc: '1월 + 9월', note: '', ids: [0, 34] },
      { name: '장삥', desc: '1월 + 10월', note: '', ids: [0, 36] },
      { name: '장사', desc: '4월 + 10월', note: '', ids: [14, 38] },
      { name: '세륙', desc: '4월 + 6월', note: '', ids: [14, 22] },
    ],
  },
  {
    title: '끗',
    rows: [
      { name: '갑오', desc: '두 월의 합의 끝자리가 9 (예: 1+8)', note: '', ids: [0, 29] },
      { name: '8끗 ~ 1끗', desc: '두 월의 합의 끝자리 (예: 2+6 = 8끗)', note: '', ids: [4, 22] },
      { name: '망통', desc: '합의 끝자리가 0 (예: 3+7)', note: '가장 약한 패', ids: [10, 26] },
    ],
  },
  {
    title: '특수 족보',
    rows: [
      { name: '암행어사', desc: '4월 열끗(새) + 7월 열끗(멧돼지)', note: '13광땡·18광땡을 잡아요. 38광땡은 못 잡아요. 못 잡는 상황이면 1끗', ids: [12, 24] },
      { name: '땡잡이', desc: '3월 광 + 7월 열끗(멧돼지)', note: '1땡~9땡을 잡아요. 장땡·광땡은 못 잡아요. 못 잡는 상황이면 망통', ids: [8, 24] },
      { name: '멍텅구리구사', desc: '4월 열끗(새) + 9월 열끗(국진)', note: '상대 최고 패가 9땡 이하이면 재경기(팟 이월)', ids: [12, 32] },
      { name: '구사', desc: '그 외 4월 + 9월', note: '상대 최고 패가 알리 이하이면 재경기(팟 이월)', ids: [14, 34] },
    ],
  },
];

// 특수 족보 상성표
export const MATCHUP_ROWS = [
  { hand: '삼팔광땡', beats: '모든 패 (암행어사 포함)', loses: '—', otherwise: '—' },
  { hand: '암행어사', beats: '13광땡 · 18광땡', loses: '삼팔광땡 (그 외엔 1끗 취급이라 땡·갑오·끗에도 짐)', otherwise: '1끗' },
  { hand: '땡잡이', beats: '1땡 ~ 9땡', loses: '장땡 · 광땡', otherwise: '망통' },
  { hand: '멍텅구리구사', beats: '(재경기) 상대 최고가 9땡 이하일 때', loses: '상대가 장땡·광땡이면 그 패가 이김', otherwise: '3끗' },
  { hand: '구사', beats: '(재경기) 상대 최고가 알리 이하일 때', loses: '상대가 땡 이상이면 그 패가 이김', otherwise: '3끗' },
];
