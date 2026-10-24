import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { cardImg, won } from '../cards.js';
import { sfx } from '../sound.js';

// 릴 한 칸 크기. 창에는 3칸이 보이고 가운데 칸이 당첨 라인이다.
const CELL = 112;
const SYMBOLS = ['똥광', '삼팔광땡', '멧돼지', '홍단', '껍데기'];
const CYCLE = CELL * SYMBOLS.length;
const SPIN_SPEED = 2800; // px/s
// 릴마다 심볼 순서를 달리해서 세 릴이 똑같은 그림으로 보이지 않게 한다
const REEL_ORDER = [
  [0, 1, 2, 3, 4],
  [2, 4, 0, 3, 1],
  [3, 0, 4, 1, 2],
];
// 화투패 에셋 재활용: 똥광(11월 오동 광), 삼팔광땡(3월 벚꽃 광 + 8월 공산 광), 멧돼지(7월 홍싸리 열끗), 홍단(1월 홍단), 껍데기(1월 피)
const SYMBOL_IDS = { 똥광: [40], 삼팔광땡: [8, 28], 멧돼지: [24], 홍단: [1], 껍데기: [2] };

const TIER_STYLE = {
  jackpot: { title: '🎉 잭팟!!', color: 'text-yellow-300' },
  big: { title: '💰 대박!', color: 'text-amber-300' },
  mid: { title: '✨ 중박!', color: 'text-emerald-300' },
  small: { title: '👍 본전!', color: 'text-sky-300' },
  miss: { title: '😢 꽝…', color: 'text-slate-400' },
};

