import { SoundToggle } from './SoundToggle.jsx';
import { SettingsButton } from './Settings.jsx';
import { LobbyTour } from './Tutorial.jsx';
import { ComingSoon } from './ComingSoon.jsx';
import { GAMES } from '../games.js';
import { getSkill, skillLabel } from '../omokSkill.js';
import { Avatar } from './Avatar.jsx';
import React, { Suspense, useEffect, useState } from 'react';
import { lazyNamed } from '../lazy.js';
import { Loading } from './Loading.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { won, signed } from '../cards.js';
import { Chat } from './Chat.jsx';
import { OPTION_LABELS, BETS, LEVELS } from './options.js';

const SlotMachine = lazyNamed(() => import('./SlotMachine.jsx'), 'SlotMachine');
const ProfilePanel = lazyNamed(() => import('./Profile.jsx'), 'ProfilePanel');

function OptionToggles({ opts, onChange, disabled }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(OPTION_LABELS).map(([k, [name, desc]]) => (
        <label key={k} className={`flex items-start gap-2 rounded-lg bg-white/5 p-2 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-white/10'}`}>
          <input type="checkbox" className="mt-1 accent-amber-400" checked={!!opts[k]} disabled={disabled} onChange={(e) => onChange({ ...opts, [k]: e.target.checked })} />
          <span>
            <b>{name}</b>
            <span className="block text-xs text-slate-300">{desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
export { OptionToggles };

const TURN_SECS = [10, 30, 60];

/** 오목: 수당 제한 시간(초) 고르기 */
function TurnSecPick({ value, onChange }) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-300">수당 제한 시간 — 넘기면 AI 가 대신 한 수 둬요</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="수당 제한 시간">
        {TURN_SECS.map((t) => (
          <button key={t} role="radio" aria-checked={value === t} onClick={() => onChange(t)} className={`btn ${value === t ? 'btn-gold' : 'btn-ghost'}`}>{t}초</button>
        ))}
      </div>
    </div>
  );
}

function CreateRoom({ onClose, game = 'gostop' }) {
  const { emit, user } = useApp();
  const [name, setName] = useState('');
  const [bet, setBet] = useState(100);
  const [opts, setOpts] = useState({});
  const [turnSec, setTurnSec] = useState(30);
  const create = async () => {
    const r = await emit('room:create', { name, bet, opts: game === 'gostop' ? opts : {}, game, ...(game === 'omok' ? { turnSec } : {}) });
    if (r.ok) onClose();
  };
  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="panel w-full max-w-lg space-y-4 bg-felt-800 p-5" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gold-400">{game === 'seotda' ? '🃏 섯다 방 만들기' : game === 'omok' ? '⚪⚫ 오목 방 만들기' : game === 'yut' ? '🎲 윷놀이 방 만들기' : '방 만들기'}</h2>
        <input className="input" placeholder={`${user.name}의 방`} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <p className="mb-1 text-xs text-slate-300">{ANTE_GAMES.includes(game) ? '참가비(진 사람이 이긴 사람에게) — 입장하려면 참가비 × 10 이상 보유' : '판돈 (1점당) — 입장하려면 판돈 × 10 이상 보유'}</p>
          <div className="grid grid-cols-4 gap-2">
            {BETS.map((b) => (
              <button key={b} onClick={() => setBet(b)} className={`btn ${bet === b ? 'btn-gold' : 'btn-ghost'}`}>
                {won(b)}
              </button>
            ))}
          </div>
        </div>
        {game === 'gostop' && <OptionToggles opts={opts} onChange={setOpts} />}
        {game === 'omok' && <TurnSecPick value={turnSec} onChange={setTurnSec} />}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-gold" onClick={create}>만들기</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const GAME_TITLE = { gostop: '🎴 고스톱', seotda: '🃏 섯다', omok: '⚪ 오목', yut: '🎲 윷놀이' };
const ANTE_GAMES = ['seotda', 'omok', 'yut']; // 판돈 대신 참가비를 쓰는 게임

const PRACTICE_KEY = 'practice.setup';
const loadPractice = () => {
  try {
    return { level: 'normal', bet: 100, turnSec: 30, ...JSON.parse(localStorage.getItem(PRACTICE_KEY) || '{}') };
  } catch {
    return { level: 'normal', bet: 100, turnSec: 30 };
  }
};

/** AI 1:1 연습 설정: 난이도 · 판돈 (마지막 선택을 기억) */
function PracticeSetup({ onClose, game }) {
  const { emit } = useApp();
  const [cfg, setCfg] = useState(loadPractice);
  const start = async () => {
    try { localStorage.setItem(PRACTICE_KEY, JSON.stringify(cfg)); } catch { /* 저장소 없음 */ }
    const r = await emit('room:practice', { game, level: cfg.level, bet: cfg.bet, ...(game === 'omok' ? { turnSec: cfg.turnSec } : {}), ...(cfg.level === 'auto' ? { skill: getSkill() } : {}) });
    if (r.ok) onClose();
  };
  return (
    <motion.div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="panel w-full max-w-md space-y-4 bg-felt-800 p-5" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="AI 연습 설정">
        <h2 className="text-lg font-black text-gold-400">🤖 AI 1:1 연습 · {GAME_TITLE[game]?.replace(/^\S+\s/, '')}</h2>
        <div>
          <p className="mb-1 text-xs text-slate-300">난이도</p>
          <div className="grid gap-2">
            {(game === 'omok' ? [...LEVELS, ['auto', '🎯 자동', `내 실력(${skillLabel(getSkill())} · ${Math.round(getSkill() * 100)}점)에 맞춰 이기면 강해지고 지면 약해져요`]] : LEVELS).map(([k, label, desc]) => (
              <button key={k} onClick={() => setCfg((c) => ({ ...c, level: k }))} aria-pressed={cfg.level === k} className={`rounded-lg px-3 py-2 text-left ring-1 transition ${cfg.level === k ? 'bg-gold-500 text-felt-900 ring-gold-300' : 'bg-white/5 ring-white/15 hover:bg-white/10'}`}>
                <b>{cfg.level === k ? '✔ ' : ''}{label}</b>
                <span className={`ml-2 text-xs ${cfg.level === k ? 'text-felt-900/80' : 'text-slate-400'}`}>{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-300">{ANTE_GAMES.includes(game) ? '참가비' : '판돈 (1점당)'} — 연습이라 내 머니는 변하지 않아요</p>
          <div className="grid grid-cols-4 gap-2">
            {BETS.map((b) => (
              <button key={b} onClick={() => setCfg((c) => ({ ...c, bet: b }))} aria-pressed={cfg.bet === b} className={`btn ${cfg.bet === b ? 'btn-gold' : 'btn-ghost'}`}>
                {won(b)}
              </button>
            ))}
          </div>
        </div>
        {game === 'omok' && <TurnSecPick value={cfg.turnSec} onChange={(t) => setCfg((c) => ({ ...c, turnSec: t }))} />}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-gold" onClick={start}>시작하기</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SidePanel({ tab, setTab }) {
  const { token, user } = useApp();
  const [ranking, setRanking] = useState([]);
  const [rankBy, setRankBy] = useState('money'); // money | gostop | seotda | omok
  const [records, setRecords] = useState([]);
  useEffect(() => {
    // 탭을 열 때/닉네임을 바꿀 때마다 다시 불러와서 랭킹의 표시 이름(닉네임)이 최신이 되게 한다
    api.ranking(rankBy).then((r) => setRanking(r.ranking)).catch(() => {});
    api.records(token).then((r) => setRecords(r.records)).catch(() => {});
  }, [token, tab, user.name, rankBy]);
  const rankText = (u) =>
    rankBy === 'gostop' ? `${u.wins}승 ${u.losses}패` : rankBy === 'seotda' ? `${u.sdWins}승 ${u.sdLosses}패` : rankBy === 'omok' ? `${u.ogWins ?? 0}승 ${u.ogLosses ?? 0}패` : `${won(u.money)}원`;
  return (
    <div className="panel flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-3 gap-1 p-2">
        <button className={`btn !px-2 ${tab === 'rank' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setTab('rank')}>랭킹</button>
        <button className={`btn !px-2 ${tab === 'rec' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setTab('rec')}>내 전적</button>
        <button className={`btn !px-2 ${tab === 'me' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setTab('me')}>내 정보</button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3 text-sm">
        {tab === 'rank' && (
          <div className="mb-1 flex gap-1 text-xs">
            {[['money', '💰 머니'], ['gostop', '🎴 고스톱'], ['seotda', '🃏 섯다'], ['omok', '⚪ 오목']].map(([k, label]) => (
              <button key={k} className={`flex-1 rounded px-2 py-1 font-bold ${rankBy === k ? 'bg-gold-500 text-felt-900' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`} onClick={() => setRankBy(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {tab === 'rank' && ranking.length === 0 && <p className="text-slate-400">아직 랭킹이 없습니다.</p>}
        {tab === 'rank' &&
          ranking.map((u, i) => (
            <div key={u.id} className="flex justify-between rounded bg-white/5 px-2 py-1">
              <span className="flex min-w-0 items-center">
                <b className="mr-2 text-gold-400">{i + 1}</b>
                <Avatar player={u} size={22} className="mr-1.5" />
                <span className="truncate">{u.name}</span>
              </span>
              <span className="whitespace-nowrap text-slate-300">{rankText(u)}</span>
            </div>
          ))}
        {tab === 'me' && <Suspense fallback={<Loading small />}><ProfilePanel /></Suspense>}
        {tab === 'rec' &&
          (records.length === 0 ? (
            <p className="text-slate-400">아직 기록이 없습니다.</p>
          ) : (
            records.map((r) => (
              <div key={r.id} className="rounded bg-white/5 px-2 py-1">
                <div className="flex justify-between">
                  <b className={r.outcome === 'win' ? 'text-emerald-300' : r.outcome === 'lose' ? 'text-red-300' : 'text-slate-300'}>
                    {{ win: '승', lose: '패', draw: '무', none: '-' }[r.outcome]} {r.roomName}
                  </b>
                  <b className={r.moneyDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}>{signed(r.moneyDelta)}</b>
                </div>
                <div className="text-xs text-slate-400">vs {r.opponents.join(', ') || '-'} · {r.detail}</div>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}

export function Lobby() {
  const { user, rooms, lobbyChat, emit, send, logout, connected, reward } = useApp();
  const [creating, setCreating] = useState(false);
  const [practicing, setPracticing] = useState(false);
  const [game, setGame] = useState('gostop'); // 선택한 게임 탭
  const [tab, setTab] = useState('rank'); // 오른쪽(모바일에선 아래) 패널 탭
  const sideRef = React.useRef(null);
  const openProfile = () => {
    setTab('me');
    setTimeout(() => sideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const gameRooms = rooms.filter((r) => (r.game ?? 'gostop') === game);
  const optNames = (o) => Object.keys(OPTION_LABELS).filter((k) => o[k]).map((k) => OPTION_LABELS[k][0]);

  return (
    <div className="min-h-full bg-cover bg-fixed bg-center" style={{ backgroundImage: 'linear-gradient(rgba(8,4,12,.55), rgba(8,4,12,.7)), url(/casino-bg.svg)' }}>
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-3 p-3">
      <header className="panel flex flex-wrap items-center justify-between gap-2 bg-black/65 px-4 py-3">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-wide">
          <span>🎰</span>
          <span className="bg-gradient-to-b from-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(255,200,80,.5)]">강원랜드</span>
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`} title={connected ? '연결됨' : '연결 끊김'} />
          <button className="flex items-center gap-2 rounded-lg px-1 hover:bg-white/10" onClick={openProfile} title="내 정보 (사진·닉네임·스탯·업적)" data-tour="profile">
            <Avatar player={user} size={28} showTitle />
            <b>{user.name}</b>
          </button>
          <span className="whitespace-nowrap text-gold-400">{won(user.money)}원</span>
          <span className="whitespace-nowrap text-slate-300" title="고스톱 / 섯다 / 오목 전적">🎴 {user.wins}승 {user.losses}패 · 🃏 {user.sdWins ?? 0}승 {user.sdLosses ?? 0}패 · ⚪ {user.ogWins ?? 0}승 {user.ogLosses ?? 0}패</span>
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1 text-xs" onClick={openProfile}>👤 내 정보</button>
          <SoundToggle />
          <span data-tour="settings" className="inline-flex"><SettingsButton /></span>
          <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1 text-xs" onClick={logout}>로그아웃</button>
        </div>
      </header>

      {/* 게임 선택: 고스톱만 열려 있고 섯다·슬롯머신은 스텁 */}
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="게임 선택" data-tour="games">
        {GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => setGame(g.id)}
            aria-pressed={game === g.id}
            className={`relative rounded-xl px-2 py-3 text-center ring-1 transition ${
              game === g.id ? 'bg-gradient-to-b from-amber-300/90 to-amber-600/90 text-felt-900 ring-amber-200' : 'bg-black/65 text-slate-100 ring-white/15 hover:bg-black/40'
            }`}
          >
            <div className="text-2xl" aria-hidden="true">{g.emoji}</div>
            <div className="text-sm font-black">{g.name}</div>
            {!g.ready && <span className="absolute right-1.5 top-1.5 rounded bg-red-600 px-1 text-[9px] font-black leading-4 text-white">준비중</span>}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[1fr_320px]">
        {game === 'slot' ? <Suspense fallback={<Loading small />}><SlotMachine /></Suspense> : !['gostop', 'seotda', 'omok', 'yut'].includes(game) ? <ComingSoon gameId={game} /> : (
        <section className="panel flex min-h-0 min-w-0 flex-col bg-black/65 p-3" data-tour="rooms">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{GAME_TITLE[game]} 방 목록 ({gameRooms.length})</h2>
            <div className="flex gap-2">
              {(game === 'gostop' || game === 'seotda' || game === 'omok' || game === 'yut') && (
                <button className="btn btn-ghost whitespace-nowrap" title="AI 와 둘이서 연습 – 머니/전적에 반영되지 않습니다" onClick={() => setPracticing(true)} data-tour="practice">
                  🤖 AI 1:1 연습하기
                </button>
              )}
              <button className="btn btn-gold whitespace-nowrap" onClick={() => setCreating(true)}>+ 방 만들기</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {gameRooms.length === 0 && <p className="py-10 text-center text-slate-400">열린 방이 없습니다. 방을 만들어 보세요!</p>}
            <AnimatePresence initial={false}>
              {gameRooms.map((r) => {
                const joinable = r.status === 'waiting' && r.count < r.max;
                return (
                  <motion.div key={r.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-white/5 p-3">
                    <div className="min-w-0">
                      <div className="truncate font-bold">{r.name}</div>
                      <div className="truncate text-xs text-slate-300">
                        {r.players.join(', ')} · {game === 'gostop' ? '판돈' : '참가비'} {won(r.bet)}{game === 'omok' && r.turnSec ? ` · ${r.turnSec}초` : ''}
                        {game === 'gostop' && optNames(r.opts).length > 0 && ` · ${optNames(r.opts).join('/')}`}
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
                      <span className="text-sm">{r.count}/{r.max}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${r.status === 'waiting' ? 'bg-emerald-600' : 'bg-red-700'}`}>{r.status === 'waiting' ? '대기' : '게임중'}</span>
                      {joinable ? (
                        <button className="btn btn-gold" onClick={() => emit('room:join', { roomId: r.id })}>입장</button>
                      ) : (
                        <button className="btn btn-ghost" title="가득 찼거나 진행 중인 방을 구경만 합니다" onClick={() => emit('room:spectate', { roomId: r.id })}>
                          👁️ 관전하기{r.spectators > 0 && ` (${r.spectators})`}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
        )}

        <aside className="flex min-h-0 min-w-0 flex-col gap-3">
          <div ref={sideRef} className="flex min-h-[420px] min-w-0 flex-1 flex-col md:min-h-0">
            <SidePanel tab={tab} setTab={setTab} />
          </div>
          <Chat className="h-56" messages={lobbyChat} me={user.name} onSend={(text) => send('lobby:chat', { text })} placeholder="로비 채팅" />
        </aside>
      </div>
      <AnimatePresence>{creating && <CreateRoom game={game} onClose={() => setCreating(false)} />}</AnimatePresence>
      <AnimatePresence>{practicing && <PracticeSetup game={game} onClose={() => setPracticing(false)} />}</AnimatePresence>
      {/* 첫 사용자(아직 한 판도 안 한 사람)에게 한 번 자동으로 */}
      <LobbyTour autoStart={(user.wins ?? 0) + (user.losses ?? 0) + (user.sdWins ?? 0) + (user.sdLosses ?? 0) === 0} blocked={!!reward || creating || practicing} />
    </div>
    </div>
  );
}
