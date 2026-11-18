import { expect } from '@playwright/test';

let seq = 0;
/** 새 계정으로 가입해 로비까지. 콘솔 오류는 errors 배열에 모은다. */
export async function signup(page, { tour = 'skip' } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon|ERR_|404/.test(m.text()) && errors.push(m.text()));
  const name = `e${Date.now() % 1e7}${seq++}`.slice(0, 12);
  await page.goto('/');
  await page.getByRole('button', { name: '회원가입' }).first().click();
  await page.getByPlaceholder('아이디 (2~12자)').fill(name);
  await page.getByPlaceholder('비밀번호 (4자 이상)').fill('pass1234');
  await page.getByRole('button', { name: /가입하고 시작/ }).click();
  // 첫 화면에도 '강원게임랜드' 글자가 있으므로 로비에만 있는 로그아웃 버튼으로 가입 완료를 확인한다
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  // 첫 접속 출석 보상 모달
  await page.getByRole('button', { name: '확인' }).click({ timeout: 4000 }).catch(() => {});
  if (tour === 'skip') await page.getByRole('button', { name: '건너뛰기' }).click({ timeout: 4000 }).catch(() => {});
  return { name, errors };
}

/** AI 대전 시작 (난이도·AI 상대 수·판돈 선택) */
export async function startPractice(page, { game = 'gostop', level = '보통', bet = '100', bots = 1 } = {}) {
  if (game === 'seotda') await page.getByRole('button', { name: /섯다/ }).first().click();
  await page.getByRole('button', { name: /AI 대전/ }).click();
  const dialog = page.getByRole('dialog', { name: 'AI 대전 설정' });
  await dialog.getByRole('button', { name: new RegExp(`^(✔ )?${level}`) }).click();
  await dialog.getByRole('button', { name: bet, exact: true }).click();
  if (game !== 'omok') await dialog.getByRole('radio', { name: `${'🤖'.repeat(bots)} ${bots}명` }).click();
  await dialog.getByRole('button', { name: '시작하기' }).click();
}
