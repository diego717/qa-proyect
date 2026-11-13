import { defineConfig } from '@playwright/test';

// Unit tests for the template's helpers and the init CLI. No browser involved.
export default defineConfig({
  testDir: 'test',
  testMatch: '**/*.unit.ts',
  reporter: 'list',
});
