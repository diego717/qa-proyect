import { test, expect } from '@playwright/test';
import { TOTP_LABEL } from '../template/e2e/pages/login-labels';

test('matches common one-time code labels', () => {
  for (const label of ['Code', 'Authentication code', 'Verification code', 'One-time code', '2FA code', 'MFA code', 'Enter your 6-digit code']) {
    expect(label, label).toMatch(TOTP_LABEL);
  }
});

test('does not match other code fields', () => {
  for (const label of ['Promo code', 'Country code', 'Postal code', 'Zip code', 'Discount code', 'Recovery code']) {
    expect(label, label).not.toMatch(TOTP_LABEL);
  }
});
