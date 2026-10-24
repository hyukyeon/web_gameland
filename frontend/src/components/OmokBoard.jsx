import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { won, signed } from '../cards.js';
import { Avatar, BotLevel } from './Avatar.jsx';
import { Chat } from './Chat.jsx';
import { SoundToggle } from './SoundToggle.jsx';
import { SettingsButton } from './Settings.jsx';
import { EmoteBubble, EmoteButton } from './Emote.jsx';
import { AutoToggle, TurnTimer, useCountdown } from './TurnTools.jsx';
import { useShortLandscape } from '../settings.js';
import { hk } from '../keys.js';
import { sfx } from '../sound.js';
import { adjustSkill, getSkill, skillLabel } from '../omokSkill.js';

const N = 15;
const STARS = new Set(['3,3', '3,11', '7,7', '11,3', '11,11']); // 화점
const BLACK = 1;
const colName = (c) => (c === BLACK ? '흑' : '백');
const coord = (x, y) => `${String.fromCharCode(65 + x)}${y + 1}`; // A1 ~ O15

/** 교차점 한 칸: 가운데를 지나는 십자선(가장자리 칸은 반 토막)을 배경으로 그린다 */
function lineBg(x, y) {
  // 가장자리 칸은 선이 교차점(가운데)에서 판 안쪽으로만 뻗는다: 왼쪽 끝 칸 = 오른쪽 절반, 오른쪽 끝 칸 = 왼쪽 절반
  const hEdge = x === 0 || x === N - 1;
  const vEdge = y === 0 || y === N - 1;
  const hx = x === 0 ? 'right' : 'left';
  const vy = y === 0 ? 'bottom' : 'top';
  return {
    backgroundImage: 'linear-gradient(#3b2a14,#3b2a14), linear-gradient(#3b2a14,#3b2a14)',
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${hEdge ? '50%' : '100%'} 1.5px, 1.5px ${vEdge ? '50%' : '100%'}`,
    backgroundPosition: `${hEdge ? hx : 'left'} center, center ${vEdge ? vy : 'top'}`,
  };
}

function Stone({ color, ghost = false, fresh = false, mark = false, win = false }) {
  const black = color === BLACK;
  return (
    <motion.span
      className={`absolute inset-[9%] rounded-full ${ghost ? 'opacity-45' : ''} ${black ? 'bg-[radial-gradient(circle_at_32%_28%,#6b7280,#111827_55%,#000)]' : 'bg-[radial-gradient(circle_at_32%_28%,#fff,#e5e7eb_60%,#9ca3af)]'} ${ghost ? '' : 'shadow-[0_2px_3px_rgba(0,0,0,.55)]'} ${win ? 'ring-2 ring-emerald-400' : ''}`}
      // 새로 놓인 돌만 위에서 '탁' 떨어지는 느낌으로 (이미 있던 돌은 그대로)
      initial={fresh ? { scale: 1.7, y: -26, opacity: 0 } : false}
      animate={{ scale: 1, y: 0, opacity: ghost ? 0.45 : 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 17, mass: 0.7 }}
    >
      {mark && <span className="absolute left-1/2 top-1/2 h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_4px_#ef4444]" aria-hidden="true" />}
    </motion.span>
  );
}

function Board({ view, myColor, canPlay, onPlace, hint }) {
  const [hover, setHover] = useState(null);
  const refs = useRef({});
  const winCells = useMemo(() => new Set((view.result?.line ?? []).map(([x, y]) => `${x},${y}`)), [view.result]);
  const lastKey = view.last ? `${view.last.x},${view.last.y}` : null;

  const onKey = (e, x, y) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const nx = Math.min(N - 1, Math.max(0, x + d[0]));
    const ny = Math.min(N - 1, Math.max(0, y + d[1]));
    refs.current[`${nx},${ny}`]?.focus();
  };

  return (
    <div
      className="relative aspect-square w-full rounded-lg p-[2.2%] shadow-[0_10px_30px_rgba(0,0,0,.65)] ring-2 ring-black/50 [background:repeating-linear-gradient(92deg,rgba(120,70,20,.10)_0_3px,transparent_3px_9px),linear-gradient(135deg,#e7b866,#d9a24d_55%,#c98f3b)]"
      role="grid"
      aria-label="오목판 15×15"
      onMouseLeave={() => setHover(null)}
    >
      <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${N}, 1fr)`, gridTemplateRows: `repeat(${N}, 1fr)` }}>
        {Array.from({ length: N * N }, (_, i) => {
          const x = i % N;
          const y = Math.floor(i / N);
          const c = view.board[y][x];
          const key = `${x},${y}`;
          const isLast = key === lastKey;
          const free = c === 0 && canPlay;
          return (
            <button
              key={key}
              ref={(el) => { refs.current[key] = el; }}
              role="gridcell"
              type="button"
              disabled={!free}
              tabIndex={free ? 0 : -1}
              aria-label={c ? `${coord(x, y)} ${colName(c)}돌${isLast ? ' (마지막 수)' : ''}` : `${coord(x, y)} 빈 자리`}
              className="relative min-h-0 min-w-0 cursor-pointer p-0 outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-default"
              style={lineBg(x, y)}
              onMouseEnter={() => setHover(key)}
              onFocus={() => setHover(key)}
              onClick={() => free && onPlace(x, y)}
              onKeyDown={(e) => onKey(e, x, y)}
            >
              {STARS.has(key) && c === 0 && <span className="absolute left-1/2 top-1/2 h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3b2a14]" aria-hidden="true" />}
              {c !== 0 && <Stone color={c} fresh={isLast && view.moveCount > 0} mark={isLast && view.phase === 'playing'} win={winCells.has(key)} />}
              {c === 0 && free && hover === key && myColor && <Stone color={myColor} ghost />}
              {hint && hint.x === x && hint.y === y && c === 0 && (
                <motion.span className="pointer-events-none absolute inset-[6%] rounded-full ring-4 ring-sky-400" animate={{ scale: [1, 1.25, 1], opacity: [1, 0.55, 1] }} transition={{ repeat: Infinity, duration: 1.1 }} aria-hidden="true" />
              )}
              {isLast && view.phase === 'ended' && <span className="absolute left-1/2 top-1/2 z-[1] h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" aria-hidden="true" />}
            </button>
          );
        })}
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

