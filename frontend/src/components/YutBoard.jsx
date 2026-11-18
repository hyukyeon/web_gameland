import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'framer-motion';
import { useApp } from '../store.jsx';
import { won, signed } from '../cards.js';
import { Avatar, BotLevel } from './Avatar.jsx';
import { Chat } from './Chat.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { SettingsButton } from './Settings.jsx';
import { EmoteBubble, EmoteButton } from './Emote.jsx';
import { AutoToggle, TurnTimer, useCountdown } from './TurnTools.jsx';
import { hk } from '../keys.js';
import { sfx } from '../sound.js';
import { WAIT, DONE, XY, LINES, CORNERS, TEAM, THROW_NAME, THROW_STEPS } from '../yut.js';

const HOP_MS = 260; // 한 칸 '통' 뛰는 시간

// 던질 때마다 가락이 떨어지는 자리·각도를 다르게 (같은 던지기는 다시 그려도 같은 자리)
const jitter = (seed, i, k) => {
  const x = Math.sin((seed + 1) * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453;
  return x - Math.floor(x); // 0~1
};
const STICK_MS = 1450; // 손에서 떠나 멍석에 멈출 때까지

/**
 * 윷가락 4개 던지기: 손에 모아 흔들기 → 위로 던져 흩어지며 공중제비 → 멍석에 떨어져 통 튀고 → 데굴 굴러 멈춤.
 * 앞(평면, 밝은 나무)/뒤(곡면, 어두운 껍질)는 마지막 rotateX 로 정해진다. 그림자는 높이 뜰수록 작고 옅어진다.
 */
function Sticks({ throwInfo, reduce }) {
  const sticks = throwInfo.sticks?.length === 4 ? throwInfo.sticks : [true, false, true, false];
  const seed = throwInfo.seq ?? 0;
  return (
    <div className="relative h-[230px] w-[min(340px,88vw)]" style={{ perspective: 800 }} aria-hidden="true" data-testid="sticks">
      {/* 멍석 */}
      <div className="absolute inset-x-0 bottom-0 h-[150px] rounded-[50%] bg-[repeating-linear-gradient(90deg,#c08a3e_0_6px,#a8732c_6px_12px)] shadow-[inset_0_0_30px_rgba(0,0,0,.45),0_10px_30px_rgba(0,0,0,.5)] ring-4 ring-amber-900/70" />
      {sticks.map((flat, i) => {
        const fx = (i - 1.5) * 62 + (jitter(seed, i, 1) - 0.5) * 36; // 멈춘 자리 (가운데 기준 px)
        const fy = (jitter(seed, i, 2) - 0.5) * 34;
        const rz = (jitter(seed, i, 3) - 0.5) * 80; // 멈춘 각도
        const roll = (jitter(seed, i, 4) - 0.5) * 50; // 떨어진 뒤 굴러 가는 거리
        const spin = 2 + Math.floor(jitter(seed, i, 5) * 2); // 공중제비 바퀴 수
        const rx = 360 * spin + (flat ? 0 : 180);
        const land = { x: fx - roll, y: fy };
        return (
          <React.Fragment key={i}>
            {/* 그림자 */}
            <motion.div
              className="absolute bottom-[68px] left-1/2 h-4 w-20 -translate-x-1/2 rounded-[50%] bg-black/45 blur-[3px]"
              initial={reduce ? false : { x: 0, y: 60, rotate: 90, scale: 0.6, opacity: 0.5 }}
              animate={reduce ? { x: fx, y: fy, rotate: rz + 90, opacity: 1 } : { x: [0, 0, fx * 0.6, land.x, land.x, fx], y: [60, 60, fy, fy, fy, fy], rotate: [90, 90, 90 + rz, 90 + rz, 90 + rz, 90 + rz], scale: [0.6, 0.6, 0.25, 1, 0.75, 1], opacity: [0.5, 0.5, 0.15, 0.9, 0.7, 0.9] }}
              transition={reduce ? { duration: 0 } : { duration: STICK_MS / 1000, times: [0, 0.16, 0.5, 0.7, 0.8, 1], ease: 'easeOut' }}
            />
            <motion.div
              data-testid="stick"
              className="absolute bottom-[40px] left-1/2 -ml-[11px] h-[92px] w-[22px]"
              style={{ transformStyle: 'preserve-3d' }}
              // 시작값을 꼭 준다 (initial=false 면 마지막 키프레임으로 바로 가 버려 움직이지 않는다)
              initial={reduce ? false : { x: (i - 1.5) * 7, y: 70, rotateZ: (i - 1.5) * 6, rotateX: 0, scale: 0.8 }}
              animate={
                reduce
                  ? { x: fx, y: fy, rotateZ: rz, rotateX: flat ? 0 : 180 }
                  : {
                      // 손에 모음 → 흔들기 → 던져 올림 → 착지 → 통 튐 → 착지 → 굴러 멈춤
                      x: [(i - 1.5) * 7, (i - 1.5) * 7 + (i % 2 ? 4 : -4), fx * 0.6, land.x, land.x + roll * 0.2, land.x + roll * 0.4, fx],
                      y: [70, 64, -150 - i * 12, fy, fy - 26, fy, fy],
                      rotateZ: [(i - 1.5) * 6, (i - 1.5) * 6 - 8, rz * 0.4 + 180, rz + 360, rz + 360, rz + 360, rz + 360],
                      rotateX: [0, 0, rx * 0.55, rx, rx, rx, rx],
                      scale: [0.8, 0.82, 1.25, 1, 1.04, 1, 1],
                    }
              }
              transition={reduce ? { duration: 0 } : { duration: STICK_MS / 1000, delay: i * 0.03, times: [0, 0.16, 0.5, 0.7, 0.78, 0.86, 1], ease: ['easeInOut', 'easeOut', 'easeIn', 'easeOut', 'easeIn', 'easeOut'] }}
            >
              {/* 앞면: 평면(밝은 나무, 결 무늬) / 뒷면: 곡면(어두운 껍질). 빽도 가락(0번)은 평면에 표시 */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-200 via-amber-50 to-amber-300 shadow-lg ring-1 ring-amber-700/60" style={{ backfaceVisibility: 'hidden' }}>
                {i === 0 && <span className="absolute left-1/2 top-2.5 -translate-x-1/2 text-[10px] font-black text-red-600">빽</span>}
                <span className="absolute inset-x-1 top-1/3 h-px bg-amber-800/40" />
                <span className="absolute inset-x-1 top-2/3 h-px bg-amber-800/40" />
              </div>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-900 via-amber-700 to-amber-950 shadow-lg ring-1 ring-black/60" style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}>
                <span className="absolute inset-x-1.5 top-1/4 h-1 rounded-full bg-black/25" />
                <span className="absolute inset-x-1.5 top-3/4 h-1 rounded-full bg-black/25" />
              </div>
            </motion.div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** 던진 결과 팝업: 가락이 다 떨어진 뒤 결과 글자 */
function ThrowPopup({ throwInfo, nameOf, reduce, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, reduce ? 900 : STICK_MS + 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwInfo.seq]);
  const big = throwInfo.kind === 'yut' || throwInfo.kind === 'mo';
  return (
    <motion.div className="pointer-events-none fixed inset-0 z-[66] flex flex-col items-center justify-center gap-4 bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
      <div className="text-sm font-bold text-slate-200">{nameOf(throwInfo.pid)}님이 윷을 던졌어요</div>
      <Sticks throwInfo={throwInfo} reduce={reduce} />
      <motion.div
        className={`rounded-2xl px-6 py-2 font-black text-felt-900 shadow-2xl ${big ? 'bg-gradient-to-b from-yellow-200 to-amber-500 text-5xl' : 'bg-white text-4xl'}`}
        initial={{ scale: 0, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ delay: reduce ? 0 : STICK_MS / 1000 - 0.1, type: 'spring', stiffness: 360, damping: 13 }}
        data-testid="throw-name"
      >
        {THROW_NAME[throwInfo.kind]}!
      </motion.div>
    </motion.div>
  );
}

const nodeKind = (n) => (CORNERS.has(n) ? 'corner' : 'dot');

/** 윷판: 선·칸·말. shown = 화면에 보이는 말 위치(이동 연출 중에는 한 칸씩 갱신) */
function Board({ view, shown, selectable, selected, onPick, targets, targetExit, onTarget, reduce }) {
  const nodes = useMemo(() => Array.from({ length: 29 }, (_, i) => i), []);
  // 칸별로 같은 팀 말을 묶어 보여 준다 (업기 → 쌓아 올린 말 + ×n 배지)
  const stacks = useMemo(() => {
    const by = {};
    for (const p of view.pieces) {
      const pos = shown[p.id] ?? p.pos;
      if (pos === WAIT || pos === DONE) continue;
      (by[`${pos}:${p.team}`] ??= { node: Number(pos), team: p.team, ids: [] }).ids.push(p.id);
    }
    return by;
  }, [view.pieces, shown]);
  return (
    <div className="relative aspect-square w-full select-none rounded-2xl bg-gradient-to-br from-amber-200 to-amber-400 shadow-2xl ring-4 ring-amber-900/70" data-testid="yut-board">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {LINES.map((l, i) => (
          <polyline key={i} points={l.map((n) => XY[n].join(',')).join(' ')} fill="none" stroke="#7c4a14" strokeWidth="0.9" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      {nodes.map((n) => {
        const [x, y] = XY[n];
        const k = nodeKind(n);
        const isTarget = targets?.has(n);
        return (
          <button
            key={n}
            type="button"
            tabIndex={isTarget ? 0 : -1}
            disabled={!isTarget}
            onClick={() => onTarget(n)}
            aria-label={isTarget ? (n === 0 && targetExit ? '도착(말이 나감)' : n === 0 ? '참먹이(출발점)로 이동' : `${n}번 칸으로 이동`) : undefined}
            data-node={n}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition ${k === 'corner' ? 'h-[7.5%] w-[7.5%] border-2 border-amber-900 bg-amber-100' : 'h-[4.6%] w-[4.6%] border border-amber-900 bg-amber-700/70'} ${isTarget ? 'z-20 animate-pulse !bg-emerald-300 ring-4 ring-emerald-500' : ''}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {n === 0 && <span className="absolute inset-0 grid place-items-center text-[9px] font-black text-amber-900">출발</span>}
            {/* 참먹이를 넘어 나가는 이동이면 '나가기' 표시 (0 에 멈추는 이동과 구분) */}
            {isTarget && n === 0 && (
              <span className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1.5 text-[10px] font-black leading-5 text-white shadow ${targetExit ? 'bg-emerald-600' : 'bg-amber-700'}`}>
                {targetExit ? '나가기 ↗' : '참먹이'}
              </span>
            )}
          </button>
        );
      })}
      {Object.entries(stacks).map(([key, st]) => (
        <Token key={`s${key}`} node={st.node} team={st.team} ids={st.ids} selectable={selectable} selected={st.ids.some((i) => selected === i)} onPick={() => onPick(st.ids)} reduce={reduce} />
      ))}
    </div>
  );
}

/** 말 한 덩어리. 칸이 바뀌면 부드럽게 옮겨 가고, 이동할 때마다 통 뛴다. */
function Token({ node, team, ids, selectable, selected, onPick, reduce }) {
  const [x, y] = XY[node];
  const t = TEAM[team];
  const can = ids.some((i) => selectable.has(i));
  return (
    <motion.button
      type="button"
      layout={false}
      initial={false}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={reduce ? { duration: 0 } : { duration: HOP_MS / 1000 * 0.9, ease: 'easeInOut' }}
      onClick={() => can && onPick()}
      disabled={!can}
      aria-label={`${t.name}팀 말 ${ids.length}개${can ? ' — 선택' : ''}`}
      data-testid="token"
      data-team={team}
      data-node={node}
      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 ${can ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ width: '8.6%', height: '8.6%' }}
    >
      {/* 업힌 말: 말을 겹겹이 쌓아 올린 모양 + 개수 배지 (맨 위 말만 튄다) */}
      <motion.span key={node} className="relative block h-full w-full" animate={reduce ? {} : { y: [0, -12, 0] }} transition={{ duration: HOP_MS / 1000, ease: 'easeOut' }}>
        {ids.map((id, k) => {
          const top = k === ids.length - 1;
          return (
            <span
              key={id}
              data-testid="stack-piece"
              className={`absolute inset-0 rounded-full ring-2 ${top && selected ? 'ring-4 !ring-yellow-300' : ''} ${top && can && !selected ? 'animate-pulse' : ''}`}
              style={{
                transform: `translateY(${-k * 34}%) scale(${1 - k * 0.05})`,
                zIndex: k,
                background: `radial-gradient(circle at 35% 30%, ${t.ring}, ${t.fill} 60%)`,
                // 아래 말 위에 얹힌 느낌: 아래쪽 두께(진한 테) + 그림자
                boxShadow: `0 ${k ? 3 : 4}px 0 ${t.fill}, 0 ${k ? 5 : 7}px 8px rgba(0,0,0,.5)`,
                '--tw-ring-color': t.ring,
              }}
            >
              {top && <span className="absolute inset-[22%] rounded-full border-2 border-white/45" />}
            </span>
          );
        })}
        {ids.length > 1 && (
          <span className="absolute -right-2 z-10 rounded-full bg-black px-1 text-[10px] font-black leading-4 text-white ring-1 ring-white/70" style={{ top: `${-(ids.length - 1) * 34 - 8}%` }}>
            ×{ids.length}
          </span>
        )}
      </motion.span>
    </motion.button>
  );
}

/** 대기실(출발 전) 말과 도착한 말 */
function TeamTray({ team, view, shown, selectable, selected, onPick, active }) {
  const t = TEAM[team];
  const waiting = view.pieces.filter((p) => p.team === team && (shown[p.id] ?? p.pos) === WAIT);
  const done = view.pieces.filter((p) => p.team === team && (shown[p.id] ?? p.pos) === DONE).length;
  return (
    <div className={`flex items-center gap-2 rounded-xl bg-black/45 px-2 py-1 ring-2 ${active ? 'ring-gold-400' : 'ring-white/10'}`} data-testid={`tray-${team}`}>
      <span className="text-sm font-black" style={{ color: t.ring }}>{t.emoji} {t.name}팀</span>
      <span className="flex items-center gap-1" aria-label={`대기 말 ${waiting.length}개`}>
        {waiting.map((p) => (
          <button key={p.id} type="button" disabled={!selectable.has(p.id)} onClick={() => onPick([p.id])} aria-label={`${t.name}팀 대기 말${selectable.has(p.id) ? ' — 선택' : ''}`} data-testid="wait-piece" className={`h-6 w-6 rounded-full ring-2 ${selected === p.id ? '!ring-4 !ring-yellow-300' : ''} ${selectable.has(p.id) ? 'animate-pulse' : ''}`} style={{ background: `radial-gradient(circle at 35% 30%, ${t.ring}, ${t.fill} 60%)`, '--tw-ring-color': t.ring }} />
        ))}
        {waiting.length === 0 && <span className="text-[11px] text-slate-400">대기 없음</span>}
      </span>
      <span className="ml-auto whitespace-nowrap text-xs text-slate-200" data-testid={`done-${team}`}>🏁 {done}/4</span>
    </div>
  );
}

function PlayerChip({ pid, view, playerOf, nameOf, you, left, auto }) {
  const p = playerOf(pid);
  const isTurn = view.phase !== 'ended' && view.turn === pid;
  const t = TEAM[view.team[pid]];
  return (
    <div className={`flex items-center gap-2 rounded-full bg-black/55 py-1 pl-1 pr-3 ring-2 transition ${isTurn ? 'ring-gold-400 shadow-[0_0_14px_rgba(244,201,93,.8)]' : 'ring-white/15'} ${view.gone.includes(pid) ? 'opacity-40' : ''}`}>
      <span className="relative inline-flex">
        <Avatar player={p} size={32} showTitle />
        <EmoteBubble userId={pid} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1 text-xs font-bold">
          <span className="max-w-[100px] truncate">{nameOf(pid)}{pid === you && ' (나)'}</span>
          <BotLevel player={p} />
        </div>
        <div className="text-[11px]" style={{ color: t.ring }}>{t.emoji} {t.name}팀</div>
      </div>
      {isTurn && (left != null || auto) && <TurnTimer left={left} auto={auto} bot={!!p?.bot} />}
    </div>
  );
}

const fmtMs = (ms) => { const s = Math.round((ms ?? 0) / 1000); return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`; };

function Rules({ onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-[68] flex items-center justify-center bg-black/65 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-label="윷놀이 규칙" className="panel max-h-[90vh] w-full max-w-md space-y-2 overflow-y-auto bg-felt-800 p-5 text-sm" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gold-400">🎲 윷놀이 규칙</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-slate-200">
          <li>청🔵·홍🔴 두 팀이 번갈아 윷을 던져요. 팀마다 말은 4개, <b>말 4개를 먼저 모두 도착</b>시키면 승리!</li>
          <li><b>도 1칸 · 개 2칸 · 걸 3칸 · 윷 4칸 · 모 5칸</b>, 빽도는 한 칸 뒤로 — <b>도 자리에서 빽도가 나오면 참먹이(출발점)</b>로 가요(아직 안 나온 말은 못 움직여요).</li>
          <li><b>윷·모</b>가 나오거나 <b>상대 말을 잡으면</b> 한 번 더 던져요. 던진 결과는 쌓였다가 원하는 말에 나눠 쓸 수 있어요.</li>
          <li><b>잡기</b>: 상대 말이 있는 칸에 <u>멈추면</u> 그 말은 처음으로 돌아가요(업힌 말도 함께).</li>
          <li><b>업기</b>: 내 말이 있는 칸에 멈추면 한 덩어리(×2, ×3…)가 되어 같이 움직여요. 최대 4개.</li>
          <li><b>지름길</b>: 모서리(우상단·좌상단)나 중앙(방)에서 <u>출발</u>하면 대각선으로 가요. 지나치기만 하면 바깥 길 그대로예요.</li>
          <li><b>나가기</b>: 한 바퀴 돌아 <b>출발점(참먹이)</b>에 딱 멈추면 아직 판 위에 있어요(잡힐 수도 있어요). 참먹이를 <u>지나 한 칸이라도 더</u> 가야 말이 나가고 점수(🏁)가 올라요. 2:2일 땐 같은 팀 두 사람이 번갈아 던져요.</li>
        </ul>
        <button className="btn btn-gold w-full" onClick={onClose} {...hk('Escape', 'Esc')}>닫기</button>
      </motion.div>
    </motion.div>
  );
}

function ResultModal({ over, view, nameOf, you, onClose, onRematch }) {
  const res = over.result;
  const mineTeam = view.team[you];
  const spectator = mineTeam == null;
  const win = !spectator && res.winnerTeam === mineTeam;
  const t = TEAM[res.winnerTeam];
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-label="윷놀이 결과" className="panel w-full max-w-sm space-y-3 bg-felt-800 p-5 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <h2 className="text-2xl font-black text-gold-400">{spectator ? `${t.emoji} ${t.name}팀 승리` : win ? '🎉 우리 팀 승리!' : `${t.emoji} ${t.name}팀 승리`}</h2>
        <p className="text-sm text-slate-300">{res.kind === 'forfeit' ? '상대 팀이 모두 나가서 승리했어요.' : '말 4개가 모두 도착했어요!'}</p>
        <p className="text-xs text-slate-400" data-testid="yut-result-stats">총 {res.turns}차례 · 던지기 {res.throws}번 · 🏁 청 {res.score[0]} : 홍 {res.score[1]}</p>
        <div className="rounded-lg bg-black/30 p-2 text-sm">
          {over.result.winners.concat(over.result.losers).map((pid) => (
            <div key={pid} className="flex items-center justify-between gap-2 py-0.5">
              <span className="truncate font-bold">{TEAM[view.team[pid]].emoji} {nameOf(pid)}</span>
              <b className={(over.payout?.delta?.[pid] ?? 0) > 0 ? 'text-emerald-300' : (over.payout?.delta?.[pid] ?? 0) < 0 ? 'text-red-300' : 'text-slate-300'}>{signed(over.payout?.delta?.[pid] ?? 0)}원</b>
            </div>
          ))}
        </div>
        {over.ranked === false && <p className="text-xs text-slate-400">AI 연습 판이라 머니에는 반영되지 않아요.</p>}
        <p className="text-xs text-slate-400">참가비 {won(over.ante)}원 기준</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-gold" onClick={onRematch} {...hk('Enter r', 'Enter')}>🔁 한 판 더</button>
          <button className="btn btn-ghost" onClick={onClose} {...hk('Escape', 'Esc')}>대기실로</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function YutBoard() {
  const { room, user, yut: view, yutOver, turnInfo, skew, emit, send, roomChat, dismissYut } = useApp();
  const reduce = useReducedMotionConfig(); // 앱 애니메이션 설정을 따른다 (useReducedMotion 은 기기 설정만 본다)
  const you = user.id;
  const [chatOpen, setChatOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(null); // 고른 말 id
  const [popup, setPopup] = useState(null); // 던지기 연출 { …lastThrow }
  const [shown, setShown] = useState({}); // 이동 연출 중 보이는 위치 (pieceId → node). 비면 서버 상태 그대로
  const [animating, setAnimating] = useState(false);
  const [pending, setPending] = useState(false);
  const [sel, setSel] = useState(0); // 고른 결과(대기 중인 결과 칩 순번)
  const seen = useRef({ throw: view.lastThrow?.seq ?? 0, move: view.lastMove?.seq ?? 0 }); // 재접속 때 지난 연출을 다시 틀지 않는다
  const popupRef = useRef(null);
  const run = useRef(0);
  const left = useCountdown(turnInfo?.deadlineAt, skew);
  const nameOf = (pid) => room?.players.find((p) => p.id === pid)?.username ?? `플레이어${pid}`;
  const playerOf = (pid) => room?.players.find((p) => p.id === pid);
  const myTeam = view.team[you];
  const spectator = myTeam == null;
  const turnAuto = turnInfo?.auto;
  const playing = view.phase !== 'ended';
  const myTurn = playing && view.turn === you && !spectator;
  const busy = animating || !!popup;
  popupRef.current = popup;

  // 새 던지기 → 팝업, 새 이동 → 칸마다 통통 (서버 상태가 이미 도착해 있어도 연출이 끝나야 화면에 반영)
  useLayoutEffect(() => {
    const th = view.lastThrow;
    if (th && th.seq > seen.current.throw) {
      seen.current.throw = th.seq;
      setPopup(th);
      sfx(th.kind === 'yut' || th.kind === 'mo' ? 'combo' : 'flip');
    }
    const mv = view.lastMove;
    if (mv && mv.seq > seen.current.move) {
      seen.current.move = mv.seq;
      const my = ++run.current;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      if (!reduce) setAnimating(true); // 페인트 전에 '출발 칸' 으로 되돌려 놓는다 (깜빡임 방지)
      (async () => {
        // 던지기 팝업이 떠 있으면 닫힐 때까지 기다렸다가 움직인다
        while (popupRef.current && run.current === my) await sleep(60);
        if (!reduce) {
          let at = mv.from;
          for (const node of mv.path) {
            if (run.current !== my) return;
            at = node;
            const cur = {};
            for (const id of mv.pieceIds) cur[id] = node;
            setShown(cur);
            sfx('stoneW');
            await sleep(HOP_MS);
          }
          if (mv.captured?.length) { sfx('ppeok'); await sleep(200); }
          else if (at === 99) sfx('win');
        }
        if (run.current === my) { setShown({}); setAnimating(false); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.seq]);

  // 이동 연출 중에는 새 서버 상태의 '이동 전' 위치로 시작해야 하므로, 이동한 말은 출발 칸에서 시작한다
  const start = useMemo(() => {
    const m = view.lastMove;
    if (!animating || !m) return null;
    return Object.fromEntries(m.pieceIds.map((id) => [id, m.from]));
  }, [animating, view.lastMove]);
  const display = animating ? { ...(start ?? {}), ...shown } : {};
  // 잡힌 말은 연출이 끝나야 대기실로 돌아간다 (그 전엔 잡힌 칸에 그대로)
  if (animating && view.lastMove?.captured?.length) {
    const dest = view.lastMove.path[view.lastMove.path.length - 1];
    for (const id of view.lastMove.captured) display[id] = dest;
  }

  const legal = view.legal ?? [];
  const canAct = myTurn && !busy && !pending;
  const kindsLegal = useMemo(() => [...new Set(legal.map((m) => m.index))], [legal]);
  // 쓸 결과: 고른 칩이 불가능하면 첫 번째 가능한 결과로
  const idx = kindsLegal.includes(sel) ? sel : kindsLegal[0];
  const options = legal.filter((m) => m.index === idx);
  const selectable = new Set(canAct && view.phase === 'move' ? options.map((m) => m.pieceId) : []);
  const selMove = options.find((m) => m.pieceId === selected);
  // 목적지: 나가는(DONE) 이동도 출발점(0) 자리에 표시한다 — 0 에 멈추는 이동과는 targetExit 로 구분
  const targetExit = selMove?.path[selMove.path.length - 1] === DONE;
  const targets = selMove ? new Set([targetExit ? 0 : selMove.path[selMove.path.length - 1]]) : null;

  useEffect(() => { setSelected(null); }, [view.seq, idx]);
  useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);

  // 말 고르기: 업힌 칸의 말들은 대표 하나만 의미가 있다
  const pick = (ids) => {
    if (!canAct || view.phase !== 'move') return;
    const id = ids.find((i) => selectable.has(i));
    if (id == null) return;
    if (selected === id) return doMove(id);
    setSelected(id);
    sfx('click');
  };
  async function doMove(pieceId) {
    const m = options.find((o) => o.pieceId === pieceId);
    if (!m || pending) return;
    setPending(true);
    const r = await emit('yut:move', { pieceId, index: m.index });
    setPending(false);
    if (!r?.ok) setMsg(r?.error ?? '움직일 수 없어요');
    setSelected(null);
  }
  const onTarget = () => selected != null && doMove(selected);
  async function doThrow() {
    if (!canAct || view.phase !== 'throw') return;
    setPending(true);
    const r = await emit('yut:throw');
    setPending(false);
    if (!r?.ok) setMsg(r?.error ?? '던질 수 없어요');
  }

  // 결과
  useEffect(() => {
    if (!yutOver) return;
    const mine = view.team[you];
    if (mine == null) return;
    sfx(yutOver.result.winnerTeam === mine ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yutOver]);
  const rematch = () => { dismissYut(); emit('room:ready'); };

  const t = TEAM[view.curTeam];
  const status = !playing ? '게임 종료'
    : view.phase === 'throw' ? (myTurn ? (view.extraTurn > 0 ? `한 번 더! 윷을 던지세요 (추가 ${view.extraTurn})` : '내 차례 — 윷을 던지세요') : `${nameOf(view.turn)}님이 윷을 던질 차례`)
    : myTurn ? '말을 골라 움직이세요 (같은 말을 한 번 더 누르면 이동)' : `${nameOf(view.turn)}님이 말을 고르는 중`;
  const players = view.pids.filter((p) => room.players.some((x) => x.id === p));

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col gap-2 overflow-y-auto p-2" data-testid="yut-root">
      <div className="sr-only" role="status" aria-live="polite" data-testid="yut-live">{status}{view.lastThrow ? ` · 마지막 결과 ${view.lastThrow.name}` : ''}</div>
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="min-w-0 truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          🎲 {room.name} · 참가비 {won(view.ante)}원 · {view.turns}번째 차례
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button className="btn btn-gold whitespace-nowrap !px-3 !py-1" onClick={() => setHelp((h) => !h)} aria-label="규칙 보기" aria-pressed={help} {...hk('?')}>❓<span className="hidden sm:inline"> 규칙</span></button>
          {!spectator && <AutoToggle room={room} you={you} emit={emit} />}
          <SoundToggle />
          <SettingsButton />
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => setChatOpen((c) => !c)} aria-label="채팅" aria-pressed={chatOpen}>💬</button>
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => window.confirm('나가면 기권 처리됩니다 (팀원이 남아 있으면 AI 가 대신해요). 나갈까요?') && emit('room:leave')}>나가기</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {players.map((pid) => (
          <PlayerChip key={pid} pid={pid} view={view} playerOf={playerOf} nameOf={nameOf} you={you} left={view.turn === pid ? left : null} auto={turnAuto && view.turn === pid} />
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-[min(100%,calc(100vh-330px),640px)] gap-2">
        <TeamTray team={0} view={view} shown={display} selectable={selectable} selected={selected} onPick={pick} active={playing && view.curTeam === 0} />
        <Board view={view} shown={display} selectable={selectable} selected={selected} onPick={pick} targets={targets} targetExit={targetExit} onTarget={onTarget} reduce={reduce} />
        <TeamTray team={1} view={view} shown={display} selectable={selectable} selected={selected} onPick={pick} active={playing && view.curTeam === 1} />
      </div>

      <div className="relative z-[59] mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-x-2 gap-y-2 rounded-xl bg-black/45 p-2 text-sm">
        {!spectator && <EmoteButton game="yut" />}
        <span className="rounded px-2 py-1 font-bold" style={{ background: `${t.fill}99` }} data-testid="yut-status">{t.emoji} {status}</span>
        {view.pending.length > 0 && (
          <span className="flex items-center gap-1" role="group" aria-label="쓸 수 있는 결과">
            {view.pending.map((k, i) => {
              const usable = kindsLegal.includes(i);
              return (
                <button key={i} type="button" disabled={!canAct || !usable || view.phase !== 'move'} onClick={() => setSel(i)} aria-pressed={idx === i && view.phase === 'move'} data-testid="pending-chip"
                  className={`rounded-lg px-2.5 py-1 font-black ring-2 ${idx === i && view.phase === 'move' ? 'bg-gold-400 text-felt-900 ring-gold-200' : 'bg-white/90 text-felt-900 ring-white/30'} ${usable ? '' : 'opacity-50'}`}>
                  {THROW_NAME[k]} <span className="text-[10px] opacity-70">{THROW_STEPS[k]}</span>
                </button>
              );
            })}
          </span>
        )}
        {!spectator && playing && (
          <button className="btn btn-gold whitespace-nowrap !px-5 !py-1.5 text-base" disabled={!canAct || view.phase !== 'throw'} onClick={doThrow} data-testid="throw-btn" {...hk('t', 'T')}>
            🎲 윷 던지기{view.extraTurn > 0 && view.phase === 'throw' ? ` (+${view.extraTurn})` : ''}
          </button>
        )}
        {selected != null && canAct && (
          <button className="btn btn-gold whitespace-nowrap !px-3 !py-1 text-sm" onClick={() => doMove(selected)} data-testid="confirm-move">✔ 이동</button>
        )}
        <AnimatePresence>
          {msg && <motion.span role="alert" className="rounded bg-red-700 px-3 py-1 font-bold" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>🚫 {msg}</motion.span>}
        </AnimatePresence>
        {view.lastThrow && !popup && <span className="text-xs text-slate-300">마지막: {nameOf(view.lastThrow.pid)} · {view.lastThrow.name}{view.lastMove?.captured?.length ? ' · 잡았다!' : ''}</span>}
      </div>

      <AnimatePresence mode="wait">{popup && <ThrowPopup key={popup.seq} throwInfo={popup} nameOf={nameOf} reduce={reduce} onDone={() => setPopup(null)} />}</AnimatePresence>
      <AnimatePresence>{help && <Rules onClose={() => setHelp(false)} />}</AnimatePresence>
      <AnimatePresence>
        {chatOpen && (
          <motion.div className="absolute bottom-16 right-2 z-[65] h-64 w-72" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Chat className="h-full bg-felt-900/95" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{yutOver && !animating && !popup && <ResultModal key="over" over={yutOver} view={view} nameOf={nameOf} you={you} onClose={dismissYut} onRematch={rematch} />}</AnimatePresence>
    </div>
  );
}
