import { defineConfig } from '@playwright/test';

// End-to-end tests of the explorer against the demo app with planted bugs (port 3100).
export default defineConfig({
  testDir: 'test',
  testMatch: '**/*.e2e.ts',
  reporter: 'list',
  workers: 1,
  timeout: 120_000,
  webServer: {
    command: 'node ../demo-app/src/main.mjs',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    env: { PORT: '3100', PLANTED_BUGS: '1', RESET_TOKEN: 'e2e-reset' },
  },
});