function ResultModal({ over, view, nameOf, you, onClose, emit, skillNote }) {
  const res = over.result;
  const d = over.payout?.delta?.[you] ?? 0;
  const draw = res.winner == null;
  const mineWin = res.winner === you;
  const why = res.kind === 'forfeit' ? '상대가 나가서 기권승 처리됐어요.' : res.kind === 'full' ? '더 둘 자리가 없어 무승부예요.' : '오목 완성! (5개 연속)';
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div role="dialog" aria-label="대국 결과" className="panel max-h-[92vh] w-full max-w-sm space-y-3 overflow-y-auto bg-felt-800 p-5 text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}>
        <h2 className="text-2xl font-black text-gold-400">{draw ? '🤝 무승부' : mineWin ? '🎉 승리!' : res.winner ? `${nameOf(res.winner)} 승리` : '게임 종료'}</h2>
        <p className="text-sm text-slate-300">{why}</p>
        {!draw && <p className="text-xs text-slate-400">{colName(view.black === res.winner ? 1 : 2)}돌 {nameOf(res.winner)} · 총 {view.moveCount}수</p>}
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
        <button className="btn btn-gold w-full" onClick={onClose} {...hk('Escape Enter', 'Esc')}>대기실로</button>
      </motion.div>
    </motion.div>
  );
}

function Rules({ onClose }) {
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
          <li>흑은 <b>쌍삼(3-3)</b>, <b>장목(6개 이상)</b> 자리에 둘 수 없어요. (렌주룰) 단, 그 수로 5목이 완성되면 허용.</li>
          <li>백은 6개 이상 이어져도 승리, 금지수가 없습니다.</li>
          <li>제한 시간(30초)을 넘기면 AI가 대신 한 수 둡니다. 판돈은 진 사람이 이긴 사람에게 참가비만큼 줍니다.</li>
          <li>키보드: 방향키로 이동, Enter/Space로 착수. 칸을 눌러 두세요.</li>
        </ul>
        <button className="btn btn-gold w-full" onClick={onClose}>닫기</button>
      </motion.div>
    </motion.div>
  );
}

