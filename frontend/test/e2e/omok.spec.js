import { test, expect } from '@playwright/test';
import { signup, startPractice } from './helpers.js';

/** 셀을 누른다. 착수 확인 방식(모바일)이면 이어서 '에 두기' 도 누른다 */
async function tap(page, cell) {
  await cell.click();
  const ok = page.getByTestId('confirm-place');
  if (await ok.isVisible().catch(() => false)) await ok.click();
}

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
    await tap(page, cell);
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

  // 규칙 창을 보는 사이 봇이 이겨 결과 창이 뜰 수도 있다 → 그럼 결과 창부터 닫는다
  if (await over.isVisible().catch(() => false)) await over.getByRole('button', { name: '대기실로' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /나가기/ }).first().click();
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

test('오목 연습: 힌트(3번) · 자동 난이도 · 끝난 판 AI 복기 분석', async ({ page }) => {
  test.setTimeout(120_000);
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /오목/ }).first().click();
  await startPractice(page, { game: 'omok', level: '🎯 자동', bet: '100' });
  const board = page.getByRole('grid', { name: /오목판/ });
  await expect(board).toBeVisible();
  await expect(page.getByLabel(/AI 난이도/)).toBeVisible();

  // 힌트: 내 차례에 누르면 남은 횟수가 줄고 추천 칸이 표시된다
  const hint = page.getByRole('button', { name: /힌트/ });
  await expect(hint).toBeEnabled({ timeout: 15_000 });
  await expect(hint).toHaveText(/\(3\)/);
  await hint.click();
  await expect(hint).toHaveText(/\(2\)|\(3\)/); // 흑 선공이면 내 차례에 바로, 아니면 봇이 둔 뒤 활성화
  await expect.poll(async () => (await hint.textContent()) ?? '', { timeout: 5000 }).toMatch(/\(2\)/);

  // 흩뿌려 두며 판이 끝날 때까지 (봇이 5목을 만든다)
  const over = page.getByRole('dialog', { name: '대국 결과' });
  const cells = board.getByRole('gridcell', { name: /빈 자리/ });
  for (let i = 0; i < 60 && !(await over.count()); i++) {
    const enabled = board.locator('[role="gridcell"]:not([disabled])');
    if (await enabled.count()) {
      const n = await enabled.count();
      await tap(page, enabled.nth((i * 37) % n)).catch(() => {});
    }
    await page.waitForTimeout(250);
  }
  void cells;
  await expect(over).toBeVisible({ timeout: 30_000 });
  await expect(over.getByText(/자동 난이도/)).toBeVisible();

  await over.getByRole('button', { name: /복기 분석/ }).click();
  await expect(over.getByLabel('복기 분석 결과')).toBeVisible({ timeout: 20_000 });
  await expect(over.getByText(/정확도/).first()).toBeVisible();
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/omok-analysis.png` });
  await over.getByRole('button', { name: '대기실로' }).click();
  expect(errors).toEqual([]);
});

test('오목 보조 기능: 좌표 · 수 번호 · 금지수 ✕ · 무르기 · 확대 · 설정 테마', async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /오목/ }).first().click();
  await startPractice(page, { game: 'omok', level: '쉬움', bet: '100' });
  const board = page.getByRole('grid', { name: /오목판/ });
  await expect(board).toBeVisible();

  // 좌표(A~O, 1~15)가 판 가장자리에 보이고 설정으로 끌 수 있다
  const grid = page.locator('[role="grid"]');
  await expect(grid.getByText('O', { exact: true })).toBeVisible();
  await expect(grid.getByText('15', { exact: true })).toBeVisible();

  // 내 차례에 한 수 → 최근 수 번호가 돌 위에 표시된다
  const first = board.locator('[role="gridcell"]:not([disabled])').first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  const spot = board.getByRole('gridcell', { name: /^H8 빈 자리/ });
  const target = (await spot.count()) && (await spot.isEnabled()) ? spot : first;
  await tap(page, target);
  await expect(board.getByRole('gridcell', { name: /1수|2수/ }).first()).toBeVisible({ timeout: 10_000 });

  // 무르기(연습: 바로): 내 차례가 되면 누르고 돌 수가 줄어든다
  const undo = page.getByRole('button', { name: /무르기/ });
  await expect.poll(async () => (await board.locator('[role="gridcell"]:not([disabled])').count()) > 0 && (await undo.isEnabled()), { timeout: 15_000 }).toBe(true);
  const stones = () => board.getByRole('gridcell', { name: /[흑백]돌/ }).count();
  const before = await stones();
  await undo.click();
  await expect.poll(stones, { timeout: 8000 }).toBeLessThan(before);

  // 확대/축소: 버튼으로 확대하면 스크롤 영역이 생기고, 축소하면 원래대로
  const scroll = page.getByTestId('board-scroll');
  const w0 = (await board.boundingBox()).width;
  await page.getByRole('button', { name: '확대' }).click();
  await expect.poll(async () => (await board.boundingBox()).width).toBeGreaterThan(w0 * 1.3);
  await page.getByRole('button', { name: '축소' }).click();
  await expect.poll(async () => (await board.boundingBox()).width).toBeLessThan(w0 * 1.05);
  void scroll;

  // 설정: 다크 테마 + 좌표 끄기
  await page.getByRole('button', { name: '설정' }).click();
  const dlg = page.getByRole('dialog', { name: '설정' });
  await dlg.getByRole('radio', { name: '다크' }).click();
  await dlg.getByLabel(/좌표/).uncheck();
  await dlg.getByRole('button', { name: '닫기' }).click();
  await expect(grid.getByText('15', { exact: true })).toHaveCount(0);
  const bg = await board.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('100, 116, 139'); // #64748b (밝은 슬레이트: 검은 돌이 묻히지 않게)
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/omok-dark-${isMobile ? 'm' : 'd'}.png` });

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
  await expect(page.getByRole('button', { name: /AI 1:1 연습/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('오목: 기권 → 결과 창에 총 수·소요 시간 → 한 판 더로 새 판 시작', async ({ page }) => {
  test.setTimeout(90_000);
  const { errors } = await signup(page);
  await page.getByRole('button', { name: /오목/ }).first().click();
  await startPractice(page, { game: 'omok', level: '쉬움', bet: '100' });
  const board = page.getByRole('grid', { name: /오목판/ });
  await expect(board).toBeVisible();
  await expect(page.getByRole('button', { name: /기권/ })).toBeEnabled();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /기권/ }).click();
  const over = page.getByRole('dialog', { name: '대국 결과' });
  await expect(over).toBeVisible();
  await expect(over.getByTestId('result-stats')).toContainText(/총 \d+수 · 소요/);
  await over.getByRole('button', { name: /한 판 더/ }).click();
  // 새 판: 결과 창이 닫히고 돌이 비워진 판이 다시 열린다
  await expect(over).toHaveCount(0);
  await expect(board).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => await board.getByRole('gridcell', { name: /[흑백]돌/ }).count(), { timeout: 15_000 }).toBeLessThanOrEqual(1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '나가기' }).click();
  expect(errors).toEqual([]);
});

