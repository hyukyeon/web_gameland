import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'framer-motion';
import { useApp } from '../store.jsx';
import { won, signed } from '../cards.js';
import { Avatar, BotLevel } from './Avatar.jsx';
import { Chat } from './Chat.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { SettingsButton } from './Settings.jsx';
import { EmoteBubble, EmoteButton } from './Emote.jsx';
import { AutoToggle, BarLabel, TurnTimer, useCountdown } from './TurnTools.jsx';
import { JanggiPiece } from './JanggiPiece.jsx';
import { hk } from '../keys.js';
import { sfx } from '../sound.js';
import { W, H, FORMATIONS, NAME, SIDE, SIZE, xyOf } from '../janggi.js';

// 판 좌표: 교차점 간격 10, 가장자리 여백 6 → viewBox 92 × 102
const PAD = 6;
const STEP = 10;
const VW = PAD * 2 + STEP * (W - 1);
const VH = PAD * 2 + STEP * (H - 1);
const pctX = (x) => ((PAD + STEP * x) / VW) * 100;
const pctY = (y) => ((PAD + STEP * y) / VH) * 100;
const END_TEXT = { checkmate: '외통!', bikjang: '빅장 — 점수 판정', passes: '서로 한수 쉼 — 점수 판정', limit: '200수 — 점수 판정', resign: '기권' };

/** 판 선: 가로 10줄·세로 9줄, 궁성 대각선 */
function Lines() {
  const l = [];
  for (let y = 0; y < H; y++) l.push([0, y, W - 1, y]);
  for (let x = 0; x < W; x++) l.push([x, 0, x, H - 1]);
  for (const [a, b] of [[0, 2], [7, 9]]) {
    l.push([3, a, 5, b]);
    l.push([5, a, 3, b]);
  }
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
      {l.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={PAD + STEP * x1} y1={PAD + STEP * y1} x2={PAD + STEP * x2} y2={PAD + STEP * y2} stroke="#5b3a14" strokeWidth={x1 !== x2 && y1 !== y2 ? 0.35 : 0.45} />
      ))}
      <rect x={PAD} y={PAD} width={STEP * (W - 1)} height={STEP * (H - 1)} fill="none" stroke="#5b3a14" strokeWidth="0.8" />
    </svg>
  );
}

