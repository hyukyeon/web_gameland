import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { won } from '../cards.js';
import { GAMES } from '../games.js';
import { Card } from './Card.jsx';
import { Avatar } from './Avatar.jsx';
import { Logo, BRAND } from './Logo.jsx';

// 게임 카드에 붙는 특징 배지
const GAME_TAGS = {
  gostop: ['실시간 2~4인', 'AI 대전', '관전'],
  seotda: ['실시간 2~4인', 'AI 대전', '베팅'],
  omok: ['1:1 대국', 'AI 대전', '렌주룰'],
  yut: ['팀전 2~4인', 'AI 대전', '업기·잡기'],
  vegas: ['실시간 2~5인', 'AI 대전', '주사위'],
  yacht: ['실시간 2~4인', 'AI 대전', '족보 12칸'],
  janggi: ['1:1 대국', 'AI 대전', '상차림'],
  slot: ['혼자', '잭팟', '하루 한도'],
  sudoku: ['혼자', '일일 보상', '난이도 3단계'],
};

const FEATURES = [
  ['💰', '가입 즉시 100,000원', '가입하면 게임 머니 10만 원을 드려요. 매일 첫 접속엔 출석 보너스도.'],
  ['🤖', 'AI 대전', '난이도와 AI 상대 수를 골라 혼자서도 바로 한 판. 연습 판은 머니·전적이 변하지 않아요.'],
  ['🏆', '랭킹 · 업적 · 칭호', '게임별 승수 랭킹과 업적을 모으고, 얻은 칭호를 프로필에 달아 보세요.'],
  ['👁️', '관전 · 채팅 · 감정표현', '진행 중인 판을 구경하고, 로비·방 채팅과 타짜 명대사로 분위기를 띄워요.'],
  ['📱', '모바일 · 앱 설치', '휴대폰 세로·가로 화면 모두 지원. 홈 화면에 추가하면 앱처럼 쓸 수 있어요.'],
  ['🧩', '쉬어 가는 미니게임', '슬롯머신과 스도쿠로 머니를 조금씩 모을 수 있어요. 하루 보상 한도가 있어요.'],
];

