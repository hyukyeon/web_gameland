import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

test('라스베가스 AI 대전: 굴리기 → 카지노 고르기 → 놓기 · 규칙 · 자동 진행으로 4라운드 끝까지', async ({ page }) => {
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /라스베가스/ }).first().click();
  // AI 대전 창: 라스베가스는 AI 4명까지
  await page.getByRole('button', { name: /AI 대전/ }).click();
  await expect(page.getByRole('dialog', { name: 'AI 대전 설정' }).getByRole('radio', { name: '🤖🤖🤖🤖 4명' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await startPractice(page, { game: 'vegas', level: '쉬움', bet: '500' });

  const root = page.getByTestId('vegas-root');
  await expect(root).toBeVisible();
  await expect(page.getByText(/AI 연습 · 참가비 500원/)).toBeVisible();
  await expect(page.getByTestId('casino')).toHaveCount(6);
  await expect(page.getByTestId('vegas-round')).toHaveText('1/4라운드');
  // 카지노마다 지폐가 깔려 있다
  expect(await page.getByTestId('bill').count()).toBeGreaterThanOrEqual(6);

  // 규칙 창: ? 키 / Esc
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: '라스베가스 규칙' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '라스베가스 규칙' })).toHaveCount(0);

  // 내 차례가 올 때까지 기다렸다가 굴린다 (2인이면 흰 주사위 4개까지 12개)
  const rollBtn = page.getByTestId('roll-btn');
  await expect(rollBtn).toBeEnabled({ timeout: 20000 });
  await rollBtn.click();
  await expect(page.getByTestId('roll-die')).toHaveCount(12);
  // 고를 수 있는 카지노가 빛나고, 한 번 누르면 고르기 · 한 번 더 누르면 놓기
  const target = page.locator('[data-testid="casino"]:enabled').first();
  await expect(target).toBeVisible();
  const value = await target.getAttribute('data-value');
  await target.click();
  await expect(page.getByTestId('confirm-place')).toHaveText(`✔ ${value}번 카지노에 놓기`);
  await target.click();
  await expect(page.locator(`[data-testid="casino"][data-value="${value}"]`).getByTestId('casino-row').first()).toBeVisible();
  // 마지막으로 놓은 기록 (봇이 바로 이어서 두면 봇 기록으로 바뀐다)
  await expect(page.getByTestId('last-place')).toHaveText(/→ \d번 카지노에 \d+개/);

  // 나머지는 AI 자동 진행으로 끝까지 → 라운드 정산 창 → 결과
  await page.getByRole('button', { name: /자동/ }).first().click();
  await expect(page.getByTestId('round-modal')).toBeVisible({ timeout: 60000 });
  const result = page.getByRole('dialog', { name: '라스베가스 결과' });
  await expect(result).toBeVisible({ timeout: 150000 });
  await expect(result.getByTestId('vegas-standings').locator('> div')).toHaveCount(2);
  await expect(result.getByText('AI 연습 판이라 머니에는 반영되지 않아요.')).toBeVisible();
  await result.getByRole('button', { name: '대기실로' }).click();
  await expect(page.getByRole('button', { name: '준비' })).toBeVisible();
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 대전/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('라스베가스 판이 화면을 넘치지 않는다 (AI 4명, 5인)', async ({ page }) => {
  await signup(page);
  await page.getByRole('button', { name: /라스베가스/ }).first().click();
  await startPractice(page, { game: 'vegas', level: '보통', bet: '100', bots: 4 });
  await expect(page.getByTestId('casino')).toHaveCount(6);
  await expect(page.getByTestId('vegas-player')).toHaveCount(5);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 대전/ })).toBeVisible();
});
