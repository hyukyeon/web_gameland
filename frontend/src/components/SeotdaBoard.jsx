import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion';
import { useApp } from '../store.jsx';
import { cardImg, won, signed } from '../cards.js';
import { Avatar } from './Avatar.jsx';
import { Chat } from './Chat.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { JokboHelp } from './JokboHelp.jsx';
import { EmoteBubble, EmoteButton } from './Emote.jsx';
import { AutoToggle, TurnTimer, useCountdown } from './TurnTools.jsx';
import { sfx } from '../sound.js';

const CARD = {
  sm: 'h-[58px] w-[38px] sm:h-[72px] sm:w-[47px]',
  lg: 'h-[96px] w-[62px] sm:h-[124px] sm:w-[80px]',
};

// 배분 연출: 한 바퀴에 한 장씩 두 바퀴. (j번째 바퀴, k번째 좌석) 카드가 날아가기 시작하는 시각(초)
const DEAL_STEP = 0.12;
const DEAL_FLY = 0.36;
const dealDelay = (j, k, n) => (j * n + k) * DEAL_STEP;
// 쇼다운 공개 연출: 상대 패를 앉은 순서대로 한 명씩 뒤집는다
const REVEAL_FIRST = 0.4;
const REVEAL_STEP = 0.75;

/**
 * 섯다 패 한 장. back 이면 뒷면.
 *  mode 'deal': 배분 카드가 도착하는 시각(delay)에 나타남 / 'flip': delay 후 뒤집히며 공개 / 'none': 그대로
 */
function SCard({ id, size = 'sm', delay = 0, mode = 'flip' }) {
  const back = id == null;
  const anim = {
    deal: { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, transition: { delay, duration: 0.15 } },
    flip: { initial: { rotateY: 90, opacity: 0, y: -10 }, animate: { rotateY: 0, opacity: 1, y: 0 }, transition: { delay, type: 'spring', stiffness: 260, damping: 20 } },
    none: { initial: false },
  }[mode];
  return (
    <motion.div {...anim} className={`relative shrink-0 overflow-hidden rounded-md shadow-md shadow-black/60 ring-1 ring-black/50 ${CARD[size]} ${back ? 'card-back' : ''}`}>
      {!back && <img src={cardImg(id)} alt="" draggable={false} className="h-full w-full object-fill" />}
    </motion.div>
  );
}

/** 내 패 '쪼기': 뒷면을 위로 밀어 올리면 아래부터 조금씩 보인다. 반 가까이 밀거나 탭하면 완전히 공개. */
function SqueezeCard({ id, open, onOpen, delay }) {
  const ref = useRef(null);
  const y = useMotionValue(0);
  const height = () => ref.current?.offsetHeight ?? 124;
  useEffect(() => {
    if (open) animate(y, -height() * 1.08, { duration: 0.25, ease: 'easeOut' });
  }, [open, y]);
  const reveal = () => {
    if (!open) {
      sfx('flip');
      onOpen();
    }
  };
  return (
    <motion.div ref={ref} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, duration: 0.15 }} className={`relative shrink-0 overflow-hidden rounded-md shadow-md shadow-black/60 ring-1 ring-black/50 ${CARD.lg}`}>
      <img src={cardImg(id)} alt="" draggable={false} className="h-full w-full object-fill" />
      <motion.div
        drag={open ? false : 'y'}
        dragConstraints={{ top: -200, bottom: 0 }}
        dragElastic={0.04}
        dragMomentum={false}
        style={{ y }}
        onDragEnd={() => (y.get() < -height() * 0.42 ? reveal() : animate(y, 0, { type: 'spring', stiffness: 420, damping: 30 }))}
        onTap={reveal}
        className={`card-back absolute inset-0 flex touch-none items-end justify-center rounded-md pb-1 shadow-[0_6px_10px_rgba(0,0,0,.6)] ${open ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'}`}
      >
        {!open && (
          <motion.span animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 1.2 }} className="text-lg drop-shadow">
            👆
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
}

