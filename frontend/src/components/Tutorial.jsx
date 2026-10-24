import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * 첫 사용자 튜토리얼 (#24): 로비 → 연습 → 실전 흐름을 스포트라이트로 안내.
 * 대상 요소에 data-tour="이름" 을 달아 둔다. 대상이 없거나 안 보이면 화면 가운데에 설명만 띄운다.
 * 한 번 끝내거나 건너뛰면 다시 뜨지 않고, 설정의 '튜토리얼 다시 보기'로 언제든 다시 볼 수 있다.
 */
const DONE_KEY = 'tour.lobby';
const EVENT = 'tour:restart';

const STEPS = [
  { title: '🎰 강원랜드에 오신 걸 환영해요!', body: '처음이시군요. 30초만 둘러볼게요. 언제든 건너뛸 수 있어요.' },
  { target: 'games', title: '① 게임 고르기', body: '고스톱 · 섯다 · 슬롯머신 중 하나를 고르세요. 아래 방 목록이 그 게임으로 바뀝니다.' },
  { target: 'practice', title: '② 먼저 AI 와 연습', body: 'AI 1:1 연습은 머니와 전적이 변하지 않아요. 난이도(쉬움·보통·어려움)와 판돈을 골라 규칙을 익혀 보세요.' },
  { target: 'rooms', title: '③ 실전은 방에서', body: '방을 만들거나 입장해서 다른 사람과 붙으면 실전! 사람이 2명 이상이면 머니·전적이 반영됩니다. 빈자리는 AI 봇으로 채울 수 있어요.' },
  { target: 'profile', title: '④ 내 정보', body: '매일 출석 보너스, 돈이 바닥나면 개평, 업적과 칭호를 여기서 확인해요.' },
  { target: 'settings', title: '⑤ 설정', body: '음량 · 연출 속도 · 카드 크기 · 진동 · 키보드 단축키를 바꿀 수 있어요. 게임 중에는 ❓ 버튼으로 규칙과 족보를 볼 수 있습니다.' },
  { title: '준비 완료! 🎉', body: '먼저 고스톱 AI 연습으로 한 판 해 보는 걸 추천해요. 행운을 빌어요!' },
];

export function restartTour() {
  try { localStorage.removeItem(DONE_KEY); } catch { /* 무시 */ }
  window.dispatchEvent(new Event(EVENT));
}

const isDone = () => {
  try { return localStorage.getItem(DONE_KEY) === 'done'; } catch { return true; }
};

function useTargetRect(target, step) {
  const [rect, setRect] = useState(null);
  const measure = useCallback(() => {
    const el = target && [...document.querySelectorAll(`[data-tour="${target}"]`)].find((e) => e.getClientRects().length);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    return setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [target]);
  useLayoutEffect(() => {
    const el = target && [...document.querySelectorAll(`[data-tour="${target}"]`)].find((e) => e.getClientRects().length);
    el?.scrollIntoView({ block: 'center', behavior: 'instant' });
    measure();
  }, [target, step, measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);
  return rect;
}

/** 로비에 둔다. autoStart 면 처음 한 번 자동으로 뜬다 (새 사용자). */
export function LobbyTour({ autoStart, blocked = false }) {
  const [step, setStep] = useState(() => (autoStart && !isDone() ? 0 : -1));
  const open = step >= 0;
  const cur = STEPS[step] ?? STEPS[0];
  const rect = useTargetRect(open && !blocked ? cur.target : null, step);

  useEffect(() => {
    const h = () => setStep(0);
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);

  const finish = useCallback(() => {
    try { localStorage.setItem(DONE_KEY, 'done'); } catch { /* 무시 */ }
    setStep(-1);
  }, []);
  // 함수형 갱신: 빠르게 연타해도 한 칸씩 정확히 넘어간다
  const next = useCallback(() => {
    if (step >= STEPS.length - 1) return finish();
    return setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [step, finish]);

  useEffect(() => {
    if (!open || blocked) return undefined;
    const k = (e) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [open, blocked, next, finish]);

  if (!open || blocked) return null; // 출석 보상 같은 다른 모달이 떠 있으면 닫힌 뒤에
  const pad = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 32);
  // 설명 카드 위치: 대상 아래에 공간이 있으면 아래, 아니면 위, 대상이 없으면 가운데
  let pos;
  if (rect) {
    const left = Math.min(Math.max(16, rect.x + rect.w / 2 - cardW / 2), vw - cardW - 16);
    const below = rect.y + rect.h + pad + 12;
    pos = vh - below > 190 ? { left, top: below } : { left, top: Math.max(16, rect.y - pad - 12 - 180) };
  } else pos = { left: (vw - cardW) / 2, top: Math.max(16, vh / 2 - 110) };

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="튜토리얼">
      {/* 어두운 배경 + 대상 구멍(스포트라이트) */}
      {rect ? (
        <motion.div
          className="pointer-events-none absolute rounded-xl outline outline-4 outline-gold-400"
          initial={false}
          animate={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,.68)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/70" />
      )}
      <div className="absolute inset-0" aria-hidden="true" />
      <AnimatePresence initial={false}>
        <motion.div
          key={step}
          className="panel absolute space-y-3 bg-felt-800 p-4 shadow-2xl ring-2 ring-gold-400/60"
          style={{ ...pos, width: cardW }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0 } }}
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-black text-gold-400">{cur.title}</h2>
            <span className="shrink-0 text-xs tabular-nums text-slate-400">{step + 1}/{STEPS.length}</span>
          </div>
          <p className="text-sm leading-relaxed text-slate-100">{cur.body}</p>
          <div className="flex items-center justify-between gap-2">
            <button className="text-xs text-slate-400 underline-offset-2 hover:underline" onClick={finish}>건너뛰기</button>
            <div className="flex gap-2">
              {step > 0 && <button className="btn btn-ghost !px-3 !py-1" onClick={() => setStep((st) => Math.max(0, st - 1))}>이전</button>}
              <button className="btn btn-gold !px-4 !py-1" onClick={next} autoFocus>{step >= STEPS.length - 1 ? '시작하기' : '다음'}</button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** 게임 화면의 한 번짜리 도움말 말풍선 (예: 처음 내 차례가 왔을 때) */
export function OnceHint({ id, show, children, className = '' }) {
  const key = `hint.${id}`;
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return true; }
  });
  const dismiss = () => {
    try { localStorage.setItem(key, '1'); } catch { /* 무시 */ }
    setSeen(true);
  };
  return (
    <AnimatePresence>
      {show && !seen && (
        <motion.div
          role="status"
          className={`z-30 flex max-w-[min(92vw,420px)] items-start gap-2 rounded-xl bg-gold-500 px-3 py-2 text-sm font-bold text-felt-900 shadow-xl ${className}`}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6 }}
        >
          <span className="flex-1">{children}</span>
          <button className="shrink-0 rounded bg-felt-900/15 px-2 text-xs hover:bg-felt-900/25" onClick={dismiss} aria-label="도움말 닫기">알겠어요</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