/** 첫 화면: 소개(게임·특징·랭킹·현황) + 로그인/회원가입 */
export function Auth() {
  const { auth } = useApp();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [ranking, setRanking] = useState([]);
  const formRef = useRef(null);
  const idRef = useRef(null);

  useEffect(() => {
    api.summary().then(setSummary).catch(() => {});
    api.ranking('money').then((r) => setRanking(r.ranking.slice(0, 5))).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await auth(mode, username.trim(), password);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };
  // 위쪽 버튼·소개 영역의 '시작하기': 로그인 상자로 옮겨 가서 바로 입력
  const openForm = (m) => {
    setMode(m);
    setErr('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // 바로 포커스한다 (늦게 옮기면 이미 비밀번호를 치는 중에 포커스를 빼앗아 아이디 칸에 입력된다)
    if (!formRef.current?.contains(document.activeElement)) idRef.current?.focus({ preventScroll: true });
  };
  const playing = summary ? Object.values(summary.games).reduce((a, g) => a + g.playing, 0) : null;

  return (
    <div className="h-full overflow-y-auto bg-[#12060c] bg-cover bg-fixed bg-center" style={{ backgroundImage: 'linear-gradient(rgba(8,4,12,.55), rgba(8,4,12,.85)), url(/casino-bg.svg)' }}>
      {/* 위쪽 바 */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#12060c]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Logo size={36} textClass="text-xl sm:text-2xl" />
          <nav className="hidden items-center gap-5 text-sm font-bold text-slate-300 md:flex" aria-label="소개 메뉴">
            <a href="#games" className="hover:text-gold-400">게임</a>
            <a href="#features" className="hover:text-gold-400">특징</a>
            <a href="#ranking" className="hover:text-gold-400">랭킹</a>
            <a href="#guide" className="hover:text-gold-400">이용 안내</a>
          </nav>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost !px-3 !py-1.5" onClick={() => openForm('login')}>로그인</button>
            <button type="button" className="btn btn-gold !px-3 !py-1.5" onClick={() => openForm('register')}>회원가입</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-14 px-4 pb-10 pt-8 sm:pt-12">
        {/* 히어로 + 로그인 */}
        <section className="grid items-center gap-8 md:grid-cols-[1fr_380px]">
          <div className="space-y-5 text-center md:text-left">
            <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }} className="flex justify-center md:justify-start">
              <Logo size={96} textClass="text-4xl sm:text-5xl" sub="KANGWON GAME LAND" />
            </motion.div>
            <h1 className="text-2xl font-black leading-snug text-slate-50 sm:text-4xl">
              화투부터 윷놀이까지,<br />
              <span className="text-gold-400">친구·AI 와 실시간으로</span> 한 판!
            </h1>
            <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
              고스톱 · 섯다 · 오목 · 윷놀이를 브라우저에서 바로. 설치 없이 가입만 하면 게임 머니 10만 원으로 시작해요.
            </p>
            <div className="flex flex-wrap justify-center gap-2 md:justify-start">
              <button type="button" className="btn btn-gold !px-6 !py-3 text-base" onClick={() => openForm('register')}>🎴 무료로 시작하기</button>
              <a href="#games" className="btn btn-ghost !px-6 !py-3 text-base">게임 둘러보기</a>
            </div>
            <div className="flex flex-wrap justify-center gap-2 text-xs md:justify-start" aria-live="polite">
              <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 ring-1 ring-white/10">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                지금 접속 <b className="text-emerald-300">{summary ? summary.online.toLocaleString('ko-KR') : '–'}</b>명
              </span>
              <span className="rounded-full bg-black/50 px-3 py-1 ring-1 ring-white/10">
                진행 중인 판 <b className="text-gold-400">{playing ?? '–'}</b>
              </span>
              <span className="rounded-full bg-black/50 px-3 py-1 ring-1 ring-white/10">게임 {GAMES.length}종</span>
            </div>
          </div>

          <motion.form
            ref={formRef}
            onSubmit={submit}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="panel w-full space-y-4 bg-[#1a0b12] p-6 shadow-2xl shadow-black/60"
            aria-label="로그인 / 회원가입"
          >
            <div className="flex justify-center gap-1">
              {[0, 8, 16, 24].map((id, i) => (
                <motion.div key={id} initial={{ rotate: -20, y: 20, opacity: 0 }} animate={{ rotate: (i - 1.5) * 8, y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.1 }}>
                  <Card id={id} size="sm" />
                </motion.div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['login', '로그인'], ['register', '회원가입']].map(([k, label]) => (
                <button type="button" key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className={`btn ${mode === k ? 'btn-gold' : 'btn-ghost'}`}>
                  {label}
                </button>
              ))}
            </div>
            <input ref={idRef} className="input" placeholder="아이디 (2~12자)" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            <input
              className="input"
              type="password"
              placeholder="비밀번호 (4자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button className="btn btn-gold w-full" disabled={loading || !username || !password}>
              {loading ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작 (100,000원 지급)'}
            </button>
            <p className="text-center text-[11px] text-slate-400">게임 머니는 가상 머니예요. 실제 돈으로 바꾸거나 충전할 수 없어요.</p>
          </motion.form>
        </section>

        {/* 게임 소개 */}
        <section id="games" className="scroll-mt-20 space-y-4">
          <SectionTitle title="즐길 수 있는 게임" desc="방을 만들어 친구와, 혹은 AI 와 바로" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((g, i) => {
              const live = summary?.games?.[g.id];
              return (
                <motion.button
                  type="button"
                  key={g.id}
                  onClick={() => openForm('register')}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  className="group flex gap-3 rounded-2xl bg-[#1a0b12] p-4 text-left ring-1 ring-white/10 transition hover:ring-gold-400/60"
                  aria-label={`${g.name}: ${g.desc}`}
                >
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-amber-300/25 to-red-800/40 text-3xl ring-1 ring-amber-200/20" aria-hidden="true">{g.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <b className="text-lg text-slate-50 group-hover:text-gold-400">{g.name}</b>
                      {live && live.rooms > 0 && <span className="whitespace-nowrap rounded-full bg-emerald-700/70 px-2 text-[11px] font-bold text-emerald-100">방 {live.rooms}개</span>}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-300">{g.desc}</span>
                    <span className="mt-2 flex flex-wrap gap-1">
                      {(GAME_TAGS[g.id] ?? []).map((t) => (
                        <span key={t} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">{t}</span>
                      ))}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* 특징 */}
        <section id="features" className="scroll-mt-20 space-y-4">
          <SectionTitle title={`${BRAND}만의 재미`} desc="혼자서도, 여럿이서도" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([icon, title, desc]) => (
              <div key={title} className="rounded-2xl bg-black/55 p-4 ring-1 ring-white/10">
                <div className="text-2xl" aria-hidden="true">{icon}</div>
                <b className="mt-1 block text-slate-50">{title}</b>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 랭킹 + 이용 안내 */}
        <section className="grid gap-4 md:grid-cols-2">
          <div id="ranking" className="scroll-mt-20 rounded-2xl bg-[#1a0b12] p-4 ring-1 ring-white/10">
            <h2 className="mb-3 font-black text-gold-400">🏆 머니 랭킹 TOP 5</h2>
            {ranking.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">아직 랭킹이 없어요. 첫 1등이 되어 보세요!</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {ranking.map((u, i) => (
                  <li key={u.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <b className={`w-5 text-center ${i < 3 ? 'text-gold-400' : 'text-slate-400'}`}>{['🥇', '🥈', '🥉'][i] ?? i + 1}</b>
                      <Avatar player={u} size={24} />
                      <span className="truncate">{u.name}</span>
                    </span>
                    <span className="whitespace-nowrap text-slate-300">{won(u.money)}원</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div id="guide" className="scroll-mt-20 rounded-2xl bg-[#1a0b12] p-4 ring-1 ring-white/10">
            <h2 className="mb-3 font-black text-gold-400">📖 이용 안내</h2>
            <ol className="space-y-2 text-sm text-slate-300">
              {[
                ['회원가입', '아이디와 비밀번호만 있으면 끝. 10만 원이 바로 지급돼요.'],
                ['게임 고르기', '로비 위쪽에서 고스톱·섯다·오목·윷놀이 중 하나를 골라요.'],
                ['AI 대전으로 연습', '난이도와 AI 수를 고르면 혼자서도 바로 시작해요.'],
                ['방 만들기 / 입장', '판돈을 정해 방을 만들고 친구를 기다리거나, 열린 방에 들어가요.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-500 text-xs font-black text-felt-900">{i + 1}</span>
                  <span><b className="text-slate-100">{t}</b> — {d}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-lg bg-red-950/60 p-2 text-[11px] leading-relaxed text-red-100/80 ring-1 ring-red-400/20">
              {BRAND}은 친목용 게임입니다. 게임 머니는 현금 가치가 없으며 환전·충전·거래가 불가능합니다.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#12060c] py-5 text-center text-xs text-slate-500">
        <Logo size={22} textClass="text-sm" className="mb-1 opacity-80" />
        <p>© {BRAND} · 화투패 그림은 게임 표시용입니다</p>
      </footer>
    </div>
  );
}

function SectionTitle({ title, desc }) {
  return (
    <div className="flex items-end justify-between gap-2 border-b border-white/10 pb-2">
      <h2 className="text-xl font-black text-slate-50 sm:text-2xl">{title}</h2>
      <span className="text-xs text-slate-400">{desc}</span>
    </div>
  );
}
