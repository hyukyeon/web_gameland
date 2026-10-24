import { test, expect } from '@playwright/test';
import { signup } from './helpers.js';

/** 화면의 판(aria-label "r행 c열 d")을 읽어 백트래킹으로 푼다 */
function solve(puzzle) {
  const b = [...puzzle];
  const ok = (i, d) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    for (let k = 0; k < 9; k++) {
      if (b[r * 9 + k] === d || b[k * 9 + c] === d) return false;
      if (b[(Math.floor(r / 3) * 3 + Math.floor(k / 3)) * 9 + Math.floor(c / 3) * 3 + (k % 3)] === d) return false;
    }
    return true;
  };
  const go = (i) => {
    if (i === 81) return true;
    if (b[i]) return go(i + 1);
    for (let d = 1; d <= 9; d++) {
      if (!ok(i, d)) continue;
      b[i] = d;
      if (go(i + 1)) return true;
    }
    b[i] = 0;
    return false;
  };
  go(0);
  return b;
}

test('스도쿠: 난이도·보상 현황 표시, 칸 선택 후 넘패드 입력/지우기, 다 풀면 +1,000원·남은 보상 9회', async ({ page }) => {
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /스도쿠/ }).first().click();
  const grid = page.getByRole('grid', { name: '스도쿠 판' });
  await expect(grid.getByRole('gridcell')).toHaveCount(81);
  await expect(page.getByText(/오늘 남은 클리어 보상: 10/)).toBeVisible();
  await expect(page.getByText('클리어 당 1,000원', { exact: false })).toBeVisible();

  // 난이도 '하' 로 새 문제 → 빈칸 30개
  await page.getByLabel('난이도').selectOption('easy');
  await page.getByRole('button', { name: '새 문제' }).click();
  await expect(grid.getByRole('gridcell', { name: /빈칸/ })).toHaveCount(30);

  // 고정 칸은 넘패드가 꺼진다, 빈칸은 입력·지우기
  const labels = await grid.getByRole('gridcell').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const puzzle = labels.map((l) => (l.includes('빈칸') ? 0 : Number(l.split(' ')[2])));
  const fixedIdx = puzzle.findIndex((d) => d > 0);
  await grid.getByRole('gridcell').nth(fixedIdx).click();
  await expect(page.getByRole('button', { name: '1 입력' })).toBeDisabled();
  const hole = puzzle.findIndex((d) => d === 0);
  await grid.getByRole('gridcell').nth(hole).click();
  const wrongDigit = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== solve(puzzle)[hole]);
  await page.getByRole('button', { name: `${wrongDigit} 입력` }).click();
  await expect(grid.getByRole('gridcell').nth(hole)).toHaveText(String(wrongDigit));
  await page.getByRole('button', { name: '지우기' }).click();
  await expect(grid.getByRole('gridcell').nth(hole)).toHaveText('');

  // 정답 채우기 (키보드 단축키로) → 자동 제출 → 보상
  const moneyBefore = Number((await page.getByText(/[\d,]+원/).first().innerText()).replace(/[^\d]/g, ''));
  const sol = solve(puzzle);
  for (let i = 0; i < 81; i++) {
    if (puzzle[i]) continue;
    await grid.getByRole('gridcell').nth(i).click();
    await page.keyboard.press(String(sol[i]));
  }
  const done = page.getByRole('dialog', { name: '스도쿠 클리어' });
  await expect(done).toBeVisible();
  await expect(done.getByText('+1,000원')).toBeVisible();
  await expect(page.getByText(/오늘 남은 클리어 보상: 9/)).toBeVisible();
  await expect.poll(async () => Number((await page.getByText(/[\d,]+원/).first().innerText()).replace(/[^\d]/g, ''))).toBe(moneyBefore + 1000);

  await done.getByRole('button', { name: '다음 문제' }).click();
  await expect(done).toHaveCount(0);
  await expect(grid.getByRole('gridcell', { name: /빈칸/ })).toHaveCount(30);
  expect(errors).toEqual([]);
});
