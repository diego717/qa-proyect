import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain ESM module without type declarations
import { initTemplate } from '../bin/init.mjs';

const tempDir = () => mkdtempSync(join(tmpdir(), 'qa-init-'));

test('copies e2e/ and the workflow into an empty dir', async () => {
  const target = tempDir();
  const result = await initTemplate({ targetDir: target });
  expect(result.created).toContain('e2e/playwright.config.ts');
  expect(result.created).toContain('e2e/.env.example');
  expect(result.created).toContain('.github/workflows/e2e.yml');
  expect(result.skipped).toEqual([]);
  expect(existsSync(join(target, 'e2e', 'fixtures', 'index.ts'))).toBe(true);
});

test('skips existing files and leaves their content untouched', async () => {
  const target = tempDir();
  mkdirSync(join(target, 'e2e'));
  writeFileSync(join(target, 'e2e', 'qa.config.ts'), 'mine');
  const result = await initTemplate({ targetDir: target });
  expect(result.skipped).toEqual(['e2e/qa.config.ts']);
  expect(result.created).not.toContain('e2e/qa.config.ts');
  expect(readFileSync(join(target, 'e2e', 'qa.config.ts'), 'utf8')).toBe('mine');
});

test('force overwrites existing files', async () => {
  const target = tempDir();
  mkdirSync(join(target, 'e2e'));
  writeFileSync(join(target, 'e2e', 'qa.config.ts'), 'mine');
  const result = await initTemplate({ targetDir: target, force: true });
  expect(result.overwritten).toEqual(['e2e/qa.config.ts']);
  expect(readFileSync(join(target, 'e2e', 'qa.config.ts'), 'utf8')).not.toBe('mine');
});

test('never copies node_modules, .auth, results, reports or .env', async () => {
  const template = tempDir();
  for (const dir of ['node_modules/pkg', '.auth', 'results', 'test-results', 'playwright-report']) {
    mkdirSync(join(template, 'e2e', dir), { recursive: true });
    writeFileSync(join(template, 'e2e', dir, 'file.json'), '{}');
  }
  writeFileSync(join(template, 'e2e', '.env'), 'SECRET=1');
  writeFileSync(join(template, 'e2e', '.env.example'), 'SECRET=');
  writeFileSync(join(template, 'e2e', 'playwright.config.ts'), '');

  const result = await initTemplate({ targetDir: tempDir(), templateDir: template });
  expect(result.created.sort()).toEqual(['e2e/.env.example', 'e2e/playwright.config.ts']);
});

test('never copies .env.* variants, only .env.example', async () => {
  const template = tempDir();
  mkdirSync(join(template, 'e2e'));
  for (const name of ['.env.local', '.env.production', '.env.staging.local', '.env.example']) {
    writeFileSync(join(template, 'e2e', name), 'SECRET=1');
  }
  const result = await initTemplate({ targetDir: tempDir(), templateDir: template });
  expect(result.created).toEqual(['e2e/.env.example']);
});

test('the real template never ships its installed node_modules', async () => {
  const result = await initTemplate({ targetDir: tempDir() });
  expect(result.created.filter((f: string) => f.includes('node_modules'))).toEqual([]);
});

test('works with spaces and accents in the target path', async () => {
  const target = join(tempDir(), 'cliente demo ñ');
  mkdirSync(target);
  const result = await initTemplate({ targetDir: target });
  expect(result.created).toContain('e2e/qa.config.ts');
  expect(existsSync(join(target, 'e2e', 'qa.config.ts'))).toBe(true);
});

test('fails clearly when the target dir does not exist', async () => {
  await expect(initTemplate({ targetDir: join(tempDir(), 'missing') })).rejects.toThrow(/does not exist/);
});
