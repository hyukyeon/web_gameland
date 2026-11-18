import React, { Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { won } from '../cards.js';
import { GAMES } from '../games.js';
import { lazyNamed } from '../lazy.js';
import { hk } from '../keys.js';
import { Loading } from './Loading.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { SettingsButton } from './Settings.jsx';
import { BarLabel } from './TurnTools.jsx';

const SlotMachine = lazyNamed(() => import('./SlotMachine.jsx'), 'SlotMachine');
const SudokuGame = lazyNamed(() => import('./SudokuGame.jsx'), 'SudokuGame');

// 혼자 하는 게임(REST): 방 목록 대신 '입장'하면 다른 게임처럼 전체 화면 게임 화면으로 들어간다
export const SOLO_GAMES = ['slot', 'sudoku'];

const RULES = {
  slot: [
    '한 번 돌리는 데 500원, 하루에 걸 수 있는 돈은 10,000원까지예요(자정·한국 시간에 초기화).',
    '세 릴이 같은 그림이면 당첨 — 그림마다 배당이 달라요. 표는 화면 아래에 있어요.',
    '결과는 서버가 정하고, 릴이 다 멈춘 뒤 머니에 반영돼요.',
  ],
  sudoku: [
    '가로줄·세로줄·굵은 3×3 칸마다 1~9 가 한 번씩 들어가게 빈칸을 채워요.',
    '칸을 누르고 아래 숫자판으로 입력해요(키보드 1~9, 지우기 0·X·Backspace, 방향키 이동).',
    '다 채우고 겹치는 숫자가 없으면 자동 제출 — 클리어마다 1,000원, 하루 10회까지 받아요.',
    '"저장하고 나가기"를 누르면 풀던 판과 걸린 시간이 저장돼 다음에 이어서 풀 수 있어요.',
  ],
};

/** 로비의 슬롯머신·스도쿠 탭: 게임 소개 + 오늘 현황 + 입장 버튼 */
export function SoloEntry({ game, onEnter }) {
  const { token } = useApp();
  const g = GAMES.find((x) => x.id === game);
  const [st, setSt] = useState(null);
  useEffect(() => {
    let off = false;
    (game === 'slot' ? api.slotStatus(token) : api.sudokuStatus(token)).then((r) => !off && setSt(r)).catch(() => {});
    return () => { off = true; };
  }, [game, token]);
  const resume = game === 'sudoku' && st?.current;
  return (
    <section className="panel flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 bg-black/65 p-6 text-center">
      <motion.div className="text-7xl" animate={{ rotate: [0, -6, 6, 0], y: [0, -6, 0] }} transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.5 }} aria-hidden="true">
        {g?.emoji}
      </motion.div>
      <h2 className="text-2xl font-black text-gold-400">{g?.name}</h2>
      <p className="max-w-sm text-sm text-slate-300">{g?.desc}</p>
      <p className="rounded-full bg-white/10 px-4 py-1 text-sm text-slate-200" aria-live="polite">
        {!st ? '오늘 현황 불러오는 중…' : game === 'slot' ? <>오늘 더 걸 수 있는 돈 <b className="text-gold-400">{won(st.slot?.left ?? 0)}원</b></> : <>오늘 남은 클리어 보상 <b className="text-gold-400">{st.sudoku?.left ?? 0}</b> / {st.sudoku?.limit ?? 10}회</>}
      </p>
      {resume && <p className="text-xs text-emerald-300">💾 저장해 둔 판이 있어요 — 들어가면 이어서 풀어요</p>}
      <button className="btn btn-gold mt-1 !px-8 !py-3 text-base" onClick={onEnter} {...hk('Enter', 'Enter')}>
        {resume ? '▶ 이어서 풀기' : '🚪 입장하기'}
      </button>
    </section>
  );
}

/** 혼자 하는 게임 화면: 위쪽 바(이름·머니·규칙·소리·설정·나가기) + 게임 */
export function SoloRoom({ game, onExit }) {
  const { user } = useApp();
  const g = GAMES.find((x) => x.id === game);
  const [help, setHelp] = useState(false);
  // 스도쿠는 나가기 전에 풀던 판을 저장한다 (게임이 저장 함수를 여기에 걸어 둔다)
  const beforeExit = useRef(null);
  const leave = () => (beforeExit.current ? beforeExit.current() : onExit());
  return (
    <div className="flex h-full flex-col bg-felt-900">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/50 px-3 py-2 text-sm">
        <h1 className="flex min-w-0 items-center gap-2 font-black">
          <span className="text-xl" aria-hidden="true">{g?.emoji}</span>
          <span className="truncate text-gold-400">{g?.name}</span>
          <span className="whitespace-nowrap text-xs font-bold text-slate-300">💰 {won(user.money)}원</span>
        </h1>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button className="btn btn-gold whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => setHelp((h) => !h)} aria-label="규칙 보기" aria-pressed={help} {...hk('?')}>
            <BarLabel icon="❓" text="규칙" />
          </button>
          <SoundToggle stacked />
          <SettingsButton stacked />
          <button className="btn btn-ghost whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={leave} aria-label={game === 'sudoku' ? '저장하고 나가기' : '나가기'}>
            <BarLabel icon="🚪" text="나가기" />
          </button>
        </div>
      </header>
      <AnimatePresence>
        {help && (
          <motion.div className="absolute inset-x-0 top-14 z-40 flex justify-center px-3" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="w-full max-w-md rounded-2xl bg-felt-800 p-4 text-left text-sm shadow-2xl ring-1 ring-white/20" role="dialog" aria-label={`${g?.name} 규칙`}>
              <div className="mb-2 flex items-center justify-between">
                <b className="text-gold-400">{g?.emoji} {g?.name} 규칙</b>
                <button className="btn btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setHelp(false)} aria-label="닫기">✕</button>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-slate-200">
                {RULES[game].map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col p-2 sm:p-3">
        <Suspense fallback={<Loading small />}>
          {game === 'slot' ? <SlotMachine /> : <SudokuGame onExit={onExit} exitRef={beforeExit} />}
        </Suspense>
      </main>
    </div>
  );
}
