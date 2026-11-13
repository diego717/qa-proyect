import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { safeOutputPath } from '../src/evidence.ts';

test('a normal path inside the audit is allowed and its folder is created', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-out-'));
  const file = safeOutputPath(dir, '.auth/session.json');
  expect(file).toBe(path.join(dir, '.auth', 'session.json'));
  expect(existsSync(path.join(dir, '.auth'))).toBe(true);
});

test('writing through a symlinked or junctioned folder is refused', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-out-'));
  const elsewhere = mkdtempSync(path.join(tmpdir(), 'qa-elsewhere-'));
  symlinkSync(elsewhere, path.join(dir, '.auth'), 'junction'); // junctions need no privileges on Windows
  expect(() => safeOutputPath(dir, '.auth/session.json')).toThrow(/symlink/);
});

test('overwriting a file that is a symlink is refused', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-out-'));
  mkdirSync(path.join(dir, 'findings'));
  writeFileSync(path.join(dir, 'outside.txt'), 'x');
  let linked = true;
  try {
    symlinkSync(path.join(dir, 'outside.txt'), path.join(dir, 'findings', 'measured.json'), 'file');
  } catch {
    linked = false; // Windows without symlink privileges
  }
  if (linked) expect(() => safeOutputPath(dir, 'findings/measured.json')).toThrow(/symlink/);
});

test('paths that leave the audit folder are refused', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-out-'));
  expect(() => safeOutputPath(dir, '../x.json')).toThrow(/outside/);
  expect(() => safeOutputPath(dir, path.join(dir, 'abs.json'))).toThrow(/outside|relative/);
});
