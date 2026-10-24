/**
 * PWA: 홈 화면 설치 버튼 + 서비스 워커 등록.
 * 크롬 계열은 beforeinstallprompt 를 잡아 두었다가 설정의 '앱으로 설치' 버튼에서 띄운다. (iOS 사파리는 공유 → 홈 화면에 추가)
 */
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const canInstall = () => !!deferred;
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  notify();
  return choice?.outcome === 'accepted';
}

/** 운영 빌드에서만 서비스 워커 등록 (개발 서버의 HMR 과 충돌하지 않게) */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
