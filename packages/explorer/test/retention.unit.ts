import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditSecretPrefix, expiredAudits } from '../src/retention.ts';

test('an audit expires 30 days after delivery', () => {
  const audits = [
    { id: 'old', deliveredOn: '2026-10-13' }, // 31 days before
    { id: 'edge', deliveredOn: '2026-10-14' }, // exactly 30 days
    { id: 'undelivered' },
  ];
  expect(expiredAudits(audits, '2026-11-13')).toEqual([{ id: 'old', deliveredOn: '2026-10-13', daysOverdue: 1 }]);
  expect(expiredAudits(audits, '2026-11-13', 10).map((a) => a.id)).toEqual(['old', 'edge']);
});

test('the secret prefix of an audit is AUDIT_<ID>_ in upper case', () => {
  expect(auditSecretPrefix('acme-uy')).toBe('AUDIT_ACME_UY_');
  expect(() => auditSecretPrefix('../x')).toThrow(/invalid audit id/);
});

test('main only ships audits/example', () => {
  const audits = readdirSync(fileURLToPath(new URL('../../../audits/', import.meta.url)));
  expect(audits).toEqual(['example']);
});
