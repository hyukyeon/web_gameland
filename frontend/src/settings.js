import { useSyncExternalStore } from 'react';

/**
 * 사용자 설정 (이 브라우저에만 저장). 화면 어디서든 getSettings()/useSettings() 로 읽고 setSettings() 로 바꾼다.
 *  - sfxVolume / bgmVolume: 0~1
 *  - speed: 연출 속도 배율 이름 (slow | normal | fast)
 *  - cardSize: 화투패 크기 (sm | md | lg)
 *  - vibrate: 내 차례·족보·승패 때 진동 (지원하는 기기만)
 *  - keyHints: 버튼/패에 단축키 표시
 */
const KEY = 'gostop.settings';
const DEFAULTS = { sfxVolume: 0.7, bgmVolume: 0.4, speed: 'normal', cardSize: 'md', vibrate: true, keyHints: false };

export const SPEEDS = [
  ['slow', '느리게', 1.35],
  ['normal', '보통', 1],
  ['fast', '빠르게', 0.6],
];
export const CARD_SIZES = [
  ['sm', '작게', 0.88],
  ['md', '보통', 1],
  ['lg', '크게', 1.15],
];

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let state = load();
const listeners = new Set();

function apply() {
  if (typeof document === 'undefined') return;
  const scale = CARD_SIZES.find(([k]) => k === state.cardSize)?.[2] ?? 1;
  document.documentElement.style.setProperty('--cs-user', String(scale)); // 실제 --cs 는 CSS 에서 (가로 모드 축소 포함)
}
apply();

export const getSettings = () => state;

export function setSettings(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장소를 못 쓰면 이번 세션만 */
  }
  apply();
  listeners.forEach((l) => l(state));
}

export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const useSettings = () => useSyncExternalStore(subscribeSettings, getSettings, getSettings);

/** 연출 시간 배율 (보통 = 1). 프레임 재생·정산·배분 등 시간 상수에 곱한다. */
export const speedScale = () => SPEEDS.find(([k]) => k === state.speed)?.[2] ?? 1;

/** 진동 (설정이 켜져 있고 기기가 지원할 때만) */
export function vibrate(pattern) {
  if (!state.vibrate || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* 일부 브라우저는 사용자 입력 전 진동을 막는다 */
  }
}

/** 휴대폰 가로 모드처럼 세로가 아주 좁은 화면인지 (CSS 의 같은 미디어 쿼리와 맞춘다) */
const SHORT_LANDSCAPE = '(orientation: landscape) and (max-height: 500px)';
const subscribeMedia = (fn) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const m = window.matchMedia(SHORT_LANDSCAPE);
  m.addEventListener('change', fn);
  return () => m.removeEventListener('change', fn);
};
const isShortLandscape = () => typeof window !== 'undefined' && !!window.matchMedia?.(SHORT_LANDSCAPE).matches;
export const useShortLandscape = () => useSyncExternalStore(subscribeMedia, isShortLandscape, () => false);
