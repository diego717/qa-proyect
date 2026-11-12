import { test, expect } from '@playwright/test';
import { credentialsFor } from '../template/e2e/lib/credentials';

test('reads email and password for a role', () => {
  expect(credentialsFor('admin', { E2E_ADMIN_EMAIL: 'a@x', E2E_ADMIN_PASSWORD: 'p' })).toEqual({
    email: 'a@x',
    password: 'p',
    totpSecret: undefined,
  });
});

test('reads the optional TOTP secret', () => {
  const c = credentialsFor('user', { E2E_USER_EMAIL: 'u', E2E_USER_PASSWORD: 'p', E2E_USER_TOTP_SECRET: 'JBSWY3DP' });
  expect(c.totpSecret).toBe('JBSWY3DP');
});

test('normalizes role names to env var form', () => {
  expect(credentialsFor('power-user', { E2E_POWER_USER_EMAIL: 'e', E2E_POWER_USER_PASSWORD: 'p' }).email).toBe('e');
});

test('an empty value counts as missing', () => {
  expect(() => credentialsFor('admin', { E2E_ADMIN_EMAIL: 'a@x', E2E_ADMIN_PASSWORD: '' })).toThrow(
    'Missing E2E credentials for role "admin": set E2E_ADMIN_PASSWORD',
  );
});

test('names every missing variable', () => {
  expect(() => credentialsFor('admin', {})).toThrow(
    'Missing E2E credentials for role "admin": set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD',
  );
});
