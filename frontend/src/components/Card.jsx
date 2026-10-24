import React from 'react';
import { motion } from 'framer-motion';
import { cardImg, isBonus, cardName } from '../cards.js';
import { hk } from '../keys.js';

// 화투패 비율 104:160
// 크기는 설정의 카드 크기 배율(--cs)을 곱한다
const SIZES = {
  xs: 'w-[calc(26px*var(--cs,1))] h-[calc(40px*var(--cs,1))]',
  sm: 'w-[calc(34px*var(--cs,1))] h-[calc(52px*var(--cs,1))] sm:w-[calc(40px*var(--cs,1))] sm:h-[calc(61px*var(--cs,1))]',
  md: 'w-[calc(46px*var(--cs,1))] h-[calc(71px*var(--cs,1))] sm:w-[calc(56px*var(--cs,1))] sm:h-[calc(86px*var(--cs,1))]',
  lg: 'w-[calc(54px*var(--cs,1))] h-[calc(83px*var(--cs,1))] sm:w-[calc(70px*var(--cs,1))] sm:h-[calc(108px*var(--cs,1))]',
};

const spring = { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 };

/**
 * 화투패 한 장. id 가 있으면 layoutId 로 손패→바닥→획득패 이동이 자동으로 날아가는 애니메이션이 된다.
 * back=true 면 뒷면(CSS), 보너스 카드(48/49)는 CSS 로 그린다.
 */
export function Card({ id, back = false, size = 'md', onClick, selected, glow, hl, dim, fresh, slam, className = '', style, hotkey }) {
  const clickable = !!onClick;
  // slam: 방금 낸/뒤집은 패 — 크게 던져서 탁! 하고 내려앉는다 (살짝 기울었다가 바로잡힘)
  const initial = slam
    ? { opacity: 1, scale: 1.45, rotate: fresh ? 0 : -9, y: fresh ? -50 : -10, rotateY: fresh ? 90 : 0 }
    : fresh
      ? { opacity: 0, y: -50, scale: 0.6, rotateY: 90 }
      : { opacity: 0, scale: 0.7 };
  const transition = slam ? { type: 'spring', stiffness: 380, damping: 15, mass: 0.8 } : spring;
  return (
    <motion.div
      layout
      layoutId={back || id == null ? undefined : `c${id}`}
      initial={initial}
      animate={{ opacity: dim ? 0.45 : 1, scale: 1, rotate: 0, y: selected ? -12 : 0, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={transition}
      whileHover={clickable ? { y: selected ? -12 : -8 } : undefined}
      whileTap={clickable ? { scale: 0.95 } : undefined}
      onClick={onClick}
      style={style}
      className={`relative shrink-0 select-none ${SIZES[size]} ${clickable ? 'cursor-pointer hk-corner' : ''} ${className}`}
      // 접근성: 누를 수 있는 패는 버튼처럼 Tab 으로 이동하고 Enter/Space 로 낸다
      role={clickable ? 'button' : 'img'}
      tabIndex={clickable ? 0 : undefined}
      aria-label={back || id == null ? '뒷면' : `${cardName(id)}${hl ? ' (짝 맞음)' : ''}`}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
      {...(clickable ? hk(hotkey) : {})}
    >
      {hl && <span className="match-badge" aria-hidden="true">🔗</span>}
      {slam && (
        <>
          {/* 착지 충격파 */}
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-lg border-[3px] border-gold-400"
            initial={{ opacity: 0.9, scale: 1 }}
            animate={{ opacity: 0, scale: 1.35 }}
            transition={{ duration: 0.55, delay: 0.18, ease: 'easeOut' }}
          />
          <motion.span
            className="pointer-events-none absolute -inset-2 rounded-xl bg-white/50 blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.45, delay: 0.15 }}
          />
        </>
      )}
      {hl && (
        <motion.span
          className="pointer-events-none absolute -inset-[3px] z-10 rounded-lg border-[3px] border-cyan-300"
          animate={{ boxShadow: ['0 0 3px 0 rgba(34,211,238,0.6)', '0 0 10px 2px rgba(34,211,238,0.9)', '0 0 3px 0 rgba(34,211,238,0.6)'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div
        className={`relative h-full w-full select-none overflow-hidden rounded-md shadow-md shadow-black/60 ${
          glow ? 'ring-4 ring-gold-400 shadow-gold-400/60' : 'ring-1 ring-black/40'
        } ${back ? 'card-back' : ''} ${id != null && isBonus(id) ? 'card-bonus' : ''}`}
      >
        {!back && id != null && !isBonus(id) && (
          <img src={cardImg(id)} alt="" draggable={false} className="h-full w-full object-fill" />
        )}
        {!back && id != null && isBonus(id) && (
          <div className="flex h-full w-full flex-col items-center justify-center text-center font-black leading-tight text-amber-950">
            <span className="text-[10px] sm:text-xs">보너스</span>
            <span className="text-base sm:text-xl">★★</span>
            <span className="text-[9px] sm:text-[11px]">쌍피</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
