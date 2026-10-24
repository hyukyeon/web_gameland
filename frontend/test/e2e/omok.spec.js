import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

test('오목 AI 연습: 착수 · 봇 응수 · 마지막 수 표시 · 규칙 · 나가기', async ({ page }) => {
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /오목/ }).first().click();
  await startPractice(page, { game: 'omok', level: '쉬움', bet: '500' });
  const board = page.getByRole('grid', { name: /오목판/ });
  await expect(board).toBeVisible();
  await expect(page.getByText(/AI 연습 · 참가비 500원/)).toBeVisible();
  await expect(page.getByLabel('AI 난이도 쉬움')).toBeVisible();
  expect((await board.getByRole('gridcell').count())).toBe(225);

  // 내 차례가 되면(빈 자리가 활성화) 흩어서 한 수씩. 흩어 두면 봇이 먼저 5목을 만들 수도 있다 → 결과 창이 뜨면 거기서 끝
  const over = page.getByRole('dialog', { name: '대국 결과' });
  const spots = [[7, 7], [3, 3], [11, 11], [3, 11], [11, 3], [7, 3]];
  let placed = 0;
  for (const [x, y] of spots) {
    const cell = board.getByRole('gridcell', { name: new RegExp(`^${String.fromCharCode(65 + x)}${y + 1} 빈 자리`) });
    await expect.poll(async () => (await over.count()) > 0 || (await cell.count()) === 0 || (await cell.isEnabled()), { timeout: 15_000 }).toBe(true);
    if ((await over.count()) > 0) break;
    if ((await cell.count()) === 0) continue; // 봇이 이미 둔 자리
    await cell.click();
    placed++;
    if (placed === 1) await expect(board.getByRole('gridcell', { name: /마지막 수/ })).toHaveCount(1);
  }
  expect(placed).toBeGreaterThan(1);
  await expect.poll(async () => await board.getByRole('gridcell', { name: /[흑백]돌/ }).count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(placed * 2 - 1);

  if (await over.count()) {
    await expect(over.getByText(/승리|무승부/)).toBeVisible();
    await over.getByRole('button', { name: '대기실로' }).click();
    await expect(page.getByRole('button', { name: /준비/ }).first()).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /나가기|방 나가기/ }).first().click();
    await expect(page.getByRole('button', { name: /AI 1:1 연습/ })).toBeVisible();
    expect(errors).toEqual([]);
    return;
  }

  // 규칙 창: ? 키, Esc 로 닫기
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: '오목 규칙' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '오목 규칙' })).toHaveCount(0);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 1:1 연습/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('오목판이 화면(가로/세로 모바일 포함)을 넘치지 않는다', async ({ page }) => {
  await signup(page);
  await page.getByRole('button', { name: /오목/ }).first().click();
  await startPractice(page, { game: 'omok', level: '쉬움', bet: '100' });
  const board = page.getByRole('grid', { name: /오목판/ });
  await expect(board).toBeVisible();
  for (const size of [{ width: 390, height: 780 }, { width: 915, height: 412 }, { width: 1180, height: 820 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    const b = await board.boundingBox();
    expect(b.width).toBeGreaterThan(150);
    expect(Math.abs(b.width - b.height)).toBeLessThan(3); // 정사각형 유지
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(size.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(size.height + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/omok-desktop.png` : 'test-results/omok-desktop.png' });
});