/** 상차림 고르기 창: 내 쪽에서 본 맨 아랫줄 미리보기 */
function SetupModal({ view, mySide, deadline, skew, onPick, chosen }) {
  const left = useCountdown(deadline, skew);
  const row = (f) => ['R', ...[...f].slice(0, 2).map((c) => (c === '마' ? 'N' : 'E')), 'A', null, 'A', ...[...f].slice(2).map((c) => (c === '마' ? 'N' : 'E')), 'R'];
  const oppSide = mySide === 'cho' ? 'han' : 'cho';
  return (
    <motion.div className="fixed inset-0 z-[67] flex items-center justify-center bg-black/65 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-label="상차림 고르기" className="panel w-full max-w-md space-y-3 bg-felt-800 p-4 text-center" initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
        <h2 className="text-xl font-black text-gold-400">상차림을 고르세요</h2>
        <p className="text-xs text-slate-300">
          나는 <b style={{ color: SIDE[mySide].light }}>{SIDE[mySide].name}({SIDE[mySide].hanja})</b>{mySide === 'cho' ? ' — 먼저 둬요' : ' — 덤 1.5점'} · 마(馬)와 상(象)의 자리를 정해요 {left != null && <b className="text-gold-400">· {left}초</b>}
        </p>
        <div className="grid gap-2">
          {FORMATIONS.map((f, i) => (
            <button key={f} type="button" disabled={!!chosen} onClick={() => onPick(f)} aria-pressed={chosen === f} className={`flex items-center gap-2 rounded-xl p-2 ring-2 transition ${chosen === f ? 'bg-amber-800/60 ring-gold-400' : 'bg-black/30 ring-white/10 hover:bg-white/10'}`} data-testid="formation" {...hk(String(i + 1), String(i + 1))}>
              <b className="w-16 shrink-0 text-sm">{f}</b>
              <span className="flex flex-1 justify-center gap-0.5">
                {row(f).map((t, k) => (t ? <JanggiPiece key={k} side={mySide} t={t} className="h-7 w-7" /> : <span key={k} className="w-7" />))}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{chosen ? `상대(${SIDE[oppSide].name})가 고르기를 기다리는 중…` : '시간이 지나면 첫 번째(마상마상)로 정해져요.'}</p>
        {view.formation?.[oppSide] && <p className="text-xs text-emerald-300">상대는 골랐어요</p>}
      </motion.div>
    </motion.div>
  );
}

function PlayerChip({ pid, view, playerOf, nameOf, you, left, auto }) {
  const p = playerOf(pid);
  const side = view.side[pid];
  const s = SIDE[side];
  const isTurn = view.phase === 'playing' && view.turn === pid;
  return (
    <div className={`flex items-center gap-2 rounded-full bg-black/55 py-1 pl-1 pr-3 ring-2 transition ${isTurn ? 'shadow-[0_0_14px_rgba(244,201,93,.8)] ring-gold-400' : 'ring-white/15'}`} data-testid="janggi-player">
      <span className="relative inline-flex">
        <Avatar player={p} size={32} showTitle />
        <EmoteBubble userId={pid} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1 text-xs font-bold">
          <JanggiPiece side={side} t="K" className="h-4 w-4" />
          <span className="max-w-[90px] truncate">{nameOf(pid)}{pid === you && ' (나)'}</span>
          <BotLevel player={p} />
        </div>
        <div className="text-[11px]" style={{ color: s.light }}>{s.name}({s.hanja}) · {view.score ? `${view.score[side]}점` : '—'}</div>
      </div>
      {isTurn && (left != null || auto) && <TurnTimer left={left} auto={auto} bot={!!p?.bot} />}
    </div>
  );
}

function Rules({ onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-[68] flex items-center justify-center bg-black/65 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-label="장기 규칙" className="panel max-h-[90vh] w-full max-w-md space-y-2 overflow-y-auto bg-felt-800 p-5 text-sm" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gold-400">♟️ 장기 규칙</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-slate-200">
          <li><b>초(楚)</b>가 먼저 두고 <b>한(漢)</b>은 덤 1.5점을 받아요. 상대 궁을 잡을 수밖에 없게 몰면(<b>외통</b>) 이겨요.</li>
          <li><b>궁·사</b>: 궁성 안에서 한 칸(대각선은 선을 따라) · <b>차</b>: 직선으로 막힐 때까지 · <b>포</b>: 말 하나를 넘어서 가요(포는 넘지도 잡지도 못해요).</li>
          <li><b>마</b>: 직선 한 칸 + 대각선 한 칸 · <b>상</b>: 직선 한 칸 + 대각선 두 칸 (가는 길이 막히면 못 가요) · <b>졸·병</b>: 앞이나 옆으로 한 칸.</li>
          <li>궁성 안에서는 차·포·졸도 대각선 선을 따라 움직일 수 있어요.</li>
          <li><b>장군</b>을 받으면 반드시 피해야 해요. 장군이 아닐 땐 <b>한수 쉼</b>도 돼요.</li>
          <li><b>빅장</b>: 두 궁이 사이에 아무것도 없이 마주 보게 되면, 상대가 바로 풀지 않으면 <b>남은 말 점수</b>로 판정(차13·포7·마5·상3·사3·졸2). 서로 연달아 쉬거나 200수가 되어도 점수 판정이에요.</li>
        </ul>
        <button className="btn btn-gold w-full" onClick={onClose} {...hk('Escape', 'Esc')}>닫기</button>
      </motion.div>
    </motion.div>
  );
}

function ResultModal({ over, view, nameOf, you, onClose, onRematch }) {
  const res = over.result;
  const spectator = !view.pids.includes(you);
  const win = res.winner === you;
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-label="장기 결과" className="panel w-full max-w-sm space-y-3 bg-felt-800 p-5 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <h2 className="text-2xl font-black text-gold-400">{spectator ? `🏆 ${nameOf(res.winner)} 승리` : win ? '🎉 승리!' : '😢 패배'}</h2>
        <p className="text-sm text-slate-300" data-testid="janggi-end-kind">{END_TEXT[res.kind] ?? res.kind} · {SIDE[res.winSide].name}({SIDE[res.winSide].hanja}) 승</p>
        {res.score && (
          <p className="text-sm">
            <b style={{ color: SIDE.cho.light }}>초 {res.score.cho}</b> : <b style={{ color: SIDE.han.light }}>한 {res.score.han}</b>
            <span className="ml-1 text-xs text-slate-400">(한 덤 1.5 포함 · {res.plies}수)</span>
          </p>
        )}
        <div className="rounded-lg bg-black/30 p-2 text-sm">
          {[res.winner, res.loser].map((pid) => {
            const d = over.payout?.delta?.[pid] ?? 0;
            return (
              <div key={pid} className="flex items-center justify-between gap-2 py-0.5">
                <span className="truncate font-bold">{SIDE[view.side[pid]].hanja} {nameOf(pid)}{pid === you && ' (나)'}</span>
                <b className={d > 0 ? 'text-emerald-300' : d < 0 ? 'text-red-300' : 'text-slate-300'}>{signed(d)}원</b>
              </div>
            );
          })}
        </div>
        {over.ranked === false && <p className="text-xs text-slate-400">AI 연습 판이라 머니에는 반영되지 않아요.</p>}
        <p className="text-xs text-slate-400">참가비 {won(over.ante)}원 · 다음 판은 초·한을 바꿔요</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-gold" onClick={onRematch} {...hk('Enter', 'Enter')}>🔁 한 판 더</button>
          <button className="btn btn-ghost" onClick={onClose} {...hk('Escape', 'Esc')}>대기실로</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function JanggiBoard() {
  const { room, user, janggi: view, janggiOver, turnInfo, skew, emit, send, roomChat, dismissJanggi } = useApp();
  const reduce = useReducedMotionConfig(); // 앱 애니메이션 설정을 따른다 (useReducedMotion 은 기기 설정만 본다)
  const you = user.id;
  const [chatOpen, setChatOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sel, setSel] = useState(null); // 고른 말의 칸
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState(null); // 장군·멍군·빅장 알림
  const seenSeq = useRef(view.last?.seq ?? 0);
  const left = useCountdown(turnInfo?.deadlineAt, skew);
  const nameOf = (pid) => room?.players.find((p) => p.id === pid)?.username ?? `플레이어${pid}`;
  const playerOf = (pid) => room?.players.find((p) => p.id === pid);
  const mySide = view.side[you] ?? null;
  const spectator = !mySide;
  const flip = mySide === 'han'; // 내 진영이 늘 아래
  const playing = view.phase === 'playing';
  const myTurn = playing && view.turn === you;
  const canAct = myTurn && !pending;
  const toScreen = (s) => {
    const [x, y] = xyOf(s);
    return flip ? [W - 1 - x, H - 1 - y] : [x, y];
  };

  // 새 수: 효과음 + 장군/빅장 알림
  useEffect(() => {
    const m = view.last;
    if (!m || m.seq <= seenSeq.current) return;
    seenSeq.current = m.seq;
    setSel(null);
    if (m.pass) sfx('flip');
    else sfx(m.captured ? 'capture' : m.side === 'cho' ? 'stoneB' : 'stoneW');
    if (m.check) { setBanner({ text: '장군!', key: m.seq, tone: 'red' }); sfx('alert'); }
    else if (m.bikjang) setBanner({ text: '빅장!', key: m.seq, tone: 'gold' });
    else if (m.pass) setBanner({ text: '한수 쉼', key: m.seq, tone: 'gray' });
  }, [view.last]);
  useEffect(() => {
    if (!banner) return undefined;
    const t = setTimeout(() => setBanner(null), 1300);
    return () => clearTimeout(t);
  }, [banner]);
  useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  useEffect(() => {
    if (!janggiOver || spectator) return;
    sfx(janggiOver.result.winner === you ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [janggiOver]);

  const legal = canAct ? view.legal ?? [] : [];
  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);
  const targets = useMemo(() => new Set(legal.filter((m) => m.from === sel).map((m) => m.to)), [legal, sel]);

  async function doMove(from, to) {
    setPending(true);
    const r = await emit('janggi:move', { from, to });
    setPending(false);
    setSel(null);
    if (!r?.ok) setMsg(r?.error ?? '둘 수 없어요');
  }
  // 내 말은 움직일 곳이 없어도 고를 수 있다 — 왜 못 움직이는지 알려 준다 (버그인지 헷갈리지 않게)
  const stuckNote = (t) => (view.check ? '장군을 받고 있어요 — 이 말로는 장군을 피할 수 없어요'
    : t === 'C' ? '포는 넘어갈 말(다리)이 하나 있어야 움직여요 — 지금은 갈 곳이 없어요'
    : '이 말은 지금 갈 곳이 없어요 (길이 막혔거나, 움직이면 내 궁이 장군을 받아요)');
  const clickSquare = (s) => {
    if (!canAct) return;
    if (sel != null && targets.has(s)) return doMove(sel, s);
    if (board[s]?.side === mySide) {
      const next = sel === s ? null : s;
      setSel(next);
      sfx('click');
      if (next != null && !movable.has(s)) setMsg({ note: true, text: stuckNote(board[s].t) });
      return undefined;
    }
    setSel(null);
    return undefined;
  };
  async function doPass() {
    setPending(true);
    const r = await emit('janggi:pass');
    setPending(false);
    if (!r?.ok) setMsg(r?.error ?? '쉴 수 없어요');
  }
  const resign = () => window.confirm('기권할까요? (지게 돼요)') && emit('janggi:resign');
  const rematch = () => { dismissJanggi(); emit('room:ready'); };

  const last = view.last && !view.last.pass ? view.last : null;
  const board = view.board ?? Array(W * H).fill(null);
  const kingInCheck = playing && view.check ? board.findIndex((p) => p && p.t === 'K' && p.side === view.side[view.turn]) : -1;
  const toMoveSide = playing ? view.side[view.turn] : null;
  const status = view.phase === 'setup' ? '상차림을 고르는 중…'
    : !playing ? '대국 종료'
    : myTurn ? (view.check ? '장군! 궁을 지키세요' : view.bikjang && view.bikjangBy && view.bikjangBy !== mySide ? '빅장! 풀지 않으면 점수로 판정돼요' : '내 차례 — 말을 골라 두세요')
    : `${nameOf(view.turn)}님(${SIDE[toMoveSide].name}) 차례`;
  const players = view.pids.filter((p) => room.players.some((x) => x.id === p));
  // 내 진영을 아래쪽 칩으로
  const [topPid, bottomPid] = spectator ? [view.pids[1], view.pids[0]] : [view.pids.find((p) => p !== you), you];

  const capturedRow = (side) => (
    <span className="flex min-h-[20px] flex-wrap items-center gap-0.5" aria-label={`${SIDE[side].name}가 잡은 말`}>
      {(view.captured?.[side] ?? []).map((t, i) => <JanggiPiece key={i} side={side === 'cho' ? 'han' : 'cho'} t={t} className="h-5 w-5 opacity-90" />)}
    </span>
  );

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col gap-2 overflow-y-auto p-2" data-testid="janggi-root">
      <div className="sr-only" role="status" aria-live="polite" data-testid="janggi-live">{status}</div>
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="min-w-0 truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          ♟️ {room.name} · 참가비 {won(view.ante)}원 · <b className="text-gold-400" data-testid="janggi-plies">{view.plies}/{view.maxPlies}수</b>
        </span>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button className="btn btn-gold whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => setHelp((h) => !h)} aria-label="규칙 보기" aria-pressed={help} {...hk('?')}><BarLabel icon="❓" text="규칙" /></button>
          {!spectator && <AutoToggle room={room} you={you} emit={emit} stacked />}
          <SoundToggle stacked />
          <SettingsButton stacked />
          <button className="btn btn-ghost whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => setChatOpen((c) => !c)} aria-label="채팅" aria-pressed={chatOpen}><BarLabel icon="💬" text="채팅" /></button>
          <button className="btn btn-ghost whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => window.confirm('나가면 기권 처리됩니다. 나갈까요?') && emit('room:leave')}><BarLabel icon="🚪" text="나가기" /></button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="mx-auto flex w-full max-w-[min(100%,calc((100vh-190px)*0.9))] flex-col gap-1.5">
          {players.includes(topPid) && (
            <div className="flex items-center justify-between gap-2">
              <PlayerChip pid={topPid} view={view} playerOf={playerOf} nameOf={nameOf} you={you} left={view.turn === topPid ? left : null} auto={turnInfo?.auto && view.turn === topPid} />
              {capturedRow(view.side[topPid])}
            </div>
          )}
          {/* 장기판 */}
          <div className="relative w-full select-none rounded-xl shadow-2xl ring-4 ring-amber-900/80" style={{ aspectRatio: `${VW} / ${VH}`, backgroundImage: 'linear-gradient(135deg,#f1cf8a,#dcae62 45%,#e8c27a 70%,#cf9d50)' }} data-testid="janggi-board">
            <Lines />
            {/* 마지막 수 표시 */}
            {last && [last.from, last.to].map((s, i) => {
              const [x, y] = toScreen(s);
              return <span key={`l${i}`} className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md ${i ? 'bg-sky-400/35 ring-2 ring-sky-500/70' : 'border-2 border-dashed border-sky-700/60'}`} style={{ left: `${pctX(x)}%`, top: `${pctY(y)}%`, width: '9%', height: '8.2%' }} />;
            })}
            {/* 빈 칸·도착 칸 (누를 수 있는 곳) */}
            {[...targets].map((s) => {
              const [x, y] = toScreen(s);
              const cap = !!board[s];
              return (
                <button key={`t${s}`} type="button" onClick={() => clickSquare(s)} aria-label={`${cap ? `${NAME[board[s].t]} 잡기` : '여기로 이동'} (${xyOf(s).join(',')})`} data-testid="janggi-target" data-sq={s}
                  className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full ${cap ? 'ring-4 ring-red-500/80' : 'bg-emerald-600/70 ring-2 ring-emerald-200'}`}
                  style={{ left: `${pctX(x)}%`, top: `${pctY(y)}%`, width: cap ? '10.5%' : '3.6%', height: cap ? '9.5%' : '3.2%' }} />
              );
            })}
            {/* 말 */}
            {board.map((p, s) => {
              if (!p) return null;
              const [x, y] = toScreen(s);
              const moved = last && last.to === s;
              const [fx, fy] = moved ? toScreen(last.from) : [x, y];
              const size = SIZE[p.t] * (STEP / VW) * 100;
              const canPick = movable.has(s); // 갈 곳이 있는 말 (빛남)
              const mine = canAct && p.side === mySide; // 내 말은 갈 곳이 없어도 고를 수 있다
              const picked = sel === s;
              return (
                <motion.button
                  key={moved ? `m${last.seq}` : `p${s}`}
                  type="button"
                  onClick={() => clickSquare(s)}
                  disabled={!canAct || (!mine && !targets.has(s))}
                  aria-label={`${SIDE[p.side].name} ${NAME[p.t]}${canPick ? ' — 고르기' : mine ? ' — 갈 곳 없음' : ''}`}
                  aria-pressed={mine ? picked : undefined}
                  data-movable={canPick}
                  data-testid="janggi-piece"
                  data-side={p.side}
                  data-t={p.t}
                  data-sq={s}
                  // 가운데 맞춤은 framer 의 x/y 로 (scale 을 애니메이션하면 Tailwind translate 클래스가 덮여 버린다)
                  className={`absolute rounded-[30%] ${targets.has(s) ? 'z-30' : 'z-10'} ${picked ? (canPick ? 'z-30 drop-shadow-[0_0_10px_rgba(253,224,71,1)]' : 'z-30 drop-shadow-[0_0_8px_rgba(148,163,184,1)]') : canPick ? 'cursor-pointer hover:drop-shadow-[0_0_8px_rgba(253,224,71,.9)]' : mine ? 'cursor-pointer' : 'cursor-default'} ${s === kingInCheck ? 'animate-pulse drop-shadow-[0_0_12px_rgba(239,68,68,1)]' : ''}`}
                  style={{ width: `${size}%`, aspectRatio: '1 / 1', x: '-50%', y: '-50%' }}
                  initial={moved && !reduce ? { left: `${pctX(fx)}%`, top: `${pctY(fy)}%` } : false}
                  animate={{ left: `${pctX(x)}%`, top: `${pctY(y)}%`, scale: picked ? 1.12 : 1 }}
                  transition={{ duration: reduce ? 0 : 0.32, ease: 'easeOut' }}
                >
                  <JanggiPiece side={p.side} t={p.t} className="h-full w-full drop-shadow-[0_3px_3px_rgba(0,0,0,.45)]" />
                </motion.button>
              );
            })}
            <AnimatePresence>
              {banner && (
                <motion.div key={banner.key} className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }} data-testid="janggi-banner">
                  <span className={`rounded-2xl px-6 py-2 text-4xl font-black shadow-2xl ring-4 ${banner.tone === 'red' ? 'bg-red-700 text-white ring-red-300' : banner.tone === 'gold' ? 'bg-amber-400 text-felt-900 ring-amber-100' : 'bg-slate-700 text-white ring-slate-300'}`}>{banner.text}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {players.includes(bottomPid) && (
            <div className="flex items-center justify-between gap-2">
              <PlayerChip pid={bottomPid} view={view} playerOf={playerOf} nameOf={nameOf} you={you} left={view.turn === bottomPid ? left : null} auto={turnInfo?.auto && view.turn === bottomPid} />
              {capturedRow(view.side[bottomPid])}
            </div>
          )}
        </div>

        {/* 옆 패널: 상태 · 점수 · 버튼 */}
        <div className="flex flex-col gap-2 self-start rounded-xl bg-black/45 p-2 text-sm ring-1 ring-white/10 md:w-full">
          <span className={`rounded px-2 py-1 text-center font-bold ${view.check && playing ? 'bg-red-800/80' : 'bg-black/40'}`} data-testid="janggi-status">{status}</span>
          {view.score && (
            <div className="flex justify-around rounded-lg bg-black/30 py-1 text-xs" aria-label="남은 말 점수">
              <span style={{ color: SIDE.cho.light }}>초 <b className="text-base">{view.score.cho}</b></span>
              <span style={{ color: SIDE.han.light }}>한 <b className="text-base">{view.score.han}</b> <span className="text-[10px] text-slate-400">(덤 1.5)</span></span>
            </div>
          )}
          {!spectator && playing && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-ghost !py-1.5" disabled={!canAct || view.check} onClick={doPass} data-testid="janggi-pass" title={view.check ? '장군일 때는 쉴 수 없어요' : '이번 차례를 쉽니다'}>⏸ 한수 쉼</button>
              <button className="btn btn-ghost !py-1.5 text-red-300" onClick={resign} data-testid="janggi-resign">🏳️ 기권</button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!spectator && <EmoteButton game="janggi" />}
            {view.last && <span className="text-xs text-slate-300" data-testid="janggi-last">{SIDE[view.last.side].name}: {view.last.pass ? '한수 쉼' : `${NAME[view.last.piece]}${view.last.captured ? ` → ${NAME[view.last.captured]} 잡음` : ' 이동'}`}{view.last.check ? ' · 장군' : ''}</span>}
          </div>
          <AnimatePresence>
            {msg && (
              <motion.span key={msg.text ?? msg} role={msg.note ? 'status' : 'alert'} data-testid="janggi-msg" className={`rounded px-3 py-1 text-center font-bold ${msg.note ? 'bg-slate-700 text-slate-100' : 'bg-red-700'}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {msg.note ? `ℹ️ ${msg.text}` : `🚫 ${msg}`}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {view.phase === 'setup' && !spectator && <SetupModal key="setup" view={view} mySide={mySide} deadline={view.setupDeadline} skew={skew} chosen={view.formation?.[mySide]} onPick={(f) => emit('janggi:setup', { formation: f }).then((r) => !r?.ok && setMsg(r?.error))} />}
      </AnimatePresence>
      <AnimatePresence>{help && <Rules onClose={() => setHelp(false)} />}</AnimatePresence>
      <AnimatePresence>
        {chatOpen && (
          <motion.div className="absolute bottom-16 right-2 z-[65] h-64 w-72" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Chat className="h-full bg-felt-900/95" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{janggiOver && !banner && <ResultModal key="over" over={janggiOver} view={view} nameOf={nameOf} you={you} onClose={dismissJanggi} onRematch={rematch} />}</AnimatePresence>
    </div>
  );
}
