import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/** 서버 기준 마감 시각까지 남은 초 (skew: 서버 시계 − 내 시계) */
export function useCountdown(deadlineAt, skew) {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!deadlineAt) {
      setLeft(null);
      return undefined;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((deadlineAt - (Date.now() + skew)) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadlineAt, skew]);
  return left;
}

/** 차례 표시 배지: 남은 시간(5초 이하면 빨갛게 깜빡임) 또는 AI 대행 중 */
export function TurnTimer({ left, auto, className = '' }) {
  if (auto) return <span className={`rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black text-white ${className}`}>🤖 AI 대행</span>;
  if (left == null) return null;
  const hurry = left <= 5;
  return (
    <motion.span
      animate={hurry ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
      transition={hurry ? { repeat: Infinity, duration: 0.8 } : undefined}
      className={`rounded px-1.5 py-0.5 text-[10px] font-black tabular-nums ${hurry ? 'bg-red-600 text-white' : 'bg-black/50 text-gold-400'} ${className}`}
    >
      ⏱ {left}초
    </motion.span>
  );
}

/** 상단 바 버튼: AI 자동 진행 켜기/끄기 (시간을 연속으로 넘기면 서버가 자동으로 켠다) */
export function AutoToggle({ room, you, emit }) {
  const me = room?.players.find((p) => p.id === you);
  if (!me) return null;
  return me.auto ? (
    <motion.button
      animate={{ opacity: [1, 0.65, 1] }}
      transition={{ repeat: Infinity, duration: 1.4 }}
      className="btn whitespace-nowrap !bg-indigo-600 !px-3 !py-1 text-white hover:!bg-indigo-500"
      onClick={() => emit('room:auto', { on: false })}
      title="AI 자동 진행을 끄고 직접 둡니다"
    >
      🤖<span className="hidden sm:inline"> 자동 진행 중 · 직접 하기</span><span className="sm:hidden"> 끄기</span>
    </motion.button>
  ) : (
    <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => emit('room:auto', { on: true })} title="내 차례를 AI가 대신 둡니다">
      🤖<span className="hidden sm:inline"> 자동</span>
    </button>
  );
}