/** 판 시작 시 테이블 가운데서 각 좌석으로 카드가 한 장씩 날아간다 */
function DealLayer({ dealKey, order, seats }) {
  const n = order.length;
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(true);
    const t = setTimeout(() => setOn(false), (dealDelay(1, n - 1, n) + DEAL_FLY + 0.2) * 1000);
    return () => clearTimeout(t);
  }, [dealKey, n]);
  if (!on) return null;
  return [0, 1].flatMap((j) =>
    order.map((pid, k) => (
      <motion.div
        key={`${dealKey}-${j}-${pid}`}
        className={`card-back pointer-events-none absolute z-30 rounded-md shadow-lg ring-1 ring-black/50 ${CARD.sm}`}
        style={{ x: '-50%', y: '-50%' }}
        initial={{ left: '50%', top: '50%', opacity: 0, rotate: -25 }}
        animate={{ left: `${seats[k][0] + (j ? 2.5 : -2.5)}%`, top: `${seats[k][1] + (k === 0 ? 14 : 8)}%`, opacity: [0, 1, 1, 0], rotate: j ? 6 : -6 }}
        transition={{ delay: dealDelay(j, k, n), duration: DEAL_FLY, ease: 'easeOut', opacity: { delay: dealDelay(j, k, n), duration: DEAL_FLY + 0.1, times: [0, 0.1, 0.8, 1] } }}
      />
    )),
  );
}

