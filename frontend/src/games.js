// 강원게임랜드에서 즐길 수 있는 게임 목록. 새 게임을 만들면 ready 를 true 로 바꾸고 Lobby 의 화면 매핑에 연결한다.
export const GAMES = [
  { id: 'gostop', emoji: '🎴', name: '고스톱', desc: '2~4인 화투 대전 · AI 대전 · 관전', ready: true },
  { id: 'seotda', emoji: '🃏', name: '섯다', desc: '두 장으로 족보를 겨루는 화투 베팅 · 2~4인', ready: true },
  { id: 'omok', emoji: '⚪', name: '오목', desc: '15×15 오목판 1:1 대국 · 렌주룰(쌍삼·장목 금지) · AI 대전', ready: true },
  { id: 'yut', emoji: '🎲', name: '윷놀이', desc: '청·홍 팀으로 즐기는 가족 윷놀이 · 2~4인 · 업기·잡기·지름길 · AI 대전', ready: true },
  { id: 'vegas', emoji: '💵', name: '라스베가스', desc: '주사위를 굴려 카지노 6곳의 지폐를 차지하는 보드게임 · 2~5인 · 동점은 취소! · AI 대전', ready: true },
  { id: 'yacht', emoji: '🎯', name: '요트 다이스', desc: '주사위 5개를 세 번까지 굴려 족보 12칸을 채우는 점수 대결 · 2~4인 · AI 대전', ready: true },
  { id: 'janggi', emoji: '♟️', name: '장기', desc: '초·한 1:1 대국 · 상차림 선택 · 외통·빅장·점수 판정 · AI 대전', ready: true },
  { id: 'slot', emoji: '🎰', name: '슬롯머신', desc: '화투패 릴을 돌려 잭팟에 도전 · 하루 한도 10,000원', ready: true },
  { id: 'sudoku', emoji: '🧩', name: '스도쿠', desc: '9×9 숫자 퍼즐 · 클리어 1회 1,000원 · 하루 10회 보상', ready: true },
];
