import React from 'react';
import { motion } from 'framer-motion';
import { cardImg, isBonus } from '../cards.js';

// 화투패 비율 104:160
const SIZES = {
  xs: 'w-[26px] h-[40px]',
  sm: 'w-[34px] h-[52px] sm:w-[40px] sm:h-[61px]',
  md: 'w-[46px] h-[71px] sm:w-[56px] sm:h-[86px]',
  lg: 'w-[54px] h-[83px] sm:w-[70px] sm:h-[108px]',
};

const spring = { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 };

/**
 * 화투패 한 장. id 가 있으면 layoutId 로 손패→바닥→획득패 이동이 자동으로 날아가는 애니메이션이 된다.
 * back=true 면 뒷면(CSS), 보너스 카드(48/49)는 CSS 로 그린다.
 */
export function Card({ id, back = false, size = 'md', onClick, selected, glow, hl, dim, fresh, slam, className = '', style }) {
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
      className={`relative shrink-0 select-none ${SIZES[size]} ${clickable ? 'cursor-pointer' : ''} ${className}`}
    >
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
          className="pointer-events-none absolute -inset-[5px] z-10 rounded-lg border-[4px] border-cyan-300"
          animate={{ boxShadow: ['0 0 6px 1px rgba(34,211,238,0.7)', '0 0 20px 6px rgba(34,211,238,1)', '0 0 6px 1px rgba(34,211,238,0.7)'] }}
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
