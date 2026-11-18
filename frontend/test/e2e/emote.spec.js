import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

/** 말풍선 버튼 → 상황 탭 → 대사 → 내 아바타 위에 말풍선 */
async function sendEmote(page, cat, expectLine) {
  await page.getByTestId('emote-btn').click();
  const picker = page.getByRole('dialog', { name: '말풍선 고르기' });
  await expect(picker.getByTestId('emote-cat')).toHaveCount(7);
  await picker.getByRole('tab', { name: cat }).click();
  const line = picker.getByTestId('emote-line').filter({ hasText: expectLine });
  await line.click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByText(expectLine).first()).toBeVisible();
}

test('말풍선: 게임마다 상황별(칭찬·감탄·억울·자책·도발·재촉·인사) 대사가 다르다', async ({ page }) => {
  const { errors } = await signup(page);
  // 요트 다이스: 재촉
  await page.getByRole('button', { name: /요트 다이스/ }).first().click();
  await startPractice(page, { game: 'yacht', level: '쉬움', bet: '100' });
  await expect(page.getByTestId('yacht-root')).toBeVisible();
  await sendEmote(page, '⏰ 재촉', '주사위 쥐고 기도 중?');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 대전/ })).toBeVisible();
  // 장기: 도발
  await page.getByRole('button', { name: /장기/ }).first().click();
  await startPractice(page, { game: 'janggi', level: '쉬움', bet: '100' });
  await page.getByTestId('formation').first().click();
  await expect(page.getByTestId('janggi-board')).toBeVisible();
  await sendEmote(page, '😏 도발', '궁이 답답해 보이네요 😏');
  expect(errors).toEqual([]);
});
