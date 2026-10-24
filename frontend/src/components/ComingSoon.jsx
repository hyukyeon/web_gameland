import React from 'react';
import { motion } from 'framer-motion';
import { GAMES } from '../games.js';

/** 아직 구현되지 않은 게임(섯다/슬롯머신)의 자리표시 화면. 나중에 실제 게임 로비 컴포넌트로 교체한다. */
export function ComingSoon({ gameId }) {
  const g = GAMES.find((x) => x.id === gameId);
  return (
    <section className="panel flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <motion.div
        className="text-7xl"
        animate={{ rotate: [0, -8, 8, -4, 4, 0], y: [0, -6, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2 }}
      >
        {g?.emoji}
      </motion.div>
      <h2 className="text-2xl font-black text-gold-400">{g?.name}</h2>
      <p className="text-sm text-slate-300">{g?.desc}</p>
      <span className="rounded-full bg-white/10 px-4 py-1 text-sm font-bold text-gold-400 ring-1 ring-gold-400/50">🚧 준비 중입니다</span>
      <button className="btn btn-ghost mt-2" disabled>입장하기</button>
    </section>
  );
}