/** 칩 이동: 베팅하면 좌석 → 팟, 정산되면 팟 → 받는 사람 */
function ChipLayer({ chips }) {
  return (
    <AnimatePresence>
      {chips.map((c) => (
        <motion.div
          key={c.key}
          className="pointer-events-none absolute z-[60] flex flex-col items-center"
          style={{ x: '-50%', y: '-50%' }}
          initial={{ left: `${c.from[0]}%`, top: `${c.from[1]}%`, opacity: 0, scale: 0.6 }}
          animate={{ left: `${c.to[0]}%`, top: `${c.to[1]}%`, opacity: [0, 1, 1, 0.9], scale: c.win ? [0.6, 1.2, 1] : [0.6, 1, 0.8] }}
          exit={{ opacity: 0, scale: 0.4 }}
          transition={{ duration: c.win ? 0.8 : 0.55, ease: 'easeInOut' }}
        >
          <div className="relative h-6 w-7">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`absolute left-0.5 h-5 w-6 rounded-full border-2 border-dashed shadow ${c.win ? 'border-yellow-100 bg-yellow-400' : 'border-white/80 bg-red-500'}`} style={{ top: -i * 3 + 6, zIndex: i }} />
            ))}
          </div>
          {c.amount > 0 && <span className={`mt-0.5 rounded-full px-1.5 text-[10px] font-black shadow ${c.win ? 'bg-yellow-300 text-felt-900' : 'bg-black/75 text-yellow-300'}`}>{c.win ? '+' : ''}{won(c.amount)}</span>}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

const ACTION_TEXT = { die: '다이', call: '콜', half: '하프', bbing: '삥', ddadang: '따당' };
const actionLabel = (e) => (e.action === 'call' && !e.amount ? '체크' : ACTION_TEXT[e.action]);

/** 이번 판 액션 기록 (접이식) */
function ActionLog({ view, nameOf, open, onToggle, revealed }) {
  const box = useRef(null);
  const log = view.log ?? [];
  const res = view.phase === 'ended' && revealed ? view.result : null;
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [log.length, open, res]);
  return (
    <div className="absolute left-1 top-1 z-20 w-[min(210px,46vw)]">
      <button className="btn btn-ghost w-full !justify-between !rounded-lg !bg-black/60 !px-2 !py-1 text-xs" onClick={onToggle} aria-expanded={open}>
        <span>📜 판 기록 {log.length > 0 && <span className="text-slate-400">({log.length})</span>}</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div ref={box} className="mt-1 max-h-[34vh] space-y-0.5 overflow-y-auto rounded-lg bg-black/60 p-1.5 text-[11px] leading-snug">
              <div className="text-slate-400">
                {view.round > 1 ? `${view.round}판째` : '새 판'} · 참가비 {won(view.ante)}원씩{view.double > 0 && ' · 💰 묻고 더블'}
              </div>
              {log.map((e, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-baseline justify-between gap-1">
                  <span className="min-w-0 truncate">
                    <b>{nameOf(e.pid)}</b>{' '}
                    <span className={e.action === 'die' ? 'text-slate-400' : e.action === 'call' ? 'text-sky-300' : 'text-yellow-300'}>
                      {actionLabel(e)}
                      {e.amount > 0 && ` ${won(e.amount)}`}
                    </span>
                    {e.allIn && <span className="text-red-400"> 🔥올인</span>}
                    {e.forfeit && <span className="text-slate-500"> (자리 비움)</span>}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-500">팟 {won(e.pot)}</span>
                </motion.div>
              ))}
              {res && (
                <div className="border-t border-white/10 pt-0.5 font-bold text-gold-400">
                  {res.rematch ? '🔁 구사 재경기' : res.tie ? `🤝 ${res.tie.map(nameOf).join(', ')} 동점` : `🏆 ${res.winners.map(nameOf).join(', ')} 승리${res.kind === 'fold' ? ' (모두 다이)' : ''}`}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 타원 테이블 둘레 좌표(%). 앉은 순서(시계 방향)대로 내가 맨 아래, 그 다음 사람이 왼쪽 → 위 → 오른쪽
const SEATS = {
  2: [[50, 90], [50, 10]],
  3: [[50, 90], [18, 20], [82, 20]],
  4: [[50, 90], [9, 52], [50, 9], [91, 52]],
  5: [[50, 90], [12, 66], [24, 18], [76, 18], [88, 66]],
};

function Seat({ pos, pid, p, view, isMe, nameOf, playerOf, turn, left, auto, win, deal, revealAt, peek }) {
  const isTurn = turn && view.turn === pid;
  const ended = view.phase === 'ended';
  const died = p.status === 'died';
  const hand = p.hand; // 내 패 또는 쇼다운으로 공개된 패
  const last = p.lastAction;
  const dk = deal?.key ?? 'sync';
  // 배분 카드가 도착하는 시각 (재접속 복구면 연출 없음)
  const landAt = (j) => (deal ? dealDelay(j, deal.k, deal.n) + DEAL_FLY - 0.05 : 0);
  const mineOpen = isMe && (peek.all || ended);
  const showName = hand && p.handName && (!isMe || mineOpen || (peek.open[0] && peek.open[1]));
  return (
    <div className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${isMe ? 'z-[59]' : 'z-10'}`} style={{ left: `${pos[0]}%`, top: `${pos[1]}%` }}>
      <div className={`flex items-center gap-1.5 rounded-full bg-black/60 py-1 pl-1 pr-3 ring-2 transition ${isTurn ? 'ring-gold-400 shadow-[0_0_14px_rgba(244,201,93,.8)]' : win ? 'ring-emerald-400' : 'ring-white/15'} ${died ? 'opacity-50' : ''}`}>
        <span className="relative inline-flex">
          <Avatar player={playerOf(pid)} size={isMe ? 34 : 30} showTitle />
          <EmoteBubble userId={pid} below={!isMe} />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1 text-xs font-bold">
            <span className="max-w-[78px] truncate sm:max-w-[110px]">{nameOf(pid)}</span>
            {pid === view.dealer && <span className="rounded bg-gold-500 px-1 text-[9px] font-black text-felt-900">선</span>}
          </div>
          <div className="text-[10px] text-gold-400">{playerOf(pid)?.bot ? '∞' : won(p.stack)}원</div>
        </div>
      </div>
      {/* 이번 판 액션 / 상태 */}
      <div className="h-4 text-[10px] font-black">
        {isTurn && (left != null || auto) ? (
          <TurnTimer left={left} auto={auto} className="!rounded-full !px-2" />
        ) : died ? (
          <span className="rounded-full bg-slate-600 px-2 py-0.5">다이</span>
        ) : p.allIn ? (
          <motion.span initial={{ scale: 0.5 }} animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} className="inline-block rounded-full bg-red-600 px-2 py-0.5 text-white">
            🔥 올인 {won(p.committed)}
          </motion.span>
        ) : last && last.action !== 'die' ? (
          <motion.span key={`${last.action}${last.amount}`} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full bg-sky-700 px-2 py-0.5">
            {actionLabel(last)}
            {last.amount > 0 && ` ${won(last.amount)}`}
          </motion.span>
        ) : null}
      </div>
      <div className={`relative flex items-end gap-1 ${died ? 'opacity-40 grayscale' : ''}`}>
        {isMe && hand
          ? hand.map((c, i) => <SqueezeCard key={`${dk}-${c.id}`} id={c.id} open={mineOpen || peek.open[i]} onOpen={() => peek.set(i)} delay={landAt(i)} />)
          : hand
            ? hand.map((c, i) => <SCard key={`${dk}-${c.id}`} id={c.id} size={isMe ? 'lg' : 'sm'} mode="flip" delay={revealAt + i * 0.15} />)
            : [0, 1].map((i) => <SCard key={`${dk}-b${i}`} size="sm" mode={deal ? 'deal' : 'none'} delay={landAt(i)} />)}
        {isMe && hand && !mineOpen && !(peek.open[0] && peek.open[1]) && (
          <div className="absolute bottom-0 left-full ml-2 flex w-[76px] flex-col items-start gap-1 sm:w-[90px]">
            <span className="text-[10px] leading-tight text-slate-200 drop-shadow">패를 위로 밀어 쪼기</span>
            <button className="whitespace-nowrap rounded-full bg-gold-500 px-2 py-0.5 text-[11px] font-black text-felt-900 shadow hover:bg-gold-400" onClick={() => peek.set('all')}>
              👀 바로 보기
            </button>
          </div>
        )}
      </div>
      {showName && (
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: isMe ? 0 : revealAt + 0.35 }} className={`rounded-full px-3 py-0.5 text-xs font-black ${win ? 'bg-emerald-500 text-emerald-950' : 'bg-black/70 text-gold-400'}`}>
          {p.handName}
          {ended && win && ' 🏆'}
        </motion.div>
      )}
    </div>
  );
}

function ResultModal({ over, view, nameOf, you, onClose }) {
  const res = over.result;
  const delta = over.payout?.delta ?? {};
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel w-full max-w-md space-y-3 bg-felt-800 p-5 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <h2 className="text-2xl font-black text-gold-400">
          {res.winners.includes(you) ? '🎉 승리!' : res.winners.length ? `${res.winners.map(nameOf).join(', ')} 승리` : '게임 종료'}
        </h2>
        <p className="text-sm text-slate-300">
          {res.kind === 'fold' ? '모두 다이해서 판이 끝났어요.' : '쇼다운'} · 팟 {won(res.pot)}원{res.round > 1 ? ` · ${res.round}판째 (이월 포함)` : ''}
        </p>
        {res.tie && <p className="rounded bg-white/10 px-3 py-1 text-xs">🤝 {res.tie.map(nameOf).join(', ')} 동점 — 팟을 나눠 가졌어요</p>}
        {res.pots?.length > 1 && (
          <div className="space-y-0.5 rounded-lg bg-black/30 p-2 text-left text-xs">
            {res.pots.map((pt, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="text-slate-300">{i === 0 ? '메인팟' : `사이드팟 ${i}`} <span className="text-slate-500">({pt.eligible.length}명)</span></span>
                <span>
                  {won(pt.amount)}원 → <b className="text-gold-400">{pt.winners.map(nameOf).join(', ')}</b>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1 rounded-lg bg-black/30 p-2 text-left text-sm">
          {/* 묻고 더블 이전 판에서 진 사람(이번 판에는 없음)도 정산에 포함 */}
          {[...view.pids, ...Object.keys(res.net ?? {}).map(Number).filter((p) => !view.pids.includes(p))].map((pid) => {
            const h = res.hands?.[pid];
            const d = delta[pid] ?? 0;
            return (
              <div key={pid} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="max-w-[90px] truncate font-bold">{nameOf(pid)}</span>
                  {h ? (
                    <span className="flex items-center gap-1">
                      {h.cards.map((c) => <img key={c.id} src={cardImg(c.id)} alt="" className="h-[34px] w-[22px] rounded-sm object-fill ring-1 ring-black/50" />)}
                      <b className="text-gold-400">{h.name}</b>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">{view.players[pid]?.status === 'died' ? '다이' : ''}</span>
                  )}
                </span>
                <b className={d > 0 ? 'text-emerald-300' : d < 0 ? 'text-red-300' : 'text-slate-300'}>{signed(d)}원</b>
              </div>
            );
          })}
        </div>
        {over.ranked === false && <p className="text-xs text-slate-400">AI 연습 판이라 머니·전적에는 반영되지 않아요.</p>}
        <button className="btn btn-gold w-full" onClick={onClose}>대기실로</button>
      </motion.div>
    </motion.div>
  );
}

/** 동점 → 묻고 더블 투표. 동점자에게는 선택 창, 나머지에게는 진행 상황 */
function TieVote({ vote, you, nameOf, skew, emit }) {
  const left = useCountdown(vote.deadlineAt, skew);
  const [sent, setSent] = useState(false);
  const mineTurn = vote.pids.includes(you) && vote.votes[you] == null && !sent;
  const answer = async (agree) => {
    setSent(true);
    const r = await emit('seotda:tieVote', { agree });
    if (!r?.ok) setSent(false);
  };
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel w-full max-w-sm space-y-3 bg-felt-800 p-5 text-center" initial={{ scale: 0.7, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
        <h2 className="text-2xl font-black text-gold-400">🤝 동점!</h2>
        <p className="text-sm">
          {vote.pids.map(nameOf).join(' · ')} 동점입니다.
          <br />
          전원 동의하면 <b className="text-yellow-300">동점자끼리만</b> 판돈 <b className="text-yellow-300">{won(vote.ante)}원</b>(2배)으로 다시 붙고, 지금 팟은 그대로 이월됩니다.
        </p>
        <div className="flex justify-center gap-2 text-xs">
          {vote.pids.map((pid) => (
            <span key={pid} className={`rounded-full px-2 py-0.5 font-bold ${vote.votes[pid] === true ? 'bg-emerald-600' : vote.votes[pid] === false ? 'bg-slate-600' : 'bg-black/40 text-slate-300'}`}>
              {nameOf(pid)} {vote.votes[pid] === true ? '✔ 동의' : vote.votes[pid] === false ? '✖ 거절' : '…'}
            </span>
          ))}
        </div>
        {mineTurn ? (
          <div className="flex gap-2">
            <button className="btn btn-red flex-1 !py-3 text-lg" onClick={() => answer(true)}>💰 묻고 더블로 가!</button>
            <button className="btn btn-ghost flex-1" onClick={() => answer(false)}>나눠 갖기</button>
          </div>
        ) : (
          <p className="text-xs text-slate-300">{vote.pids.includes(you) ? '다른 사람의 선택을 기다리는 중…' : '동점자들이 선택하는 중…'}</p>
        )}
        {left != null && <p className="text-xs text-slate-400">⏱ {left}초 안에 모두 동의하지 않으면 나눠 갖습니다</p>}
      </motion.div>
    </motion.div>
  );
}

const LOG_KEY = 'seotda.logOpen';
const loadLogOpen = () => {
  try {
    const v = localStorage.getItem(LOG_KEY);
    return v == null ? window.innerWidth >= 1024 : v === '1';
  } catch {
    return false;
  }
};

/** 베팅 버튼: 행동 이름 + 이번에 실제로 더 내는 금액 */
function BetButton({ label, amount, allIn, className, disabled, onClick }) {
  return (
    <button className={`btn flex flex-col items-center !px-3 !py-1 leading-tight sm:!px-4 ${className}`} disabled={disabled} onClick={onClick}>
      <span>{allIn ? `🔥 ${label}` : label}</span>
      {amount != null && <span className="text-[11px] font-black tabular-nums opacity-90">{amount > 0 ? `+${won(amount)}` : '±0'}{allIn && ' 올인'}</span>}
    </button>
  );
}

export function SeotdaBoard() {
  const { room, user, seotda: view, seotdaOver, seotdaNote, seotdaDeal, seotdaEvent, tieVote, turnInfo, skew, emit, send, roomChat, dismissSeotda } = useApp();
  const [help, setHelp] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(loadLogOpen);
  const [busy, setBusy] = useState(false);
  const you = user.id;
  const left = useCountdown(turnInfo?.deadlineAt, skew);
  useEffect(() => setBusy(false), [view]);

  const nameOf = (pid) => room?.players.find((p) => p.id === pid)?.username ?? `플레이어${pid}`;
  const playerOf = (pid) => room?.players.find((p) => p.id === pid);
  const mine = view.players[you];
  const spectator = !mine;
  const order = useMemo(() => {
    // 내가 맨 아래 좌석이 되도록 앉은 순서를 회전 (관전자는 그대로)
    const i = view.pids.indexOf(you);
    return i < 0 ? view.pids : [...view.pids.slice(i), ...view.pids.slice(0, i)];
  }, [view.pids, you]);
  const seats = SEATS[Math.min(5, Math.max(2, order.length))];
  const posOf = (pid) => seats[Math.max(0, order.indexOf(pid))] ?? [50, 50];
  const o = view.options;
  const myTurn = !!o && !busy;

  // ----- 내 패 쪼기: 판마다 초기화, 재접속 복구(배분 연출 없음)면 바로 공개 -----
  const [peekOpen, setPeekOpen] = useState([false, false]);
  useEffect(() => setPeekOpen([false, false]), [seotdaDeal]);
  const peek = { all: seotdaDeal == null, open: peekOpen, set: (i) => setPeekOpen((v) => (i === 'all' ? [true, true] : v.map((x, k) => x || k === i))) };

  // ----- 쇼다운 공개 연출: 상대 패를 한 명씩 뒤집은 뒤에 승자 표시·칩 정산·결과 창 -----
  const revealOrder = view.phase === 'ended' && view.result ? order.filter((pid) => pid !== you && view.result.hands?.[pid]) : [];
  const revealAt = (pid) => REVEAL_FIRST + Math.max(0, revealOrder.indexOf(pid)) * REVEAL_STEP;
  const [revealDone, setRevealDone] = useState(view.phase === 'ended');
  const [overReady, setOverReady] = useState(view.phase === 'ended'); // 승리 칩 이동을 본 뒤 결과 창
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = view.phase;
    if (view.phase !== 'ended') {
      setRevealDone(false);
      setOverReady(false);
      return undefined;
    }
    if (was === 'ended') return undefined;
    const timers = revealOrder.map((_, i) => setTimeout(() => sfx('flip'), (REVEAL_FIRST + i * REVEAL_STEP) * 1000));
    const end = (REVEAL_FIRST + revealOrder.length * REVEAL_STEP + 0.6) * 1000;
    timers.push(setTimeout(() => setRevealDone(true), end));
    timers.push(setTimeout(() => setOverReady(true), end + 1000));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);
  const winners = revealDone && view.phase === 'ended' && view.result ? view.result.winners : [];

  // ----- 칩 이동 -----
  const [chips, setChips] = useState([]);
  const addChips = (list) => {
    if (!list.length) return;
    setChips((c) => [...c, ...list]);
    const keys = new Set(list.map((x) => x.key));
    setTimeout(() => setChips((c) => c.filter((x) => !keys.has(x.key))), 1000);
  };
  useEffect(() => {
    if (seotdaEvent?.amount > 0 && view.pids.includes(seotdaEvent.pid)) addChips([{ key: seotdaEvent.key, from: posOf(seotdaEvent.pid), to: [50, 47], amount: seotdaEvent.amount }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seotdaEvent]);
  useEffect(() => {
    const pays = revealDone && view.phase === 'ended' ? view.result?.payouts ?? {} : {};
    const list = Object.entries(pays).filter(([pid, v]) => v > 0 && view.pids.includes(Number(pid))).map(([pid, v]) => ({ key: `win-${pid}-${Date.now()}`, from: [50, 47], to: posOf(Number(pid)), amount: v, win: true }));
    if (list.length) sfx('chip');
    addChips(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealDone]);

  // 결과 창이 뜰 때 승패 효과음
  const showOver = seotdaOver && overReady;
  useEffect(() => {
    if (!showOver) return;
    const d = seotdaOver.payout?.delta?.[you] ?? seotdaOver.result?.net?.[you] ?? 0;
    sfx(d > 0 ? 'win' : d < 0 ? 'lose' : 'draw');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOver]);

  const toggleLog = () =>
    setLogOpen((v) => {
      try {
        localStorage.setItem(LOG_KEY, v ? '0' : '1');
      } catch {
        /* 저장소를 못 쓰는 환경 */
      }
      return !v;
    });

  const act = async (action) => {
    setBusy(true);
    const r = await emit('seotda:act', { action });
    if (!r?.ok) setBusy(false);
  };

  let status = '';
  if (view.phase === 'ended') status = view.result?.rematch ? '구사 재경기 준비 중…' : revealDone ? '쇼다운!' : '패 공개!';
  else if (view.turn === you) status = '내 차례입니다';
  else status = `${nameOf(view.turn)}님의 차례`;

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col gap-2 overflow-hidden p-2">
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="min-w-0 truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          🃏 {room.name} · 참가비 {won(view.ante)}원{view.round > 1 && ` · ${view.round}판째`}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button className="btn btn-gold whitespace-nowrap !px-3 !py-1" onClick={() => setHelp((h) => !h)} aria-label="족보 보기" aria-pressed={help}>
            ❓<span className="hidden sm:inline"> 족보 보기</span>
          </button>
          {!spectator && <AutoToggle room={room} you={you} emit={emit} />}
          <SoundToggle />
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => setChatOpen((c) => !c)}>💬</button>
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => window.confirm('나가면 이번 판은 다이(포기) 처리됩니다. 나갈까요?') && emit('room:leave')}>나가기</button>
        </div>
      </div>

      {/* 타원 포커 테이블 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div className="relative h-full max-h-[620px] w-full max-w-4xl">
          <div className="absolute inset-[3%] rounded-[50%] bg-gradient-to-b from-amber-800 to-amber-950 shadow-[0_10px_40px_rgba(0,0,0,.7)]" />
          <div className="absolute inset-[6%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,#238a5a_0%,#14603f_55%,#0c3d29_100%)] shadow-[inset_0_0_60px_rgba(0,0,0,.55)] ring-2 ring-black/40" />
          <div className="absolute inset-[6%] rounded-[50%] opacity-25 [background-image:radial-gradient(rgba(255,255,255,.35)_1px,transparent_1.2px)] [background-size:7px_7px]" />

          {/* 중앙: 팟 */}
          <div className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="text-[11px] font-bold tracking-widest text-emerald-100/80">POT</div>
            <motion.div key={view.pot} initial={{ scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.45 }} className="text-3xl font-black text-yellow-300 drop-shadow-[0_2px_6px_rgba(0,0,0,.7)] sm:text-5xl">
              {won(view.pot)}
              <span className="text-base sm:text-xl">원</span>
            </motion.div>
            <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-emerald-100/90 sm:text-xs">
              <span>🪙 현재 베팅 {won(view.currentBet)}</span>
              {view.double > 0 ? (
                <span className="rounded bg-yellow-500 px-1.5 font-black text-felt-900">💰 묻고 더블{view.double > 1 ? ` ×${view.double}` : ''}</span>
              ) : (
                view.round > 1 && <span className="rounded bg-red-600 px-1.5 font-black">재경기 {view.round}판</span>
              )}
            </div>
            <div className="mt-1 text-[11px] font-bold text-white/90 sm:text-sm">{status}</div>
          </div>

          {order.map((pid, i) => (
            <Seat
              key={pid}
              pos={seats[i]}
              pid={pid}
              p={view.players[pid]}
              view={view}
              isMe={pid === you}
              nameOf={nameOf}
              playerOf={playerOf}
              turn={view.phase === 'betting'}
              left={view.turn === pid ? left : null}
              auto={turnInfo?.userId === pid && !!turnInfo.auto}
              win={winners.includes(pid)}
              deal={seotdaDeal ? { key: seotdaDeal, k: i, n: order.length } : null}
              revealAt={revealAt(pid)}
              peek={peek}
            />
          ))}
          {seotdaDeal && <DealLayer key={seotdaDeal} dealKey={seotdaDeal} order={order} seats={seats} />}
          <ChipLayer chips={chips} />
          <ActionLog view={view} nameOf={nameOf} open={logOpen} onToggle={toggleLog} revealed={revealDone} />
        </div>

        {/* 구사 재경기 / 묻고 더블 안내 */}
        <AnimatePresence>
          {seotdaNote && view.phase !== 'betting' && revealDone && (
            <motion.div key={seotdaNote.key} className="pointer-events-none absolute left-1/2 top-[38%] z-20 -translate-x-1/2 rounded-2xl bg-red-700/95 px-5 py-3 text-center text-sm font-black shadow-2xl ring-2 ring-white/60 sm:text-lg" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
              {seotdaNote.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 하단: 액션 바 (내 차례일 때) — 족보 모달이 떠 있어도 쓸 수 있게 오버레이 위로 올림 */}
      <div className="relative z-[59] min-h-[56px]">
        {!spectator && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-black/55 p-2">
            <EmoteButton />
            <AnimatePresence mode="wait">
              {o ? (
                <motion.div key="bar" className="flex flex-wrap items-center justify-center gap-2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <BetButton label="다이" className="btn-red" disabled={!myTurn} onClick={() => act('die')} />
                  <BetButton label={o.call.amount === 0 ? '체크' : '콜'} amount={o.call.amount} allIn={o.call.allIn} className="btn-gold" disabled={!myTurn} onClick={() => act('call')} />
                  {o.half && <BetButton label="하프" amount={o.half.amount} allIn={o.half.allIn} className="btn-ghost !bg-sky-700 hover:!bg-sky-600" disabled={!myTurn} onClick={() => act('half')} />}
                  {o.bbing && <BetButton label="삥" amount={o.bbing.amount} allIn={o.bbing.allIn} className="btn-ghost !bg-emerald-700 hover:!bg-emerald-600" disabled={!myTurn} onClick={() => act('bbing')} />}
                  {o.ddadang && <BetButton label="따당" amount={o.ddadang.amount} allIn={o.ddadang.allIn} className="btn-ghost !bg-purple-700 hover:!bg-purple-600" disabled={!myTurn} onClick={() => act('ddadang')} />}
                  <span className="hidden flex-col items-center gap-0.5 text-[10px] text-slate-300 sm:flex">
                    <TurnTimer left={left} />
                    <span>보유 {won(mine.stack)}</span>
                  </span>
                </motion.div>
              ) : (
                <motion.span key="wait" className="px-3 text-sm text-slate-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {view.phase === 'ended' ? '결과를 확인하는 중…' : mine.status === 'died' ? '다이했습니다. 다음 판을 기다리는 중…' : mine.allIn ? '🔥 올인! 쇼다운을 기다리는 중…' : `${nameOf(view.turn)}님의 선택을 기다리는 중…`}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>{help && <JokboHelp onClose={() => setHelp(false)} />}</AnimatePresence>

      <AnimatePresence>
        {chatOpen && (
          <motion.div className="absolute bottom-16 right-2 z-[65] h-64 w-72" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Chat className="h-full bg-felt-900/95" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{tieVote && !seotdaOver && revealDone && <TieVote key="tie" vote={tieVote} you={you} nameOf={nameOf} skew={skew} emit={emit} />}</AnimatePresence>
      <AnimatePresence>{showOver && <ResultModal key="over" over={seotdaOver} view={view} nameOf={nameOf} you={you} onClose={dismissSeotda} />}</AnimatePresence>
    </div>
  );
}
