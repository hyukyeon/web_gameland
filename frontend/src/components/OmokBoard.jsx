import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { won, signed } from '../cards.js';
import { Avatar, BotLevel } from './Avatar.jsx';
import { Chat } from './Chat.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { SettingsButton } from './Settings.jsx';
import { EmoteBubble, EmoteButton, OMOK_EMOTES } from './Emote.jsx';
import { AutoToggle, TurnTimer, useCountdown } from './TurnTools.jsx';
import { OnceHint } from './Tutorial.jsx';
import { useShortLandscape, useSettings } from '../settings.js';
import { hk } from '../keys.js';
import { sfx } from '../sound.js';
import { adjustSkill, getSkill, skillLabel } from '../omokSkill.js';

const N = 15;
const STARS = new Set(['3,3', '3,11', '7,7', '11,3', '11,11']); // 화점
const BLACK = 1;
const colName = (c) => (c === BLACK ? '흑' : '백');
const coord = (x, y) => `${String.fromCharCode(65 + x)}${y + 1}`; // A1 ~ O15
const LETTERS = 'ABCDEFGHIJKLMNO'.split('');
const PAD = 2.2; // 판 안쪽 여백(%) — 교차점 격자는 이 안쪽에 그려진다
const COORD_PX = 14; // 좌표 글자 영역 두께

// 판 테마(U6): 배경과 선 색
const THEMES = {
  wood: { bg: 'repeating-linear-gradient(92deg,rgba(120,70,20,.10) 0 3px,transparent 3px 9px),linear-gradient(135deg,#e7b866,#d9a24d 55%,#c98f3b)', line: '#3b2a14' },
  marble: { bg: 'repeating-linear-gradient(115deg,rgba(100,116,139,.10) 0 2px,transparent 2px 14px),linear-gradient(135deg,#f3f4f6,#d1d5db 55%,#e5e7eb)', line: '#4b5563' },
  dark: { bg: 'linear-gradient(135deg,#243044,#111827 70%)', line: '#8b9bb4' },
};
// 돌 스킨
const STONES = {
  classic: { 1: 'radial-gradient(circle at 32% 28%,#6b7280,#111827 55%,#000)', 2: 'radial-gradient(circle at 32% 28%,#fff,#e5e7eb 60%,#9ca3af)' },
  glass: { 1: 'radial-gradient(circle at 30% 24%,#d1d5db 0,#374151 16%,#030712 60%,#000)', 2: 'radial-gradient(circle at 30% 24%,#fff 0,#f1f5f9 28%,#cbd5e1 75%,#94a3b8)' },
  flat: { 1: '#111827', 2: '#f8fafc' },
};

/** 교차점 한 칸: 가운데를 지나는 십자선(가장자리 칸은 반 토막)을 배경으로 그린다 */
function lineBg(x, y, c) {
  // 가장자리 칸은 선이 교차점(가운데)에서 판 안쪽으로만 뻗는다: 왼쪽 끝 칸 = 오른쪽 절반, 오른쪽 끝 칸 = 왼쪽 절반
  const hEdge = x === 0 || x === N - 1;
  const vEdge = y === 0 || y === N - 1;
  const hx = x === 0 ? 'right' : 'left';
  const vy = y === 0 ? 'bottom' : 'top';
  return {
    backgroundImage: `linear-gradient(${c},${c}), linear-gradient(${c},${c})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${hEdge ? '50%' : '100%'} 1.5px, 1.5px ${vEdge ? '50%' : '100%'}`,
    backgroundPosition: `${hEdge ? hx : 'left'} center, center ${vEdge ? vy : 'top'}`,
  };
}

function Stone({ color, skin = 'classic', theme = 'wood', ghost = false, fresh = false, mark = false, win = false, num = null, last = false }) {
  const black = color === BLACK;
  const edge = black ? (theme === 'dark' ? 'ring-1 ring-white/30' : '') : 'ring-1 ring-black/25';
  return (
    <motion.span
      className={`absolute inset-[9%] flex items-center justify-center rounded-full ${edge} ${win ? '!ring-2 ring-emerald-400' : ''}`}
      style={{ background: STONES[skin][color], boxShadow: ghost ? 'none' : skin === 'flat' ? '0 1px 1px rgba(0,0,0,.45)' : '0 2px 3px rgba(0,0,0,.55)' }}
      // 새로 놓인 돌만 위에서 '탁' 떨어지는 느낌으로 (이미 있던 돌은 그대로)
      initial={fresh ? { scale: 1.7, y: -26, opacity: 0 } : false}
      animate={{ scale: 1, y: 0, opacity: ghost ? 0.45 : 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 17, mass: 0.7 }}
    >
      {num != null && (
        <span className={`select-none text-[clamp(7px,2.3vw,13px)] font-black leading-none ${last ? (black ? 'text-red-400' : 'text-red-600') : black ? 'text-white/85' : 'text-slate-700'}`} aria-hidden="true">{num}</span>
      )}
      {mark && <span className="absolute left-1/2 top-1/2 h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_4px_#ef4444]" aria-hidden="true" />}
    </motion.span>
  );
}

