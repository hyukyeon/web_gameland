import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { cardImg, cardName, groupCaptured, isBonus, kindOf, monthOf, nearCombos, won, signed } from '../cards.js';
import { Card } from './Card.jsx';
import { Chat } from './Chat.jsx';
import { Avatar, BotLevel } from './Avatar.jsx';
import { EmoteBubble, EmoteButton } from './Emote.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { speedScale } from '../settings.js';
import { hk } from '../keys.js';
import { SettingsButton } from './Settings.jsx';
import { OnceHint } from './Tutorial.jsx';
import { AutoToggle, BarLabel, TurnTimer, useCountdown } from './TurnTools.jsx';
import { sfx } from '../sound.js';
import { GostopHelp } from './GostopHelp.jsx';

const GROUP_LABEL = { gwang: '광', tti: '띠', yeol: '열끗', pi: '피' };
// 점수가 나기 시작하는 장수 (피는 쌍피 2장으로 센 값)
const GROUP_GOAL = { gwang: 3, tti: 5, yeol: 5, pi: 10 };

/**
 * 획득패: 광/띠/열끗/피 그룹별로 겹쳐서 보여주고, 그룹마다 장수와 점수까지 남은 장수를 붙인다.
 * 장수는 서버 점수(score)의 값을 쓴다(쌍피·국진 선택 반영). 카드 폭은 래퍼의 --capw 로 정한다.
 */
