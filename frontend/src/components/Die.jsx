import React from 'react';

// 주사위 눈 자리 (3×3 칸 번호)
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
/** 주사위 한 개 (라스베가스·요트 다이스 공용). seat = { fill, hi, pip } 색, value 0 이면 빈 면. 배경은 그라데이션 이미지(강제 다크 모드 대응) */
export function Die({ value, seat, size = 28, dim = false, glow = false, className = '' }) {
  return (
    <span
      className={`relative inline-grid shrink-0 grid-cols-3 grid-rows-3 place-items-center rounded-[22%] shadow-[0_2px_0_rgba(0,0,0,.35),0_3px_6px_rgba(0,0,0,.35)] ${glow ? 'ring-2 ring-yellow-300' : 'ring-1 ring-black/30'} ${dim ? 'opacity-35' : ''} ${className}`}
      // 패딩·눈 크기는 px 로 (% 패딩은 부모 폭 기준이라 넓은 칸에선 주사위가 커져 버린다)
      style={{ width: size, height: size, padding: Math.round(size * 0.12), backgroundImage: `radial-gradient(circle at 30% 25%, ${seat.hi}, ${seat.fill} 75%)` }}
      aria-hidden="true"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="block rounded-full" style={{ width: Math.max(2, Math.round(size * 0.17)), height: Math.max(2, Math.round(size * 0.17)), backgroundImage: PIPS[value]?.includes(i) ? `radial-gradient(circle at 40% 35%, ${seat.pip}, ${seat.pip})` : 'none' }} />
      ))}
    </span>
  );
}
