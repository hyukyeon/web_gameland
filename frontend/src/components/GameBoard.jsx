import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { groupCaptured, kindOf, monthOf, nearCombos, won, signed } from '../cards.js';
import { Card } from './Card.jsx';
import { Chat } from './Chat.jsx';
import { Avatar, BotLevel } from './Avatar.jsx';
import { EmoteBubble, EmoteButton } from './Emote.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { AutoToggle, TurnTimer, useCountdown } from './TurnTools.jsx';
import { sfx } from '../sound.js';
import { GostopHelp } from './GostopHelp.jsx';

const GROUP_LABEL = { gwang: '광', tti: '띠', yeol: '멍', pi: '피' };

/** 획득패: 광/열끗/띠/피 그룹별로 겹쳐서 보여준다 */
const OVERLAP = 0.4; // 카드 폭의 40% 만큼씩만 어긋나게 겹쳐 컴팩트하게

function Captured({ ids, size = 'xs' }) {
  const g = useMemo(() => groupCaptured(ids), [ids]);
  const w = { xs: 26, sm: 34, md: 52 }[size];
  const maxW = w * 6; // 한 그룹이 이 폭을 넘으면 더 촘촘하게
  return (
    <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
      {Object.entries(g).map(([k, list]) => {
        if (list.length === 0) return null;
        const step = Math.max(w * 0.2, Math.min(w * OVERLAP, (maxW - w) / Math.max(1, list.length - 1)));
        return (
          <div key={k} className="flex items-end" title={`${GROUP_LABEL[k]} ${list.length}`}>
            {size !== 'xs' && <span className="mr-0.5 self-center text-[9px] leading-none text-slate-300 [writing-mode:vertical-rl]">{GROUP_LABEL[k]}{list.length}</span>}
            <div className="relative" style={{ height: w * 1.54, width: w + (list.length - 1) * step }}>
              {list.map((id, i) => (
                <Card key={id} id={id} size={size} className="!absolute" style={{ left: i * step, top: 0, zIndex: i }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreChip({ view, pid }) {
  const s = view.scores[pid];
  const go = view.go[pid];
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      <span className="rounded bg-gold-500 px-1.5 py-0.5 font-black text-felt-900">{s.total}점</span>
      {go > 0 && <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold">{go}고</span>}
      {view.shakes[pid] > 0 && <span className="rounded bg-sky-600 px-1.5 py-0.5">흔들기×{view.shakes[pid]}</span>}
      {view.bombs[pid] > 0 && <span className="rounded bg-orange-600 px-1.5 py-0.5">폭탄×{view.bombs[pid]}</span>}
      {s.detail.map((d) => (
        <span key={d.name} className="rounded bg-white/10 px-1.5 py-0.5">{d.name}</span>
      ))}
      {nearCombos(view.captured, pid).map((n) => (
        <motion.span key={`near-${n}`} initial={{ scale: 0.4 }} animate={{ scale: 1, opacity: [1, 0.55, 1] }} transition={{ opacity: { repeat: Infinity, duration: 1.2 } }} className="rounded bg-red-600 px-1.5 py-0.5 font-black text-white" title="한 장만 더 먹으면 완성">
          🚨 {n} 비상
        </motion.span>
      ))}
    </div>
  );
}

function Opponent({ view, pid, name, player, turn, timer }) {
  const isRest = view.rest === pid;
  const cnt = view.handCounts[pid];
  return (
    <div className={`panel min-w-0 flex-1 p-2 transition ${turn ? 'ring-2 ring-gold-400' : ''} ${isRest ? 'opacity-50' : ''}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <b className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="relative inline-flex">
            <Avatar player={player} size={26} showTitle className={turn ? '!ring-gold-400' : ''} />
            <EmoteBubble userId={pid} below />
          </span>
          {turn && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }}>▶ </motion.span>}
          <span className="truncate">{name}</span>
          <BotLevel player={player} />
          {isRest && <span className="ml-1 text-xs text-slate-300">(쉬는 중)</span>}
          {timer}
        </b>
        <span className="shrink-0 text-xs text-slate-300">패 {cnt}</span>
      </div>
      {!isRest && <ScoreChip view={view} pid={pid} />}
      <div className="mt-1 flex h-[42px] items-end">
        {Array.from({ length: cnt }).map((_, i) => (
          <Card key={`b${pid}-${i}`} back size="xs" style={{ marginLeft: i ? -12 : 0 }} />
        ))}
      </div>
      <div className="mt-1 min-h-[42px]">
        <Captured ids={view.captured[pid]} size="xs" />
      </div>
    </div>
  );
}

const BANNER_STYLE = {
  ppeok: 'from-slate-300 to-slate-500 text-slate-900',
  bomb: 'from-orange-400 to-red-600 text-white',
  ttadak: 'from-yellow-300 to-amber-500 text-amber-950',
  jjok: 'from-sky-300 to-sky-500 text-sky-950',
  sweep: 'from-fuchsia-400 to-purple-600 text-white',
  go: 'from-red-500 to-rose-700 text-white',
  shake: 'from-cyan-300 to-sky-500 text-sky-950',
  bonus: 'from-amber-300 to-yellow-500 text-amber-950',
  sale: 'from-emerald-300 to-emerald-600 text-emerald-950',
  steal: 'from-pink-300 to-pink-500 text-pink-950',
  special: 'from-lime-300 to-green-500 text-green-950',
  end: 'from-gold-400 to-amber-600 text-amber-950',
};

const GRACE_SEC = 60;

/** 연결이 끊긴 플레이어가 있으면 재접속 대기 카운트다운을 보여준다 */
function OfflineNotice({ players, skew }) {
  const [now, setNow] = useState(Date.now());
  const off = players.filter((p) => !p.bot && !p.online && p.offlineAt);
  useEffect(() => {
    if (!off.length) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [off.length]);
  if (!off.length) return null;
  return (
    <div className="space-y-1">
      {off.map((p) => {
        const left = Math.max(0, GRACE_SEC - Math.floor((now + skew - p.offlineAt) / 1000));
        return (
          <div key={p.id} className="rounded-lg bg-red-700/90 px-3 py-1.5 text-center text-xs font-bold text-white sm:text-sm">
            📡 {p.username}님의 연결이 끊겼습니다. 재접속을 대기합니다 ({left}초) — 그동안 AI가 대신 둡니다
          </div>
        );
      })}
    </div>
  );
}

const COMBO_EMOJI = { 홍단: '🟥', 청단: '🟦', 초단: '🟩', 고도리: '🐦' };

/** 홍단/청단/초단/고도리/광 완성 알림 (진행을 막지 않는 상단 팝업) */
function ComboPopup({ combo, nameOf, playerOf }) {
  return (
    <AnimatePresence>
      {combo && (
        <motion.div key={combo.key} className="pointer-events-none absolute inset-x-0 top-[18%] z-30 flex justify-center" initial={{ opacity: 0, y: -20, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }} transition={{ type: 'spring', stiffness: 320, damping: 18 }}>
          <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 px-5 py-2.5 text-felt-900 shadow-2xl ring-4 ring-white/70">
            <Avatar player={playerOf(combo.pid)} size={44} className="!ring-2 !ring-white" />
            <div className="leading-tight">
              <div className="text-2xl font-black drop-shadow-sm sm:text-3xl">{COMBO_EMOJI[combo.name] ?? '✨'} {combo.name} 완성!</div>
              <div className="text-xs font-bold opacity-80">{nameOf(combo.pid)} · +{combo.pts}점</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 족보 비상(한 장 남음) 알림: 작게, 진행을 막지 않음 */
function NearPopup({ alert, nameOf, playerOf, you }) {
  return (
    <AnimatePresence>
      {alert && (
        <motion.div key={alert.key} className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center" initial={{ opacity: 0, y: -12, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 360, damping: 20 }}>
          <div className={`flex items-center gap-2 rounded-full px-4 py-1.5 font-black shadow-xl ring-2 ring-white/70 ${alert.pid === you ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            <Avatar player={playerOf(alert.pid)} size={26} />
            <span className="text-sm sm:text-base">🚨 {alert.names.map((n) => `${n} 비상`).join(' · ')}!</span>
            <span className="text-xs font-bold opacity-80">{alert.pid === you ? '한 장만 더!' : nameOf(alert.pid)}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 판 진행 중 새로 생긴 '비상'을 감지해 팝업 + 경고음. 판 시작/재접속 직후의 상태는 알리지 않는다. */
function useNearAlert(view, resetKey) {
  const [alert, setAlert] = useState(null);
  const prev = useRef(null);
  const key = useRef(resetKey);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const now = Object.fromEntries(view.active.map((p) => [p, nearCombos(view.captured, p)]));
    const fresh = key.current === resetKey && prev.current
      ? view.active.map((p) => ({ pid: p, names: now[p].filter((n) => !(prev.current[p] ?? []).includes(n)) })).filter((a) => a.names.length)
      : [];
    key.current = resetKey;
    prev.current = now;
    if (!fresh.length || view.phase === 'ended') return;
    sfx('alert');
    setAlert({ ...fresh[0], key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAlert(null), 1800);
  }, [view, resetKey]);
  return alert;
}

function Banner({ banner, nameOf, playerOf }) {
  return (
    <AnimatePresence>
      {banner && (
        <motion.div key={banner.key} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {['bomb', 'ppeok', 'sweep'].includes(banner.kind) && (
            <motion.div className={`absolute inset-0 ${banner.kind === 'bomb' ? 'bg-red-500' : banner.kind === 'sweep' ? 'bg-fuchsia-400' : 'bg-slate-200'}`} initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.7 }} />
          )}
          <motion.div
            className={`rounded-2xl bg-gradient-to-br px-8 py-4 text-center shadow-2xl ring-4 ring-white/70 ${BANNER_STYLE[banner.kind] || BANNER_STYLE.special}`}
            initial={{ scale: 0.2, rotate: -14, opacity: 0 }}
            animate={{ scale: [0.2, 1.35, 1], rotate: [-14, 5, 0], opacity: 1 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-3 sm:gap-5">
              {banner.pid != null && banner.kind !== 'end' && (
                <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.1 }} className="flex flex-col items-center">
                  <Avatar player={playerOf(banner.pid)} size={64} className="!ring-4 !ring-white shadow-lg sm:!h-20 sm:!w-20" />
                </motion.div>
              )}
              <div className="text-left">
                <div className="text-4xl font-black drop-shadow sm:text-6xl">{banner.text}</div>
                {banner.pid != null && banner.kind !== 'end' && <div className="mt-1 text-sm font-bold opacity-90">{nameOf(banner.pid)}</div>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Modal({ children }) {
  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto bg-felt-800 p-5 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

const STEP_MS = 420;
const PAY_KIND = { sale: '광팔기', ppeok: '뻑', forfeit: '기권' };

/**
 * 정산 연출: 족보 점수가 한 줄씩 쌓이고(누적 합계), 패자별로 배수(박·흔들기·고 등)가 하나씩 붙은 뒤 최종 점수가 나온다.
 * 클릭하면 끝까지 건너뛴다. @returns { node, done }
 */
function useSettleSteps(res, over, nameOf) {
  const seq = useMemo(() => {
    if (res.nagari) return [];
    const ev = (res.detail || []).map((d, i) => ({ t: 'item', i, label: d.name, add: d.pts }));
    if (res.goBonus) ev.push({ t: 'item', i: ev.length, label: `고 보너스`, add: res.goBonus });
    (res.payments || []).forEach((p, j) => {
      if (p.kind !== 'game') return;
      ev.push({ t: 'row', j });
      p.tags.forEach((tag, k) => ev.push({ t: 'tag', j, k, mul: tag.includes('×') }));
      ev.push({ t: 'total', j });
    });
    return ev;
  }, [res]);
  const [shown, setShown] = useState(0);
  const done = shown >= seq.length;
  useEffect(() => {
    if (done) return undefined;
    const t = setTimeout(() => {
      const e = seq[shown];
      sfx(e.t === 'tag' ? (e.mul ? 'boost' : 'tick') : e.t === 'total' ? 'chip' : 'tick');
      setShown((n) => n + 1);
    }, shown === 0 ? 500 : STEP_MS);
    return () => clearTimeout(t);
  }, [shown, done, seq]);
  const vis = seq.slice(0, shown);
  const items = vis.filter((e) => e.t === 'item');
  const sum = items.reduce((a, e) => a + e.add, 0);
  const has = (pred) => vis.some(pred);
  const games = (res.payments || []).map((p, j) => ({ p, j })).filter(({ p }) => p.kind === 'game');
  const others = (res.payments || []).filter((p) => p.kind !== 'game');
  const node = res.nagari ? null : (
    <div className="space-y-2 text-sm" onClick={() => setShown(seq.length)} title="클릭하면 건너뜁니다">
      <div className="rounded-lg bg-black/30 p-2">
        <div className="flex min-h-[26px] flex-wrap justify-center gap-1">
          {items.map((e) => (
            <motion.span key={e.i} initial={{ scale: 0.3, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="rounded bg-white/10 px-2 py-0.5 text-xs">
              {e.label} <b className="text-gold-400">+{e.add}</b>
            </motion.span>
          ))}
        </div>
        <motion.div key={sum} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="mt-1 text-lg font-black text-gold-400">
          {res.base != null && !(res.detail || []).length && !res.goBonus ? `${res.base}점` : `${sum}점`}
        </motion.div>
      </div>
      {games.map(({ p, j }) =>
        has((e) => e.t === 'row' && e.j === j) ? (
          <motion.div key={j} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="rounded-lg bg-black/30 p-2 text-left text-xs">
            <div className="flex items-center justify-between gap-2">
              <span>{nameOf(p.from)} → {nameOf(p.to)}</span>
              {has((e) => e.t === 'total' && e.j === j) && (
                <motion.b initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-base text-yellow-300">
                  {p.total}점 × {won(over.bet)}
                </motion.b>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.tags.map((tag, k) =>
                has((e) => e.t === 'tag' && e.j === j && e.k === k) ? (
                  <motion.span key={k} initial={{ scale: 2, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} className={`rounded px-1.5 py-0.5 font-bold ${tag.includes('×') ? 'bg-red-600' : tag.includes('독박') ? 'bg-red-800' : 'bg-white/15'}`}>
                    {tag}
                  </motion.span>
                ) : null,
              )}
            </div>
          </motion.div>
        ) : null,
      )}
      {done && others.length > 0 && (
        <div className="space-y-1 rounded-lg bg-black/30 p-2 text-left text-xs">
          {others.map((p, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span>{nameOf(p.from)} → {nameOf(p.to)} <span className="text-slate-400">{PAY_KIND[p.kind] ?? ''}</span></span>
              <b>{p.total}점 × {won(over.bet)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  return { node, done };
}

function GameOver({ over, view, nameOf, onClose, userId }) {
  const res = over.result;
  const mine = over.payout?.delta?.[userId];
  const settle = useSettleSteps(res, over, nameOf);
  return (
    <Modal>
      <h2 className="text-2xl font-black text-gold-400">{res.nagari ? '나가리' : res.winner === userId ? '🎉 승리!' : res.winner == null ? '게임 종료' : `${nameOf(res.winner)} 승리`}</h2>
      {res.nagari && <p className="text-sm text-slate-300">{res.shodang ? '🫴 쇼당 — 모두 수락해서 나가리입니다. ' : '승자 없이 끝났습니다. '}선은 유지됩니다.</p>}
      {res.dokbak != null && <p className="rounded bg-red-700/80 px-3 py-1 text-sm font-black">💥 {nameOf(res.dokbak)}님 독박! 다른 패자의 몫까지 혼자 냅니다</p>}
      {settle.node}
      {res.nagari && (res.payments || []).length > 0 && (
        <div className="space-y-1 rounded-lg bg-black/30 p-2 text-left text-xs">
          {res.payments.map((p, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span>{nameOf(p.from)} → {nameOf(p.to)} <span className="text-slate-400">{PAY_KIND[p.kind] ?? ''}</span></span>
              <b>{p.total}점 × {won(over.bet)}</b>
            </div>
          ))}
        </div>
      )}
      {!settle.done ? null : over.ranked && over.payout ? (
        <div className="space-y-1 text-sm">
          {Object.entries(over.payout.delta).map(([pid, d]) => (
            <div key={pid} className="flex justify-between rounded bg-white/5 px-3 py-1">
              <span>{nameOf(Number(pid))}</span>
              <b className={d > 0 ? 'text-emerald-300' : d < 0 ? 'text-red-300' : ''}>{signed(d)}원</b>
            </div>
          ))}
          {mine != null && <p className="pt-1 text-slate-300">내 머니 {won(over.payout.money?.[userId] ?? 0)}원</p>}
        </div>
      ) : (
        !over.ranked && <p className="text-sm text-sky-300">연습 게임이라 머니와 전적에 반영되지 않습니다.</p>
      )}
      <button className="btn btn-gold w-full" onClick={onClose}>대기실로</button>
    </Modal>
  );
}

/** onDone 이 렌더마다 새로 만들어져도(차례 타이머가 1초마다 다시 그림) 타이머가 다시 시작되지 않도록 ref 로 잡는다 */
function useLatest(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return ref;
}

function FirstIntro({ info, nameOf, playerOf, onDone }) {
  const done = useLatest(onDone);
  useEffect(() => {
    const t = setTimeout(() => done.current(), 2600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/75" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onDone}>
      <h2 className="text-2xl font-black text-gold-400">선 정하기 (밤일낮장)</h2>
      <div className="flex gap-4">
        {info.flips.map((f, i) => (
          <motion.div key={f.p} className="text-center" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.25 }}>
            <Card id={f.id} size="lg" glow={f.p === info.first} />
            <div className="mt-1 flex items-center justify-center gap-1.5 text-sm font-bold">
              <Avatar player={playerOf(f.p)} size={22} />
              {nameOf(f.p)}
            </div>
          </motion.div>
        ))}
      </div>
      <p className="text-lg font-bold">{nameOf(info.first)}님이 선입니다</p>
    </motion.div>
  );
}

/** 기리(패 떼기): 선의 앞사람이 섞인 패 더미를 둘로 나눠 위아래를 바꾼다 (연출) */
function GiriOverlay({ cutter, nameOf, playerOf, onDone }) {
  const done = useLatest(onDone);
  useEffect(() => {
    sfx('flip');
    const t1 = setTimeout(() => sfx('place'), 1000);
    const t2 = setTimeout(() => done.current(), 1700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [done]);
  const stack = (n) => Array.from({ length: n }).map((_, i) => (
    <div key={i} className="absolute" style={{ left: i * 1.5, top: -i * 1.5 }}>
      <Card back size="md" />
    </div>
  ));
  return (
    <motion.div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/65" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onDone}>
      <div className="relative h-[100px] w-[180px]">
        {/* 아래 절반: 제자리 */}
        <div className="absolute left-[62px] top-[14px]">{stack(4)}</div>
        {/* 위 절반: 떼어서 옆으로 → 아래로 넣는다 */}
        <motion.div
          className="absolute left-[62px] top-[14px]"
          initial={{ x: 0, y: -8, zIndex: 2 }}
          animate={{ x: [0, 72, 72, 0], y: [-8, -8, 10, 6], zIndex: [2, 2, 0, 0] }}
          transition={{ duration: 1.2, times: [0, 0.35, 0.6, 1], ease: 'easeInOut' }}
        >
          {stack(4)}
        </motion.div>
      </div>
      <div className="flex items-center gap-2 text-lg font-black text-gold-400">
        <Avatar player={playerOf(cutter)} size={30} />
        ✂️ {nameOf(cutter)}님이 패를 뗍니다 (기리)
      </div>
    </motion.div>
  );
}

export function GameBoard() {
  const { skew, room, user, view, banner, combo, busy, over, startInfo, turnInfo, emit, send, roomChat, dismissOver } = useApp();
  const [shakeFor, setShakeFor] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const nearAlert = useNearAlert(view, startInfo?.key);
  // 판 시작 연출: 선 정하기(밤일낮장) → 기리 순서
  const [intro, setIntro] = useState(startInfo?.flips ? 'first' : startInfo?.cutter != null ? 'giri' : null);
  useEffect(() => setIntro(startInfo?.flips ? 'first' : startInfo?.cutter != null ? 'giri' : null), [startInfo]);
  const left = useCountdown(turnInfo?.deadlineAt, skew);
  // 차례 배지: 서버가 알려준 지금 차례인 사람에게만 (남은 시간 또는 AI 대행)
  const timerFor = (pid) => (turnInfo?.userId === pid && view.phase !== 'ended' ? <TurnTimer left={left} auto={turnInfo.auto} /> : null);

  const playerOf = (pid) => room?.players.find((p) => p.id === pid);
  const nameOf = (pid) => room?.players.find((p) => p.id === pid)?.username ?? `플레이어${pid}`;
  const you = user.id;
  const spectator = !room?.players.some((p) => p.id === you); // 관전자: 손패·조작 UI 없음
  const isRest = view.rest === you;
  const myTurn = view.turn === you && !busy;
  const canPlay = myTurn && view.phase === 'play';
  // 바닥패를 같은 달끼리 묶는다. 묶음 순서는 처음 나타난 순서를 유지해서 다른 묶음이 생기거나 사라져도 나머지는 제자리에 머문다.
  const groupOrder = useRef([]);
  const byMonth = new Map();
  for (const id of view.floor) {
    const m = monthOf(id);
    const key = m > 0 ? m : `b${id}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(id);
  }
  groupOrder.current = groupOrder.current.filter((k) => byMonth.has(k));
  for (const k of byMonth.keys()) if (!groupOrder.current.includes(k)) groupOrder.current.push(k);
  const floorGroups = groupOrder.current.map((month) => ({ month, ids: byMonth.get(month) }));
  // 내 차례: 바닥과 짝이 맞는 손패/바닥패는 솟아오르고 테두리로 강조
  const floorMonths = new Set(view.floor.map(monthOf));
  const matchHand = new Set(canPlay ? view.hand.filter((id) => monthOf(id) > 0 && floorMonths.has(monthOf(id))) : []);
  const handMonths = new Set([...matchHand].map(monthOf));
  const matchFloor = new Set(canPlay ? view.floor.filter((id) => handMonths.has(monthOf(id))) : []);
  const canDrawOnly = canPlay && (view.hand.length === 0 || view.dummies[you] > 0);
  const choiceOpts = myTurn && view.phase === 'choose' && view.choice ? view.choice.options : [];
  const hand = useMemo(() => [...view.hand].sort((a, b) => a - b), [view.hand]);
  const opps = view.active.filter((p) => p !== you);
  const restOpp = view.rest != null && view.rest !== you ? [view.rest] : [];

  const playCard = (id) => {
    if (!canPlay) return;
    const m = monthOf(id);
    if (m > 0) {
      const hm = view.hand.filter((c) => monthOf(c) === m).length;
      const fm = view.floor.filter((c) => monthOf(c) === m).length;
      const isBomb = hm === 3 && fm === 1;
      if (hm >= 3 && !isBomb && !view.shaken[you].includes(m)) return setShakeFor(id);
    }
    emit('game:play', { cardId: id });
  };

  let status = '';
  if (view.phase === 'chong') status = `${nameOf(view.chongAsk)}님이 총통 선언을 고민 중…`;
  else if (view.phase === 'gwang') status = `${nameOf(view.gwangAsk)}님이 광팔기를 고민 중…`;
  else if (view.phase === 'gostop') status = `${nameOf(view.turn)}님이 고/스톱 선택 중…`;
  else if (view.phase === 'shodang') status = `🫴 ${nameOf(view.shodangBy)}님의 쇼당! ${view.turn === you ? '답해 주세요' : `${nameOf(view.turn)}님이 답하는 중…`}`;
  else if (view.phase === 'ended') status = '게임 종료';
  else if (busy || view.phase === 'busy') status = '진행 중…';
  else if (view.turn === you) status = view.phase === 'choose' ? '먹을 바닥 패를 선택하세요' : canDrawOnly ? '패를 내거나 더미를 뒤집으세요' : '내 차례입니다. 패를 내세요';
  else status = `${nameOf(view.turn)}님의 차례`;

  const myScore = view.scores[you];

  return (
    <div className="relative mx-auto flex h-full max-w-6xl flex-col gap-2 overflow-hidden p-2">
      {/* 상단 정보 */}
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          {room.name} · 판돈 {won(room.bet)} · {view.active.length}인{startInfo?.ranked === false && ' · 연습(머니 무변동)'}
        </span>
        <div className="flex items-center gap-2">
          {view.sale && <span className="rounded bg-emerald-700 px-2 py-0.5">{nameOf(view.sale.seller)} 광팔기</span>}
          {view.shodangReceiver != null && <span className="hidden rounded bg-red-700 px-2 py-0.5 sm:inline" title="쇼당을 받은 사람은 지면 독박">{nameOf(view.shodangReceiver)} 쇼당 받음</span>}
          <button className="btn btn-gold whitespace-nowrap !px-3 !py-1" onClick={() => setHelp((h) => !h)} aria-label="규칙 보기" aria-pressed={help}>
            ❓<span className="hidden sm:inline"> 규칙</span>
          </button>
          {!spectator && <AutoToggle room={room} you={you} emit={emit} />}
          <SoundToggle />
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => setChatOpen((o) => !o)}>💬<span className="hidden sm:inline"> 채팅</span></button>
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1" onClick={() => window.confirm('나가면 기권패 처리됩니다. 나갈까요?') && emit('room:leave')}>나가기</button>
        </div>
      </div>

      <OfflineNotice players={room.players} skew={skew} />

      <LayoutGroup>
        {/* 상대 */}
        <div className="flex gap-2">
          {[...opps, ...restOpp].map((pid) => (
            <Opponent key={pid} view={view} pid={pid} name={nameOf(pid)} player={playerOf(pid)} turn={view.turn === pid && view.phase !== 'ended'} timer={timerFor(pid)} />
          ))}
        </div>

        {/* 바닥 */}
        <motion.div
          key={banner && ['ppeok', 'bomb'].includes(banner.kind) ? banner.key : 'floor'}
          animate={banner && ['ppeok', 'bomb'].includes(banner.kind) ? { x: [0, -12, 12, -9, 9, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="relative flex min-h-0 flex-1 items-center justify-center gap-4 rounded-2xl bg-felt-700/70 p-3 ring-1 ring-white/10"
        >
          <div className="relative flex shrink-0 flex-col items-center gap-1">
            <div className="relative h-[71px] w-[46px] sm:h-[86px] sm:w-[56px]">
              {[2, 1, 0].map((i) => (
                <div key={i} className="absolute" style={{ left: i * 2, top: -i * 2 }}>
                  <Card back size="md" />
                </div>
              ))}
            </div>
            <span className="text-xs text-slate-300">더미 {view.stockCount}</span>
          </div>
          <div className="flex max-h-full min-w-0 flex-1 flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 overflow-y-auto py-4 [--cw:40px] sm:[--cw:56px]">
            {floorGroups.map((grp) => {
              const spread = grp.ids.some((id) => choiceOpts.includes(id)); // 고를 때는 펼쳐서 클릭하기 쉽게
              const dx = spread ? 0.9 : 0.34;
              const dy = spread ? 0 : 0.14;
              const n = grp.ids.length;
              return (
                <div
                  key={`g${grp.month}`}
                  className="relative"
                  style={{ width: `calc(var(--cw) * ${1 + (n - 1) * dx})`, height: `calc(var(--cw) * ${1.54 + (n - 1) * dy})` }}
                >
                  {grp.ids.map((id, i) => {
                    const opt = choiceOpts.includes(id);
                    const match = matchFloor.has(id);
                    return (
                      <Card
                        key={id}
                        id={id}
                        size="md"
                        className="!absolute !w-[var(--cw)] !h-[calc(var(--cw)*1.54)]"
                        style={{ left: `calc(var(--cw) * ${i * dx})`, top: `calc(var(--cw) * ${i * dy})`, zIndex: i }}
                        selected={match}
                        hl={match}
                        glow={opt || id === view.drawn}
                        fresh={id === view.drawn}
                        slam={id === view.played || id === view.drawn}
                        dim={choiceOpts.length > 0 && !opt}
                        onClick={opt ? () => emit('game:choose', { cardId: id }) : undefined}
                      />
                    );
                  })}
                  {n >= 3 && (
                    <span className="pointer-events-none absolute -right-1 -top-3 z-10 rounded-full bg-red-600 px-1.5 text-[10px] font-black text-white shadow">
                      {n >= 4 ? '4장' : '뻑'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <Banner banner={banner} nameOf={nameOf} playerOf={playerOf} />
          <ComboPopup combo={combo} nameOf={nameOf} playerOf={playerOf} />
          <NearPopup alert={nearAlert} nameOf={nameOf} playerOf={playerOf} you={you} />
        </motion.div>

        {/* 내 영역 (관전자에게는 손패·조작 UI 를 숨긴다) */}
        {!spectator && (
          <>
        <div className={`panel p-2 ${view.turn === you && view.phase !== 'ended' ? 'ring-2 ring-gold-400' : ''}`}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative inline-flex">
                <Avatar player={user} size={30} showTitle className={view.turn === you ? '!ring-gold-400' : ''} />
                <EmoteBubble userId={you} />
              </span>
              <EmoteButton />
              <b className="text-sm">{user.name}</b>
              {timerFor(you)}
              {!isRest && <ScoreChip view={view} pid={you} />}
              {!isRest && <span className="text-[11px] text-slate-400">/ {view.threshold}점부터 고·스톱</span>}
            </div>
            <motion.span key={status} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-bold text-gold-400">
              {isRest ? '이번 판은 쉽니다 (관전)' : status}
            </motion.span>
          </div>
          <div className="min-h-[42px]">
            <Captured ids={view.captured[you]} size="sm" />
          </div>
          <div className="mt-2 flex items-end justify-center overflow-x-auto pb-1 pt-4 [--hw:54px] sm:[--hw:70px]">
            {hand.map((id, i) => (
              <Card key={id} id={id} size="lg" style={{ marginLeft: i ? `min(4px, calc((100vw - 40px - ${hand.length} * var(--hw)) / ${hand.length - 1}))` : 0, zIndex: i }} selected={matchHand.has(id)} hl={matchHand.has(id)} onClick={canPlay ? () => playCard(id) : undefined} dim={choiceOpts.length > 0} />
            ))}
            {canDrawOnly && (
              <button className="btn btn-gold ml-3 self-center" onClick={() => emit('game:play', { cardId: null })}>
                더미 뒤집기
              </button>
            )}
            {canPlay && view.shodangOk && (
              <button
                className="btn btn-red ml-3 shrink-0 self-center"
                title="두 상대가 모두 날 수 있는 상황: 둘 다 수락하면 나가리"
                onClick={() => window.confirm('쇼당을 부를까요?\n두 상대가 모두 수락하면 나가리, 한 명이라도 받으면 계속하고 받은 사람이 독박 책임을 집니다. (한 판에 한 번)') && emit('game:shodang')}
              >
                🫴 쇼당
              </button>
            )}
          </div>
        </div>
          </>
        )}
      </LayoutGroup>

      {/* 채팅 */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div className="absolute bottom-2 right-2 z-20 h-72 w-72" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Chat className="h-full bg-felt-900/95" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{help && <GostopHelp key="help" onClose={() => setHelp(false)} />}</AnimatePresence>

      {/* 선택 모달 */}
      <AnimatePresence>
        {intro === 'first' && startInfo?.flips && !over && <FirstIntro key="intro" info={startInfo} nameOf={nameOf} playerOf={playerOf} onDone={() => setIntro(startInfo.cutter != null ? 'giri' : null)} />}
        {intro === 'giri' && startInfo?.cutter != null && !over && <GiriOverlay key="giri" cutter={startInfo.cutter} nameOf={nameOf} playerOf={playerOf} onDone={() => setIntro(null)} />}

        {!busy && view.phase === 'shodang' && view.shodangAsk === you && (
          <Modal key="shodang">
            <h3 className="text-xl font-black text-gold-400">🫴 {nameOf(view.shodangBy)}님의 쇼당!</h3>
            <p className="text-sm">두 사람이 모두 날 수 있는 상황입니다. 둘 다 수락하면 이번 판은 나가리가 됩니다.</p>
            <p className="text-xs text-red-300">받아서 계속하면, 쇼당을 부른 사람이 아닌 다른 사람이 났을 때 내가 독박을 씁니다.</p>
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={() => emit('game:shodangAnswer', { accept: true })}>나가리 수락</button>
              <button className="btn btn-red flex-1" onClick={() => emit('game:shodangAnswer', { accept: false })}>받기 (계속)</button>
            </div>
          </Modal>
        )}

        {!busy && view.phase === 'chong' && view.chongAsk === you && (
          <Modal key="chong">
            <h3 className="text-xl font-black text-gold-400">총통!</h3>
            <p className="text-sm">첫 패에 같은 달 4장이 있습니다. 지금 선언하면 즉시 승리합니다. 계속하면 이길 때 ×4 입니다.</p>
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={() => emit('game:chongtong')}>총통 선언</button>
              <button className="btn btn-ghost flex-1" onClick={() => emit('game:passChongtong')}>계속 진행</button>
            </div>
          </Modal>
        )}

        {!busy && view.phase === 'gwang' && view.gwangAsk === you && (
          <Modal key="gwang">
            <h3 className="text-xl font-black text-gold-400">광팔기</h3>
            <p className="text-sm">첫 패에 광이 3장 이상입니다. 광을 팔면 광 1장당 2점을 받고 이번 판은 쉽니다.</p>
            <div className="flex justify-center gap-1">{hand.filter((id) => kindOf(id) === 'gwang').map((id) => <Card key={id} id={id} size="md" />)}</div>
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={() => emit('game:sellGwang')}>광 팔기</button>
              <button className="btn btn-ghost flex-1" onClick={() => emit('game:passGwang')}>그냥 치기</button>
            </div>
          </Modal>
        )}

        {!busy && view.phase === 'gostop' && view.turn === you && (
          <Modal key="gostop">
            <h3 className="text-xl font-black text-gold-400">{myScore.total}점 달성!</h3>
            <p className="text-sm">현재 {view.go[you]}고 · 고를 하면 점수를 더 쌓지만 상대가 먼저 나면 고박 위험이 있습니다.</p>
            <div className="flex gap-2">
              <button className="btn btn-red flex-1 !py-3 text-lg" onClick={() => emit('game:go')}>고!</button>
              <button className="btn btn-gold flex-1 !py-3 text-lg" onClick={() => emit('game:stop')}>스톱</button>
            </div>
          </Modal>
        )}

        {shakeFor != null && (
          <Modal key="shake">
            <h3 className="text-xl font-black text-gold-400">흔들기</h3>
            <p className="text-sm">같은 달 패를 3장 가지고 있습니다. 흔들면 점수가 ×2 가 됩니다.</p>
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={() => { const id = shakeFor; setShakeFor(null); emit('game:play', { cardId: id, shake: true }); }}>흔들기</button>
              <button className="btn btn-ghost flex-1" onClick={() => { const id = shakeFor; setShakeFor(null); emit('game:play', { cardId: id }); }}>그냥 내기</button>
            </div>
          </Modal>
        )}

        {over && <GameOver key="over" over={over} view={view} nameOf={nameOf} userId={you} onClose={dismissOver} />}
      </AnimatePresence>
    </div>
  );
}
