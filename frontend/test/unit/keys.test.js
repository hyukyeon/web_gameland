import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { installHotkeys, hk } from '../../src/keys.js';
import { setSettings } from '../../src/settings.js';

const press = (key, target = document.body, init = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

// jsdom 은 레이아웃이 없어 getClientRects 가 비어 있다 → 보이는 것으로 간주
beforeAll(() => {
  Element.prototype.getClientRects = function rects() { return this.dataset?.hidden ? [] : [{}]; };
  installHotkeys();
});
afterEach(() => { document.body.innerHTML = ''; });

function button(attrs = {}, onClick = vi.fn()) {
  const b = document.createElement('button');
  Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
  b.addEventListener('click', onClick);
  document.body.appendChild(b);
  return onClick;
}

describe('단축키', () => {
  test('data-hotkey 의 키를 누르면 클릭 (대소문자 무시, 여러 키)', () => {
    const go = button(hk('g'));
    const close = button(hk('Escape Enter', 'Esc'));
    press('G');
    expect(go).toHaveBeenCalledTimes(1);
    press('Escape');
    press('Enter');
    expect(close).toHaveBeenCalledTimes(2);
  });

  test('나중에 그려진 것(모달)이 우선, 비활성·숨김은 건너뜀', () => {
    const under = button(hk('y'));
    const modal = button(hk('y'));
    press('y');
    expect(modal).toHaveBeenCalledTimes(1);
    expect(under).not.toHaveBeenCalled();
    document.body.innerHTML = '';
    const a = button(hk('n'));
    button({ ...hk('n'), disabled: '' });
    button({ ...hk('n'), 'data-hidden': '1' });
    press('n');
    expect(a).toHaveBeenCalledTimes(1);
  });

  test('입력창에 타이핑 중이거나 수정키를 누르면 무시', () => {
    const c = button(hk('c'));
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('c', input);
    press('c', document.body, { ctrlKey: true });
    expect(c).not.toHaveBeenCalled();
  });

  test('설정의 단축키 표시 → <html class="show-keys">', () => {
    setSettings({ keyHints: true });
    expect(document.documentElement.classList.contains('show-keys')).toBe(true);
    setSettings({ keyHints: false });
    expect(document.documentElement.classList.contains('show-keys')).toBe(false);
  });

  test('hk: 라벨 기본값은 첫 키 대문자, 키가 없으면 빈 객체', () => {
    expect(hk('d')).toEqual({ 'data-hotkey': 'd', 'data-hotkey-label': 'D' });
    expect(hk(undefined)).toEqual({});
  });
});