export function OmokBoard() {
  const { room, user, omok: view, omokOver, turnInfo, skew, emit, send, roomChat, dismissOmok } = useApp();
  const [chatOpen, setChatOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [msg, setMsg] = useState(null);
  const you = user.id;
  const left = useCountdown(turnInfo?.deadlineAt, skew);
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
  useEffect(() => { setPending(false); setHint(null); }, [view.moveCount]);
  useEffect(() => { if (view.moveCount === 0) { setHintsLeft(3); setSkillNote(null); } }, [view.moveCount]);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  const place = async (x, y) => {
    if (!myTurn || pending) return;
    setPending(true);
    const r = await emit('omok:place', { x, y });
    if (!r?.ok) {
      setPending(false);
      setMsg(r?.error ?? '둘 수 없는 자리입니다.');
      sfx('alert');
    }
  };

  const practice = room?.ranked === false && !spectator;
  const adaptiveBot = room?.players.find((p) => p.bot && p.adaptive);
  const askHint = async () => {
    if (!myTurn || pending) return;
    const r = await emit('omok:hint');
    if (r?.ok) { setHint({ x: r.x, y: r.y }); setHintsLeft(r.left); sfx('click'); }
    else setMsg(r?.error ?? '힌트를 쓸 수 없어요.');
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

  const turnAuto = turnInfo?.userId === view.turn && !!turnInfo.auto;
  const status = !playing ? '대국 종료' : spectator ? `${nameOf(view.turn)}님의 차례` : myTurn ? '내 차례입니다 — 교차점을 눌러 두세요' : `${nameOf(view.turn)}님이 생각 중…`;
  const top = spectator || view.black === you ? view.white : view.black;
  const bottom = spectator ? view.black : you;
  const colorOf = (pid) => (view.black === pid ? 1 : 2);

  return (
    <div className="relative mx-auto flex h-full max-w-5xl flex-col gap-2 overflow-hidden p-2">
      <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="min-w-0 truncate text-slate-300">
          {spectator && <span className="mr-2 rounded-full bg-sky-700 px-2 py-0.5 font-bold text-white">👁️ 관전 중</span>}
          ⚪⚫ {room.name} · 참가비 {won(view.ante)}원 · {view.moveCount}수
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

      <div className={`flex min-h-0 flex-1 items-center justify-center gap-3 ${wide ? 'flex-row' : 'flex-col'}`}>
        <div className={wide ? 'flex flex-col justify-between gap-4 self-stretch py-2' : 'flex w-full max-w-[min(100%,calc(100vh-250px))] items-center justify-between'}>
          <PlayerStrip pid={top} color={colorOf(top)} playerOf={playerOf} nameOf={nameOf} isTurn={playing && view.turn === top} left={view.turn === top ? left : null} auto={turnAuto && view.turn === top} win={view.result?.winner === top} you={you} />
          {wide && <div className="text-center text-xs font-bold text-white/90">{status}</div>}
          {!wide && <span className="px-2 text-center text-xs font-bold text-white/90 sm:text-sm">{status}</span>}
          <PlayerStrip pid={bottom} color={colorOf(bottom)} playerOf={playerOf} nameOf={nameOf} isTurn={playing && view.turn === bottom} left={view.turn === bottom ? left : null} auto={turnAuto && view.turn === bottom} win={view.result?.winner === bottom} you={you} align={wide ? 'left' : 'right'} />
        </div>
        <div className={wide ? 'h-full max-h-[calc(100vh-70px)] aspect-square' : 'w-full max-w-[min(100%,calc(100vh-250px))]'}>
          <Board view={view} myColor={myColor} canPlay={myTurn && !pending} onPlace={place} hint={hint} />
        </div>
      </div>

      <div className="relative z-[59] flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-black/45 p-1.5 text-sm">
        {!spectator && <EmoteButton />}
        {practice && playing && (
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1 text-sm" disabled={!myTurn || pending || hintsLeft <= 0} onClick={askHint} title="AI 가 추천하는 수를 알려 줘요 (연습 판당 3번)" {...hk('h')}>
            💡 힌트 ({hintsLeft})
          </button>
        )}
        <AnimatePresence mode="wait">
          {msg ? (
            <motion.span key="err" role="alert" className="rounded bg-red-700 px-3 py-1 font-bold" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>🚫 {msg}</motion.span>
          ) : (
            <motion.span key="st" className="px-2 text-slate-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {view.last ? `마지막 수: ${colName(view.last.color)} ${coord(view.last.x, view.last.y)}` : '흑이 먼저 둡니다 (중앙 추천)'}
              {myTurn && myColor === 1 && ' · 흑은 쌍삼·장목 금지'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>{help && <Rules onClose={() => setHelp(false)} />}</AnimatePresence>
      <AnimatePresence>
        {chatOpen && (
          <motion.div className="absolute bottom-16 right-2 z-[65] h-64 w-72" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Chat className="h-full bg-felt-900/95" messages={roomChat} me={user.name} onSend={(text) => send('room:chat', { text })} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{omokOver && <ResultModal key="over" over={omokOver} view={view} nameOf={nameOf} you={you} onClose={dismissOmok} emit={emit} skillNote={skillNote} />}</AnimatePresence>
    </div>
  );
}
