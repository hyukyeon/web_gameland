import fs from 'node:fs';
import os from 'node:os';
import { defineConfig, devices } from '@playwright/test';

// 이미 받아 둔 크로미움이 있으면 그것을 쓴다 (PW_CHROMIUM 으로 지정 가능). 없으면 `npx playwright install chromium`.
const cached = `${os.homedir()}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;
const executablePath = process.env.PW_CHROMIUM || (fs.existsSync(cached) ? cached : undefined);
const PORT = process.env.E2E_PORT || '4199';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath, args: ['--no-sandbox'] },
    trace: 'retain-on-failure',
    locale: 'ko-KR',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1180, height: 820 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath, args: ['--no-sandbox'] } } },
  ],
  webServer: {
    // 프론트를 빌드하고, 임시 DB 로 백엔드를 띄운다
    command: 'npx vite build && node test/e2e/server.mjs',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
