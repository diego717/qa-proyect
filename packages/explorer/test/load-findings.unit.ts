import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadFindings } from '../src/cli.ts';
import { observedId } from '../src/observed.ts';

function audit(measured: object[], observed: object[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-load-'));
  mkdirSync(path.join(dir, 'findings'));
  writeFileSync(path.join(dir, 'findings', 'measured.json'), JSON.stringify({ findings: measured }));
  writeFileSync(path.join(dir, 'findings', 'observed.json'), JSON.stringify({ findings: observed }));
  return dir;
}

const base = { check: 'exploration', title: 't', severity: 'minor', severitySource: 's', url: 'http://a/x', steps: ['a', 'b'], evidence: {} };

test('observed findings are validated when loaded: no evidence or a spoofed source never reach review or report', () => {
  const dir = audit([], [{ ...base, id: 'exploration-0000000001', source: 'measured', review: { status: 'confirmed' } }]);
  expect(() => loadFindings(dir)).toThrow(/observed.json.*source must be "model"/s);
});

test('a valid observed finding loads as model, pending, and never as third party', () => {
  const dir = audit([], []);
  mkdirSync(path.join(dir, 'evidence'));
  writeFileSync(path.join(dir, 'evidence', 'x.png'), Buffer.from('89504e470d0a1a0a00', 'hex'));
  const title = 'Algo observado';
  const finding = {
    ...base,
    title,
    id: observedId({ url: base.url, checklistItem: 'formularios#4', title, severity: base.severity, steps: base.steps, screenshot: 'evidence/x.png' }),
    source: 'model',
    checklistItem: 'formularios#4',
    evidence: { screenshot: 'evidence/x.png' },
    thirdParty: true,
    review: { status: 'pending_review' },
  };
  writeFileSync(path.join(dir, 'findings', 'observed.json'), JSON.stringify({ findings: [finding] }));
  const [loaded] = loadFindings(dir);
  expect(loaded).toMatchObject({ source: 'model', review: { status: 'pending_review' } });
  expect(loaded.thirdParty).toBeUndefined();
});

test('evidence is only read from the audit evidence folder, and only PNG files', async () => {
  const { evidenceReader } = await import('../src/cli.ts');
  const dir = audit([], []);
  mkdirSync(path.join(dir, 'evidence'));
  writeFileSync(path.join(dir, 'evidence', 'ok.png'), Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('png-bytes')]));
  writeFileSync(path.join(dir, 'secret.txt'), 'top secret');
  const read = evidenceReader(dir);
  expect(read('evidence/ok.png')?.subarray(8).toString()).toBe('png-bytes');
  expect(read('evidence/../secret.txt')).toBeNull();
  expect(read('../secret.txt')).toBeNull();
  expect(read(path.join(dir, 'evidence', 'ok.png'))).toBeNull(); // absolute paths are refused
  expect(read('evidence/missing.png')).toBeNull();
});

test('evidence must be a real PNG file, never a symlink', async () => {
  const { evidenceReader } = await import('../src/cli.ts');
  const { symlinkSync } = await import('node:fs');
  const dir = audit([], []);
  mkdirSync(path.join(dir, 'evidence'));
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('rest')]);
  writeFileSync(path.join(dir, 'evidence', 'real.png'), png);
  writeFileSync(path.join(dir, 'evidence', 'fake.png'), 'not a png at all');
  writeFileSync(path.join(dir, 'secret.txt'), 'top secret');
  const read = evidenceReader(dir);
  expect(read('evidence/real.png')?.equals(png)).toBe(true);
  expect(read('evidence/fake.png')).toBeNull();
  let linked = true;
  try {
    symlinkSync(path.join(dir, 'secret.txt'), path.join(dir, 'evidence', 'link.png'), 'file');
  } catch {
    linked = false; // Windows without symlink privileges: nothing to test there
  }
  if (linked) expect(read('evidence/link.png')).toBeNull();
});