/** 좌표(x,y)의 교차점 */
const cellAt = (page, x, y) => page.getByRole('grid', { name: /오목판/ }).getByRole('gridcell', { name: new RegExp(`^${String.fromCharCode(65 + x)}${y + 1} (빈|흑|백)`) });

test('오목 실전 2인: 금지수 ✕ 표시·거절 메시지 → 5목 승리 선 긋기·결과', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctxOpt = { viewport: { width: 1180, height: 820 }, baseURL: test.info().project.use.baseURL, locale: 'ko-KR' };
  const ctxA = await browser.newContext(ctxOpt);
  const ctxB = await browser.newContext(ctxOpt);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    const { errors: errA, name: nameA } = await signup(a);
    const { errors: errB } = await signup(b);
    await a.getByRole('button', { name: /오목/ }).first().click();
    await a.getByRole('button', { name: '+ 방 만들기' }).click();
    await a.getByRole('button', { name: '만들기', exact: true }).click();
    await b.getByRole('button', { name: /오목/ }).first().click();
    // 이전 테스트가 남긴 방이 있을 수 있으니 방장 이름으로 내 방을 찾는다
    await b.getByText(`${nameA}의 방`).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]').getByRole('button', { name: '입장' }).click();
    await a.getByRole('button', { name: /^준비$/ }).click();
    await b.getByRole('button', { name: /^준비$/ }).click();
    await expect(a.getByRole('grid', { name: /오목판/ })).toBeVisible();
    await expect(b.getByRole('grid', { name: /오목판/ })).toBeVisible();

    // 누가 흑(선공)인지: 첫 칸이 활성화된 쪽
    const aBlack = await expect.poll(async () => (await cellAt(a, 0, 0).isEnabled()) || (await cellAt(b, 0, 0).isEnabled()), { timeout: 10_000 }).toBe(true).then(() => cellAt(a, 0, 0).isEnabled());
    const [black, white] = aBlack ? [a, b] : [b, a];
    const play = async (pg, x, y) => {
      await expect(cellAt(pg, x, y)).toBeEnabled({ timeout: 15_000 });
      await tap(pg, cellAt(pg, x, y)); // 터치 환경이면 착수 확인까지
    };
    const bm = [[6, 7], [8, 7], [7, 6], [7, 8]];
    const wm = [[0, 0], [14, 0], [0, 14], [14, 14]];
    for (let i = 0; i < 4; i++) {
      await play(black, ...bm[i]);
      await play(white, ...wm[i]);
    }
    // 흑 차례: (7,7) 은 가로·세로 열린 3 두 개 → 쌍삼 금지. ✕ 가 표시되고 눌러도 거절된다
    const h8 = cellAt(black, 7, 7);
    await expect(h8).toBeEnabled({ timeout: 15_000 });
    await expect(h8).toHaveAttribute('aria-label', /금지 자리/);
    await expect(h8.getByText('✕')).toBeVisible();
    await expect(cellAt(white, 7, 7)).not.toHaveAttribute('aria-label', /금지 자리/); // 백 화면엔 표시 없음
    await h8.click();
    await expect(black.getByRole('alert').filter({ hasText: /금지/ })).toBeVisible();
    await expect(cellAt(black, 7, 7)).toHaveAttribute('aria-label', /빈 자리/); // 돌이 놓이지 않았다

    // 이어서 가로 줄을 만들어 (7,7) 로 5목 완성 (5목이 되면 금지수여도 허용)
    await play(black, 9, 7);
    await play(white, 0, 3);
    await play(black, 10, 7);
    await play(white, 14, 3);
    await expect(h8).not.toHaveAttribute('aria-label', /금지 자리/); // 이제 5목이 되는 자리라 금지가 아님
    await play(black, 7, 7);

    for (const pg of [black, white]) {
      const over = pg.getByRole('dialog', { name: '대국 결과' });
      await expect(over).toBeVisible({ timeout: 10_000 });
      await expect(over.getByTestId('result-stats')).toContainText('총 13수');
    }
    await expect(black.getByRole('dialog', { name: '대국 결과' }).getByText('승리!')).toBeVisible();
    await expect(black.getByTestId('confetti')).toBeVisible();
    await expect(white.getByTestId('confetti')).toHaveCount(0);
    await expect(black.getByTestId('win-line')).toHaveCount(1); // 5목 선 긋기
    await expect(black.getByTestId('win-line').locator('line')).toHaveAttribute('x1', '6.5');
    await expect(black.getByTestId('win-line').locator('line')).toHaveAttribute('x2', '10.5');
    if (process.env.SHOT_DIR) await black.screenshot({ path: `${process.env.SHOT_DIR}/omok-pvp-win.png` });

    // 업적 달성 안내(첫 승·속전속결)가 떠 있으면 닫고, 한 판 더: 양쪽이 누르면 새 판 (진 사람이 흑)
    await expect(black.getByText('업적 달성!')).toBeVisible();
    await black.getByRole('button', { name: '확인' }).click();
    await black.getByRole('button', { name: /한 판 더/ }).click({ timeout: 8000 });
    await white.getByRole('button', { name: /한 판 더/ }).click({ timeout: 8000 });
    await expect(cellAt(white, 0, 0)).toBeEnabled({ timeout: 15_000 });
    expect(errA).toEqual([]);
    expect(errB).toEqual([]);
  } catch (e) {
    if (process.env.SHOT_DIR) { await a.screenshot({ path: `${process.env.SHOT_DIR}/pvp-fail-a.png` }).catch(() => {}); await b.screenshot({ path: `${process.env.SHOT_DIR}/pvp-fail-b.png` }).catch(() => {}); }
    throw e;
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
