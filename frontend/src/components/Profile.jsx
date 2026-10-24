import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { api } from '../api.js';
import { Avatar } from './Avatar.jsx';

const SIZE = 256;
const pct = (v) => `${Math.round(v * 100)}%`;

/** 방사형 차트: axes = [{ label, value(0~1) }] — 의존성 없이 SVG 로 그린다 */
export function RadarChart({ axes, size = 220 }) {
  const c = size / 2;
  const r = size / 2 - 38;
  const n = axes.length;
  const pt = (i, k) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r * k, c + Math.sin(a) * r * k];
  };
  const poly = (k) => axes.map((_, i) => pt(i, k).join(',')).join(' ');
  const data = axes.map((a, i) => pt(i, Math.max(0.04, Math.min(1, a.value))).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto w-full max-w-[240px]" role="img" aria-label="플레이 성향 방사형 차트">
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={poly(k)} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(255,255,255,0.18)" />;
      })}
      <polygon points={data} fill="rgba(234,179,8,0.35)" stroke="#facc15" strokeWidth="2" />
      {axes.map((a, i) => {
        const [x, y] = pt(i, Math.max(0.04, Math.min(1, a.value)));
        const [lx, ly] = pt(i, 1.2);
        return (
          <g key={a.label}>
            <circle cx={x} cy={y} r="3" fill="#facc15" />
            <text x={lx} y={ly} fill="#e2e8f0" fontSize="10.5" fontWeight="700" textAnchor="middle" dominantBaseline="middle">
              {a.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Bar({ label, value, text }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[11px]">
        <span className="text-slate-300">{label}</span>
        <b>{text}</b>
      </div>
      <div className="h-2 overflow-hidden rounded bg-white/10">
        <div className="h-full rounded bg-gold-500 transition-all" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
      </div>
    </div>
  );
}

/** 업적 목록: 달성한 업적을 눌러 대표 칭호로 설정 */
function AchList({ list, user, pick }) {
  return (
    <>
      <h3 className="pt-1 text-sm font-black text-gold-400">🏆 업적 · 대표 칭호</h3>
      <p className="text-[11px] text-slate-400">달성한 업적을 눌러 대표 칭호로 설정하면 아바타 위에 표시됩니다.</p>
      <ul className="space-y-1">
        {list.map((a) => (
          <li key={a.id}>
            <button
              disabled={!a.owned}
              onClick={() => pick(a.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${a.owned ? 'bg-white/10 hover:bg-white/20' : 'bg-white/5 opacity-50'} ${user.title === a.id ? 'ring-2 ring-gold-400' : ''}`}
            >
              <span className="text-lg">{a.owned ? a.emoji : '🔒'}</span>
              <span className="min-w-0 flex-1">
                <b>{a.name}</b>
                <span className="block text-[11px] text-slate-400">{a.desc}</span>
              </span>
              {user.title === a.id && <span className="rounded bg-gold-500 px-1.5 text-[10px] font-black text-felt-900">대표</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** 포커 스타일 스탯 대시보드 + 업적/대표 칭호 */
function StatsPanel() {
  const { token, user, updateUser, notify } = useApp();
  const [stats, setStats] = useState(null);
  const [ach, setAch] = useState([]);
  const [game, setGame] = useState('gostop'); // 스탯·업적을 볼 게임
  useEffect(() => {
    api.stats(token).then((r) => setStats(r.stats)).catch(() => {});
    api.achievements(token).then((r) => setAch(r.achievements)).catch(() => {});
  }, [token, user.wins, user.losses, user.sdWins, user.sdLosses, user.achievements?.length]);

  const pick = async (id) => {
    try {
      const r = await api.setTitle(token, user.title === id ? null : id);
      updateUser(r.user);
    } catch (e) {
      notify(e.message);
    }
  };

  if (!stats) return <p className="py-2 text-xs text-slate-400">불러오는 중…</p>;
  const sd = stats.seotda;
  const tabs = (
    <div className="flex gap-1 text-xs">
      {[['gostop', '🎴 고스톱'], ['seotda', '🃏 섯다']].map(([k, label]) => (
        <button key={k} className={`flex-1 rounded px-2 py-1 font-bold ${game === k ? 'bg-gold-500 text-felt-900' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`} onClick={() => setGame(k)}>
          {label}
        </button>
      ))}
    </div>
  );
  const achList = ach.filter((a) => (a.game ?? 'gostop') === game);
  const axes = [
    { label: '승률', value: stats.winRate },
    { label: '고 성향', value: stats.goRate },
    { label: '평균 점수', value: Math.min(1, stats.avgScore / 10) },
    { label: '피박 회피', value: stats.pibakAvoid },
    { label: '폭탄·흔들기', value: Math.min(1, stats.bombPerGame / 0.5) },
  ];
  const sdAxes = sd && [
    { label: '승률', value: sd.winRate },
    { label: '공격성', value: 1 - sd.dieRate },
    { label: '허세', value: sd.wins ? Math.min(1, sd.bluffWins / sd.wins / 0.3) : 0 },
    { label: '땡 승률', value: sd.wins ? sd.ttaengWins / sd.wins : 0 },
    { label: '올인', value: sd.wins ? Math.min(1, sd.allinWins / sd.wins / 0.3) : 0 },
  ];
  if (game === 'seotda' && sd)
    return (
      <div className="space-y-3">
        {tabs}
        <h3 className="text-sm font-black text-gold-400">📊 섯다 성향 (실전 {sd.games}판)</h3>
        <RadarChart axes={sdAxes} />
        <div className="space-y-1.5">
          <Bar label="승률" value={sd.winRate} text={`${pct(sd.winRate)} (${sd.wins}승 ${sd.losses}패)`} />
          <Bar label="다이 비율" value={sd.dieRate} text={sd.games ? pct(sd.dieRate) : '-'} />
        </div>
        <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
          {[['다이승', sd.foldWins], ['허세승', sd.bluffWins], ['땡 이상', sd.ttaengWins], ['광땡', sd.gwangWins], ['올인승', sd.allinWins], ['더블승', sd.doubleWins], ['최대 팟', sd.biggestPot ? `${Math.round(sd.biggestPot / 1000)}천` : 0], ['최고 패', sd.bestHand ?? '-']].map(([k, v]) => (
            <div key={k} className="rounded bg-white/5 py-1">
              <div className="text-slate-400">{k}</div>
              <b className="block truncate px-0.5">{v}</b>
            </div>
          ))}
        </div>
        <AchList list={achList} user={user} pick={pick} />
      </div>
    );
  return (
    <div className="space-y-3">
      {tabs}
      <h3 className="text-sm font-black text-gold-400">📊 고스톱 성향 (실전 {stats.games}판)</h3>
      <RadarChart axes={axes} />
      <div className="space-y-1.5">
        <Bar label="승률" value={stats.winRate} text={`${pct(stats.winRate)} (${stats.wins}승 ${stats.losses}패)`} />
        <Bar label="고(Go) 성향" value={stats.goRate} text={`${pct(stats.goRate)} (고 ${stats.goCount} / 스톱 ${stats.stopCount})`} />
        <Bar label="평균 획득 점수" value={Math.min(1, stats.avgScore / 10)} text={`${stats.avgScore.toFixed(1)}점`} />
        <Bar label="피박 회피율" value={stats.pibakAvoid} text={stats.losses ? pct(stats.pibakAvoid) : '-'} />
      </div>
      <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
        {[['뻑', stats.bbuckCount], ['폭탄', stats.bombCount], ['흔들기', stats.shakeCount], ['AI 승', stats.botWins]].map(([k, v]) => (
          <div key={k} className="rounded bg-white/5 py-1">
            <div className="text-slate-400">{k}</div>
            <b>{v}</b>
          </div>
        ))}
      </div>

      <AchList list={achList} user={user} pick={pick} />
    </div>
  );
}

/** 선택한 사진을 가운데 기준 정사각형으로 잘라 256px JPEG 로 줄인다 (업로드 용량·전송 시간 절약) */
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('이미지를 읽을 수 없습니다.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, SIZE, SIZE);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('변환에 실패했습니다.'))), 'image/jpeg', 0.88));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 내 정보 관리: 닉네임(다른 사람에게 보이는 이름)과 사진 */
export function ProfilePanel() {
  const { token, user, updateUser, notify, claimGaepyeong } = useApp();
  const [nick, setNick] = useState(user.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      updateUser(r.user);
      setNick(r.user.nickname ?? '');
      if (okMsg) notify(okMsg);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return notify('이미지 파일을 선택하세요.');
    run(async () => api.uploadAvatar(token, await shrink(f)), '사진을 바꿨습니다.');
  };

  const dirty = nick.trim() !== (user.nickname ?? '');

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col items-center gap-2">
        <Avatar player={user} size={96} showTitle />
        <div className="flex gap-2">
          <button className="btn btn-gold !px-3 !py-1 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
            사진 올리기
          </button>
          {user.avatar && (
            <button className="btn btn-ghost !px-3 !py-1 text-xs" disabled={busy} onClick={() => run(() => api.deleteAvatar(token), '기본 이미지로 되돌렸습니다.')}>
              기본 이미지로
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} />
        <p className="text-[11px] text-slate-400">정사각형으로 잘려 저장됩니다. 방과 팝업 메시지에 표시돼요.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold text-slate-300">닉네임 (다른 사람에게 보이는 이름)</label>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder={user.username}
            maxLength={12}
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && dirty && run(() => api.updateProfile(token, nick), '닉네임을 저장했습니다.')}
          />
          <button className="btn btn-gold shrink-0" disabled={busy || !dirty} onClick={() => run(() => api.updateProfile(token, nick), '닉네임을 저장했습니다.')}>
            저장
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">2~12자 한글/영문/숫자/_ . 비우면 로그인 아이디({user.username})가 보입니다.</p>
      </div>

      <div className="rounded bg-white/5 p-2 text-xs text-slate-300">
        <div>로그인 아이디: <b>{user.username}</b></div>
        <div>표시 이름: <b className="text-gold-400">{user.name}</b></div>
        {user.titleText && <div>대표 칭호: <b className="text-gold-400">{user.titleText}</b></div>}
      </div>

      <div className="space-y-1.5 rounded-lg bg-white/5 p-3">
        <h3 className="text-sm font-black text-gold-400">🧧 개평 받기</h3>
        <p className="text-[11px] text-slate-400">보유 머니가 10,000원 이하일 때 하루 3번, 30,000원씩 충전해 드려요.</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-300">
            오늘 남은 횟수 <b className="text-white">{user.gaepyeongLeft}/3</b>
          </span>
          <button className="btn btn-gold !px-3 !py-1 text-xs" disabled={!user.canGaepyeong} onClick={claimGaepyeong}>
            개평 받기
          </button>
        </div>
        {!user.canGaepyeong && (
          <p className="text-[11px] text-slate-400">{user.gaepyeongLeft === 0 ? '오늘은 개평을 모두 받았습니다.' : '보유 머니가 10,000원을 넘어서 지금은 받을 수 없어요.'}</p>
        )}
      </div>

      <StatsPanel />
    </div>
  );
}