/** 위협 배지 한 칸 몫: 같은 칸에 여러 개면 4 > 3, 내 것 > 상대 것 */
function threatMapOf(threats, myColor) {
  const m = new Map();
  const rank = (t) => (t.kind === 'four' ? 2 : 0) + (myColor && t.color === myColor ? 1 : 0);
  for (const t of threats ?? []) {
    const k = `${t.x},${t.y}`;
    if (!m.has(k) || rank(t) > rank(m.get(k))) m.set(k, t);
  }
  return m;
}

function threatBadge(t, myColor) {
  const mine = myColor ? t.color === myColor : null;
  const cls = mine == null ? (t.color === BLACK ? 'bg-slate-900 text-white ring-1 ring-white/70' : 'bg-white text-slate-900 ring-1 ring-black/50') : mine ? 'bg-sky-500 text-white' : 'bg-red-500 text-white';
  const who = mine == null ? colName(t.color) : mine ? '내' : '상대';
  const what = t.kind === 'four' ? '4 (한 수만 더 두면 5목)' : '열린 3';
  return { cls, label: `${who} ${what}`, text: t.kind === 'four' ? '4' : '3' };
}

function Board({ view, myColor, canPlay, onCell, hint, sel, prefs, forbidSet, zoom = 1, readLabel }) {
  const [hover, setHover] = useState(null);
  const refs = useRef({});
  const reduce = useReducedMotion();
  const theme = THEMES[prefs.theme] ?? THEMES.wood;
  const winCells = useMemo(() => new Set((view.result?.line ?? []).map(([x, y]) => `${x},${y}`)), [view.result]);
  const lastKey = view.last ? `${view.last.x},${view.last.y}` : null;
  const numOf = useMemo(() => {
    const m = new Map();
    const total = view.moves?.length ?? 0;
    (view.moves ?? []).forEach(([x, y], i) => {
      if (prefs.numbers === 'all' || (prefs.numbers === 'last3' && i >= total - 3)) m.set(`${x},${y}`, i + 1);
    });
    return m;
  }, [view.moves, prefs.numbers]);
  const threatMap = useMemo(() => (prefs.threat && view.phase === 'playing' ? threatMapOf(view.threats, myColor) : new Map()), [view.threats, view.phase, prefs.threat, myColor]);
  const line = view.result?.kind === 'five' && view.result.line?.length >= 2 ? [view.result.line[0], view.result.line.at(-1)] : null;

  const onKey = (e, x, y) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      refs.current[`${e.key === 'Home' ? 0 : N - 1},${y}`]?.focus();
      return;
    }
    if (!d) return;
    e.preventDefault();
    const nx = Math.min(N - 1, Math.max(0, x + d[0]));
    const ny = Math.min(N - 1, Math.max(0, y + d[1]));
    refs.current[`${nx},${ny}`]?.focus();
  };

  const edge = prefs.coords ? COORD_PX : 0;
  const at = (i) => `calc(${PAD}% + (100% - ${PAD * 2}%) * ${(i + 0.5) / N})`;

  return (
    <div style={{ width: `${zoom * 100}%`, paddingLeft: edge, paddingTop: edge }}>
      <div
        className="relative aspect-square w-full rounded-lg shadow-[0_10px_30px_rgba(0,0,0,.65)] ring-2 ring-black/50"
        style={{ background: theme.bg, padding: `${PAD}%` }}
        role="grid"
        aria-label="오목판 15×15"
        onMouseLeave={() => setHover(null)}
      >
        {prefs.coords && (
          <>
            {LETTERS.map((l, i) => (
              <span key={l} className="pointer-events-none absolute -translate-x-1/2 select-none text-[9px] font-bold leading-none text-white/65 sm:text-[10px]" style={{ left: at(i), top: -(COORD_PX - 3) }} aria-hidden="true">{l}</span>
            ))}
            {Array.from({ length: N }, (_, i) => (
              <span key={i} className="pointer-events-none absolute -translate-y-1/2 select-none text-right text-[9px] font-bold leading-none text-white/65 sm:text-[10px]" style={{ top: at(i), left: -COORD_PX, width: COORD_PX - 3 }} aria-hidden="true">{i + 1}</span>
            ))}
          </>
        )}
        <div className="relative grid h-full w-full" style={{ gridTemplateColumns: `repeat(${N}, 1fr)`, gridTemplateRows: `repeat(${N}, 1fr)` }}>
          {Array.from({ length: N * N }, (_, i) => {
            const x = i % N;
            const y = Math.floor(i / N);
            const c = view.board[y][x];
            const key = `${x},${y}`;
            const isLast = key === lastKey;
            const free = c === 0 && canPlay;
            const forbidden = c === 0 && forbidSet.has(key);
            const th = c === 0 ? threatMap.get(key) : null;
            const badge = th ? threatBadge(th, myColor) : null;
            const num = numOf.get(key) ?? null;
            const isSel = sel && sel.x === x && sel.y === y;
            return (
              <button
                key={key}
                ref={(el) => { refs.current[key] = el; }}
                role="gridcell"
                type="button"
                data-cell={key}
                disabled={!free}
                tabIndex={free ? 0 : -1}
                aria-label={`${coord(x, y)} ${c ? `${colName(c)}돌${num ? ` ${num}수` : ''}${isLast ? ' (마지막 수)' : ''}` : '빈 자리'}${forbidden ? ' 금지 자리' : ''}${badge ? ` ${badge.label}` : ''}`}
                className="relative min-h-0 min-w-0 cursor-pointer p-0 outline-none focus-visible:z-10 focus-visible:bg-red-500/25 focus-visible:ring-4 focus-visible:ring-red-500 disabled:cursor-default"
                style={lineBg(x, y, theme.line)}
                onMouseEnter={() => setHover(key)}
                onFocus={() => { setHover(key); readLabel?.(x, y, c); }}
                onClick={() => free && onCell(x, y)}
                onKeyDown={(e) => onKey(e, x, y)}
              >
                {STARS.has(key) && c === 0 && <span className="absolute left-1/2 top-1/2 h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: theme.line }} aria-hidden="true" />}
                {c !== 0 && (
                  <Stone color={c} skin={prefs.stones} theme={prefs.theme} fresh={isLast && view.moveCount > 0} mark={isLast && view.phase === 'playing' && num == null} win={winCells.has(key)} num={num} last={isLast} />
                )}
                {c === 0 && !sel && free && hover === key && myColor && !forbidden && <Stone color={myColor} skin={prefs.stones} theme={prefs.theme} ghost />}
                {isSel && myColor && (
                  <>
                    <Stone color={myColor} skin={prefs.stones} theme={prefs.theme} ghost />
                    <motion.span className="pointer-events-none absolute inset-[4%] rounded-full ring-[3px] ring-gold-400" animate={reduce ? undefined : { scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 0.9 }} aria-hidden="true" />
                  </>
                )}
                {forbidden && (
                  <span className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(9px,2.8vw,17px)] font-black leading-none ${prefs.theme === 'dark' ? 'text-red-400' : 'text-red-600'}`} aria-hidden="true">✕</span>
                )}
                {badge && (
                  <span className={`pointer-events-none absolute inset-[26%] flex items-center justify-center rounded-full text-[clamp(7px,2vw,11px)] font-black leading-none opacity-90 ${badge.cls}`} title={badge.label} aria-hidden="true">{badge.text}</span>
                )}
                {hint && hint.x === x && hint.y === y && c === 0 && (
                  <motion.span className="pointer-events-none absolute inset-[6%] rounded-full ring-4 ring-sky-400" animate={{ scale: [1, 1.25, 1], opacity: [1, 0.55, 1] }} transition={{ repeat: Infinity, duration: 1.1 }} aria-hidden="true" />
                )}
                {isLast && view.phase === 'ended' && num == null && <span className="absolute left-1/2 top-1/2 z-[1] h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" aria-hidden="true" />}
              </button>
            );
          })}
          {line && (
            <svg className="pointer-events-none absolute inset-0 z-[2] h-full w-full" viewBox={`0 0 ${N} ${N}`} preserveAspectRatio="none" aria-hidden="true" data-testid="win-line">
              <motion.line
                x1={line[0][0] + 0.5} y1={line[0][1] + 0.5} x2={line[1][0] + 0.5} y2={line[1][1] + 0.5}
                stroke="#34d399" strokeWidth="0.26" strokeLinecap="round" opacity="0.9"
                initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerStrip({ pid, color, playerOf, nameOf, isTurn, left, auto, win, you, align = 'left' }) {
  const p = playerOf(pid);
  return (
    <div className={`flex items-center gap-2 rounded-full bg-black/55 py-1 pl-1 pr-3 ring-2 transition ${isTurn ? 'ring-gold-400 shadow-[0_0_14px_rgba(244,201,93,.8)]' : win ? 'ring-emerald-400' : 'ring-white/15'} ${align === 'right' ? 'flex-row-reverse pl-3 pr-1' : ''}`}>
      <span className="relative inline-flex">
        <Avatar player={p} size={34} showTitle />
        <EmoteBubble userId={pid} below={align === 'left'} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1 text-xs font-bold">
          <span className="max-w-[110px] truncate">{nameOf(pid)}{pid === you && ' (나)'}</span>
          <BotLevel player={p} />
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-300">
          <span className={`inline-block h-3 w-3 rounded-full ring-1 ring-white/40 ${color === BLACK ? 'bg-black' : 'bg-white'}`} aria-hidden="true" />
          {colName(color)} {color === BLACK && '· 선공'}
        </div>
      </div>
      {isTurn && (left != null || auto) && <TurnTimer left={left} auto={auto} />}
    </div>
  );
}

const TAG = { blunder: ['실수', 'bg-red-600'], mistake: ['악수', 'bg-amber-600'] };

/** 복기 분석 패널 (A9): 결과 창에서 눌러 AI 분석을 받는다 */
function Analysis({ moves, nameOf, view, emit }) {
  const [st, setSt] = useState({ phase: 'idle' });
  const run = async () => {
    setSt({ phase: 'loading' });
    const r = await emit('omok:analyze', { moves });
    setSt(r?.ok ? { phase: 'done', a: r.analysis } : { phase: 'error', msg: r?.error ?? '분석하지 못했어요.' });
  };
  if (st.phase === 'idle') return <button className="btn btn-ghost w-full text-sm" onClick={run}>🔍 AI 복기 분석</button>;
  if (st.phase === 'loading') return <p className="rounded-lg bg-black/30 p-2 text-xs text-slate-300" role="status">AI 가 수순을 분석하는 중…</p>;
  if (st.phase === 'error') return <p className="rounded-lg bg-red-900/60 p-2 text-xs" role="alert">{st.msg}</p>;
  const { rows, summary } = st.a;
  const bad = rows.filter((r) => r.tag).sort((x, y) => y.loss - x.loss).slice(0, 8).sort((x, y) => x.n - y.n);
  return (
    <div className="space-y-2 rounded-lg bg-black/30 p-2 text-left text-xs" aria-label="복기 분석 결과">
      <div className="grid grid-cols-2 gap-2">
        {[['black', view.black, '⚫'], ['white', view.white, '⚪']].map(([k, pid, icon]) => (
          <div key={k} className="rounded bg-white/5 p-1.5">
            <div className="truncate font-bold">{icon} {nameOf(pid)}</div>
            <div className="text-slate-300">정확도 <b className="text-gold-400">{summary[k].accuracy}%</b></div>
            <div className="text-slate-300">실수 {summary[k].blunders} · 악수 {summary[k].mistakes}</div>
          </div>
        ))}
      </div>
      {bad.length === 0 ? (
        <p className="text-center text-slate-300">눈에 띄는 실수가 없는 깔끔한 대국이에요 👏</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {bad.map((r) => (
            <li key={r.n} className="flex items-center justify-between gap-2">
              <span className="truncate">{r.n}수 {r.color === 1 ? '⚫' : '⚪'} {coord(r.x, r.y)}{r.bestWin ? ' (이길 수 있었어요)' : r.playedLose ? ' (지는 수)' : ''}</span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-slate-400">추천 {coord(r.bestX, r.bestY)}</span>
                <span className={`rounded px-1 font-black text-white ${TAG[r.tag][1]}`}>{TAG[r.tag][0]}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const fmtDuration = (ms) => {
  const sec = Math.max(0, Math.round((ms ?? 0) / 1000));
  return sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`;
};

/** 승리 컨페티 (움직임 줄이기 설정이면 생략) */
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ i, x: Math.random() * 100, d: 1.6 + Math.random() * 1.4, r: Math.random() * 540 - 270, c: ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#f87171'][i % 5], dl: Math.random() * 0.5 })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="confetti">
      {pieces.map((p) => (
        <motion.span key={p.i} className="absolute -top-3 h-2.5 w-1.5 rounded-sm" style={{ left: `${p.x}%`, background: p.c }} initial={{ y: -12, opacity: 1, rotate: 0 }} animate={{ y: 520, opacity: [1, 1, 0], rotate: p.r }} transition={{ duration: p.d, delay: p.dl, ease: 'easeIn' }} />
      ))}
    </div>
  );
}

function ResultModal({ over, view, nameOf, you, onClose, onRematch, emit, skillNote }) {
  const reduce = useReducedMotion();
  const res = over.result;
  const d = over.payout?.delta?.[you] ?? 0;
  const draw = res.winner == null;
  const mineWin = res.winner === you;
  const why = res.kind === 'forfeit' ? '상대가 기권해서 승리했어요.' : res.kind === 'full' ? '더 둘 자리가 없어 무승부예요.' : '오목 완성! (5개 연속)';
  const total = res.moveCount ?? view.moveCount;
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-label="대국 결과" className="panel relative max-h-[92vh] w-full max-w-sm space-y-3 overflow-y-auto bg-felt-800 p-5 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        {mineWin && !reduce && <Confetti />}
        <h2 className="text-2xl font-black text-gold-400">{draw ? '🤝 무승부' : mineWin ? '🎉 승리!' : res.winner ? `${nameOf(res.winner)} 승리` : '게임 종료'}</h2>
        <p className="text-sm text-slate-300">{res.kind === 'forfeit' && !mineWin && !draw ? '기권으로 졌어요.' : why}</p>
        <p className="text-xs text-slate-400" data-testid="result-stats">
          {!draw && `${colName(view.black === res.winner ? 1 : 2)}돌 ${nameOf(res.winner)} · `}총 {total}수 · 소요 {fmtDuration(res.elapsedMs)}
        </p>
        <div className="rounded-lg bg-black/30 p-2 text-sm">
          {view.black != null && [view.black, view.white].map((pid) => (
            <div key={pid} className="flex items-center justify-between gap-2 py-0.5">
              <span className="truncate font-bold">{pid === view.black ? '⚫' : '⚪'} {nameOf(pid)}</span>
              <b className={(over.payout?.delta?.[pid] ?? 0) > 0 ? 'text-emerald-300' : (over.payout?.delta?.[pid] ?? 0) < 0 ? 'text-red-300' : 'text-slate-300'}>{signed(over.payout?.delta?.[pid] ?? 0)}원</b>
            </div>
          ))}
        </div>
        {over.ranked === false && <p className="text-xs text-slate-400">AI 연습 판이라 머니·전적에는 반영되지 않아요.</p>}
        {skillNote && <p className="rounded bg-sky-900/60 px-2 py-1 text-xs" role="status">🎯 자동 난이도: {skillNote}</p>}
        {d !== 0 && <p className="text-xs text-slate-300">참가비 {won(over.ante)}원 기준</p>}
        {over.moves?.length > 1 && <Analysis moves={over.moves} nameOf={nameOf} view={view} emit={emit} />}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-gold" onClick={onRematch} {...hk('Enter r', 'Enter')}>🔁 한 판 더</button>
          <button className="btn btn-ghost" onClick={onClose} {...hk('Escape', 'Esc')}>대기실로</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Rules({ onClose, turnSec }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-label="오목 규칙" className="panel max-h-[85vh] w-full max-w-md space-y-2 overflow-y-auto bg-felt-800 p-5 text-sm" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gold-400">⚪⚫ 오목 규칙</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-200">
          <li>15×15 판의 교차점에 흑이 먼저, 백이 번갈아 한 수씩 둡니다.</li>
          <li>가로 · 세로 · 대각선으로 <b>같은 색 5개를 먼저 잇는</b> 쪽이 이깁니다.</li>
          <li>흑은 <b>쌍삼(3-3)</b>, <b>쌍사(4-4)</b>, <b>장목(6개 이상)</b> 자리에 둘 수 없어요 — 흑 차례에 판에 <b className="text-red-400">✕</b> 로 표시됩니다. 단, 그 수로 5목이 완성되면 허용.</li>
          <li>백은 6개 이상 이어져도 승리, 금지수가 없습니다.</li>
          <li>제한 시간({turnSec ?? 30}초)을 넘기면 AI가 대신 한 수 둡니다. 판돈은 진 사람이 이긴 사람에게 참가비만큼 줍니다.</li>
          <li><b>무르기</b>: AI 연습은 판당 3번 바로, 실전은 상대가 수락하면 사람당 판당 2번. <b>기권</b>은 방에 남은 채로 패배 처리돼요.</li>
          <li>키보드: 방향키로 이동, Enter/Space로 착수, U 무르기, H 힌트(연습). 모바일은 한 번 탭하면 미리보기, 한 번 더 탭하면 착수(설정에서 변경).</li>
          <li>설정(⚙️)에서 판 테마·돌 모양·수 번호·위협 표시·좌표를 바꿀 수 있어요.</li>
        </ul>
        <button className="btn btn-gold w-full" onClick={onClose}>닫기</button>
      </motion.div>
    </motion.div>
  );
}

const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
const useCoarsePointer = () => {
  const [coarse] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  return coarse;
};

export function OmokBoard() {
  const { room, user, omok: view, omokOver, omokUndo, turnInfo, skew, emit, send, roomChat, dismissOmok } = useApp();
  const st = useSettings();
  const coarse = useCoarsePointer();
  const [chatOpen, setChatOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState(null); // { text, kind: 'err' | 'info' }
  const you = user.id;
  const left = useCountdown(turnInfo?.deadlineAt, skew);
  const askLeft = useCountdown(omokUndo?.state === 'ask' ? omokUndo.deadlineAt : null, skew);
  const wide = useShortLandscape();
  const nameOf = (pid) => room?.players.find((p) => p.id === pid)?.username ?? `플레이어${pid}`;
  const playerOf = (pid) => room?.players.find((p) => p.id === pid);
  const spectator = view.black !== you && view.white !== you;
  const myColor = spectator ? null : view.black === you ? 1 : 2;
  const playing = view.phase === 'playing';
  const myTurn = playing && view.turn === you && !spectator;
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState(null); // { x, y } 추천 수 표시
  const [hintsLeft, setHintsLeft] = useState(3);
  const [skillNote, setSkillNote] = useState(null);
  const [sel, setSel] = useState(null); // 착수 확인 방식: 미리보기 중인 칸
  const [zoom, setZoom] = useState(1);
  const [live, setLive] = useState(''); // 스크린리더용 안내
  const prefs = { theme: st.omokTheme, stones: st.omokStones, numbers: st.omokNumbers, threat: st.omokThreat, coords: st.omokCoords };
  const confirmMode = st.omokConfirm === 'on' || (st.omokConfirm === 'auto' && coarse);
  const forbidSet = useMemo(() => new Set(myTurn && myColor === 1 ? (view.forbidden ?? []).map(([x, y]) => `${x},${y}`) : []), [view.forbidden, myTurn, myColor]);
  const myMoves = (view.moves ?? []).filter((_, i) => (i % 2 === 0 ? 1 : 2) === myColor).length;

  useEffect(() => { setPending(false); setHint(null); setSel(null); }, [view.moveCount]);
  useEffect(() => { if (!myTurn) setSel(null); }, [myTurn]);
  useEffect(() => { if (view.moveCount === 0) { setHintsLeft(3); setSkillNote(null); } }, [view.moveCount]);

  const note = (text, kind = 'err') => setMsg({ text, kind });
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  // 착수음 (흑/백 음색 구분) + 스크린리더 안내
  const prevCount = useRef(view.moveCount);
  useEffect(() => {
    if (view.moveCount > prevCount.current && view.last) {
      sfx(view.last.color === BLACK ? 'stoneB' : 'stoneW');
      setLive(`${colName(view.last.color)} ${coord(view.last.x, view.last.y)} 착수. ${view.phase === 'playing' ? (view.turn === you ? '내 차례입니다.' : '상대 차례입니다.') : '대국이 끝났습니다.'}`);
    }
    prevCount.current = view.moveCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.moveCount]);

  // 무르기 요청/결과 알림
  useEffect(() => {
    if (!omokUndo) return;
    if (omokUndo.state === 'granted') note(omokUndo.from === you ? '무르기 성공 — 다시 두세요' : '상대의 무르기를 받아들였어요', 'info');
    else if (omokUndo.state === 'declined') note(omokUndo.from === you ? '상대가 무르기를 거절했어요' : '무르기를 거절했어요', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [omokUndo]);

  // 초읽기: 내 차례 5초 이하일 때 삑 소리 + 진동 (C8)
  const turnAuto = turnInfo?.userId === view.turn && !!turnInfo.auto;
  useEffect(() => {
    if (myTurn && !turnAuto && left != null && left > 0 && left <= 5) sfx('urgent');
  }, [left, myTurn, turnAuto]);

  const rid = useRef(0);
  const place = async (x, y) => {
    if (!myTurn || pending) return;
    setPending(true);
    setSel(null);
    // 같은 rid 로 재전송해도 서버가 한 번만 둔다 (불안정한 네트워크 대비, C9)
    const id = `${you}-${Date.now().toString(36)}-${++rid.current}`;
    let r = await emit('omok:place', { x, y, rid: id });
    if (!r?.ok && r?.error === '서버 응답이 없습니다.') r = await emit('omok:place', { x, y, rid: id });
    if (!r?.ok) {
      setPending(false);
      note(r?.error ?? '둘 수 없는 자리입니다.');
      sfx('alert');
    }
  };

  const onCell = (x, y) => {
    if (!myTurn || pending) return;
    if (forbidSet.has(`${x},${y}`)) {
      setSel(null);
      note('흑은 ✕ 표시된 금지 자리(3-3 · 4-4 · 6목)에 둘 수 없어요');
      sfx('alert');
      return;
    }
    if (confirmMode && !(sel && sel.x === x && sel.y === y)) {
      setSel({ x, y });
      sfx('click');
      return;
    }
    place(x, y);
  };

  const practice = room?.ranked === false && !spectator;
  const adaptiveBot = room?.players.find((p) => p.bot && p.adaptive);
  const askHint = async () => {
    if (!myTurn || pending) return;
    const r = await emit('omok:hint');
    if (r?.ok) { setHint({ x: r.x, y: r.y }); setHintsLeft(r.left); sfx('click'); }
    else note(r?.error ?? '힌트를 쓸 수 없어요.');
  };
  const askUndo = async () => {
    const r = await emit('omok:undo');
    if (r?.ok && !practice) note('상대에게 무르기를 요청했어요', 'info');
  };
  const replyUndo = (accept) => emit('omok:undoReply', { accept });
  const resign = () => window.confirm('기권하면 이번 판은 패배로 처리됩니다. 기권할까요?') && emit('omok:resign');
  const rematch = () => {
    dismissOmok(); // 먼저 결과를 닫아야, 곧바로 시작되는 새 판의 오목판 상태를 지우지 않는다
    return emit('room:ready');
  };

  // 결과 효과음 + 자동 난이도 실력 갱신
  useEffect(() => {
    if (!omokOver) return;
    const d = omokOver.result.winner == null ? 0 : omokOver.result.winner === you ? 1 : -1;
    if (adaptiveBot && !spectator) {
      const before = getSkill();
      const after = adjustSkill(d > 0 ? 'win' : d < 0 ? 'lose' : 'draw');
      setSkillNote(`${skillLabel(before)} ${Math.round(before * 100)}점 → ${skillLabel(after)} ${Math.round(after * 100)}점`);
    }
    sfx(d > 0 ? 'win' : d < 0 ? 'lose' : 'draw');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [omokOver]);

  // 확대/축소 (U9): 버튼과 핀치. 확대할 때 보고 있던 중심을 유지한다
  const scrollRef = useRef(null);
  const prevZoom = useRef(1);
  const pinch = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prevZoom.current !== zoom) {
      const k = zoom / prevZoom.current;
      el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * k - el.clientWidth / 2;
      el.scrollTop = (el.scrollTop + el.clientHeight / 2) * k - el.clientHeight / 2;
    }
    prevZoom.current = zoom;
  }, [zoom]);
  const clampZoom = (z) => Math.min(2.6, Math.max(1, Math.round(z * 100) / 100));
  const onTouchStart = (e) => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), z: zoom }; };
  const onTouchMove = (e) => { if (pinch.current && e.touches.length === 2) setZoom(clampZoom((pinch.current.z * dist(e.touches)) / pinch.current.d)); };
  const onTouchEnd = (e) => { if (e.touches.length < 2) pinch.current = null; };

  const status = !playing ? '대국 종료' : spectator ? `${nameOf(view.turn)}님의 차례` : myTurn ? (sel ? '한 번 더 누르면 착수해요' : '내 차례입니다 — 교차점을 눌러 두세요') : `${nameOf(view.turn)}님이 생각 중…`;
  const top = spectator || view.black === you ? view.white : view.black;
  const bottom = spectator ? view.black : you;
  const colorOf = (pid) => (view.black === pid ? 1 : 2);
  const undoAsking = omokUndo?.state === 'ask';

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col gap-2 overflow-hidden p-2">
      <div className="sr-only" role="status" aria-live="polite" data-testid="omok-live">{live}</div>
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="min-w-0 truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          ⚪⚫ {room.name} · 참가비 {won(view.ante)}원 · {room.turnSec ?? 30}초 · {view.moveCount}수
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button className="btn btn-gold whitespace-nowrap !px-3 !py-1" onClick={() => setHelp((h) => !h)} aria-label="규칙 보기" aria-pressed={help} {...hk('?')}>
            ❓<span className="hidden sm:inline"> 규칙</span>
          </button>
          {!spectator && <AutoToggle room={room} you={you} emit={emit} />}
          <SoundToggle />
          <SettingsButton />
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => setChatOpen((c) => !c)} aria-label="채팅" aria-pressed={chatOpen}>💬</button>
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => window.confirm('나가면 이번 판은 기권 처리됩니다. 나갈까요?') && emit('room:leave')}>나가기</button>
        </div>
      </div>

      <div className={`relative flex min-h-0 flex-1 items-center justify-center gap-3 ${wide ? 'flex-row' : 'flex-col'}`}>
        <div className={wide ? 'flex flex-col justify-between gap-4 self-stretch py-2' : 'flex w-full max-w-[min(100%,calc(100vh-250px))] items-center justify-between'}>
          <PlayerStrip pid={top} color={colorOf(top)} playerOf={playerOf} nameOf={nameOf} isTurn={playing && view.turn === top} left={view.turn === top ? left : null} auto={turnAuto && view.turn === top} win={view.result?.winner === top} you={you} />
          {wide && <div className="text-center text-xs font-bold text-white/90">{status}</div>}
          {!wide && <span className="px-2 text-center text-xs font-bold text-white/90 sm:text-sm">{status}</span>}
          <PlayerStrip pid={bottom} color={colorOf(bottom)} playerOf={playerOf} nameOf={nameOf} isTurn={playing && view.turn === bottom} left={view.turn === bottom ? left : null} auto={turnAuto && view.turn === bottom} win={view.result?.winner === bottom} you={you} align={wide ? 'left' : 'right'} />
        </div>
        <div
          ref={scrollRef}
          data-testid="board-scroll"
          className={`${zoom > 1 ? 'overflow-auto' : 'overflow-hidden'} ${wide ? 'h-full max-h-[calc(100vh-70px)] aspect-square' : 'w-full max-w-[min(100%,calc(100vh-250px))]'}`}
          style={{ touchAction: 'pan-x pan-y' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <Board view={view} myColor={myColor} canPlay={myTurn && !pending} onCell={onCell} hint={hint} sel={sel} prefs={prefs} forbidSet={forbidSet} zoom={zoom} readLabel={(x, y, c) => !c && setLive(`${coord(x, y)} 빈 자리${forbidSet.has(`${x},${y}`) ? ', 금지 자리' : ''}`)} />
        </div>
        <OnceHint id="omok.play" show={myTurn && view.moveCount < 3} className="pointer-events-none absolute left-1/2 top-1 w-[min(92vw,420px)] -translate-x-1/2 [&_button]:pointer-events-auto">
          교차점을 눌러 돌을 놓아요. 가로·세로·대각선으로 5개를 먼저 이으면 승리! 흑은 ✕ 표시된 금지 자리(3-3·4-4·6목)에 둘 수 없어요.
        </OnceHint>
        <AnimatePresence>
          {undoAsking && !spectator && (
            <motion.div role="alert" data-testid="undo-banner" className="absolute inset-x-2 top-2 z-[62] mx-auto flex max-w-sm flex-wrap items-center justify-center gap-2 rounded-xl bg-indigo-700 px-3 py-2 text-sm font-bold text-white shadow-xl" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {omokUndo.from === you ? (
                <span>↩ 상대의 무르기 응답을 기다리는 중… {askLeft != null && `(${askLeft}초)`}</span>
              ) : (
                <>
                  <span>↩ {nameOf(omokUndo.from)}님이 무르기를 요청했어요 {askLeft != null && `(${askLeft}초)`}</span>
                  <button className="btn btn-gold !px-3 !py-0.5" onClick={() => replyUndo(true)}>수락</button>
                  <button className="btn btn-ghost !px-3 !py-0.5" onClick={() => replyUndo(false)}>거절</button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-[59] flex min-h-[40px] flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl bg-black/45 p-1.5 text-sm">
        {!spectator && <EmoteButton list={OMOK_EMOTES} />}
        {!spectator && playing && (
          <>
            <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1 text-sm" disabled={myMoves === 0 || undoAsking || pending} onClick={askUndo} title="내 마지막 수를 무릅니다 (연습 3번 · 실전은 상대가 수락해야 해요)" {...hk('u')}>
              ↩ 무르기
            </button>
            <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1 text-sm" onClick={resign} title="이번 판을 포기합니다">🏳️ 기권</button>
          </>
        )}
        {practice && playing && (
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1 text-sm" disabled={!myTurn || pending || hintsLeft <= 0} onClick={askHint} title="AI 가 추천하는 수를 알려 줘요 (연습 판당 3번)" {...hk('h')}>
            💡 힌트 ({hintsLeft})
          </button>
        )}
        <span className="flex items-center gap-1" role="group" aria-label="확대 축소">
          <button className="btn btn-ghost !px-2 !py-1 text-sm" aria-label="축소" disabled={zoom <= 1} onClick={() => setZoom((z) => clampZoom(z - 0.4))}>🔍−</button>
          <button className="btn btn-ghost !px-2 !py-1 text-sm" aria-label="확대" disabled={zoom >= 2.6} onClick={() => setZoom((z) => clampZoom(z + 0.4))}>🔍+</button>
        </span>
        {sel && myTurn && (
          <span className="flex items-center gap-1">
            <button className="btn btn-gold whitespace-nowrap !px-3 !py-1 text-sm" onClick={() => place(sel.x, sel.y)} data-testid="confirm-place">✔ {coord(sel.x, sel.y)} 에 두기</button>
            <button className="btn btn-ghost whitespace-nowrap !px-2 !py-1 text-sm" onClick={() => setSel(null)} aria-label="미리보기 취소">취소</button>
          </span>
        )}
        <AnimatePresence mode="wait">
          {msg ? (
            <motion.span key="err" role="alert" className={`rounded px-3 py-1 font-bold ${msg.kind === 'info' ? 'bg-indigo-700' : 'bg-red-700'}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{msg.kind === 'info' ? 'ℹ️' : '🚫'} {msg.text}</motion.span>
          ) : (
            <motion.span key="st" className="px-2 text-slate-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {view.last ? `마지막 수: ${colName(view.last.color)} ${coord(view.last.x, view.last.y)}` : '흑이 먼저 둡니다 (중앙 추천)'}
              {myTurn && myColor === 1 && ' · 흑은 3-3·4-4·장목 금지(✕)'}
              {prefs.threat && playing && !spectator && ' · 🔵 내 위협 🔴 상대 위협'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>{help && <Rules onClose={() => setHelp(false)} turnSec={room.turnSec} />}</AnimatePresence>
      <AnimatePresence>
        {chatOpen && (
          <motion.div className="absolute bottom-16 right-2 z-[65] h-64 w-72" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Chat className="h-full bg-felt-900/95" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{omokOver && <ResultModal key="over" over={omokOver} view={view} nameOf={nameOf} you={you} onClose={dismissOmok} onRematch={rematch} emit={emit} skillNote={skillNote} />}</AnimatePresence>
    </div>
  );
}
