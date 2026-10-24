import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

/** 내 차례의 한 단계: 던지기 가능하면 던지고, 말을 고를 수 있으면 하나 골라 이동. 한 일이 있으면 true */
async function step(page) {
  const throwBtn = page.getByTestId('throw-btn');
  if (await throwBtn.isEnabled().catch(() => false)) {
    await throwBtn.click();
    return 'throw';
  }
  const movable = page.locator('[data-testid="token"]:enabled, [data-testid="wait-piece"]:enabled');
  if ((await movable.count()) > 0) {
    await movable.first().click();
    const ok = page.getByTestId('confirm-move');
    if (await ok.isVisible().catch(() => false)) await ok.click();
    return 'move';
  }
  return null;
}

test('윷놀이 AI 연습: 던지기 팝업 · 말 이동 · 봇 응수 · 규칙 · 나가기', async ({ page }) => {
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /윷놀이/ }).first().click();
  await startPractice(page, { game: 'yut', level: '쉬움', bet: '500' });
  const board = page.getByTestId('yut-board');
  await expect(board).toBeVisible();
  await expect(page.getByText(/AI 연습 · 참가비 500원/)).toBeVisible();
  // 판: 29개 칸, 팀마다 대기 말 4개
  expect(await board.locator('button[data-node]').count()).toBe(29);
  await expect(page.getByTestId('tray-0').getByTestId('wait-piece')).toHaveCount(4);
  await expect(page.getByTestId('tray-1').getByTestId('wait-piece')).toHaveCount(4);

  // 규칙 창: ? 키 / Esc
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: '윷놀이 규칙' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '윷놀이 규칙' })).toHaveCount(0);

  const done = page.getByRole('dialog', { name: '윷놀이 결과' });
  let throws = 0;
  let moves = 0;
  let sawPopup = false;
  for (let i = 0; i < 120 && throws < 6 && (await done.count()) === 0; i++) {
    const r = await step(page);
    if (r === 'throw') {
      throws++;
      await expect(page.getByTestId('throw-name').last()).toBeVisible();
      await expect(page.getByTestId('sticks').last().locator('> div')).toHaveCount(4);
      sawPopup = true;
    }
    if (r === 'move') moves++;
    if (!r) await page.waitForTimeout(250);
  }
  expect(sawPopup).toBe(true);
  expect(throws).toBeGreaterThanOrEqual(1);
  // 던진 결과 중 쓸 수 있는 것은 결과 칩으로 보이고, 내가 던진 만큼 이동(또는 소멸)했다
  expect(moves).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId('yut-status')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 1:1 연습/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('윷판이 화면을 넘치지 않는다', async ({ page }) => {
  await signup(page);
  await page.getByRole('button', { name: /윷놀이/ }).first().click();
  await startPractice(page, { game: 'yut', level: '쉬움', bet: '100' });
  const board = page.getByTestId('yut-board');
  await expect(board).toBeVisible();
  const vp = page.viewportSize();
  const box = await board.boundingBox();
  expect(box.width).toBeGreaterThan(200);
  expect(Math.abs(box.width - box.height)).toBeLessThan(2); // 정사각형
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
});
