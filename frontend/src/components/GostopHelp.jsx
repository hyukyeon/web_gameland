import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cardImg } from '../cards.js';

const Mini = ({ id }) => <img src={cardImg(id)} alt="" draggable={false} className="h-[42px] w-[27px] rounded-sm object-fill shadow ring-1 ring-black/50" />;

/** 고스톱 규칙 (서버 GostopGame/score.js 기준) */
const SECTIONS = [
  {
    title: '점수 내기',
    rows: [
      { name: '광', ids: [0, 8, 28, 40, 44], desc: '3광 3점 (비광 포함 시 2점) · 4광 4점 · 5광 15점' },
      { name: '고도리', ids: [4, 12, 29], desc: '2·4·8월 새 세 장 5점' },
      { name: '홍단 / 청단 / 초단', ids: [1, 21, 13], desc: '같은 색 띠 세 장 각 3점 (홍단 1·2·3월, 청단 6·9·10월, 초단 4·5·7월)' },
      { name: '열끗(멍)', ids: [16, 20, 24], desc: '5장 1점, 한 장 늘 때마다 +1점' },
      { name: '띠', ids: [1, 5, 13], desc: '5장 1점, 한 장 늘 때마다 +1점' },
      { name: '피', ids: [2, 3, 41], desc: '10장 1점, 한 장 늘 때마다 +1점 · 쌍피(11·12월)는 2장으로 셈', note: '9월 국진(술잔)은 먹을 때 열끗/쌍피 중 직접 고르고, 고르지 않으면 유리한 쪽으로 자동 계산 (점수줄의 🍶 버튼으로 변경)' },
    ],
  },
  {
    title: '고 · 스톱',
    lines: [
      ['기준 점수', '2인(맞고) 7점, 3인 이상 3점부터 고/스톱을 고를 수 있어요.'],
      ['고', '1고 +1점, 2고 +2점, 3고부터는 ×2, ×4, ×8 … 로 배가 돼요. 고를 한 뒤에는 점수가 더 올라야 다시 고/스톱을 고를 수 있어요.'],
      ['스톱', '그 자리에서 판을 끝내고 점수 × 판돈을 받아요.'],
      ['나가리', '더미와 손패가 모두 떨어질 때까지 아무도 나지 못하면 무승부. (옵션: 다음 판 ×2 이월)'],
    ],
  },
  {
    title: '박 (진 사람 ×2)',
    lines: [
      ['피박', '이긴 사람이 피로 점수를 냈는데(10장 이상) 진 사람 피가 6장 미만'],
      ['광박', '이긴 사람이 광으로 점수를 냈는데 진 사람 광이 0장'],
      ['멍박', '이긴 사람의 열끗이 7장 이상'],
      ['고박', '고를 부른 사람이 지면 ×2 (3인 이상이면 독박)'],
      ['띠박', '(옵션) 이긴 사람의 띠가 5장 이상'],
      ['흔들기 · 폭탄', '이긴 사람이 흔들거나 폭탄을 한 번 할 때마다 ×2'],
    ],
  },
  {
    title: '뻑 · 따닥 · 쪽 · 싹쓸이',
    lines: [
      ['뻑', '낸 패로 바닥 한 장을 먹었는데 뒤집은 패도 같은 달이면 세 장이 바닥에 묶여요. 그 달 마지막 패로 가져가면 상대마다 피 1장 (내 뻑이면 자뻑, 2장). (옵션: 첫뻑 3점 · 연뻑 6점 지불, 삼연뻑은 즉시 승리)'],
      ['따닥', '바닥 두 장과 같은 달을 내고, 뒤집은 패도 그 달이면 네 장을 모두 먹고 상대마다 피 1장'],
      ['쪽', '바닥에 없는 패를 냈는데 뒤집은 패가 그 패와 짝이 맞으면 상대마다 피 1장'],
      ['싹쓸이', '바닥 패를 모두 쓸어 가면 상대마다 피 1장'],
      ['마지막 패', '마지막 차례의 따닥 · 쪽은 피를 받지 않아요.'],
    ],
  },
  {
    title: '흔들기 · 폭탄 · 총통',
    lines: [
      ['흔들기', '같은 달 3장을 손에 들고 있을 때 보여 주고 내면, 이기면 ×2'],
      ['폭탄', '손에 같은 달 3장 + 바닥에 1장 → 한 번에 내서 네 장을 먹고 상대마다 피 1장, 이기면 ×2'],
      ['총통', '(옵션) 첫 패에 같은 달 4장 → 바로 3점 승리 선언, 계속해서 이기면 ×4'],
    ],
  },
  {
    title: '3인 이상 규칙',
    lines: [
      ['광팔기', '첫 패에 광이 3장 이상이면 광을 팔고 이번 판을 쉴 수 있어요. 광 1장당 2점씩 받아요.'],
      ['쇼당', '두 상대가 모두 날 수 있는 점수일 때 내 차례에 한 번 부를 수 있어요. 둘 다 수락하면 나가리, 한 명이라도 받으면 계속하고 그 사람이 독박 책임을 져요.'],
      ['독박', '고를 부르고 진 사람, 또는 쇼당을 받은 사람이 지면 다른 패자 몫까지 혼자 내요.'],
      ['4인', '4명이 앉으면 한 명은 쉬고 3명이 쳐요.'],
    ],
  },
];

