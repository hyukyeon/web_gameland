import { beforeEach, describe, expect, test, vi } from 'vitest';

// 모듈 상태(설정값)가 테스트마다 초기화되도록 매번 새로 불러온다
async function fresh(saved) {
  vi.resetModules();
  localStorage.clear();
  if (saved) localStorage.setItem('gostop.settings', JSON.stringify(saved));
  return import('../../src/settings.js');
}

describe('settings', () => {
  beforeEach(() => document.documentElement.removeAttribute('style'));

  test('기본값과 저장된 값 병합', async () => {
    const s = await fresh({ speed: 'fast' });
    expect(s.getSettings()).toMatchObject({ speed: 'fast', cardSize: 'md', vibrate: true, keyHints: false });
    expect(s.speedScale()).toBe(0.6);
  });

  test('깨진 저장값이면 기본값', async () => {
    vi.resetModules();
    localStorage.setItem('gostop.settings', '{oops');
    const s = await import('../../src/settings.js');
    expect(s.getSettings().speed).toBe('normal');
    expect(s.speedScale()).toBe(1);
  });

  test('setSettings: 저장 + 구독자 알림 + 카드 크기 CSS 변수', async () => {
    const s = await fresh();
    const seen = [];
    const off = s.subscribeSettings((st) => seen.push(st.cardSize));
    s.setSettings({ cardSize: 'lg' });
    expect(JSON.parse(localStorage.getItem('gostop.settings')).cardSize).toBe('lg');
    expect(document.documentElement.style.getPropertyValue('--cs-user')).toBe('1.15');
    off();
    s.setSettings({ cardSize: 'sm' });
    expect(seen).toEqual(['lg']);
  });

  test('vibrate: 설정이 켜져 있고 지원할 때만 호출', async () => {
    const s = await fresh();
    const fn = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true });
    s.vibrate(30);
    expect(fn).toHaveBeenCalledWith(30);
    s.setSettings({ vibrate: false });
    s.vibrate(30);
    expect(fn).toHaveBeenCalledTimes(1);
    delete navigator.vibrate;
    s.setSettings({ vibrate: true });
    expect(() => s.vibrate(30)).not.toThrow();
  });

  test('애니메이션: 기본은 OS 동작 줄이기와 상관없이 켬, 기기 설정·끄기 선택', async () => {
    const s = await fresh();
    expect(s.getSettings().motion).toBe('on');
    expect(s.reducedMotionOf('on')).toBe('never');
    expect(s.reducedMotionOf('auto')).toBe('user');
    expect(s.reducedMotionOf('off')).toBe('always');
    expect(s.reducedMotionOf(undefined)).toBe('never');
  });
});
