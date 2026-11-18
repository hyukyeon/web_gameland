import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

test('장기 AI 대전: 상차림 → 말 고르기 → 두기 → AI 응수 → 규칙 → 기권 → 결과', async ({ page }) => {
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /장기/ }).first().click();
  await startPractice(page, { game: 'janggi', level: '쉬움', bet: '500' });

  // 상차림 고르기 (네 가지, 각 줄에 말 그림 미리보기)
  const setup = page.getByRole('dialog', { name: '상차림 고르기' });
  await expect(setup).toBeVisible();
  await expect(setup.getByTestId('formation')).toHaveCount(4);
  await setup.getByRole('button', { name: /마상상마/ }).click();
  await expect(setup).toHaveCount(0, { timeout: 15000 });

  const board = page.getByTestId('janggi-board');
  await expect(board).toBeVisible();
  await expect(page.getByTestId('janggi-piece')).toHaveCount(32);
  await expect(page.getByText(/AI 연습 · 참가비 500원/)).toBeVisible();
  // 방장(나)이 초 — 아래쪽 맨 끝 줄에 내가 고른 마상상마
  const row = await page.$$eval('[data-testid="janggi-piece"][data-side="cho"]', (els) => els.map((e) => [Number(e.dataset.sq), e.dataset.t]).filter(([s]) => s >= 81).sort((a, b) => a[0] - b[0]).map(([, t]) => t).join(''));
  expect(row).toBe('RNEAAENR'); // 차 마 상 사 · 사 상 마 차 (궁은 한 줄 위)

  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: '장기 규칙' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.getByTestId('janggi-status')).toHaveText(/내 차례/, { timeout: 15000 });
  // 갈 곳이 없는 말도 고를 수 있고, 왜 못 움직이는지 알려 준다 (첫 수의 포는 넘을 다리가 없다)
  const cannon = page.locator('[data-testid="janggi-piece"][data-sq="64"]');
  await expect(cannon).toHaveAttribute('data-movable', 'false');
  await cannon.click();
  await expect(cannon).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('janggi-msg')).toHaveText(/다리.*갈 곳이 없어요/);
  await expect(page.getByTestId('janggi-target')).toHaveCount(0);
  // 내 차례: 졸 하나를 골라 앞으로
  const pawn = page.locator('[data-testid="janggi-piece"][data-side="cho"][data-t="P"][data-sq="54"]');
  await pawn.click();
  await expect(pawn).toHaveAttribute('aria-pressed', 'true');
  const target = page.locator('[data-testid="janggi-target"][data-sq="45"]');
  await target.click();
  await expect(page.locator('[data-testid="janggi-piece"][data-sq="45"]')).toBeVisible();
  await expect(page.getByTestId('janggi-plies')).toHaveText(/^[12]\//);
  // AI 가 응수하면 다시 내 차례
  await expect(page.getByTestId('janggi-plies')).toHaveText(/^2\//, { timeout: 15000 });
  await expect(page.getByTestId('janggi-status')).toHaveText(/내 차례/);
  // 한수 쉼
  await page.getByTestId('janggi-pass').click();
  await expect(page.getByTestId('janggi-last')).toHaveText(/한수 쉼/);

  // 기권 → 결과
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('janggi-resign').click();
  const result = page.getByRole('dialog', { name: '장기 결과' });
  await expect(result).toBeVisible({ timeout: 15000 });
  await expect(result.getByTestId('janggi-end-kind')).toHaveText(/기권/);
  await expect(result.getByText('AI 연습 판이라 머니에는 반영되지 않아요.')).toBeVisible();
  await result.getByRole('button', { name: '대기실로' }).click();
  await expect(page.getByRole('button', { name: '준비' })).toBeVisible();
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 대전/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('장기판이 화면을 넘치지 않고 비율이 맞다', async ({ page }) => {
  await signup(page);
  await page.getByRole('button', { name: /장기/ }).first().click();
  await startPractice(page, { game: 'janggi', level: '보통', bet: '100' });
  await page.getByRole('dialog', { name: '상차림 고르기' }).getByTestId('formation').first().click();
  const board = page.getByTestId('janggi-board');
  await expect(page.getByTestId('janggi-piece')).toHaveCount(32);
  const box = await board.boundingBox();
  expect(Math.abs(box.width / box.height - 92 / 102)).toBeLessThan(0.02);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 대전/ })).toBeVisible();
});
