import { test, expect } from '@playwright/test';
// @ts-expect-error plain ESM module without type declarations
import { ciEnvEntries, githubEnvBlock } from '../template/e2e/lib/ci-env.mjs';

test('keeps only E2E_* secrets', () => {
  const entries = ciEnvEntries({ E2E_USER_EMAIL: 'u@x.test', GITHUB_TOKEN: 'gh', QA_INGEST_TOKEN: 'qa' });
  expect(entries).toEqual([['E2E_USER_EMAIL', 'u@x.test']]);
});

test('a secret can never override variables the workflow owns', () => {
  const entries = ciEnvEntries({ E2E_QUARANTINE_MODE: 'off', E2E_ADMIN_PASSWORD: 'p' });
  expect(entries).toEqual([['E2E_ADMIN_PASSWORD', 'p']]);
});

test('formats multiline-safe GITHUB_ENV blocks', () => {
  expect(githubEnvBlock([['E2E_A', 'line1\nline2']], 'DELIM')).toBe('E2E_A<<DELIM\nline1\nline2\nDELIM\n');
});

test('refuses a value that contains the delimiter (it could inject other variables)', () => {
  expect(() => githubEnvBlock([['E2E_A', 'x\nDELIM\nNODE_OPTIONS=--require=evil']], 'DELIM')).toThrow(
    /E2E_A contains the GITHUB_ENV delimiter/,
  );
});
