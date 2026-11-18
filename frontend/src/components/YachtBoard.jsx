import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'framer-motion';
import { useApp } from '../store.jsx';
import { won, signed } from '../cards.js';
import { Avatar, BotLevel } from './Avatar.jsx';
import { Chat } from './Chat.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { SettingsButton } from './Settings.jsx';
import { EmoteBubble, EmoteButton } from './Emote.jsx';
import { AutoToggle, BarLabel, TurnTimer, useCountdown } from './TurnTools.jsx';
import { Die } from './Die.jsx';
import { hk } from '../keys.js';
import { sfx } from '../sound.js';
import { SEATS } from '../vegas.js';
import { UPPER, LOWER, BONUS_AT, BONUS, CAT_LABEL, CAT_HINT, CAT_FACE, CAT_ICON, bonusState } from '../yacht.js';

const ROLL_MS = 1000; // 손 안에서 흔들기 → 던지기 → 떨어져 튀고 멈출 때까지 (효과음 diceRoll 과 맞춤)
const IVORY = { fill: '#e7e0cf', hi: '#ffffff', pip: '#1f2937' }; // 상아색 주사위
const IVORY_HELD = { fill: '#f59e0b', hi: '#fef3c7', pip: '#451a03' }; // 고정한 주사위
const rand = (seed, k) => {
  const x = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * 주사위 한 개. 굴릴 때(rolling): 제자리에서 달그락 흔들림 → 위로 던져져 빙글 돌며 → 떨어져 통 튀고 멈춤,
 * 그동안 눈이 빠르게 바뀌다 마지막 눈에서 멈춘다. 누르면 고정/풀기
 */
function TrayDie({ i, value, held, rolling, seed, reduce, canHold, onToggle, size }) {
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling || reduce) return setFace(value);
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (n * 70 >= ROLL_MS * 0.8) {
        setFace(value);
        clearInterval(t);
      } else setFace(1 + Math.floor(rand(seed + n, i) * 6));
    }, 70);
    return () => clearInterval(t);
  }, [rolling, seed, value, reduce, i]);
  const dir = rand(seed, i + 7) < 0.5 ? -1 : 1;
  const spin = dir * 360 * (1 + Math.floor(rand(seed, i + 9) * 2)); // 한두 바퀴 돌고 똑바로 멈춤
  const dx = (rand(seed, i + 3) - 0.5) * 50;
  const lift = 45 + rand(seed, i) * 25;
  return (
    <motion.button
      type="button"
      disabled={!canHold}
      onClick={onToggle}
      aria-pressed={held}
      aria-label={`${i + 1}번 주사위 ${value || '-'}${held ? ' (고정됨)' : ''}${canHold ? ` — ${held ? '풀기' : '고정'}` : ''}`}
      data-testid="yacht-die"
      data-value={value}
      data-held={held}
      className={`relative flex flex-col items-center gap-1 rounded-xl p-0.5 transition sm:p-1 ${canHold ? 'cursor-pointer hover:bg-white/10' : 'cursor-default'}`}
      animate={{ y: held ? -10 : 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      {...(canHold ? hk(String(i + 1), String(i + 1)) : {})}
    >
      <motion.span
        key={rolling ? seed : 'still'}
        className="inline-flex"
        // 키프레임은 시작값을 꼭 준다 (initial=false 면 마지막 값으로 바로 가 버린다)
        initial={rolling && !reduce ? { x: 0, y: 0, rotate: 0, scale: 1 } : false}
        animate={
          rolling && !reduce
            ? {
                x: [0, -6, 6, -6, 6, dx, dx * 0.3, dx * 0.1, 0],
                y: [0, -4, -9, -4, -9, -lift, 0, -16, 0],
                rotate: [0, -14, 14, -14, 14, spin * 0.6, spin, spin, spin],
                scale: [1, 1, 1, 1, 1, 1.18, 0.9, 1.05, 1],
              }
            : { x: 0, y: 0, rotate: 0, scale: 1 }
        }
        transition={rolling && !reduce ? { duration: ROLL_MS / 1000, delay: i * 0.02, times: [0, 0.08, 0.16, 0.24, 0.32, 0.55, 0.75, 0.87, 1], ease: 'easeOut' } : { duration: 0 }}
      >
        <Die value={face} seat={held ? IVORY_HELD : IVORY} size={size} glow={held} />
      </motion.span>
      <span className={`h-4 text-[11px] font-black ${held ? 'text-amber-300' : 'text-transparent'}`}>고정</span>
    </motion.button>
  );
}

function PlayerChip({ pid, view, playerOf, nameOf, seat, you, left, auto }) {
  const p = playerOf(pid);
  const isTurn = view.phase !== 'ended' && view.turn === pid;
  return (
    <div className={`flex items-center gap-2 rounded-full bg-black/55 py-1 pl-1 pr-3 ring-2 transition ${isTurn ? 'shadow-[0_0_14px_rgba(244,201,93,.8)] ring-gold-400' : 'ring-white/15'} ${view.gone.includes(pid) ? 'opacity-40' : ''}`} data-testid="yacht-player">
      <span className="relative inline-flex">
        <Avatar player={p} size={32} showTitle />
        <EmoteBubble userId={pid} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1 text-xs font-bold">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundImage: `linear-gradient(${seat.hi},${seat.fill})` }} />
          <span className="max-w-[90px] truncate">{nameOf(pid)}{pid === you && ' (나)'}</span>
          <BotLevel player={p} />
        </div>
        <div className="text-[11px] text-slate-300"><b className="text-gold-400" data-testid="yacht-total">{view.totals[pid].total}</b>점</div>
      </div>
      {isTurn && (left != null || auto) && <TurnTimer left={left} auto={auto} bot={!!p?.bot} />}
    </div>
  );
}

const dot = (seat) => ({ backgroundImage: `linear-gradient(${seat.hi},${seat.fill})` });

/** 칸 하나에 사람별로 적힌 점수 칩. 차례인 사람의 빈 칸은 지금 받을 점수를 흐리게 */
function ScoreChips({ k, view, players, seatOf, nameOf, you, flash }) {
  return (
    <div className={`grid gap-1 ${players.length > 2 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
      {players.map((pid) => {
        const v = view.sheets[pid][k];
        const preview = v == null && pid === view.turn && view.phase === 'decide' ? view.options?.[k] : undefined;
        const lit = flash && flash.pid === pid && flash.cat === k;
        return (
          <motion.span
            key={pid}
            title={nameOf(pid)}
            className={`flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm tabular-nums ring-1 ${lit ? 'bg-gold-400 text-felt-900 ring-gold-200' : pid === you ? 'bg-white/10 ring-white/25' : 'bg-black/30 ring-white/10'}`}
            animate={lit ? { scale: [1, 1.25, 1] } : { scale: 1 }}
          >
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={dot(seatOf(pid))} />
            {v != null ? (
              <b className={lit ? '' : v === 0 ? 'text-slate-500' : 'text-slate-50'} data-testid="yacht-cell" data-cat={k} data-pid={pid}>{v}</b>
            ) : preview !== undefined ? (
              <span className="italic text-slate-400">{preview}</span>
            ) : (
              <span className="text-slate-600">–</span>
            )}
          </motion.span>
        );
      })}
    </div>
  );
}

/** 족보 칸 하나 (카드). 내 차례에 비어 있으면 카드 전체가 큰 기록 버튼 */
function CatCard({ k, view, players, seatOf, nameOf, you, canScore, onScore, flash, best }) {
  const mine = canScore && view.sheets[you]?.[k] == null;
  const pts = mine ? view.options?.[k] : undefined;
  const top = mine && pts === best && best > 0;
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center text-xl" aria-hidden="true">{CAT_FACE[k] ? <Die value={CAT_FACE[k]} seat={IVORY} size={26} /> : CAT_ICON[k]}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-black sm:text-base">{CAT_LABEL[k]}</div>
          {/* 'n 모으기' 는 이름만으로 뜻이 통해 좁은 화면에선 설명을 숨긴다 */}
          <div className={`text-[11px] text-slate-400 sm:text-xs ${CAT_FACE[k] ? 'hidden sm:block' : ''}`}>{CAT_HINT[k]}</div>
        </div>
        {mine && (
          <span className={`shrink-0 rounded-lg px-2 py-0.5 text-right font-black leading-none ${top ? 'bg-emerald-500 text-felt-900' : pts ? 'bg-white/15 text-slate-50' : 'bg-black/30 text-slate-400'}`}>
            <span className="text-2xl tabular-nums">{pts}</span><span className="text-xs">점</span>
          </span>
        )}
      </div>
      <ScoreChips k={k} view={view} players={players} seatOf={seatOf} nameOf={nameOf} you={you} flash={flash} />
    </>
  );
  const ring = flash?.cat === k ? 'ring-gold-400' : top ? 'ring-emerald-400' : mine ? 'ring-white/30' : 'ring-white/10';
  return mine ? (
    <button type="button" onClick={() => onScore(k)} aria-label={`${CAT_LABEL[k]}에 ${pts}점 기록`} data-testid="yacht-pick" data-cat={k}
      className={`flex flex-col gap-1.5 rounded-xl bg-black/45 p-2 text-left ring-2 transition hover:bg-white/10 active:scale-[0.98] ${ring} ${top ? 'shadow-[0_0_14px_rgba(52,211,153,.55)]' : ''}`}>
      {body}
    </button>
  ) : (
    <div className={`flex flex-col gap-1.5 rounded-xl bg-black/35 p-2 ring-2 ${ring}`} data-testid="yacht-cat" data-cat={k}>{body}</div>
  );
}

/** 위쪽 보너스 칸: 사람별 위쪽 합/63 막대 + 몇 점 남았는지 */
function BonusCard({ view, players, seatOf, nameOf, you }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-gradient-to-b from-emerald-950/80 to-black/40 p-2 ring-2 ring-emerald-700/50" data-testid="yacht-bonus-card">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center text-xl" aria-hidden="true">🎁</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-black text-emerald-300 sm:text-base">보너스 +{BONUS}</div>
          <div className="text-[11px] text-slate-400 sm:text-xs">위 6칸 합이 {BONUS_AT}점 이상이면</div>
        </div>
      </div>
      {players.map((pid) => {
        const b = bonusState(view.sheets[pid]);
        const pct = Math.min(100, (b.upper / BONUS_AT) * 100);
        return (
          <div key={pid} className="flex items-center gap-1.5 text-xs" data-testid="yacht-bonus" data-pid={pid}>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={dot(seatOf(pid))} />
            <span className="w-10 shrink-0 truncate font-bold">{pid === you ? '나' : nameOf(pid)}</span>
            <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
              <span className={`absolute inset-y-0 left-0 rounded-full ${b.done ? 'bg-emerald-400' : b.fail ? 'bg-slate-500' : 'bg-gold-400'}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="w-[5.6rem] shrink-0 text-right tabular-nums">
              {b.done ? <b className="text-emerald-300">달성 +{BONUS}</b> : b.fail ? <span className="text-slate-500">{b.upper}/{BONUS_AT} · 불가</span> : <><b className="text-gold-400">{b.need}</b><span className="text-slate-300">점 남음</span></>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 총점 칸 */
function TotalCard({ view, players, seatOf, nameOf, you }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-gradient-to-b from-amber-900/50 to-black/40 p-2 ring-2 ring-gold-400/40" data-testid="yacht-total-card">
      <div className="text-[15px] font-black text-gold-400 sm:text-base">🏆 총점</div>
      <div className="grid grid-cols-2 gap-1">
        {players.map((pid) => (
          <span key={pid} className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 ${pid === you ? 'bg-white/10' : 'bg-black/30'}`}>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={dot(seatOf(pid))} />
            <span className="min-w-0 flex-1 truncate text-xs">{pid === you ? '나' : nameOf(pid)}</span>
            <b className="text-lg tabular-nums text-gold-400">{view.totals[pid].total}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 점수표: 위쪽(1~6 모으기 + 보너스) | 아래쪽(족보 + 총점) 두 열, 칸마다 큰 카드 */
function ScoreSheet({ view, players, seatOf, nameOf, you, canScore, onScore, flash }) {
  const best = Math.max(-1, ...Object.values(view.options ?? {}));
  const card = (k) => <CatCard key={k} k={k} view={view} players={players} seatOf={seatOf} nameOf={nameOf} you={you} canScore={canScore} onScore={onScore} flash={flash} best={best} />;
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:gap-2" data-testid="yacht-sheet">
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {UPPER.map(card)}
        <BonusCard view={view} players={players} seatOf={seatOf} nameOf={nameOf} you={you} />
      </div>
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {LOWER.map(card)}
        <TotalCard view={view} players={players} seatOf={seatOf} nameOf={nameOf} you={you} />
      </div>
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
      <motion.div role="dialog" aria-label="요트 다이스 규칙" className="panel max-h-[90vh] w-full max-w-md space-y-2 overflow-y-auto bg-felt-800 p-5 text-sm" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gold-400">🎯 요트 다이스 규칙</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-slate-200">
          <li>차례마다 주사위 5개를 <b>최대 3번</b> 굴려요. 굴린 뒤 남기고 싶은 주사위를 누르면 <b>고정</b>되고, 나머지만 다시 굴려요(다시 누르면 풀림).</li>
          <li>굴린 뒤엔 언제든 점수표에서 <b>빈 칸 하나</b>를 눌러 기록하면 차례가 끝나요(칸에 받을 점수가 크게 보여요). 맞는 족보가 없으면 0점으로 버려야 해요.</li>
          <li><b>1~6 모으기</b>(왼쪽 6칸): 그 눈이 나온 주사위만 더해요. 6칸 합이 <b>63점 이상이면 보너스 35점</b> — 눈마다 3개씩 모으면 딱 63이에요. 보너스 칸에 몇 점 남았는지 보여요.</li>
          <li><b>초이스</b>: 5개 모두 더하기 · <b>포카드</b>: 같은 눈 4개 이상이면 5개 합 · <b>풀하우스</b>: 같은 눈 3개+2개면 5개 합</li>
          <li><b>스몰 스트레이트</b>: 4개 연속(1234·2345·3456) 15점 · <b>라지 스트레이트</b>: 5개 연속(12345·23456) 30점 · <b>요트</b>: 5개 모두 같으면 50점</li>
          <li>12칸을 모두 채우면 끝! 총점이 가장 높은 사람이 나머지의 참가비를 받아요(공동 1등은 나눠요).</li>
        </ul>
        <button className="btn btn-gold w-full" onClick={onClose} {...hk('Escape', 'Esc')}>닫기</button>
      </motion.div>
    </motion.div>
  );
}

function ResultModal({ over, view, seatOf, nameOf, you, onClose, onRematch }) {
  const res = over.result;
  const spectator = !view.pids.includes(you);
  const win = res.winners.includes(you);
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-label="요트 다이스 결과" className="panel w-full max-w-sm space-y-3 bg-felt-800 p-5 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <h2 className="text-2xl font-black text-gold-400">{!spectator && win ? (res.winners.length > 1 ? '🤝 공동 1등!' : '🎉 1등!') : `🏆 ${res.winners.map(nameOf).join(', ')} 승리`}</h2>
        {res.kind === 'forfeit' && <p className="text-sm text-slate-300">다른 사람이 모두 나가서 끝났어요.</p>}
        <div className="rounded-lg bg-black/30 p-2 text-sm" data-testid="yacht-standings">
          {res.standings.map((pid, i) => {
            const d = over.payout?.delta?.[pid] ?? 0;
            return (
              <div key={pid} className="flex items-center gap-2 py-0.5">
                <span className="w-5 text-right font-black text-slate-400">{i + 1}</span>
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundImage: `linear-gradient(${seatOf(pid).hi},${seatOf(pid).fill})` }} />
                <span className="min-w-0 flex-1 truncate text-left font-bold">{nameOf(pid)}{pid === you && ' (나)'}</span>
                <span className="font-black text-gold-400">{res.scores[pid]}점</span>
                <b className={`w-20 text-right ${d > 0 ? 'text-emerald-300' : d < 0 ? 'text-red-300' : 'text-slate-300'}`}>{signed(d)}원</b>
              </div>
            );
          })}
        </div>
        {over.ranked === false && <p className="text-xs text-slate-400">AI 연습 판이라 머니에는 반영되지 않아요.</p>}
        <p className="text-xs text-slate-400">참가비 {won(over.ante)}원 · 1등이 나머지 참가비를 받아요</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-gold" onClick={onRematch} {...hk('Enter', 'Enter')}>🔁 한 판 더</button>
          <button className="btn btn-ghost" onClick={onClose} {...hk('Escape', 'Esc')}>대기실로</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function YachtBoard() {
  const { room, user, yacht: view, yachtOver, turnInfo, skew, emit, send, roomChat, dismissYacht } = useApp();
  const reduce = useReducedMotionConfig(); // 앱 애니메이션 설정을 따른다 (useReducedMotion 은 기기 설정만 본다)
  const you = user.id;
  const [chatOpen, setChatOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(false);
  const [rolling, setRolling] = useState(null); // 굴리는 연출 중인 { seq, rolled }
  const [flash, setFlash] = useState(null); // 방금 기록한 칸 { pid, cat, score, seq }
  const [held, setHeld] = useState(view.held); // 내 화면의 고정 표시 (서버에 보내고 응답을 기다리지 않는다)
  const seen = useRef({ roll: view.lastRoll?.seq ?? 0, score: view.lastScore?.seq ?? 0 }); // 재접속 때 지난 연출을 다시 틀지 않는다
  const left = useCountdown(turnInfo?.deadlineAt, skew);
  const nameOf = (pid) => room?.players.find((p) => p.id === pid)?.username ?? `플레이어${pid}`;
  const playerOf = (pid) => room?.players.find((p) => p.id === pid);
  const seatOf = (pid) => SEATS[Math.max(0, view.pids.indexOf(pid)) % SEATS.length];
  const spectator = !view.pids.includes(you);
  const playing = view.phase !== 'ended';
  const myTurn = playing && view.turn === you && !spectator;
  const canAct = myTurn && !pending && !rolling;

  // 서버의 고정 상태를 따른다 (다른 사람 차례·새 차례·굴린 뒤)
  useEffect(() => { setHeld(view.held); }, [view.seq, view.held]);
  // 새 굴림 → 굴리는 연출, 새 기록 → 칸 반짝 + 효과음
  useLayoutEffect(() => {
    const r = view.lastRoll;
    if (r && r.seq > seen.current.roll) {
      seen.current.roll = r.seq;
      sfx('diceRoll');
      if (!reduce) {
        setRolling({ seq: r.seq, rolled: r.rolled });
        const t = setTimeout(() => setRolling(null), ROLL_MS + 80);
        return () => clearTimeout(t);
      }
    }
    const s = view.lastScore;
    if (s && s.seq > seen.current.score) {
      seen.current.score = s.seq;
      setRolling(null);
      setFlash(s);
      sfx(s.cat === 'yacht' && s.score ? 'jackpot' : s.score >= 25 ? 'combo' : s.score ? 'place' : 'ppeok');
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.seq]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => { if (!msg) return undefined; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  useEffect(() => {
    if (!yachtOver || spectator) return;
    sfx(yachtOver.result.winners.includes(you) ? 'win' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yachtOver]);

  const canHold = canAct && view.phase === 'decide' && view.rollsLeft > 0;
  const toggle = (i) => {
    if (!canHold) return;
    const next = held.map((h, k) => (k === i ? !h : h));
    setHeld(next);
    sfx('click');
    emit('yacht:hold', { held: next }).then((r) => !r?.ok && setMsg(r?.error ?? '고정할 수 없어요'));
  };
  async function doRoll() {
    if (!canAct || view.rollsLeft <= 0) return;
    setPending(true);
    const r = await emit('yacht:roll', view.phase === 'decide' ? { held } : {});
    setPending(false);
    if (!r?.ok) setMsg(r?.error ?? '굴릴 수 없어요');
  }
  async function doScore(cat) {
    if (!canAct || view.phase !== 'decide') return;
    setPending(true);
    const r = await emit('yacht:score', { cat });
    setPending(false);
    if (!r?.ok) setMsg(r?.error ?? '기록할 수 없어요');
  }
  const rematch = () => { dismissYacht(); emit('room:ready'); };

  const shownHeld = myTurn ? held : view.held;
  const allHeld = view.phase === 'decide' && shownHeld.every(Boolean);
  const status = !playing ? '게임 종료'
    : view.phase === 'roll' ? (myTurn ? '내 차례 — 주사위를 굴리세요' : `${nameOf(view.turn)}님이 굴릴 차례`)
    : myTurn ? (rolling ? '데굴데굴…' : view.rollsLeft > 0 ? '남길 주사위를 눌러 고정하고 다시 굴리거나, 점수표에 기록하세요' : '점수표에서 기록할 칸을 고르세요')
    : `${nameOf(view.turn)}님이 고민 중 (${3 - view.rollsLeft}/3번 굴림)`;
  const players = view.pids.filter((p) => room.players.some((x) => x.id === p));

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col gap-2 overflow-y-auto p-2" data-testid="yacht-root">
      <div className="sr-only" role="status" aria-live="polite" data-testid="yacht-live">{status}</div>
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="min-w-0 truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          🎯 {room.name} · 참가비 {won(view.ante)}원 · <b className="text-gold-400" data-testid="yacht-round">{Math.min(view.round + 1, view.rounds)}/{view.rounds}라운드</b>
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

      <div className="flex flex-wrap items-center justify-center gap-2">
        {players.map((pid) => (
          <PlayerChip key={pid} pid={pid} view={view} playerOf={playerOf} nameOf={nameOf} seat={seatOf(pid)} you={you} left={view.turn === pid ? left : null} auto={turnInfo?.auto && view.turn === pid} />
        ))}
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-start">
        {/* 주사위 판 */}
        <div className="relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl p-3 ring-1 ring-white/10" style={{ backgroundImage: 'radial-gradient(ellipse at 50% 30%, rgba(22,101,52,.75), rgba(0,0,0,.55) 75%)' }} data-testid="yacht-tray">
          {/* 맨 위 한 줄: 방금 기록한 족보(큰 족보면 크게) 또는 누구의 주사위인지 — 자리를 따로 잡아 주사위를 가리지 않는다 */}
          <div className="flex h-9 items-center justify-center">
            <AnimatePresence mode="wait">
              {flash ? (
                <motion.div
                  key={flash.seq}
                  className={`rounded-xl px-4 py-1 text-center font-black shadow-xl ${flash.cat === 'yacht' && flash.score ? 'bg-gradient-to-b from-yellow-200 to-amber-500 text-xl text-felt-900' : 'bg-black/70 text-sm text-slate-100 ring-1 ring-white/20'}`}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  data-testid="yacht-flash"
                >
                  {nameOf(flash.pid)} · {CAT_LABEL[flash.cat]} {flash.score}점{flash.cat === 'yacht' && flash.score ? ' ⛵ 요트!' : flash.score === 0 ? ' (버림)' : ''}
                </motion.div>
              ) : (
                <motion.div key="who" className="text-xs text-slate-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{playing ? `${nameOf(view.turn)}님의 주사위` : '—'}</motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex flex-nowrap items-end justify-center gap-0.5 sm:gap-1">
            {view.dice.map((v, i) => (
              <TrayDie key={i} i={i} value={v} held={shownHeld[i]} rolling={!!rolling && rolling.rolled.includes(i)} seed={rolling?.seq ?? 0} reduce={reduce} canHold={canHold} onToggle={() => toggle(i)} size={52} />
            ))}
          </div>
          <div className="flex items-center gap-1.5" aria-label={`남은 굴림 ${view.rollsLeft}번`} data-testid="rolls-left">
            {[0, 1, 2].map((k) => <span key={k} className={`h-2.5 w-2.5 rounded-full ${k < view.rollsLeft ? 'bg-gold-400 shadow-[0_0_6px_rgba(244,201,93,.9)]' : 'bg-white/15'}`} />)}
            <span className="ml-1 text-[11px] text-slate-300">남은 굴림 {view.rollsLeft}</span>
          </div>
          {!spectator && playing && (
            <button className="btn btn-gold whitespace-nowrap !px-6 !py-2 text-base" disabled={!canAct || view.rollsLeft <= 0 || allHeld} onClick={doRoll} data-testid="yacht-roll" {...hk('r', 'R')}>
              🎲 {view.phase === 'roll' ? '주사위 굴리기' : `다시 굴리기 (${view.rollsLeft})`}
            </button>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {!spectator && <EmoteButton game="yacht" />}
            <span className="rounded bg-black/40 px-2 py-1 text-center font-bold" data-testid="yacht-status">{status}</span>
          </div>
          <AnimatePresence>
            {msg && <motion.span role="alert" className="rounded bg-red-700 px-3 py-1 text-sm font-bold" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>🚫 {msg}</motion.span>}
          </AnimatePresence>
        </div>

        <ScoreSheet view={view} players={players} seatOf={seatOf} nameOf={nameOf} you={you} canScore={canAct && view.phase === 'decide'} onScore={doScore} flash={flash} />
      </div>

      <AnimatePresence>{help && <Rules onClose={() => setHelp(false)} />}</AnimatePresence>
      <AnimatePresence>
        {chatOpen && (
          <motion.div className="absolute bottom-16 right-2 z-[65] h-64 w-72" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Chat className="h-full bg-felt-900/95" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{yachtOver && !rolling && <ResultModal key="over" over={yachtOver} view={view} seatOf={seatOf} nameOf={nameOf} you={you} onClose={dismissYacht} onRematch={rematch} />}</AnimatePresence>
    </div>
  );
}
