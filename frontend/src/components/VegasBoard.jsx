import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'framer-motion';
import { useApp } from '../store.jsx';
import { won, signed } from '../cards.js';
import { Avatar, BotLevel } from './Avatar.jsx';
import { Chat } from './Chat.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { SettingsButton } from './Settings.jsx';
import { EmoteBubble, EmoteButton } from './Emote.jsx';
import { AutoToggle, BarLabel, TurnTimer, useCountdown } from './TurnTools.jsx';
import { hk } from '../keys.js';
import { sfx } from '../sound.js';
import { SEATS, NEUTRAL_SEAT, NEUTRAL, note, dollars, resolveCasino } from '../vegas.js';
import { Die } from './Die.jsx';

const ROLL_MS = 900; // 주사위가 데굴데굴 구르다 멈출 때까지
const PLACE_MS = 650; // 놓인 주사위가 카지노로 날아가 앉을 때까지

const rand = (seed, k) => {
  const x = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** 굴러가는 주사위: 눈이 빠르게 바뀌며 통통 튀다가 최종 눈에서 멈춘다 */
function RollingDie({ value, seat, seed, i, reduce, size, dim, glow }) {
  const [face, setFace] = useState(reduce ? value : 1 + Math.floor(rand(seed, i) * 6));
  useEffect(() => {
    if (reduce) return setFace(value);
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (n * 90 >= ROLL_MS - 120) {
        setFace(value);
        clearInterval(t);
      } else setFace(1 + Math.floor(rand(seed + n, i) * 6));
    }, 90);
    return () => clearInterval(t);
  }, [seed, value, reduce, i]);
  const spin = (rand(seed, i + 9) - 0.5) * 720;
  return (
    <motion.span
      className="inline-flex"
      data-testid="roll-die"
      data-value={value}
      initial={reduce ? false : { y: -60 - rand(seed, i + 3) * 40, x: (rand(seed, i + 5) - 0.5) * 80, rotate: spin, opacity: 0 }}
      animate={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
      transition={reduce ? { duration: 0 } : { duration: ROLL_MS / 1000, delay: i * 0.025, ease: [0.2, 0.8, 0.3, 1.15] }}
    >
      <Die value={face} seat={seat} size={size} dim={dim} glow={glow} />
    </motion.span>
  );
}

/** 지폐 한 장 (주인이 될 사람 색 띠) */
function Bill({ v, owner, seatOf }) {
  const s = owner == null ? null : owner === NEUTRAL ? NEUTRAL_SEAT : seatOf(owner);
  return (
    <span
      className="relative inline-flex h-6 min-w-[44px] items-center justify-center rounded-[4px] px-1.5 text-[11px] font-black text-emerald-950 shadow ring-1 ring-emerald-900/50"
      style={{ backgroundImage: 'linear-gradient(135deg,#bbf7d0,#4ade80 55%,#16a34a)' }}
      title={s ? `지금 ${s.name} 차지` : '아직 주인 없음'}
      data-testid="bill"
    >
      {note(v)}
      {s && <span className="absolute -bottom-1 left-1 right-1 h-1.5 rounded-full ring-1 ring-black/30" style={{ backgroundImage: `linear-gradient(${s.hi},${s.fill})` }} />}
    </span>
  );
}

