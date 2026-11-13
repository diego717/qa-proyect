import { defineConfig } from '@playwright/test';

// Unit tests of the explorer. No browser involved.
export default defineConfig({
  testDir: 'test',
  testMatch: '**/*.unit.ts',
  reporter: 'list',
});
