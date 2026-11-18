import React from 'react';
import { GLYPH, SIDE } from '../janggi.js';

// 한자가 들어 있는 글꼴을 앞에 (없으면 기기 기본 명조/세리프)
const FONT = "'Noto Serif KR','Noto Serif CJK KR','Nanum Myeongjo','Batang','AppleMyungjo','Noto Serif CJK SC','SimSun',serif";

/**
 * 장기말 한 개: 팔각형 나무판 + 겹 테두리 + 한자. SVG 로 직접 그려 어떤 크기에서도 선명하고,
 * 칠은 그라데이션(이미지)이라 강제 다크 모드에서도 뒤집히지 않는다.
 */
export function JanggiPiece({ side, t, className = '', style }) {
  const s = SIDE[side];
  const id = `jp-${side}`;
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-wood`} cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset=".55" stopColor="#f3e3bf" />
          <stop offset="1" stopColor="#d6b47a" />
        </radialGradient>
      </defs>
      {/* 두께(아래쪽 그림자 면) */}
      <polygon points="30,7 70,7 97,34 97,74 70,99 30,99 3,74 3,34" fill="#8a6a3a" />
      <polygon points="30,2 70,2 97,29 97,69 70,95 30,95 3,69 3,29" fill={`url(#${id}-wood)`} stroke={s.rim} strokeWidth="3.5" />
      <polygon points="33,10 67,10 89,32 89,66 67,87 33,87 11,66 11,32" fill="none" stroke={s.rim} strokeWidth="1.6" strokeOpacity=".55" />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontWeight="900" fontSize={t === 'K' ? 50 : 54} fill={s.ink}>
        {GLYPH[side][t]}
      </text>
    </svg>
  );
}
