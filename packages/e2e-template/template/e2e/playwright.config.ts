import { defineConfig, devices } from '@playwright/test';
import { qa } from './qa.config';

export default defineConfig({
  outputDir: 'test-results',
  forbidOnly: !!process.env.CI,
  // Retries let a flaky test pass (reported as "flaky") instead of blocking a PR.
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: qa.baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  ...(qa.webServer
    ? { webServer: { ...qa.webServer, reuseExistingServer: !process.env.CI } }
    : {}),
  projects: [
    // No traces or videos for setup: they would record test-user passwords and the reset token.
    { name: 'seed', testMatch: /seed\.setup\.ts/, use: { trace: 'off', video: 'off' } },
    { name: 'auth', testMatch: /auth\.setup\.ts/, dependencies: ['seed'], use: { trace: 'off', video: 'off' } },
    {
      name: 'chromium',
      testDir: 'tests',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['auth'],
    },
  ],
});
