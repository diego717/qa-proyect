import { test, expect } from '@playwright/test';
import { totp } from '../../e2e-template/template/e2e/lib/totp.ts';

test('imports with .ts extension work in the test runner', () => {
  expect(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000, 8)).toBe('94287082'); // RFC 6238 vector
});