/** 고스톱 규칙 도움말. 게임은 계속 진행되고(배경 클릭 통과), 손패도 그대로 쓸 수 있다. */
export function GostopHelp({ onClose }) {
  const [open, setOpen] = useState(0);
  const toggle = (i) => setOpen((o) => (o === i ? null : i));
  return (
    <div className="pointer-events-none fixed inset-0 z-[45] flex items-start justify-center p-3 pt-12" role="dialog" aria-label="고스톱 규칙">
      <motion.div
        className="pointer-events-auto flex max-h-[60vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-felt-800/95 shadow-2xl ring-1 ring-white/25"
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92 }}
      >
        <div className="flex items-center justify-between border-b border-white/15 px-4 py-2">
          <h2 className="text-base font-black text-gold-400">❓ 고스톱 규칙</h2>
          <span className="hidden text-[11px] text-slate-300 sm:inline">게임은 계속 진행 중이에요</span>
          <button className="btn btn-ghost !px-3 !py-1" onClick={onClose} aria-label="닫기" data-hotkey="Escape" data-hotkey-label="Esc">✕ 닫기</button>
        </div>
        <div className="space-y-1.5 overflow-y-auto p-3 text-sm">
          {SECTIONS.map((s, i) => (
            <div key={s.title} className="overflow-hidden rounded-lg bg-white/5">
              <button className="flex w-full items-center justify-between px-3 py-2 text-left font-bold hover:bg-white/10" onClick={() => toggle(i)} aria-expanded={open === i}>
                <span>{s.title}</span>
                <span className="text-xs text-slate-400">{open === i ? '▲' : '▼'}</span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <tbody>
                        {s.rows?.map((r) => (
                          <tr key={r.name} className="border-t border-white/10 align-middle">
                            <td className="w-[100px] py-1.5 pl-3">
                              <div className="flex gap-0.5">{r.ids.slice(0, 3).map((id) => <Mini key={id} id={id} />)}</div>
                            </td>
                            <td className="px-2 py-1.5">
                              <b className="text-gold-400">{r.name}</b>
                              <div className="text-slate-200">{r.desc}</div>
                              {r.note && <div className="text-[11px] text-slate-400">{r.note}</div>}
                            </td>
                          </tr>
                        ))}
                        {s.lines?.map(([k, v]) => (
                          <tr key={k} className="border-t border-white/10 align-top">
                            <td className="w-[92px] whitespace-nowrap py-1.5 pl-3 font-bold text-gold-400">{k}</td>
                            <td className="px-2 py-1.5 text-slate-200">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-slate-400">받는 돈 = (점수 + 고 점수) × 배수 × 판돈. 진 사람이 가진 돈보다 많이 낼 수는 없어요. 옵션 규칙은 방장이 대기실에서 정해요.</p>
        </div>
      </motion.div>
    </div>
  );
}
