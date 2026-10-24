// 강원랜드에서 즐길 수 있는 게임 목록. 새 게임을 만들면 ready 를 true 로 바꾸고 Lobby 의 화면 매핑에 연결한다.
export const GAMES = [
  { id: 'gostop', emoji: '🎴', name: '고스톱', desc: '2~4인 화투 대전 · AI 연습 · 관전', ready: true },
  { id: 'seotda', emoji: '🃏', name: '섯다', desc: '두 장으로 족보를 겨루는 화투 베팅 · 2~4인', ready: true },
  { id: 'omok', emoji: '⚪', name: '오목', desc: '15×15 오목판 1:1 대국 · 렌주룰(쌍삼·장목 금지) · AI 연습', ready: true },
  { id: 'slot', emoji: '🎰', name: '슬롯머신', desc: '화투패 릴을 돌려 잭팟에 도전 · 하루 한도 10,000원', ready: true },
];
