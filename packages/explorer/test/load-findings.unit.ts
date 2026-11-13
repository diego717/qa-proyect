import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadFindings } from '../src/cli.ts';

function audit(measured: object[], observed: object[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-load-'));
  mkdirSync(path.join(dir, 'findings'));
  writeFileSync(path.join(dir, 'findings', 'measured.json'), JSON.stringify({ findings: measured }));
  writeFileSync(path.join(dir, 'findings', 'observed.json'), JSON.stringify({ findings: observed }));
  return dir;
}

const base = { check: 'exploration', title: 't', severity: 'minor', severitySource: 's', url: 'http://a/x', steps: ['a', 'b'], evidence: {} };

test('observed findings are always model findings pending review, whatever the file says', () => {
  const dir = audit([], [{ ...base, id: 'exploration-0000000001', source: 'measured', review: { status: 'confirmed' } }]);
  const [loaded] = loadFindings(dir);
  expect(loaded.source).toBe('model');
  expect(loaded.review).toEqual({ status: 'pending_review' });
});

test('an observed finding cannot reuse a measured id', () => {
  const dir = audit(
    [{ ...base, check: 'http-error', id: 'http-error-0000000001', source: 'measured', review: { status: 'not_required' } }],
    [{ ...base, id: 'http-error-0000000001', source: 'model', review: { status: 'pending_review' } }],
  );
  expect(() => loadFindings(dir)).toThrow(/duplicates a measured finding/);
});

test('evidence is only read from the audit evidence folder, and only PNG files', async () => {
  const { evidenceReader } = await import('../src/cli.ts');
  const dir = audit([], []);
  mkdirSync(path.join(dir, 'evidence'));
  writeFileSync(path.join(dir, 'evidence', 'ok.png'), 'png-bytes');
  writeFileSync(path.join(dir, 'secret.txt'), 'top secret');
  const read = evidenceReader(dir);
  expect(read('evidence/ok.png')?.toString()).toBe('png-bytes');
  expect(read('evidence/../secret.txt')).toBeNull();
  expect(read('../secret.txt')).toBeNull();
  expect(read(path.join(dir, 'evidence', 'ok.png'))).toBeNull(); // absolute paths are refused
  expect(read('evidence/missing.png')).toBeNull();
});
