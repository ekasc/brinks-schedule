import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  webServer: {
    command: `PORT=${PORT} DB_PATH=/tmp/brinks-test-e2e.db JWT_SECRET=e2e-test-secret ORIGIN=${BASE_URL} node build/index.js`,
    url: `${BASE_URL}/login`,
    stdout: 'pipe',
    stderr: 'pipe',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
    env: {
      DB_PATH: './data/test-e2e.db',
      JWT_SECRET: 'e2e-test-secret',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
