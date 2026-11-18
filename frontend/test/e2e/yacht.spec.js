import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

test('요트 다이스 AI 대전: 굴리기 → 고정 → 다시 굴리기 → 기록 · 규칙 · 자동 진행으로 끝까지', async ({ page }) => {
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /요트 다이스/ }).first().click();
  await startPractice(page, { game: 'yacht', level: '쉬움', bet: '500' });

  await expect(page.getByTestId('yacht-root')).toBeVisible();
  await expect(page.getByText(/AI 연습 · 참가비 500원/)).toBeVisible();
  await expect(page.getByTestId('yacht-die')).toHaveCount(5);
  await expect(page.getByTestId('yacht-round')).toHaveText('1/12라운드');
  // 점수표: 족보 12칸 카드 + 보너스(몇 점 남았는지) + 총점
  await expect(page.getByTestId('yacht-cat')).toHaveCount(12);
  await expect(page.getByTestId('yacht-bonus').first()).toHaveText(/63점 남음/);
  await expect(page.getByTestId('yacht-total-card')).toBeVisible();

  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: '요트 다이스 규칙' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '요트 다이스 규칙' })).toHaveCount(0);

  // 내 차례: 굴리기
  const roll = page.getByTestId('yacht-roll');
  await expect(roll).toBeEnabled({ timeout: 20000 });
  await roll.click();
  await expect(roll).toHaveText(/다시 굴리기 \(2\)/);
  await expect(page.getByTestId('yacht-pick')).toHaveCount(12); // 내 빈 칸 12개가 모두 큰 기록 버튼
  // 첫 주사위 고정 → 다시 굴려도 그 주사위는 그대로
  const die0 = page.getByTestId('yacht-die').first();
  await expect(die0).toBeEnabled();
  const kept = await die0.getAttribute('data-value');
  await die0.click();
  await expect(die0).toHaveAttribute('data-held', 'true');
  await roll.click();
  await expect(roll).toHaveText(/다시 굴리기 \(1\)/);
  await expect(die0).toHaveAttribute('data-value', kept);
  await expect(die0).toHaveAttribute('data-held', 'true');
  // 기록: 초이스(항상 0 보다 큼)
  const choice = page.locator('[data-testid="yacht-pick"][data-cat="choice"]');
  const pts = Number((await choice.getAttribute('aria-label')).match(/(\d+)점/)[1]); // '초이스에 23점 기록'
  await choice.click();
  await expect(page.locator('[data-testid="yacht-cell"][data-cat="choice"]').first()).toHaveText(String(pts));
  await expect(page.getByTestId('yacht-pick')).toHaveCount(0);

  // 나머지는 자동 진행으로 끝까지
  await page.getByRole('button', { name: /자동/ }).first().click();
  const result = page.getByRole('dialog', { name: '요트 다이스 결과' });
  await expect(result).toBeVisible({ timeout: 150000 });
  await expect(result.getByTestId('yacht-standings').locator('> div')).toHaveCount(2);
  await expect(result.getByText('AI 연습 판이라 머니에는 반영되지 않아요.')).toBeVisible();
  await result.getByRole('button', { name: '대기실로' }).click();
  await expect(page.getByRole('button', { name: '준비' })).toBeVisible();
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 대전/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('요트 다이스 판이 화면을 넘치지 않는다 (AI 3명, 4인)', async ({ page }) => {
  await signup(page);
  await page.getByRole('button', { name: /요트 다이스/ }).first().click();
  await startPractice(page, { game: 'yacht', level: '보통', bet: '100', bots: 3 });
  await expect(page.getByTestId('yacht-player')).toHaveCount(4);
  await expect(page.getByTestId('yacht-bonus')).toHaveCount(4); // 보너스 칸에 사람마다 한 줄
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 대전/ })).toBeVisible();
});
