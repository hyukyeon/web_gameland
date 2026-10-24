import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

test('섯다 AI 연습: V 로 패 보기, 단축키로 베팅, 결과 확인', async ({ page }) => {
  const { errors } = await signup(page);
  await startPractice(page, { game: 'seotda', level: '쉬움', bet: '500' });
  await expect(page.getByText(/AI 연습 · 참가비 500원/)).toBeVisible();
  await expect(page.getByLabel('AI 난이도 쉬움')).toBeVisible();

  const reveal = page.getByRole('button', { name: /바로 보기/ });
  await reveal.waitFor({ timeout: 15_000 });
  await page.keyboard.press('v');
  await expect(reveal).toHaveCount(0);

  // 판이 끝날 때까지: 내 차례면 C(콜/체크)
  const done = page.getByRole('button', { name: /대기실로/ });
  for (let i = 0; i < 120 && !(await done.count()); i++) {
    const call = page.locator('[data-hotkey="c"]:not([disabled])');
    if (await call.count()) await page.keyboard.press('c');
    await page.waitForTimeout(500);
    // 동점 투표가 뜨면 나눠 갖기
    if (await page.locator('[data-hotkey="n"]').count()) await page.keyboard.press('n');
  }
  await expect(done).toBeVisible();
  expect(errors).toEqual([]);
});
