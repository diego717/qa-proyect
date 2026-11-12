import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quarantineKey, quarantineAction, loadQuarantine } from '../template/e2e/lib/quarantine';

test('builds a key with forward slashes', () => {
  expect(quarantineKey(['tests\\items.spec.ts', 'Items', 'adds an item'])).toBe('tests/items.spec.ts > Items > adds an item');
});

test('exclude mode skips quarantined tests and runs the rest', () => {
  expect(quarantineAction('k', ['k'], 'exclude')).toBe('skip');
  expect(quarantineAction('k', [], 'exclude')).toBe('run');
});

test('only mode runs quarantined tests and skips the rest', () => {
  expect(quarantineAction('k', ['k'], 'only')).toBe('run');
  expect(quarantineAction('other', ['k'], 'only')).toBe('skip');
});

test('a missing quarantine file means no quarantine', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-'));
  expect(loadQuarantine(join(dir, 'missing.json'))).toEqual([]);
});

test('reads a valid quarantine file', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'qa-')), 'quarantine.json');
  writeFileSync(file, '["a > b"]');
  expect(loadQuarantine(file)).toEqual(['a > b']);
});

test('a non-array file throws naming the file', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'qa-')), 'quarantine.json');
  writeFileSync(file, '{"a":1}');
  expect(() => loadQuarantine(file)).toThrow(file);
});

test('an array with non-strings throws', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'qa-')), 'quarantine.json');
  writeFileSync(file, '[1]');
  expect(() => loadQuarantine(file)).toThrow(file);
});

test('invalid JSON throws naming the file', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'qa-')), 'quarantine.json');
  writeFileSync(file, '[oops');
  expect(() => loadQuarantine(file)).toThrow(file);
});
