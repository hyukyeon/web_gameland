import { test, expect } from '@playwright/test';
import { signup } from './helpers.js';

test('첫 사용자 튜토리얼: 끝까지 넘기면 다시 뜨지 않고, 설정에서 다시 볼 수 있다', async ({ page }) => {
  const { errors } = await signup(page, { tour: 'keep' });
  const tour = page.getByRole('dialog', { name: '튜토리얼' });
  await expect(tour.getByText('강원랜드에 오신 걸 환영해요')).toBeVisible();
  for (let i = 0; i < 6; i++) await tour.getByRole('button', { name: '다음' }).click();
  await tour.getByRole('button', { name: '시작하기' }).click();
  await expect(tour).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('강원랜드').first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog', { name: '튜토리얼' })).toHaveCount(0);
  // 설정 → 다시 보기
  await page.getByRole('button', { name: '설정' }).click();
  await page.getByRole('button', { name: /튜토리얼 다시 보기/ }).click();
  await expect(page.getByRole('dialog', { name: '튜토리얼' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('설정: 카드 크기·연출 속도·단축키 표시가 저장된다', async ({ page }) => {
  const { errors } = await signup(page);
  await page.getByRole('button', { name: '설정' }).click();
  const dlg = page.getByRole('dialog', { name: '설정' });
  await dlg.getByRole('radio', { name: '크게' }).click();
  await dlg.getByRole('radio', { name: '빠르게' }).click();
  await dlg.getByText('버튼과 손패에 단축키 표시').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--cs-user'))).toBe('1.15');
  await expect(page.locator('html.show-keys')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gostop.settings')));
  expect(saved).toMatchObject({ cardSize: 'lg', speed: 'fast', keyHints: true });
  expect(errors).toEqual([]);
});

test('PWA: 매니페스트·아이콘·서비스 워커', async ({ page, request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m.short_name).toBe('강원랜드');
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  await signup(page);
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), { timeout: 10_000 }).toBe(true);
});
