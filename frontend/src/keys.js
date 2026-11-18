/**
 * 키보드 단축키. 버튼/패에 data-hotkey="g" (여러 개면 공백 구분) 를 달면, 그 키를 눌렀을 때 화면에 보이는 요소를 대신 클릭한다.
 * 모달이 떠 있으면 모달 안의 요소가 우선(DOM 에서 나중에 그려진 것)이고, 입력창에 타이핑 중일 때는 동작하지 않는다.
 * 설정에서 '단축키 표시'를 켜면 <html class="show-keys"> 가 되어 CSS 로 키 배지를 보여 준다 (data-hotkey-label).
 */
import { getSettings, subscribeSettings } from './settings.js';

export const SHORTCUTS = [
  ['1~9, 0', '고스톱: 손패 내기(왼쪽부터) · 먹을 바닥패 고르기'],
  ['D', '고스톱: 더미 뒤집기 · 섯다: 다이'],
  ['G / S', '고스톱: 고 / 스톱'],
  ['Y / N', '흔들기·광팔기·총통·쇼당 등 예 / 아니오'],
  ['C', '섯다: 콜 · 체크'],
  ['H / B / T', '섯다: 하프 / 삥 / 따당'],
  ['V', '섯다: 내 패 바로 보기'],
  ['방향키 · Enter', '오목: 교차점 이동 · 착수'],
  ['H', '오목 연습: AI 힌트'],
  ['U', '오목: 무르기'],
  ['T', '윷놀이: 윷 던지기 · 라스베가스: 주사위 굴리기'],
  ['1~6', '라스베가스: 그 번호 카지노 고르기(한 번 더 누르면 놓기)'],
  ['1~5 · R', '요트 다이스: 주사위 고정/풀기 · 굴리기'],
  ['1~9 · 0/Backspace · 방향키', '스도쿠: 숫자 넣기 · 지우기 · 칸 이동'],
  ['?', '규칙 · 족보 도움말'],
  ['Esc', '창 닫기'],
];

const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

function handle(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const t = e.target;
  if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
  // 포커스된 버튼의 Space/Enter 는 브라우저 기본 동작에 맡긴다
  if ((e.key === ' ' || e.key === 'Enter') && t instanceof Element && t.closest('button')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const els = [...document.querySelectorAll('[data-hotkey]')].filter(
    (el) => el.dataset.hotkey.split(' ').includes(key) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && visible(el),
  );
  const el = els.at(-1);
  if (!el) return;
  e.preventDefault();
  el.click();
}

function syncClass() {
  document.documentElement.classList.toggle('show-keys', !!getSettings().keyHints);
}

export function installHotkeys() {
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', handle);
  syncClass();
  subscribeSettings(syncClass);
}

/** 요소에 펼쳐 넣을 단축키 속성. label 은 배지에 보일 글자(기본: 첫 키를 대문자로) */
export const hk = (keys, label) => (keys ? { 'data-hotkey': keys, 'data-hotkey-label': label ?? keys.split(' ')[0].toUpperCase() } : {});