/** 카지노 한 곳: 번호 주사위, 지폐(지금 가져갈 사람 표시), 놓인 주사위(자리별 개수, 동점 표시) */
function Casino({ c, view, seatOf, nameOf, target, picked, preview, onPick, flash, reduce }) {
  const { ranking, owner } = useMemo(() => resolveCasino(c.notes, c.dice, c.neutral), [c]);
  const rows = ranking.map((r) => ({ ...r, seat: r.who === NEUTRAL ? NEUTRAL_SEAT : seatOf(r.who) }));
  return (
    <motion.button
      type="button"
      disabled={!target}
      onClick={onPick}
      data-testid="casino"
      data-value={c.value}
      aria-label={`${c.value}번 카지노${target ? ` — 여기에 놓기 (주사위 ${preview.own}개${preview.neutral ? ` + 흰 주사위 ${preview.neutral}개` : ''})` : ''}`}
      aria-pressed={target ? picked : undefined}
      animate={flash && !reduce ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={{ duration: 0.45 }}
      className={`relative flex min-h-[132px] flex-col gap-1.5 rounded-xl p-2 text-left ring-2 transition ${picked ? 'bg-amber-900/70 ring-yellow-300' : target ? 'animate-pulse bg-black/45 ring-emerald-400' : flash ? 'bg-black/45 ring-gold-400' : 'bg-black/45 ring-white/10'}`}
      style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(255,215,120,.16), transparent 65%)' }}
      {...(target ? hk(String(c.value), String(c.value)) : {})}
    >
      <div className="flex items-center gap-2">
        <Die value={c.value} seat={{ fill: '#b45309', hi: '#fde68a', pip: '#450a0a' }} size={30} />
        <span className="text-xs font-black text-gold-400">카지노 {c.value}</span>
        {target && <span className="ml-auto rounded bg-emerald-600 px-1.5 text-[10px] font-black leading-5 text-white">+{preview.own}{preview.neutral ? ` ⚪${preview.neutral}` : ''}</span>}
      </div>
      <div className="flex flex-wrap gap-1 pb-1">
        {c.notes.map((v, i) => <Bill key={i} v={v} owner={owner[i]} seatOf={seatOf} />)}
      </div>
      <div className="flex flex-col gap-0.5">
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.div key={r.who} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={`flex items-center gap-1 text-[11px] ${r.tied ? 'text-red-300' : 'text-slate-100'}`} data-testid="casino-row">
              <Die value={c.value} seat={r.seat} size={16} dim={r.tied} />
              <b className="tabular-nums">×{r.count}</b>
              <span className="min-w-0 truncate text-slate-300">{r.who === NEUTRAL ? '흰색' : nameOf(r.who)}</span>
              {r.tied && <span className="ml-auto whitespace-nowrap rounded bg-red-700/80 px-1 text-[9px] font-black text-white">동점 취소</span>}
            </motion.div>
          ))}
        </AnimatePresence>
        {rows.length === 0 && <span className="text-[11px] text-slate-500">아직 주사위 없음</span>}
      </div>
    </motion.button>
  );
}

function PlayerChip({ pid, view, playerOf, nameOf, seat, you, left, auto }) {
  const p = playerOf(pid);
  const isTurn = (view.phase === 'roll' || view.phase === 'place') && view.turn === pid;
  const d = view.dice[pid];
  return (
    <div className={`flex items-center gap-2 rounded-full bg-black/55 py-1 pl-1 pr-3 ring-2 transition ${isTurn ? 'shadow-[0_0_14px_rgba(244,201,93,.8)] ring-gold-400' : 'ring-white/15'} ${view.gone.includes(pid) ? 'opacity-40' : ''}`} data-testid="vegas-player">
      <span className="relative inline-flex">
        <Avatar player={p} size={32} showTitle />
        <EmoteBubble userId={pid} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1 text-xs font-bold">
          <Die value={5} seat={seat} size={12} />
          <span className="max-w-[90px] truncate">{nameOf(pid)}{pid === you && ' (나)'}</span>
          <BotLevel player={p} />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <b className="text-emerald-300" data-testid="vegas-score">{dollars(view.scores[pid])}</b>
          <span title="남은 주사위">🎲{d.own}{view.neutralPer > 0 && ` ⚪${d.neutral}`}</span>
        </div>
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
      <motion.div role="dialog" aria-label="라스베가스 규칙" className="panel max-h-[90vh] w-full max-w-md space-y-2 overflow-y-auto bg-felt-800 p-5 text-sm" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gold-400">💵 라스베가스 규칙</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-slate-200">
          <li>카지노 6곳(1~6번)에 라운드마다 지폐가 <b>합계 $50k 이상</b> 깔려요. 모두 주사위 <b>8개</b>로 시작해 <b>4라운드</b>를 해요.</li>
          <li>내 차례: 남은 주사위를 <b>모두 굴린 뒤</b>, 나온 눈 하나를 골라 <b>그 눈의 주사위를 전부</b> 같은 번호 카지노에 놓아요.</li>
          <li>모두 다 놓으면 정산: 카지노마다 <b>주사위가 많은 순서</b>로 큰 지폐부터 한 장씩 가져가요.</li>
          <li><b>동점은 모두 취소!</b> 같은 개수를 놓은 사람끼리는 아무것도 못 받고, 다음 순위가 큰 지폐를 가져가요.</li>
          <li><b>흰 주사위(중립)</b>: 2인은 4개씩, 3인은 2개씩 내 주사위와 함께 굴려 같은 눈이면 같이 놓아요. 순위·동점에는 끼지만 돈은 못 받아서, 흰 주사위가 이긴 지폐는 버려져요.</li>
          <li>카지노 칸의 지폐 아래 색 띠 = <b>지금 그 지폐를 가져갈 사람</b>이에요. 4라운드 뒤 돈이 가장 많은 사람이 나머지 참가비를 받아요(공동 1등은 나눠요).</li>
        </ul>
        <button className="btn btn-gold w-full" onClick={onClose} {...hk('Escape', 'Esc')}>닫기</button>
      </motion.div>
    </motion.div>
  );
}

