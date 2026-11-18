import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { EMOTE_CATS, EMOTE_SETS } from '../emotes.js';

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

let lastCat = 'praise'; // 마지막으로 연 상황 탭 (게임을 옮겨도 기억)

/** 말풍선 버튼: 누르면 상황별(칭찬·감탄·억울·자책·도발·재촉·인사) 탭과 그 게임에 맞춘 대사 목록이 뜬다 */
export function EmoteButton({ disabled, game = 'gostop' }) {
  const { send } = useApp();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(lastCat);
  const set = EMOTE_SETS[game] ?? EMOTE_SETS.gostop;
  const pick = (k) => {
    lastCat = k;
    setCat(k);
  };
  return (
    <div className="relative">
      <button className="btn btn-ghost !px-2 !py-0.5 text-base" title="말풍선" aria-label="말풍선 보내기" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)} data-testid="emote-btn">
        😎
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute bottom-full left-0 z-50 mb-1 w-[min(17rem,calc(100vw-2rem))] rounded-xl bg-felt-800 p-2 shadow-2xl ring-1 ring-white/20"
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            role="dialog"
            aria-label="말풍선 고르기"
          >
            <div className="mb-1.5 flex flex-wrap gap-1" role="tablist" aria-label="상황">
              {EMOTE_CATS.map((c) => (
                <button key={c.key} type="button" role="tab" aria-selected={cat === c.key} onClick={() => pick(c.key)} data-testid="emote-cat"
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${cat === c.key ? 'bg-gold-400 text-felt-900 ring-gold-200' : 'bg-white/10 text-slate-200 ring-white/15 hover:bg-white/20'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <ul className="space-y-1" role="tabpanel">
              {(set[cat] ?? []).map((t) => (
                <li key={t}>
                  <button
                    className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-left text-sm font-bold hover:bg-gold-500 hover:text-felt-900"
                    data-testid="emote-line"
                    onClick={() => {
                      send('SEND_EMOTE', { text: t });
                      setOpen(false);
                    }}
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
