import React from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BotLevel } from '../../src/components/Avatar.jsx';
import { OnceHint } from '../../src/components/Tutorial.jsx';
import { Card } from '../../src/components/Card.jsx';
import { SettingsModal } from '../../src/components/Settings.jsx';
import { getSettings } from '../../src/settings.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('컴포넌트', () => {
  test('BotLevel: 봇만 하/중/상 배지', () => {
    const { rerender, container } = render(<BotLevel player={{ bot: true, level: 'hard' }} />);
    expect(screen.getByLabelText('AI 난이도 어려움').textContent).toBe('상');
    rerender(<BotLevel player={{ bot: false, level: 'hard' }} />);
    expect(container.textContent).toBe('');
  });

  test('Card: 누를 수 있으면 버튼 역할 + 이름 + 단축키, 짝 맞으면 🔗 배지', () => {
    let clicked = 0;
    render(<Card id={8} hl onClick={() => { clicked += 1; }} hotkey="3" />);
    const el = screen.getByRole('button', { name: '3월 광 (짝 맞음)' });
    expect(el.getAttribute('data-hotkey')).toBe('3');
    expect(el.querySelector('.match-badge')).not.toBeNull();
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(clicked).toBe(1);
  });

  test('Card: 뒷면/구경용은 버튼이 아님', () => {
    render(<Card back />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('img', { name: '뒷면' })).toBeTruthy();
  });

  test('OnceHint: 닫으면 다시 뜨지 않음', () => {
    const { unmount } = render(<OnceHint id="t1" show>도움말</OnceHint>);
    fireEvent.click(screen.getByLabelText('도움말 닫기'));
    unmount();
    render(<OnceHint id="t1" show>도움말</OnceHint>);
    expect(screen.queryByText('도움말')).toBeNull();
  });

  test('설정 화면: 연출 속도·카드 크기를 바꾸면 저장된다', () => {
    let closed = false;
    render(<SettingsModal onClose={() => { closed = true; }} />);
    fireEvent.click(screen.getByRole('radio', { name: '빠르게' }));
    fireEvent.click(screen.getByRole('radio', { name: '크게' }));
    expect(getSettings()).toMatchObject({ speed: 'fast', cardSize: 'lg' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closed).toBe(true);
  });
});
