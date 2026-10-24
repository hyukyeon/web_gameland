import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cardImg } from '../cards.js';
import { JOKBO_GROUPS, MATCHUP_ROWS } from './seotdaJokbo.js';

const Mini = ({ id }) => <img src={cardImg(id)} alt="" draggable={false} className="h-[42px] w-[27px] rounded-sm object-fill shadow ring-1 ring-black/50" />;

/**
 * 족보 도우미. 게임(소켓)은 계속 돌아가고, 배경은 반투명 + 클릭이 통과(pointer-events-none)하므로
 * 모달을 띄운 채로 내 패와 베팅 버튼을 그대로 쓸 수 있다. (내 패/버튼 영역은 오버레이 위 z-index 로 올려 둠)
 */
export function JokboHelp({ onClose }) {
  const [open, setOpen] = useState(0); // 아코디언: 열린 그룹 index (-1 = 상성표)
  const toggle = (i) => setOpen((o) => (o === i ? null : i));
  return (
    <div className="pointer-events-none fixed inset-0 z-[58] flex items-start justify-center bg-black/45 p-3 pt-12" role="dialog" aria-label="족보 도우미">
      <motion.div
        className="pointer-events-auto flex max-h-[46vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-felt-800/95 shadow-2xl ring-1 ring-white/25"
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92 }}
      >
        <div className="flex items-center justify-between border-b border-white/15 px-4 py-2">
          <h2 className="text-base font-black text-gold-400">❓ 족보 보기</h2>
          <span className="hidden text-[11px] text-slate-300 sm:inline">게임은 계속 진행 중이에요</span>
          <button className="btn btn-ghost !px-3 !py-1" onClick={onClose} aria-label="닫기">✕ 닫기</button>
        </div>
        <div className="space-y-1.5 overflow-y-auto p-3 text-sm">
          <p className="text-[11px] text-slate-400">강한 순서대로: 광땡 &gt; 땡 &gt; 중간 족보 &gt; 갑오 &gt; 끗 &gt; 망통</p>
          {JOKBO_GROUPS.map((g, i) => (
            <div key={g.title} className="overflow-hidden rounded-lg bg-white/5">
              <button className="flex w-full items-center justify-between px-3 py-2 text-left font-bold hover:bg-white/10" onClick={() => toggle(i)} aria-expanded={open === i}>
                <span>{g.title}</span>
                <span className="text-xs text-slate-400">{open === i ? '▲' : '▼'}</span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={r.name} className="border-t border-white/10 align-middle">
                            <td className="w-[64px] py-1.5 pl-3">
                              <div className="flex gap-0.5">{r.ids.map((id) => <Mini key={id} id={id} />)}</div>
                            </td>
                            <td className="px-2 py-1.5">
                              <b className="text-gold-400">{r.name}</b>
                              <div className="text-slate-200">{r.desc}</div>
                              {r.note && <div className="text-[11px] text-slate-400">{r.note}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          <div className="overflow-hidden rounded-lg bg-white/5">
            <button className="flex w-full items-center justify-between px-3 py-2 text-left font-bold hover:bg-white/10" onClick={() => toggle(-1)} aria-expanded={open === -1}>
              <span>특수 족보 상성표</span>
              <span className="text-xs text-slate-400">{open === -1 ? '▲' : '▼'}</span>
            </button>
            <AnimatePresence initial={false}>
              {open === -1 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-x-auto">
                  <table className="w-full min-w-[460px] text-left text-[11px]">
                    <thead className="bg-white/10 text-slate-300">
                      <tr>
                        <th className="px-2 py-1">패</th>
                        <th className="px-2 py-1">이기는 상대</th>
                        <th className="px-2 py-1">지는 상황</th>
                        <th className="px-2 py-1">못 잡으면</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MATCHUP_ROWS.map((r) => (
                        <tr key={r.hand} className="border-t border-white/10 align-top">
                          <td className="px-2 py-1.5 font-bold text-gold-400">{r.hand}</td>
                          <td className="px-2 py-1.5">{r.beats}</td>
                          <td className="px-2 py-1.5">{r.loses}</td>
                          <td className="px-2 py-1.5">{r.otherwise}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="pt-1 text-[11px] text-slate-400">같은 족보끼리는 비기며 팟을 나눠 가져요. 베팅: 다이 · 콜 · 하프(팟의 50%) · 삥(선만, 기본 판돈) · 따당(앞사람의 2배)</p>
        </div>
      </motion.div>
    </div>
  );
}
