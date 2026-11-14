import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditSecretNames, expiredAudits } from '../src/retention.ts';

test('an audit expires 30 days after delivery', () => {
  const audits = [
    { id: 'old', deliveredOn: '2026-10-13' }, // 31 days before
    { id: 'edge', deliveredOn: '2026-10-14' }, // exactly 30 days
    { id: 'undelivered' },
  ];
  expect(expiredAudits(audits, '2026-11-13')).toEqual([{ id: 'old', deliveredOn: '2026-10-13', daysOverdue: 1 }]);
  expect(expiredAudits(audits, '2026-11-13', 10).map((a) => a.id)).toEqual(['old', 'edge']);
});

test('the secrets of an audit are exactly AUDIT_<ID>_EMAIL, _PASSWORD and _TOTP_SECRET', () => {
  expect(auditSecretNames('acme-uy')).toEqual(['AUDIT_ACME_UY_EMAIL', 'AUDIT_ACME_UY_PASSWORD', 'AUDIT_ACME_UY_TOTP_SECRET']);
  expect(() => auditSecretNames('../x')).toThrow(/invalid audit id/);
});

test('main only ships audits/example', () => {
  const audits = readdirSync(fileURLToPath(new URL('../../../audits/', import.meta.url)));
  expect(audits).toEqual(['example']);
});

test('one invalid profile does not hide the other audits', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { readAudits } = await import('../src/retention.ts');
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-ret-'));
  const example = readFileSync(fileURLToPath(new URL('../../../audits/example/target.yaml', import.meta.url)), 'utf8');
  mkdirSync(path.join(dir, 'example'));
  writeFileSync(path.join(dir, 'example', 'target.yaml'), example.replace('# delivered_on: 2026-11-20', 'delivered_on: 2026-09-01'));
  mkdirSync(path.join(dir, 'broken'));
  writeFileSync(path.join(dir, 'broken', 'target.yaml'), 'name: Broken\n');
  const { audits, errors } = readAudits(dir);
  expect(audits.map((a) => a.id)).toEqual(['example']);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatch(/broken/);
});