function SymbolCell({ name }) {
  const ids = SYMBOL_IDS[name];
  return (
    <div className="flex items-center justify-center" style={{ height: CELL }}>
      {ids.length === 1 ? (
        <img src={cardImg(ids[0])} alt={name} draggable={false} className="h-[98px] w-[64px] rounded-md object-fill shadow-md shadow-black/60 ring-1 ring-black/40" />
      ) : (
        <div className="relative h-[98px] w-[76px]">
          {ids.map((id, i) => (
            <img key={id} src={cardImg(id)} alt="" draggable={false} className="absolute h-[84px] w-[54px] rounded-md object-fill shadow-md shadow-black/60 ring-1 ring-black/40" style={{ left: i * 22, top: i * 12 }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 세로로 도는 릴 하나. y(px) 모션값 하나만 움직이므로 transform 만 갱신되어 가볍다. */
const Reel = React.forwardRef(function Reel({ order, spinning, dim }, ref) {
  const y = useMotionValue(0);
  const loop = useRef(null);
  // y 를 [-CYCLE, 0) 로 감아서 같은 두 사이클짜리 띠를 무한히 재사용
  const ty = useTransform(y, (v) => (((v % CYCLE) + CYCLE) % CYCLE) - CYCLE);
  const names = useMemo(() => [...order, ...order].map((i) => SYMBOLS[i]), [order]);

  React.useImperativeHandle(ref, () => ({
    start() {
      loop.current?.stop();
      loop.current = animate(y, y.get() - 1e7, { duration: 1e7 / SPIN_SPEED, ease: 'linear' });
    },
    /** target 심볼이 가운데 칸에 오도록 감속하며 멈춘다 */
    stop(target, ms = 500) {
      loop.current?.stop();
      const k = order.map((i) => SYMBOLS[i]).indexOf(target);
      const want = ((((-(k - 1) * CELL) % CYCLE) + CYCLE) % CYCLE); // wrapped 값이 -(k-1)*CELL 이 되는 y mod CYCLE
      const base = y.get() - 3.5 * CELL; // 멈추기 전에 3.5칸은 더 굴러서 ease-out 이 보이게
      const delta = ((((base % CYCLE) + CYCLE) % CYCLE) - want + CYCLE) % CYCLE;
      return new Promise((resolve) => {
        animate(y, base - delta, { duration: ms / 1000, ease: [0.12, 0.85, 0.22, 1], onComplete: resolve });
      });
    },
  }));

  return (
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-b from-stone-100 via-white to-stone-100 ring-4 ring-amber-500/80" style={{ height: CELL * 3, width: 96 }}>
      <motion.div
        className="will-change-transform"
        style={{ y: ty, filter: spinning ? 'blur(3.5px) saturate(1.3)' : dim ? 'grayscale(1) brightness(0.55)' : 'none', transition: 'filter 0.4s' }}
      >
        {names.map((n, i) => (
          <SymbolCell key={i} name={n} />
        ))}
      </motion.div>
      {/* 위아래 그림자로 원통 느낌 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/45" />
    </div>
  );
});

function CoinRain() {
  const coins = useMemo(
    () => Array.from({ length: 44 }, () => ({ x: Math.random() * 100, size: 16 + Math.random() * 20, delay: Math.random() * 1.4, dur: 1.6 + Math.random() * 1.6, rot: (Math.random() - 0.5) * 720 })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {coins.map((c, i) => (
        <motion.div
          key={i}
          className="absolute flex items-center justify-center rounded-full bg-gradient-to-br from-yellow-200 to-amber-500 text-[10px] font-black text-amber-900 ring-2 ring-amber-700"
          style={{ left: `${c.x}%`, width: c.size, height: c.size, top: -40 }}
          initial={{ y: -40, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', rotate: c.rot, opacity: [1, 1, 0.9] }}
          transition={{ duration: c.dur, delay: c.delay, ease: 'easeIn' }}
        >
          ₩
        </motion.div>
      ))}
    </div>
  );
}

function Burst() {
  const dots = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ a: (i / 28) * Math.PI * 2, d: 120 + Math.random() * 160, s: 4 + Math.random() * 6 })), []);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      {dots.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-yellow-300 shadow-[0_0_10px_3px_rgba(253,224,71,.9)]"
          style={{ width: p.s, height: p.s }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: Math.cos(p.a) * p.d, y: Math.sin(p.a) * p.d, opacity: 0, scale: 0.3 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

export function SlotMachine() {
  const { token, user, updateUser } = useApp();
  const [info, setInfo] = useState(null); // { slot, table, rtp }
  const [phase, setPhase] = useState('idle'); // idle | spinning | done
  const [result, setResult] = useState(null);
  const [flash, setFlash] = useState(0);
  const [error, setError] = useState('');
  const reels = [useRef(null), useRef(null), useRef(null)];
  const [revealed, setRevealed] = useState([false, false, false]);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const refresh = useCallback(() => api.slotStatus(token).then(setInfo).catch(() => {}), [token]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const slot = info?.slot;
  const left = slot?.left ?? 0;
  const spinning = phase === 'spinning';
  const canSpin = !spinning && slot && left >= slot.bet && user.money >= slot.bet;

  const spin = async () => {
    if (!canSpin) return;
    setError('');
    setResult(null);
    setRevealed([false, false, false]);
    setPhase('spinning');
    sfx('slotSpin');
    const t0 = performance.now();
    reels.forEach((r) => r.current?.start());
    let res;
    try {
      res = await api.slotSpin(token); // 결과는 서버가 난수로 정한다
    } catch (e) {
      reels.forEach((r) => r.current?.stop(SYMBOLS[0], 300));
      setPhase('idle');
      setError(e.message);
      refresh();
      return;
    }
    // 최소 0.9초는 돌린 뒤, 왼쪽 릴부터 0.5초 간격으로 탁·탁·탁 멈춘다
    await new Promise((r) => setTimeout(r, Math.max(0, 900 - (performance.now() - t0))));
    for (let i = 0; i < 3; i++) {
      if (!alive.current) return;
      const stopping = reels[i].current.stop(res.resultSymbols[i], 500);
      stopping.then(() => {
        sfx('slotStop');
        setRevealed((v) => v.map((x, j) => (j === i ? true : x)));
      });
      if (i < 2) await new Promise((r) => setTimeout(r, 500));
      else await stopping;
    }
    if (!alive.current) return;
    setResult(res);
    setPhase('done');
    setInfo((p) => ({ ...p, slot: res.slot }));
    updateUser(res.user);
    if (res.tier === 'jackpot' || res.tier === 'big') {
      sfx('jackpot');
      setFlash((n) => n + 1);
    } else if (res.payout > 0) sfx('slotWin');
    else sfx('lose');
  };

  const big = result && (result.tier === 'jackpot' || result.tier === 'big');
  const miss = result?.tier === 'miss';
  const pct = slot ? (slot.left / slot.limit) * 100 : 0;
  const style = result ? TIER_STYLE[result.tier] : null;

  return (
    <section className="panel relative flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto bg-black/65 p-4">
      {/* 오늘 남은 한도 */}
      <div className="w-full max-w-md">
        <div className="mb-1 flex items-end justify-between text-sm">
          <b className="text-gold-400">🎰 고스톱 슬롯머신</b>
          <span className="text-slate-200">
            오늘 남은 한도: <b className={pct <= 20 ? 'text-red-400' : 'text-white'}>{won(left)}</b> / {won(slot?.limit ?? 10000)}원
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-white/15 ring-1 ring-white/20" role="progressbar" aria-valuenow={left} aria-valuemin={0} aria-valuemax={slot?.limit ?? 10000}>
          <motion.div className={`h-full rounded-full ${pct <= 20 ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-amber-500 to-yellow-300'}`} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">1회 {won(slot?.bet ?? 500)}원 · 자정(한국 시간)에 한도가 초기화됩니다. 재미로만 즐기세요!</p>
      </div>

      {/* 슬롯머신 본체 */}
      <div className="relative rounded-3xl bg-gradient-to-b from-red-700 via-red-800 to-red-950 p-4 shadow-[0_0_40px_rgba(250,204,21,.25)] ring-4 ring-amber-400">
        <div className="mb-2 text-center text-xl font-black tracking-widest text-yellow-200 drop-shadow-[0_0_8px_rgba(253,224,71,.8)]">★ JACKPOT ★</div>
        <div className="relative flex gap-2 rounded-2xl bg-black/70 p-3 ring-2 ring-black">
          {reels.map((r, i) => (
            <Reel key={i} ref={r} order={REEL_ORDER[i]} spinning={spinning && !revealed[i]} dim={miss} />
          ))}
          {/* 당첨 라인 */}
          <div className="pointer-events-none absolute inset-x-1 z-10" style={{ top: 12 + CELL, height: CELL }}>
            <div className={`h-full rounded-md border-y-4 ${result && result.payout > 0 ? 'border-yellow-300 shadow-[0_0_18px_4px_rgba(253,224,71,.7)]' : 'border-red-400/80'}`} />
          </div>
          {big && <Burst />}
        </div>
      </div>

      {/* 결과 */}
      <div className="h-14 text-center">
        <AnimatePresence mode="wait">
          {result && (
            <motion.div key={flash + result.tier + result.payout} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 14 }}>
              <div className={`text-2xl font-black ${style.color}`}>{style.title}</div>
              <div className="text-sm text-slate-200">
                {result.payout > 0 ? (
                  <>
                    당첨금 <b className="text-yellow-300">+{won(result.payout)}원</b> (순이익 {result.payout - result.bet >= 0 ? '+' : ''}
                    {won(result.payout - result.bet)}원)
                  </>
                ) : (
                  <>-{won(result.bet)}원</>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <div className="text-sm font-bold text-red-400">{error}</div>}
      </div>

      <button
        className="rounded-full bg-gradient-to-b from-yellow-300 to-amber-600 px-12 py-4 text-2xl font-black text-red-900 shadow-lg shadow-black/60 ring-4 ring-amber-200/70 transition active:scale-95 disabled:opacity-40"
        disabled={!canSpin}
        onClick={spin}
      >
        {spinning ? '돌아가는 중…' : left < (slot?.bet ?? 500) ? '한도 소진' : '🎰 당기기 (500원)'}
      </button>

      {/* 배당표 */}
      {info && (
        <div className="w-full max-w-md rounded-lg bg-white/5 p-3 text-xs">
          <div className="mb-1 flex justify-between font-bold text-slate-200">
            <span>배당표</span>
            <span className="text-slate-400">이론 환수율 {(info.rtp * 100).toFixed(0)}%</span>
          </div>
          {info.table.map((t) => (
            <div key={t.id} className="flex justify-between border-t border-white/10 py-1">
              <span>{{ jackpot: '똥광 ×3', big: '삼팔광땡 ×3', mid: '멧돼지 ×3', small: '같은 심볼 2개', miss: '그 외' }[t.id]}</span>
              <span className="text-slate-300">
                {t.payout ? `${won(t.payout)}원` : '0원'} <span className="text-slate-500">({(t.p * 100).toFixed(1)}%)</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 화면 전체 플래시 + 동전 */}
      <AnimatePresence>
        {big && phase === 'done' && (
          <>
            <motion.div key={`f${flash}`} className="pointer-events-none fixed inset-0 z-[79] bg-yellow-100" initial={{ opacity: 0.9 }} animate={{ opacity: [0.9, 0, 0.7, 0] }} transition={{ duration: 1, times: [0, 0.3, 0.45, 1] }} />
            <CoinRain key={`c${flash}`} />
          </>
        )}
      </AnimatePresence>
    </section>
  );
}
