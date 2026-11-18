import React from 'react';

export const BRAND = '강원게임랜드';

/**
 * 대표 로고: 엠블럼(/logo-mark.svg) + 워드마크. 워드마크는 글꼴이 기기마다 같도록 SVG 가 아니라 HTML 글자로 그린다.
 * size: 엠블럼 크기(px) · sub: 워드마크 아래 작은 문구 · text=false 면 엠블럼만
 */
export function Logo({ size = 40, text = true, sub, className = '', textClass = 'text-2xl' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/logo-mark.svg" width={size} height={size} alt={text ? '' : BRAND} className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,.5)]" draggable={false} />
      {text && (
        <span className="flex flex-col leading-none">
          <span className={`whitespace-nowrap bg-gradient-to-b from-yellow-100 via-yellow-300 to-amber-600 bg-clip-text font-black tracking-tight text-transparent drop-shadow-[0_0_10px_rgba(255,200,80,.35)] ${textClass}`}>{BRAND}</span>
          {sub && <span className="mt-1 whitespace-nowrap text-[10px] font-bold tracking-[0.25em] text-amber-200/70">{sub}</span>}
        </span>
      )}
    </span>
  );
}
