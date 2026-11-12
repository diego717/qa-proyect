import { test, expect } from '@playwright/test';
import { totp } from '../template/e2e/lib/totp';

// RFC 6238 test vectors, SHA-1, ASCII secret "12345678901234567890"
const S = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('matches RFC 6238 vector at T=59s (8 digits)', () => {
  expect(totp(S, 59_000, 8)).toBe('94287082');
});

test('matches RFC 6238 vector at T=1111111109s (8 digits, leading zero)', () => {
  expect(totp(S, 1_111_111_109_000, 8)).toBe('07081804');
});

test('defaults to 6 digits', () => {
  expect(totp(S, 59_000)).toBe('287082');
});

test('accepts lowercase secrets with spaces', () => {
  expect(totp('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', 59_000)).toBe('287082');
});

test('rejects invalid base32', () => {
  expect(() => totp('GEZ1!', 0)).toThrow(/base32/i);
});
