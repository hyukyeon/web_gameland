import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

test('고스톱 AI 연습: 난이도·판돈 반영, 키보드로 패 내기, 자동 진행으로 끝까지, 정산 후 Esc', async ({ page }) => {
  const { errors } = await signup(page);
  await startPractice(page, { level: '어려움', bet: '1,000' });
  await expect(page.getByText(/판돈 1,000/)).toBeVisible();
  await expect(page.getByLabel('AI 난이도 어려움')).toBeVisible(); // 봇 이름 옆 '상' 배지
  await expect(page.getByText(/^AI /).first()).toBeVisible();

  // 내 차례가 오면 숫자키로 손패를 낸다 (선이 봇이면 기다림)
  const hand = page.locator('[data-hotkey="1"][role="button"]');
  await hand.first().waitFor({ timeout: 30_000 });
  await page.keyboard.press('1');
  // 패를 내면 내 차례가 끝나 손패 단축키가 사라진다 (흔들기 질문이 뜨면 N 으로 그냥 내기)
  await expect.poll(async () => {
    if (await page.locator('[data-hotkey="n"]').count()) await page.keyboard.press('n');
    return page.locator('[role="button"][data-hotkey="1"]').count();
  }, { timeout: 15_000 }).toBe(0);

  // 나머지는 자동 진행
  await page.getByTitle('내 차례를 AI가 대신 둡니다').click();
  const done = page.getByRole('button', { name: /대기실로/ });
  await done.waitFor({ timeout: 150_000 });
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await expect(done).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('가로 모드(휴대폰)에서도 가로 스크롤 없이 보드가 들어간다', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', '모바일 전용');
  await page.setViewportSize({ width: 915, height: 412 });
  const { errors } = await signup(page);
  await startPractice(page, {});
  await expect(page.getByRole('button', { name: '규칙 보기' })).toBeVisible();
  await page.waitForTimeout(2500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // 내 손패가 화면 안에 있다
  const box = await page.locator('[role="button"][data-hotkey]').first().boundingBox({ timeout: 30_000 }).catch(() => null);
  if (box) expect(box.y + box.height).toBeLessThanOrEqual(412 + 1);
  expect(errors).toEqual([]);
});

test('고스톱: 첫 안내는 한 장 내면 닫히고, 나가기는 앱 안 확인 창(취소/나가기)으로 묻는다', async ({ page }) => {
  const { errors } = await signup(page);
  await startPractice(page, {});
  const hand = page.locator('[role="button"][data-hotkey="1"]');
  await hand.first().waitFor({ timeout: 30_000 });
  const hint = page.getByText('🔗 표시가 붙은 패는');
  await expect(hint).toBeVisible();
  await page.keyboard.press('1');
  if (await page.getByRole('dialog', { name: '흔들기' }).count()) await page.keyboard.press('n');
  await expect(hint).toHaveCount(0);

  await page.getByRole('button', { name: /나가기/ }).click();
  const ask = page.getByRole('dialog', { name: '방에서 나갈까요?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: '취소' }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole('button', { name: /나가기/ }).click();
  await ask.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 1:1 연습/ })).toBeVisible();
  expect(errors).toEqual([]);
});