/** 라운드 정산 표: 카지노마다 누가 어떤 지폐를 가져갔나 + 이번 라운드 수익 */
function RoundTable({ lr, seatOf, nameOf, pids }) {
  return (
    <>
      <div className="grid gap-1.5 text-left text-xs sm:grid-cols-2">
        {lr.casinos.map((c) => (
          <div key={c.value} className="rounded-lg bg-black/30 p-1.5">
            <div className="mb-0.5 font-black text-gold-400">카지노 {c.value}</div>
            {c.ranking.length === 0 && <div className="text-slate-500">아무도 안 놓음{c.notes.length ? ` · ${c.notes.map(note).join(' ')} 버려짐` : ''}</div>}
            {c.ranking.map((r) => (
              <div key={r.who} className={`flex items-center gap-1 ${r.tied ? 'text-red-300 line-through decoration-red-400/70' : ''}`}>
                <Die value={c.value} seat={r.who === NEUTRAL ? NEUTRAL_SEAT : seatOf(r.who)} size={13} />
                <span className="min-w-0 truncate">{r.who === NEUTRAL ? '흰색' : nameOf(r.who)} ×{r.count}</span>
                <b className="ml-auto whitespace-nowrap">{r.tied ? '동점' : r.who === NEUTRAL ? (r.blocked ? `${note(r.blocked)} 막음` : '-') : r.note ? note(r.note) : '-'}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm">
        {pids.map((p) => (
          <span key={p} className="flex items-center gap-1">
            <Die value={6} seat={seatOf(p)} size={14} />
            {nameOf(p)} <b className="text-emerald-300">+{dollars(lr.gains[p] ?? 0)}</b>
          </span>
        ))}
      </div>
    </>
  );
}

function RoundModal({ lr, view, seatOf, nameOf, onClose }) {
  return (
    <motion.div className="fixed inset-0 z-[67] flex items-center justify-center bg-black/60 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-label="라운드 정산" data-testid="round-modal" className="panel max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto bg-felt-800 p-4 text-center" initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-black text-gold-400">💰 {lr.round}라운드 정산</h2>
        <RoundTable lr={lr} seatOf={seatOf} nameOf={nameOf} pids={view.pids} />
        <p className="text-xs text-slate-400">곧 {lr.round + 1}라운드가 시작돼요 (선은 다음 사람)</p>
        <button className="btn btn-gold w-full" onClick={onClose} {...hk('Enter Escape', 'Enter')}>확인</button>
      </motion.div>
    </motion.div>
  );
}

function ResultModal({ over, view, seatOf, nameOf, you, onClose, onRematch }) {
  const res = over.result;
  const spectator = !view.pids.includes(you);
  const win = res.winners.includes(you);
  const lr = view.lastRound;
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-label="라스베가스 결과" className="panel max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto bg-felt-800 p-4 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <h2 className="text-2xl font-black text-gold-400">{spectator ? `🏆 ${res.winners.map(nameOf).join(', ')} 승리` : win ? (res.winners.length > 1 ? '🤝 공동 1등!' : '🎉 1등! 잭팟!') : `🏆 ${res.winners.map(nameOf).join(', ')} 승리`}</h2>
        {res.kind === 'forfeit' && <p className="text-sm text-slate-300">다른 사람이 모두 나가서 끝났어요.</p>}
        <div className="rounded-lg bg-black/30 p-2 text-sm" data-testid="vegas-standings">
          {res.standings.map((pid, i) => {
            const d = over.payout?.delta?.[pid] ?? 0;
            return (
              <div key={pid} className="flex items-center gap-2 py-0.5">
                <span className="w-5 text-right font-black text-slate-400">{i + 1}</span>
                <Die value={6} seat={seatOf(pid)} size={16} />
                <span className="min-w-0 flex-1 truncate text-left font-bold">{nameOf(pid)}{pid === you && ' (나)'}</span>
                <span className="text-emerald-300">{dollars(res.scores[pid])}</span>
                <b className={`w-20 text-right ${d > 0 ? 'text-emerald-300' : d < 0 ? 'text-red-300' : 'text-slate-300'}`}>{signed(d)}원</b>
              </div>
            );
          })}
        </div>
        {lr && res.kind !== 'forfeit' && (
          <details className="rounded-lg bg-black/20 p-2 text-left">
            <summary className="cursor-pointer text-sm font-bold text-slate-200">{lr.round}라운드(마지막) 정산 보기</summary>
            <div className="mt-2 space-y-2"><RoundTable lr={lr} seatOf={seatOf} nameOf={nameOf} pids={view.pids} /></div>
          </details>
        )}
        {over.ranked === false && <p className="text-xs text-slate-400">AI 연습 판이라 머니에는 반영되지 않아요.</p>}
        <p className="text-xs text-slate-400">참가비 {won(over.ante)}원 · 1등이 나머지 참가비를 받아요</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-gold" onClick={onRematch} {...hk('Enter r', 'Enter')}>🔁 한 판 더</button>
          <button className="btn btn-ghost" onClick={onClose} {...hk('Escape', 'Esc')}>대기실로</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function VegasBoard() {
  const { room, user, vegas: view, vegasOver, turnInfo, skew, emit, send, roomChat, dismissVegas } = useApp();
  const reduce = useReducedMotionConfig(); // 앱 애니메이션 설정을 따른다 (useReducedMotion 은 기기 설정만 본다)
  const you = user.id;
  const [chatOpen, setChatOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState(null);
  const [picked, setPicked] = useState(null); // 고른 눈(카지노 번호)
  const [pending, setPending] = useState(false);
  const [rolling, setRolling] = useState(false); // 굴리는 연출 중
  const [flash, setFlash] = useState(null); // 방금 주사위가 놓인 카지노 { value, seq }
  const [roundShown, setRoundShown] = useState(view.lastRound?.round ?? 0); // 이미 본 라운드 정산
  const [roundOpen, setRoundOpen] = useState(null);
  const seen = useRef({ roll: view.roll?.seq ?? 0, place: view.lastPlace?.seq ?? 0 });
  const left = useCountdown(turnInfo?.deadlineAt, skew);
  const nameOf = (pid) => room?.players.find((p) => p.id === pid)?.username ?? `플레이어${pid}`;
  const playerOf = (pid) => room?.players.find((p) => p.id === pid);
  const seatOf = (pid) => SEATS[Math.max(0, view.pids.indexOf(pid)) % SEATS.length];
  const spectator = !view.pids.includes(you);
  const playing = view.phase === 'roll' || view.phase === 'place';
  const myTurn = playing && view.turn === you && !spectator;
  const canAct = myTurn && !pending && !rolling;

  // 새 굴림 → 굴리는 연출, 새 배치 → 카지노 반짝 + 효과음, 라운드 끝 → 정산 창
  useLayoutEffect(() => {
    const r = view.roll;
    if (r && r.seq > seen.current.roll) {
      seen.current.roll = r.seq;
      sfx('shake');
      if (!reduce) {
        setRolling(true);
        const t = setTimeout(() => { setRolling(false); sfx('chip'); }, ROLL_MS);
        return () => clearTimeout(t);
      }
    }
    const pl = view.lastPlace;
    if (pl && pl.seq > seen.current.place) {
      seen.current.place = pl.seq;
      seen.current.roll = Math.max(seen.current.roll, pl.roll?.seq ?? 0);
      setRolling(false);
      setFlash({ value: pl.value, seq: pl.seq });
      sfx('place');
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.seq]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), PLACE_MS + 400);
    return () => clearTimeout(t);
  }, [flash]);
  // 라운드 정산: 놓는 연출이 끝난 뒤 띄우고, 다음 라운드가 시작되면 닫는다 (마지막 라운드는 결과 창에서)
  useEffect(() => {
    const lr = view.lastRound;
    if (!lr || lr.round <= roundShown) return undefined;
    if (view.phase === 'ended') { setRoundShown(lr.round); return undefined; }
    const t = setTimeout(() => { setRoundShown(lr.round); setRoundOpen(lr); sfx('sale'); }, reduce ? 0 : PLACE_MS + 300);
    return () => clearTimeout(t);
  }, [view.lastRound, view.phase, roundShown, reduce]);
  useEffect(() => { if (view.phase === 'roll' && roundOpen && view.round + 1 > roundOpen.round) setRoundOpen(null); }, [view.phase, view.round, roundOpen]);
  useEffect(() => { setPicked(null); }, [view.seq]);
  useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  useEffect(() => {
    if (!vegasOver || spectator) return;
    sfx(vegasOver.result.winners.includes(you) ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vegasOver]);

  const legal = view.phase === 'place' ? view.legal ?? [] : [];
  const countIn = (arr, v) => (arr ?? []).filter((f) => f === v).length;
  const preview = (v) => ({ own: countIn(view.roll?.own, v), neutral: countIn(view.roll?.neutral, v) });

  async function doRoll() {
    if (!canAct || view.phase !== 'roll') return;
    setPending(true);
    const r = await emit('vegas:roll');
    setPending(false);
    if (!r?.ok) setMsg(r?.error ?? '굴릴 수 없어요');
  }
  async function doPlace(v) {
    if (!canAct || !legal.includes(v)) return;
    setPending(true);
    const r = await emit('vegas:place', { value: v });
    setPending(false);
    setPicked(null);
    if (!r?.ok) setMsg(r?.error ?? '놓을 수 없어요');
  }
  // 카지노/주사위 묶음 누르기: 한 번 = 고르기, 같은 걸 한 번 더 = 놓기
  const pick = (v) => {
    if (!canAct || !legal.includes(v)) return;
    if (picked === v) return doPlace(v);
    setPicked(v);
    sfx('click');
    return undefined;
  };
  const rematch = () => { dismissVegas(); emit('room:ready'); };

  // 굴림 표시: 지금 굴린 주사위(놓기 전) 또는 방금 놓은 차례의 굴림(놓은 눈만 밝게)
  const shownRoll = view.roll ?? (view.lastPlace ? view.lastPlace.roll : null);
  const placedValue = view.roll ? null : view.lastPlace?.value;
  const rollSeat = shownRoll ? seatOf(shownRoll.pid) : null;
  const groups = useMemo(() => {
    if (!shownRoll) return [];
    return [1, 2, 3, 4, 5, 6]
      .map((v) => ({ v, own: countIn(shownRoll.own, v), neutral: countIn(shownRoll.neutral, v) }))
      .filter((g) => g.own + g.neutral > 0);
  }, [shownRoll]);

  const status = view.phase === 'ended' ? '게임 종료'
    : view.phase === 'roundEnd' ? `${view.round + 1}라운드 정산 중…`
    : view.phase === 'roll' ? (myTurn ? '내 차례 — 주사위를 굴리세요' : `${nameOf(view.turn)}님이 굴릴 차례`)
    : myTurn ? (rolling ? '데굴데굴…' : '놓을 눈을 고르세요 (같은 걸 한 번 더 누르면 놓기)') : `${nameOf(view.turn)}님이 놓을 눈을 고르는 중`;
  const players = view.pids.filter((p) => room.players.some((x) => x.id === p));
  let k = 0;

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col gap-2 overflow-y-auto p-2" data-testid="vegas-root">
      <div className="sr-only" role="status" aria-live="polite" data-testid="vegas-live">{status}</div>
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="min-w-0 truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          💵 {room.name} · 참가비 {won(view.ante)}원 · <b className="text-gold-400" data-testid="vegas-round">{Math.min(view.round + 1, view.rounds)}/{view.rounds}라운드</b>
        </span>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button className="btn btn-gold whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => setHelp((h) => !h)} aria-label="규칙 보기" aria-pressed={help} {...hk('?')}><BarLabel icon="❓" text="규칙" /></button>
          {!spectator && <AutoToggle room={room} you={you} emit={emit} stacked />}
          <SoundToggle stacked />
          <SettingsButton stacked />
          <button className="btn btn-ghost whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => setChatOpen((c) => !c)} aria-label="채팅" aria-pressed={chatOpen}><BarLabel icon="💬" text="채팅" /></button>
          <button className="btn btn-ghost whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => window.confirm('나가면 기권 처리됩니다 (남은 주사위는 버려져요). 나갈까요?') && emit('room:leave')}><BarLabel icon="🚪" text="나가기" /></button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {players.map((pid) => (
          <PlayerChip key={pid} pid={pid} view={view} playerOf={playerOf} nameOf={nameOf} seat={seatOf(pid)} you={you} left={view.turn === pid ? left : null} auto={turnInfo?.auto && view.turn === pid} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="casinos">
        {view.casinos.map((c) => (
          <Casino
            key={c.value}
            c={c}
            view={view}
            seatOf={seatOf}
            nameOf={nameOf}
            target={canAct && legal.includes(c.value)}
            picked={picked === c.value}
            preview={preview(c.value)}
            onPick={() => pick(c.value)}
            flash={flash?.value === c.value}
            reduce={reduce}
          />
        ))}
      </div>

      {/* 주사위 판: 지금 굴린(또는 방금 놓은) 주사위를 눈별로 묶어서 */}
      <div className="relative z-[59] mx-auto flex w-full max-w-2xl flex-col items-center gap-2 rounded-2xl bg-black/50 p-2 ring-1 ring-white/10" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(22,101,52,.55), transparent 70%)' }}>
        <div className="flex min-h-[52px] flex-wrap items-center justify-center gap-2" data-testid="roll-tray" aria-label="굴린 주사위">
          {groups.length === 0 && <span className="text-xs text-slate-400">{playing ? `${nameOf(view.turn)}님의 주사위 🎲 ${view.dice[view.turn]?.own ?? 0}${view.neutralPer ? ` · ⚪ ${view.dice[view.turn]?.neutral ?? 0}` : ''}` : '—'}</span>}
          {groups.map((g) => {
            const choosable = canAct && legal.includes(g.v);
            const dim = placedValue != null && placedValue !== g.v;
            return (
              <button
                key={`${shownRoll.seq}-${g.v}`}
                type="button"
                disabled={!choosable}
                onClick={() => pick(g.v)}
                aria-label={`${g.v} 눈 ${g.own}개${g.neutral ? ` + 흰 ${g.neutral}개` : ''}${choosable ? ' — 고르기' : ''}`}
                data-testid="roll-group"
                className={`flex items-center gap-1 rounded-xl px-1.5 py-1 ring-2 transition ${picked === g.v ? 'bg-amber-700/60 ring-yellow-300' : choosable && !rolling ? 'ring-emerald-400/70 hover:bg-white/10' : placedValue === g.v ? 'ring-gold-400' : 'ring-transparent'}`}
              >
                {Array.from({ length: g.own }, (_, i) => <RollingDie key={`o${i}`} value={g.v} seat={rollSeat} seed={shownRoll.seq} i={k++} reduce={reduce || !view.roll} size={30} dim={dim} glow={picked === g.v} />)}
                {Array.from({ length: g.neutral }, (_, i) => <RollingDie key={`n${i}`} value={g.v} seat={NEUTRAL_SEAT} seed={shownRoll.seq} i={k++} reduce={reduce || !view.roll} size={30} dim={dim} glow={picked === g.v} />)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          {!spectator && <EmoteButton game="vegas" />}
          <span className="rounded bg-black/40 px-2 py-1 font-bold" data-testid="vegas-status">{status}</span>
          {!spectator && playing && view.phase === 'roll' && (
            <button className="btn btn-gold whitespace-nowrap !px-5 !py-1.5 text-base" disabled={!canAct} onClick={doRoll} data-testid="roll-btn" {...hk('t', 'T')}>
              🎲 주사위 굴리기
            </button>
          )}
          {picked != null && canAct && (
            <button className="btn btn-gold whitespace-nowrap !px-3 !py-1 text-sm" onClick={() => doPlace(picked)} data-testid="confirm-place">✔ {picked}번 카지노에 놓기</button>
          )}
          {view.lastPlace && <span className="text-xs text-slate-300" data-testid="last-place">{nameOf(view.lastPlace.pid)} → {view.lastPlace.value}번 카지노에 {view.lastPlace.own}개{view.lastPlace.neutral ? ` + 흰 ${view.lastPlace.neutral}개` : ''}</span>}
          <AnimatePresence>
            {msg && <motion.span role="alert" className="rounded bg-red-700 px-3 py-1 font-bold" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>🚫 {msg}</motion.span>}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>{help && <Rules onClose={() => setHelp(false)} />}</AnimatePresence>
      <AnimatePresence>{roundOpen && !vegasOver && <RoundModal key={roundOpen.round} lr={roundOpen} view={view} seatOf={seatOf} nameOf={nameOf} onClose={() => setRoundOpen(null)} />}</AnimatePresence>
      <AnimatePresence>
        {chatOpen && (
          <motion.div className="absolute bottom-16 right-2 z-[65] h-64 w-72" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Chat className="h-full bg-felt-900/95" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{vegasOver && !flash && <ResultModal key="over" over={vegasOver} view={view} seatOf={seatOf} nameOf={nameOf} you={you} onClose={dismissVegas} onRematch={rematch} />}</AnimatePresence>
    </div>
  );
}
