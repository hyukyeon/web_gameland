import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store.jsx';

export const EMOTES = ['묻고 더블로 가!', '싸늘하다...', '동작그만 밑장빼기냐?', '아수라발발타'];

/** 아바타 위(또는 아래)에 통통 튀어오르는 말풍선. 3초 뒤 서버 이벤트 없이 사라진다(스토어에서 제거 → exit 애니메이션). */
export function EmoteBubble({ userId, below = false }) {
  const { emotes } = useApp();
  const e = emotes[userId];
  return (
    <AnimatePresence>
      {e && (
        <motion.div
          key={e.key}
          className={`pointer-events-none absolute left-0 z-40 w-max max-w-[170px] ${below ? 'top-full mt-1' : 'bottom-full mb-1'}`}
          initial={{ scale: 0, y: below ? -12 : 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ opacity: 0, y: below ? 6 : -6, transition: { duration: 0.35 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 12 }}
        >
          <div className="relative rounded-2xl bg-white px-3 py-1.5 text-sm font-black text-slate-900 shadow-xl ring-2 ring-gold-400">
            {e.text}
            <span className={`absolute left-4 h-3 w-3 rotate-45 bg-white ring-gold-400 ${below ? '-top-1.5 ring-1' : '-bottom-1.5 ring-1'}`} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 프로필 영역의 이모티콘 버튼: 누르면 타짜 명대사 목록이 뜬다 */
export function EmoteButton({ disabled }) {
  const { send } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="btn btn-ghost !px-2 !py-0.5 text-base" title="타짜 대사" disabled={disabled} onClick={() => setOpen((o) => !o)}>
        😎
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            className="absolute bottom-full left-0 z-50 mb-1 w-48 space-y-1 rounded-xl bg-felt-800 p-2 shadow-2xl ring-1 ring-white/20"
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
          >
            {EMOTES.map((t) => (
              <li key={t}>
                <button
                  className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-left text-sm font-bold hover:bg-gold-500 hover:text-felt-900"
                  onClick={() => {
                    send('SEND_EMOTE', { text: t });
                    setOpen(false);
                  }}
                >
                  {t}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