function Captured({ ids, score, className = '' }) {
  const sepAsPi = !!score?.sepAsPi; // 국진을 쌍피로 세는 중이면 피 그룹에 보여준다
  const g = useMemo(() => groupCaptured(ids, sepAsPi), [ids, sepAsPi]);
  return (
    <div className={`flex flex-wrap items-end gap-x-2.5 gap-y-1 ${className}`}>
      {Object.entries(g).map(([k, list]) => {
        if (list.length === 0) return null;
        const n = list.length;
        // 카드 폭 대비 어긋나는 비율: 장수가 많을수록 촘촘하게 (한 그룹이 카드 6장 폭을 넘지 않도록)
        const step = Math.max(0.2, Math.min(0.42, 5 / Math.max(1, n - 1)));
        const cnt = score?.[k] ?? n;
        const goal = GROUP_GOAL[k];
        const reached = cnt >= goal;
        return (
          <div key={k} className="flex items-end gap-1" title={`${GROUP_LABEL[k]} ${cnt}${k === 'pi' ? '장(쌍피 2장)' : '장'}: ${list.map(cardName).join(', ')}`}>
            <span className={`cap-label flex flex-col items-center self-center rounded px-1 py-0.5 text-[10px] font-bold leading-tight ${reached ? 'bg-gold-500 text-felt-900' : 'bg-black/40 text-slate-200'}`}>
              <span>{GROUP_LABEL[k]}</span>
              <span className="tabular-nums">{reached ? cnt : `${cnt}/${goal}`}</span>
            </span>
            <div className="relative" style={{ height: 'calc(var(--capw) * 1.54)', width: `calc(var(--capw) * ${1 + (n - 1) * step})` }}>
              {list.map((id, i) => (
                <Card key={id} id={id} size="xs" className="!absolute !h-[calc(var(--capw)*1.54)] !w-[var(--capw)]" style={{ left: `calc(var(--capw) * ${i * step})`, top: 0, zIndex: i }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const GUKJIN_ID = 32; // 9월 국진(술잔)
const GUKJIN_LABEL = { auto: '자동', yeol: '열끗', pi: '쌍피' };
const GUKJIN_TO = { auto: '자동으로', yeol: '열끗으로', pi: '쌍피로' };

/** 국진을 먹은 내 점수줄에 붙는 열끗/쌍피 선택 칩 */
function GukjinChip({ view, emit }) {
  const mode = view.gukjin?.[view.you] ?? 'auto';
  const next = { auto: 'pi', pi: 'yeol', yeol: 'auto' }[mode];
  return (
    <button
      className="rounded bg-amber-500/90 px-1.5 py-0.5 font-bold text-felt-900 hover:bg-amber-400"
      title="국진을 열끗으로 셀지 쌍피로 셀지 정합니다 (누르면 변경)"
      aria-label={`국진 ${GUKJIN_LABEL[mode]} — 누르면 ${GUKJIN_TO[next]} 변경`}
      onClick={() => emit('game:gukjin', { mode: next })}
    >
      🍶 국진: {GUKJIN_LABEL[mode]}
    </button>
  );
}

/** 국진을 먹은 순간 한 번 묻는다 */
function GukjinPrompt({ onPick, onClose }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="국진 선택">
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="panel w-full max-w-sm p-5 text-center">
        <div className="mb-1 text-3xl">🍶</div>
        <h3 className="text-lg font-black text-gold-400">국진을 먹었습니다!</h3>
        <p className="mt-1 text-sm text-slate-300">9월 술잔을 어떻게 셀까요? 판 중에 점수줄의 🍶 버튼으로 바꿀 수 있어요.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn btn-gold" onClick={() => onPick('pi')}>쌍피로 (피 2장)</button>
          <button className="btn btn-ghost" onClick={() => onPick('yeol')}>열끗으로</button>
        </div>
        <button className="mt-2 text-xs text-slate-400 underline" onClick={onClose}>나중에 정할게요 (자동: 유리한 쪽)</button>
      </motion.div>
    </motion.div>
  );
}

function ScoreChip({ view, pid, emit }) {
  const s = view.scores[pid];
  const go = view.go[pid];
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      <span className="rounded bg-gold-500 px-1.5 py-0.5 font-black text-felt-900">{s.total}점</span>
      {go > 0 && <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold">{go}고</span>}
      {view.shakes[pid] > 0 && <span className="rounded bg-sky-600 px-1.5 py-0.5">흔들기×{view.shakes[pid]}</span>}
      {view.bombs[pid] > 0 && <span className="rounded bg-orange-600 px-1.5 py-0.5">폭탄×{view.bombs[pid]}</span>}
      {/* 광·띠·열끗·피 장수는 획득패 그룹 라벨에 있으니 여기엔 족보(홍단·고도리 등)만 */}
      {s.detail.filter((d) => !/(광|장)$/.test(d.name)).map((d) => (
        <span key={d.name} className="rounded bg-white/10 px-1.5 py-0.5">{d.name}</span>
      ))}
      {emit && pid === view.you && view.captured[pid].includes(GUKJIN_ID) && <GukjinChip view={view} emit={emit} />}
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
    <div className={`panel min-w-0 flex-1 p-2 transition ${turn ? 'ring-2 ring-gold-400 shadow-[0_0_18px_rgba(251,191,36,0.35)]' : ''} ${isRest ? 'opacity-50' : ''}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <b className="flex min-w-0 items-center gap-1.5 text-sm">
          <Avatar player={player} size={26} showTitle className={turn ? '!ring-gold-400' : ''} />
          {turn && <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1 }}>▶ </motion.span>}
          <span className="truncate">{name}</span>
          <BotLevel player={player} />
          {isRest && <span className="ml-1 text-xs text-slate-300">(쉬는 중)</span>}
          {timer}
        </b>
        <span className="shrink-0 text-xs text-slate-300">패 {cnt}</span>
      </div>
      {!isRest && <ScoreChip view={view} pid={pid} />}
      {/* 말풍선은 점수 칩을 가리지 않도록 뒷면 패 줄 위에 띄운다 */}
      <div className="relative">
        <span className="absolute left-1 top-0"><EmoteBubble userId={pid} below /></span>
        <div className="landscape-hide mt-1 hidden h-[42px] items-end sm:flex">
          {Array.from({ length: cnt }).map((_, i) => (
            <Card key={`b${pid}-${i}`} back size="xs" style={{ marginLeft: i ? -14 : 0 }} />
          ))}
        </div>
        <div className="landscape-cap mt-1 min-h-[42px] [--capw:calc(24px*var(--cs,1))] sm:[--capw:calc(32px*var(--cs,1))]">
          <Captured ids={view.captured[pid]} score={view.scores[pid]} />
        </div>
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

/** 족보 비상(한 장 남음) 알림: 작게, 진행을 막지 않음. 바닥 아래쪽에 띄워 족보 완성 팝업(위쪽)과 겹치지 않게 한다 */
function NearPopup({ alert, nameOf, playerOf, you }) {
  return (
    <AnimatePresence>
      {alert && (
        <motion.div key={alert.key} className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center" initial={{ opacity: 0, y: 12, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ type: 'spring', stiffness: 360, damping: 20 }}>
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

function Modal({ children, label }) {
  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-modal="true" aria-label={label} className="panel max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto bg-felt-800 p-5 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
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
    }, (shown === 0 ? 500 : STEP_MS) * speedScale());
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
                <motion.b initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-right text-base text-yellow-300">
                  {p.mult > 1 && <span className="mr-1 text-xs font-bold text-slate-300">{p.total / p.mult}점 × {p.mult}배 =</span>}
                  {p.total}점
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
            {has((e) => e.t === 'total' && e.j === j) && (
              <div className="mt-1 text-right text-[11px] text-slate-300">
                × 판돈 {won(over.bet)} = <b className="text-sm text-yellow-300">{won(p.total * over.bet)}원</b>
              </div>
            )}
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

function GameOver({ over, view, nameOf, onClose, userId, carryNext }) {
  const res = over.result;
  const mine = over.payout?.delta?.[userId];
  const settle = useSettleSteps(res, over, nameOf);
  return (
    <Modal>
      <h2 className="text-2xl font-black text-gold-400">{res.nagari ? '나가리' : res.winner === userId ? '🎉 승리!' : res.winner == null ? '게임 종료' : (res.losers ?? []).includes(userId) ? `패배 — ${nameOf(res.winner)} 승리` : `${nameOf(res.winner)} 승리`}</h2>
      {res.nagari && (
        <div className="space-y-1 text-sm text-slate-300">
          <p>{res.shodang ? '🫴 쇼당 — 모두 수락해서 나가리입니다.' : `패를 다 쓸 때까지 아무도 ${view.threshold}점을 내지 못해 승자 없이 끝났습니다.`}</p>
          <p>선은 그대로 유지됩니다.{carryNext && <b className="ml-1 text-purple-300">다음 판은 나가리 이월로 점수 ×2!</b>}</p>
        </div>
      )}
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
      <button className="btn btn-gold w-full" onClick={onClose} {...hk('Escape Enter', 'Esc')}>대기실로</button>
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

/** 최근 행동 기록: 프레임을 따라가며 누가 무엇을 내고·뒤집고·먹었는지 모은다 (최근 3건). 판이 바뀌면 비운다 */
function useActionLog(view, resetKey) {
  const [log, setLog] = useState([]);
  const prev = useRef(null);
  const key = useRef(resetKey);
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (key.current !== resetKey || !p) {
      key.current = resetKey;
      setLog([]);
      return;
    }
    setLog((cur) => {
      let next = cur;
      const startPlay = view.played != null && view.played !== p.played;
      const startDraw = !startPlay && view.played == null && view.drawn != null && view.drawn !== p.drawn;
      if (startPlay || startDraw) {
        next = [...next, { k: `${resetKey}-${Date.now()}-${Math.random()}`, pid: view.actor, played: view.played, drawn: view.drawn, got: [] }].slice(-3);
      } else if (next.length && view.drawn != null && view.drawn !== p.drawn) {
        next = [...next.slice(0, -1), { ...next.at(-1), drawn: view.drawn }];
      }
      const last = next.at(-1);
      if (last) {
        const before = new Set(p.captured[last.pid] ?? []);
        const fresh = (view.captured[last.pid] ?? []).filter((id) => !before.has(id) && !last.got.includes(id));
        if (fresh.length) next = [...next.slice(0, -1), { ...last, got: [...last.got, ...fresh] }];
      }
      return next;
    });
  }, [view, resetKey]);
  return log;
}

/** 작은 패 그림 (layoutId 없는 정적 이미지라 본 카드 애니메이션과 섞이지 않는다) */
function Mini({ id, big = false }) {
  const sz = big ? 'h-[86px] w-[56px] rounded-md' : 'h-[22px] w-[14px] rounded-sm';
  if (isBonus(id)) return <span className={`inline-flex items-center justify-center bg-amber-300 font-black text-amber-950 ${sz} ${big ? 'text-lg' : 'text-[7px]'}`} title="보너스 쌍피">★</span>;
  return <img src={cardImg(id)} alt={cardName(id)} title={cardName(id)} className={`inline-block object-fill ring-1 ring-black/50 ${sz}`} draggable={false} />;
}

function ActionLog({ log, nameOf, you }) {
  if (!log.length) return null;
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-20 flex flex-col-reverse items-end gap-1 text-[11px]" aria-live="polite" aria-label="최근 행동">
      {log.map((e, i) => (
        <motion.div
          key={e.k}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: i === log.length - 1 ? 1 : 0.55, x: 0 }}
          className={`flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 ${i === log.length - 1 ? '' : 'landscape-hide max-sm:hidden'}`}
        >
          <b className={`max-w-[84px] truncate ${e.pid === you ? 'text-gold-400' : 'text-slate-100'}`}>{e.pid === you ? '나' : nameOf(e.pid)}</b>
          {e.played != null && <><Mini id={e.played} /><span className="text-slate-300">냄</span></>}
          {e.drawn != null && <><Mini id={e.drawn} /><span className="text-slate-300">뒤집음</span></>}
          {e.got.length > 0 ? <span className="font-bold text-emerald-300">→ {e.got.length}장 먹음</span> : <span className="text-slate-400">→ 못 먹음</span>}
        </motion.div>
      ))}
    </div>
  );
}

/** 앱 안 확인 창 (브라우저 기본 confirm 대신) */
function ConfirmModal({ title, body, okLabel, danger, onOk, onCancel }) {
  return (
    <Modal label={title}>
      <h3 className="text-xl font-black text-gold-400">{title}</h3>
      <p className="whitespace-pre-line text-sm text-slate-200">{body}</p>
      <div className="flex gap-2">
        <button className={`btn flex-1 ${danger ? 'btn-red' : 'btn-gold'}`} onClick={onOk} {...hk('y Enter', 'Y')}>{okLabel}</button>
        <button className="btn btn-ghost flex-1" onClick={onCancel} {...hk('n Escape', 'N')}>취소</button>
      </div>
    </Modal>
  );
}

/** 내 차례 남은 시간 막대 (차례가 시작될 때의 남은 시간을 100% 로 본다) */
function TurnBar({ left, deadlineAt }) {
  const total = useRef({ at: null, sec: 0 });
  if (total.current.at !== deadlineAt) total.current = { at: deadlineAt, sec: Math.max(left ?? 0, 1) };
  if (left == null) return null;
  const pct = Math.max(0, Math.min(100, (left / total.current.sec) * 100));
  return (
    <div className="absolute inset-x-0 top-0 h-1 overflow-hidden rounded-t-xl bg-black/40" role="progressbar" aria-label="남은 시간" aria-valuenow={left} aria-valuemin={0} aria-valuemax={total.current.sec}>
      <div className={`h-full transition-[width] duration-300 ease-linear ${left <= 5 ? 'bg-red-500' : 'bg-gold-400'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// 터치 기기(마우스 호버 없음)에는 키보드 안내를 빼고 보여준다
const isTouch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches;

export function GameBoard() {
  const { skew, room, user, view, banner, combo, busy, over, startInfo, turnInfo, emit, send, roomChat, dismissOver } = useApp();
  const [shakeFor, setShakeFor] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [confirm, setConfirm] = useState(null); // 앱 안 확인 창 { title, body, okLabel, danger, onOk }
  const [playedOnce, setPlayedOnce] = useState(false); // 첫 안내를 닫는 기준
  const nearAlert = useNearAlert(view, startInfo?.key);
  const actionLog = useActionLog(view, startInfo?.key);
  // 판 시작 연출: 선 정하기(밤일낮장) → 기리 순서
  const [intro, setIntro] = useState(startInfo?.flips ? 'first' : startInfo?.cutter != null ? 'giri' : null);
  useEffect(() => setIntro(startInfo?.flips ? 'first' : startInfo?.cutter != null ? 'giri' : null), [startInfo]);
  // 국진을 먹으면 한 번 묻는다 (판마다 한 번)
  const gukjinAsked = useRef(null);
  const [gukjinAsk, setGukjinAsk] = useState(false);
  useEffect(() => {
    if (gukjinAsked.current !== startInfo?.key) gukjinAsked.current = null;
  }, [startInfo?.key]);
  const left = useCountdown(turnInfo?.deadlineAt, skew);
  const touch = useMemo(isTouch, []);

  const playerOf = (pid) => room?.players.find((p) => p.id === pid);
  const nameOf = (pid) => room?.players.find((p) => p.id === pid)?.username ?? `플레이어${pid}`;
  // 차례 배지: 서버가 알려준 지금 차례인 사람에게만 (남은 시간 / 사람 대행 중 / 봇 생각 중)
  const timerFor = (pid) => (turnInfo?.userId === pid && view.phase !== 'ended' ? <TurnTimer left={left} auto={turnInfo.auto} bot={!!playerOf(pid)?.bot} /> : null);
  const you = user.id;
  const spectator = !room?.players.some((p) => p.id === you); // 관전자: 손패·조작 UI 없음
  const isRest = view.rest === you;
  const myTurn = view.turn === you && !busy;
  const gotGukjin = !spectator && view.phase !== 'ended' && view.captured[you]?.includes(GUKJIN_ID);
  useEffect(() => {
    if (gotGukjin && gukjinAsked.current == null && (view.gukjin?.[you] ?? 'auto') === 'auto') {
      gukjinAsked.current = startInfo?.key ?? true;
      setGukjinAsk(true);
    }
  }, [gotGukjin, view.gukjin, you, startInfo?.key]);
  const canPlay = myTurn && view.phase === 'play';
  // 바닥패: 같은 달끼리 묶어 월 순서로 놓는다 (보너스패는 맨 뒤). 어느 달이 어디 있는지 늘 같은 순서라 찾기 쉽다.
  const floorGroups = useMemo(() => {
    const byMonth = new Map();
    for (const id of view.floor) {
      const m = monthOf(id);
      const key = m > 0 ? m : `b${id}`;
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(id);
    }
    const rank = (k) => (typeof k === 'number' ? k : 99);
    return [...byMonth.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([month, ids]) => ({ month, ids }));
  }, [view.floor]);
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
    setPlayedOnce(true);
    emit('game:play', { cardId: id });
  };
  const shakeAnswer = (shake) => {
    const id = shakeFor;
    setShakeFor(null);
    setPlayedOnce(true);
    emit('game:play', shake ? { cardId: id, shake: true } : { cardId: id });
  };

  const leave = () => {
    if (spectator || view.phase === 'ended') return emit('room:leave');
    const practice = startInfo?.ranked === false;
    setConfirm({
      title: '방에서 나갈까요?',
      body: practice ? '판 도중에 나가면 기권으로 끝납니다.\n연습 게임이라 머니·전적은 변하지 않아요.' : '판 도중에 나가면 기권패로 처리되어 판돈을 잃습니다.',
      okLabel: '나가기',
      danger: !practice,
      onOk: () => emit('room:leave'),
    });
  };
  const askShodang = () =>
    setConfirm({
      title: '🫴 쇼당을 부를까요?',
      body: '두 상대가 모두 수락하면 이번 판은 나가리입니다.\n한 명이라도 받으면 계속하고, 받은 사람이 독박 책임을 집니다. (한 판에 한 번)',
      okLabel: '쇼당 부르기',
      danger: true,
      onOk: () => emit('game:shodang'),
    });

  let status = '';
  if (view.phase === 'chong') status = `${nameOf(view.chongAsk)}님이 총통 선언을 고민 중…`;
  else if (view.phase === 'gwang') status = `${nameOf(view.gwangAsk)}님이 광팔기를 고민 중…`;
  else if (view.phase === 'gostop') status = view.turn === you ? '고/스톱을 고르세요' : `${nameOf(view.turn)}님이 고/스톱 선택 중…`;
  else if (view.phase === 'shodang') status = `🫴 ${nameOf(view.shodangBy)}님의 쇼당! ${view.turn === you ? '답해 주세요' : `${nameOf(view.turn)}님이 답하는 중…`}`;
  else if (view.phase === 'ended') status = '게임 종료';
  else if (busy || view.phase === 'busy') status = '진행 중…';
  else if (view.turn === you) status = view.phase === 'choose' ? '먹을 바닥 패를 선택하세요' : canDrawOnly ? '패를 내거나 더미를 뒤집으세요' : '내 차례입니다. 패를 내세요';
  else status = `${nameOf(view.turn)}님의 차례`;
  const myTurnNow = !spectator && !isRest && view.turn === you && view.phase !== 'ended';
  const myAction = myTurnNow && !busy && view.phase !== 'busy';

  const myScore = view.scores[you];
  // 결정 창이 떠 있으면 족보/비상 팝업을 띄우지 않는다 (겹쳐서 읽을 수 없음)
  const asking =
    shakeFor != null ||
    confirm != null ||
    (gukjinAsk && !busy) ||
    (!busy && ((view.phase === 'gostop' && view.turn === you) || (view.phase === 'chong' && view.chongAsk === you) || (view.phase === 'gwang' && view.gwangAsk === you) || (view.phase === 'shodang' && view.shodangAsk === you)));
  const nextGo = (view.go[you] ?? 0) + 1;
  const goEffect = nextGo === 1 ? '+1점' : nextGo === 2 ? '+2점' : `+2점에 점수 ×${2 ** (nextGo - 2)}`;
  const shakeCards = shakeFor != null ? hand.filter((id) => monthOf(id) === monthOf(shakeFor)) : [];

  const myHeader = (
    <div className="flex items-center gap-2">
      <span className="relative inline-flex">
        <Avatar player={user} size={30} showTitle className={myTurnNow ? '!ring-gold-400' : ''} />
        <EmoteBubble userId={you} />
      </span>
      <EmoteButton />
      <b className="text-sm">{user.name}</b>
      {timerFor(you)}
    </div>
  );

  return (
    <div className="relative mx-auto flex h-full max-w-6xl flex-col gap-2 overflow-hidden p-2">
      {/* 상단 정보 */}
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="min-w-0 truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          {room.name} · 판돈 {won(room.bet)} · {view.active.length}인{startInfo?.ranked === false && ' · 연습(머니 무변동)'}
        </span>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {view.carry > 1 && <span className="hidden rounded bg-purple-700 px-2 py-0.5 sm:inline" title="직전 판이 나가리라 이번 판 점수가 배가 됩니다">나가리 이월 ×{view.carry}</span>}
          {view.sale && <span className="hidden rounded bg-emerald-700 px-2 py-0.5 sm:inline">{nameOf(view.sale.seller)} 광팔기</span>}
          {view.shodangReceiver != null && <span className="hidden rounded bg-red-700 px-2 py-0.5 sm:inline" title="쇼당을 받은 사람은 지면 독박">{nameOf(view.shodangReceiver)} 쇼당 받음</span>}
          <button className="btn btn-gold whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => setHelp((h) => !h)} aria-label="규칙 보기" aria-pressed={help} {...hk('?')}>
            <BarLabel icon="❓" text="규칙" />
          </button>
          {!spectator && <AutoToggle room={room} you={you} emit={emit} stacked />}
          <SoundToggle stacked />
          <SettingsButton stacked />
          <button className="btn btn-ghost whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={() => setChatOpen((o) => !o)} aria-label="채팅" aria-pressed={chatOpen}>
            <BarLabel icon="💬" text="채팅" />
          </button>
          <button className="btn btn-ghost whitespace-nowrap !px-2.5 !py-1 sm:!px-3" onClick={leave}>
            <BarLabel icon="🚪" text="나가기" />
          </button>
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

        {/* 바닥 (container 크기에 맞춰 바닥패 크기를 정한다: 높이가 넉넉하면 두 줄, 낮으면 한 줄 기준) */}
        <motion.div
          key={banner && ['ppeok', 'bomb'].includes(banner.kind) ? banner.key : 'floor'}
          animate={banner && ['ppeok', 'bomb'].includes(banner.kind) ? { x: [0, -12, 12, -9, 9, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="landscape-tight relative flex min-h-0 flex-1 items-center justify-center gap-4 rounded-2xl bg-felt-700/70 p-3 ring-1 ring-white/10 [container-type:size]"
        >
          <div className="relative flex shrink-0 flex-col items-center gap-1">
            <div className="relative h-[calc(71px*var(--cs,1))] w-[calc(46px*var(--cs,1))] sm:h-[calc(86px*var(--cs,1))] sm:w-[calc(56px*var(--cs,1))]">
              {[2, 1, 0].map((i) => (
                <div key={i} className="absolute" style={{ left: i * 2, top: -i * 2 }}>
                  <Card back size="md" />
                </div>
              ))}
            </div>
            <span className="text-xs text-slate-300">더미 {view.stockCount}</span>
          </div>
          <div className="landscape-tight flex max-h-full min-w-0 flex-1 flex-wrap content-center items-center justify-center gap-x-3 gap-y-2 overflow-y-auto py-4 [--cw:min(calc(80px*var(--cs,1)),14cqw,max(27cqh,min(42cqh,40px)))]">
            {floorGroups.map((grp) => {
              const spread = grp.ids.some((id) => choiceOpts.includes(id)); // 고를 때는 펼쳐서 클릭하기 쉽게
              const dx = spread ? 0.9 : 0.34;
              const dy = spread ? 0 : 0.14;
              const n = grp.ids.length;
              return (
                <motion.div
                  layout
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
                        hotkey={opt ? String(choiceOpts.indexOf(id) + 1) : undefined}
                      />
                    );
                  })}
                  {n >= 3 && (
                    <span className="pointer-events-none absolute -left-1 -top-3 z-30 rounded-full bg-red-600 px-1.5 text-[10px] font-black text-white shadow">
                      {n >= 4 ? '4장' : '뻑'}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
          <ActionLog log={actionLog} nameOf={nameOf} you={you} />
          {/* 처음 내 차례가 왔을 때 한 번만 — 한 장 내면 저절로 닫힌다 */}
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-30 flex justify-center [&_button]:pointer-events-auto">
            <OnceHint id="gostop.play" show={canPlay && !over && !intro} done={playedOnce}>
              🔗 표시가 붙은 패는 바닥과 같은 달이라 먹을 수 있어요. 손패를 눌러 내세요!{!touch && ' (키보드 1~0)'}
            </OnceHint>
          </div>
          <Banner banner={banner} nameOf={nameOf} playerOf={playerOf} />
          {!asking && <ComboPopup combo={combo} nameOf={nameOf} playerOf={playerOf} />}
          {!asking && <NearPopup alert={nearAlert} nameOf={nameOf} playerOf={playerOf} you={you} />}
        </motion.div>

        {/* 내 영역 (관전자에게는 손패·조작 UI 를 숨긴다) */}
        {!spectator && isRest && (
          <div className="panel flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            {myHeader}
            <span className="text-sm font-bold text-slate-300">☕ 이번 판은 쉽니다 — 다음 판에 들어갑니다</span>
          </div>
        )}
        {!spectator && !isRest && (
          <div className={`panel relative p-2 transition-shadow ${myTurnNow ? 'ring-2 ring-gold-400 shadow-[0_0_24px_rgba(251,191,36,0.4)]' : ''}`}>
            {myAction && turnInfo?.userId === you && !turnInfo.auto && <TurnBar left={left} deadlineAt={turnInfo.deadlineAt} />}
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {myHeader}
                <ScoreChip view={view} pid={you} emit={emit} />
                <span className="landscape-hide text-[11px] text-slate-400">/ {view.threshold}점부터 고·스톱</span>
              </div>
              <motion.span
                key={status}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-sm font-bold ${myAction ? 'rounded-full bg-gold-500 px-3 py-0.5 text-felt-900 shadow' : 'text-gold-400'}`}
              >
                {status}
              </motion.span>
            </div>
            <div className="landscape-cap min-h-[42px] [--capw:calc(30px*var(--cs,1))] sm:[--capw:calc(42px*var(--cs,1))]">
              <Captured ids={view.captured[you]} score={view.scores[you]} />
            </div>
            <div className="landscape-tight-hand mt-2 flex items-end justify-center overflow-x-auto pb-1 pt-4 [--hw:calc(54px*var(--cs,1))] sm:[--hw:calc(70px*var(--cs,1))]">
              {hand.map((id, i) => (
                <Card key={id} id={id} size="lg" style={{ marginLeft: i ? `min(4px, calc((100vw - 60px - ${hand.length} * var(--hw)) / ${Math.max(1, hand.length - 1)}))` : 0, zIndex: i }} selected={matchHand.has(id)} hl={matchHand.has(id)} onClick={canPlay ? () => playCard(id) : undefined} dim={choiceOpts.length > 0} hotkey={i < 9 ? String(i + 1) : i === 9 ? '0' : undefined} />
              ))}
              {canDrawOnly && (
                <button className="btn btn-gold ml-3 self-center" onClick={() => { setPlayedOnce(true); emit('game:play', { cardId: null }); }} {...hk('d')}>
                  더미 뒤집기
                </button>
              )}
              {canPlay && view.shodangOk && (
                <button className="btn btn-red ml-3 shrink-0 self-center" title="두 상대가 모두 날 수 있는 상황: 둘 다 수락하면 나가리" onClick={askShodang}>
                  🫴 쇼당
                </button>
              )}
            </div>
          </div>
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

      <AnimatePresence>
        {gukjinAsk && !busy && <GukjinPrompt key="gukjin" onPick={(mode) => { emit('game:gukjin', { mode }); setGukjinAsk(false); }} onClose={() => setGukjinAsk(false)} />}
      </AnimatePresence>
      <AnimatePresence>{help && <GostopHelp key="help" onClose={() => setHelp(false)} />}</AnimatePresence>

      {/* 선택 모달 */}
      <AnimatePresence>
        {intro === 'first' && startInfo?.flips && !over && <FirstIntro key="intro" info={startInfo} nameOf={nameOf} playerOf={playerOf} onDone={() => setIntro(startInfo.cutter != null ? 'giri' : null)} />}
        {intro === 'giri' && startInfo?.cutter != null && !over && <GiriOverlay key="giri" cutter={startInfo.cutter} nameOf={nameOf} playerOf={playerOf} onDone={() => setIntro(null)} />}

        {confirm && (
          <ConfirmModal
            key="confirm"
            {...confirm}
            onOk={() => {
              const f = confirm.onOk;
              setConfirm(null);
              f();
            }}
            onCancel={() => setConfirm(null)}
          />
        )}

        {!busy && view.phase === 'shodang' && view.shodangAsk === you && (
          <Modal key="shodang" label="쇼당">
            <h3 className="text-xl font-black text-gold-400">🫴 {nameOf(view.shodangBy)}님의 쇼당!</h3>
            <p className="text-sm">두 사람이 모두 날 수 있는 상황입니다. 둘 다 수락하면 이번 판은 나가리가 됩니다.</p>
            <p className="text-xs text-red-300">받아서 계속하면, 쇼당을 부른 사람이 아닌 다른 사람이 났을 때 내가 독박을 씁니다.</p>
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={() => emit('game:shodangAnswer', { accept: true })} {...hk('y')}>나가리 수락</button>
              <button className="btn btn-red flex-1" onClick={() => emit('game:shodangAnswer', { accept: false })} {...hk('n')}>받기 (계속)</button>
            </div>
          </Modal>
        )}

        {!busy && view.phase === 'chong' && view.chongAsk === you && (
          <Modal key="chong" label="총통">
            <h3 className="text-xl font-black text-gold-400">총통!</h3>
            <p className="text-sm">첫 패에 같은 달 4장이 있습니다. 지금 선언하면 즉시 승리합니다. 계속하면 이길 때 ×4 입니다.</p>
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={() => emit('game:chongtong')} {...hk('y')}>총통 선언</button>
              <button className="btn btn-ghost flex-1" onClick={() => emit('game:passChongtong')} {...hk('n')}>계속 진행</button>
            </div>
          </Modal>
        )}

        {!busy && view.phase === 'gwang' && view.gwangAsk === you && (
          <Modal key="gwang" label="광팔기">
            <h3 className="text-xl font-black text-gold-400">광팔기</h3>
            <p className="text-sm">첫 패에 광이 3장 이상입니다. 광을 팔면 광 1장당 2점을 받고 이번 판은 쉽니다.</p>
            <div className="flex justify-center gap-1">{hand.filter((id) => kindOf(id) === 'gwang').map((id) => <Mini key={id} id={id} big />)}</div>
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={() => emit('game:sellGwang')} {...hk('y')}>광 팔기</button>
              <button className="btn btn-ghost flex-1" onClick={() => emit('game:passGwang')} {...hk('n')}>그냥 치기</button>
            </div>
          </Modal>
        )}

        {!busy && view.phase === 'gostop' && view.turn === you && (
          <Modal key="gostop" label="고 또는 스톱">
            <h3 className="text-xl font-black text-gold-400">{myScore.total}점 달성!</h3>
            <p className="text-sm">
              {view.go[you] > 0 && <>지금 <b className="text-red-300">{view.go[you]}고</b> 중입니다. </>}
              <b className="text-red-300">고</b>를 하면 {nextGo}고({goEffect})로 계속하고, <b className="text-gold-400">스톱</b>하면 지금 점수로 이깁니다.
            </p>
            <p className="text-xs text-slate-400">고를 부른 뒤 다른 사람이 먼저 나면 고박(×2)을 씁니다.</p>
            <div className="flex gap-2">
              <button className="btn btn-red flex-1 !py-3 text-lg" onClick={() => emit('game:go')} {...hk('g')}>고! <span className="text-sm font-bold opacity-80">({nextGo}고)</span></button>
              <button className="btn btn-gold flex-1 !py-3 text-lg" onClick={() => emit('game:stop')} {...hk('s')}>스톱</button>
            </div>
          </Modal>
        )}

        {shakeFor != null && (
          <Modal key="shake" label="흔들기">
            <h3 className="text-xl font-black text-gold-400">흔들기</h3>
            <div className="flex justify-center gap-1.5">{shakeCards.map((id) => <Mini key={id} id={id} big />)}</div>
            <p className="text-sm">{monthOf(shakeFor)}월 패를 3장 가지고 있습니다. 흔들면(상대에게 보여 주면) 이길 때 점수가 ×2 가 됩니다.</p>
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1" onClick={() => shakeAnswer(true)} {...hk('y')}>흔들기</button>
              <button className="btn btn-ghost flex-1" onClick={() => shakeAnswer(false)} {...hk('n')}>그냥 내기</button>
              <button className="btn btn-ghost !px-3" onClick={() => setShakeFor(null)} aria-label="취소" {...hk('Escape', 'Esc')}>✕</button>
            </div>
          </Modal>
        )}

        {over && <GameOver key="over" over={over} view={view} nameOf={nameOf} userId={you} carryNext={!!room.opts?.nagariCarry} onClose={dismissOver} />}
      </AnimatePresence>
    </div>
  );
}
