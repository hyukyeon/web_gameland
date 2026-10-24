import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { isBgmOn, isSoundOn, setBgmOn, setSoundOn, onSoundChange } from '../sound.js';
import { useSettings, setSettings, SPEEDS, CARD_SIZES, OMOK_THEMES, OMOK_STONES, OMOK_NUMBERS, OMOK_CONFIRM, vibrate } from '../settings.js';
import { canInstall, promptInstall, onInstallChange, isStandalone } from '../pwa.js';
import { restartTour } from './Tutorial.jsx';
import { SHORTCUTS } from '../keys.js';
import { BarLabel } from './TurnTools.jsx';

function Seg({ value, options, onChange, label }) {
  return (
    <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={label}>
      {options.map(([k, text]) => (
        <button key={k} role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={`btn !px-2 !py-1 text-sm ${value === k ? 'btn-gold' : 'btn-ghost'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Row({ title, children, hint }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Volume({ on, setOn, value, onChange, label }) {
  return (
    <div className="flex items-center gap-3">
      <button className={`btn !px-3 !py-1 text-sm ${on ? 'btn-gold' : 'btn-ghost'}`} aria-pressed={on} onClick={() => setOn(!on)}>
        {on ? '켜짐' : '꺼짐'}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        disabled={!on}
        aria-label={`${label} 음량`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-amber-400 disabled:opacity-40"
      />
      <span className="w-9 text-right text-xs tabular-nums text-slate-300">{Math.round(value * 100)}%</span>
    </div>
  );
}

/** 설정 화면: 효과음/배경음 음량, 연출 속도, 카드 크기, 진동, 단축키, 튜토리얼, 앱 설치 */
export function SettingsModal({ onClose }) {
  const st = useSettings();
  const [fx, setFx] = useState(isSoundOn());
  const [bgm, setBgm] = useState(isBgmOn());
  useEffect(() => onSoundChange(() => setFx(isSoundOn())), []);
  const [installable, setInstallable] = useState(canInstall());
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const canVibrate = typeof navigator !== 'undefined' && !!navigator.vibrate;

  return (
    <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        className="panel max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto bg-felt-800 p-5"
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-gold-400">⚙️ 설정</h2>
          <button className="btn btn-ghost !px-3 !py-1" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <Row title="🔊 효과음">
          <Volume label="효과음" on={fx} setOn={(v) => { setSoundOn(v); setFx(v); }} value={st.sfxVolume} onChange={(v) => setSettings({ sfxVolume: v })} />
        </Row>
        <Row title="🎵 배경음악">
          <Volume label="배경음악" on={bgm} setOn={(v) => { setBgmOn(v); setBgm(v); }} value={st.bgmVolume} onChange={(v) => setSettings({ bgmVolume: v })} />
        </Row>
        <Row title="🎬 연출 속도" hint="패 이동·정산·섯다 배분">
          <Seg label="연출 속도" value={st.speed} options={SPEEDS} onChange={(v) => setSettings({ speed: v })} />
        </Row>
        <Row title="🎴 카드 크기">
          <Seg label="카드 크기" value={st.cardSize} options={CARD_SIZES} onChange={(v) => setSettings({ cardSize: v })} />
        </Row>
        <Row title="⚪⚫ 오목" hint="판 · 돌 · 보조 표시">
          <div className="space-y-2">
            <Seg label="오목판 테마" value={st.omokTheme} options={OMOK_THEMES} onChange={(v) => setSettings({ omokTheme: v })} />
            <Seg label="돌 모양" value={st.omokStones} options={OMOK_STONES} onChange={(v) => setSettings({ omokStones: v })} />
            <p className="text-[11px] text-slate-400">수 번호 표시</p>
            <Seg label="수 번호 표시" value={st.omokNumbers} options={OMOK_NUMBERS} onChange={(v) => setSettings({ omokNumbers: v })} />
            <p className="text-[11px] text-slate-400">착수 확인 (탭 → 미리보기 → 한 번 더 탭)</p>
            <Seg label="착수 확인" value={st.omokConfirm} options={OMOK_CONFIRM} onChange={(v) => setSettings({ omokConfirm: v })} />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-amber-400" checked={st.omokCoords} onChange={(e) => setSettings({ omokCoords: e.target.checked })} />
              판 가장자리에 좌표(A~O, 1~15) 표시
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-amber-400" checked={st.omokThreat} onChange={(e) => setSettings({ omokThreat: e.target.checked })} />
              위협 표시 (열린 3·4 를 숫자 배지로 — 초보 보조)
            </label>
          </div>
        </Row>
        <Row title="📳 진동" hint={canVibrate ? '내 차례 · 족보 · 승패' : '이 기기/브라우저는 진동을 지원하지 않아요'}>
          <button
            className={`btn !px-3 !py-1 text-sm ${st.vibrate ? 'btn-gold' : 'btn-ghost'}`}
            aria-pressed={st.vibrate}
            disabled={!canVibrate}
            onClick={() => {
              setSettings({ vibrate: !st.vibrate });
              if (!st.vibrate) setTimeout(() => vibrate(40), 0);
            }}
          >
            {st.vibrate ? '켜짐' : '꺼짐'}
          </button>
        </Row>
        <Row title="⌨️ 키보드 단축키">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-amber-400" checked={st.keyHints} onChange={(e) => setSettings({ keyHints: e.target.checked })} />
            버튼과 손패에 단축키 표시
          </label>
          <details className="rounded-lg bg-white/5 p-2 text-xs text-slate-300">
            <summary className="cursor-pointer font-bold text-slate-200">단축키 목록</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {SHORTCUTS.map(([k, d]) => (
                <React.Fragment key={k}>
                  <dt><kbd className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-gold-400">{k}</kbd></dt>
                  <dd>{d}</dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
        </Row>
        <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
          <button className="btn btn-ghost text-sm" onClick={() => { onClose(); restartTour(); }}>🧭 튜토리얼 다시 보기</button>
          {installable ? (
            <button className="btn btn-gold text-sm" onClick={() => promptInstall()}>📲 앱으로 설치</button>
          ) : (
            <span className="self-center text-center text-[11px] text-slate-400">{isStandalone() ? '📲 앱으로 실행 중' : '브라우저 메뉴의 "홈 화면에 추가"로 설치할 수 있어요'}</span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** 설정 열기 버튼 */
export function SettingsButton({ className = '', stacked = false }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn btn-ghost whitespace-nowrap !py-1 ${stacked ? '!px-2.5 sm:!px-3' : '!px-3'} ${className}`} title="설정 (음량·속도·카드 크기·진동·단축키)" aria-label="설정" onClick={() => setOpen(true)}>
        <BarLabel icon="⚙️" text="설정" stacked={stacked} />
      </button>
      <AnimatePresence>{open && <SettingsModal onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
