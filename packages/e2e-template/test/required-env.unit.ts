import { test, expect } from '@playwright/test';
import { missingE2EEnv } from '../template/e2e/lib/required-env';

const config = { roles: ['user', 'power-user'], resetPath: '/__test__/reset' as string | null, webServer: undefined };
const complete = {
  E2E_BASE_URL: 'https://staging.example.com',
  E2E_RESET_TOKEN: 't',
  E2E_USER_EMAIL: 'u',
  E2E_USER_PASSWORD: 'p',
  E2E_POWER_USER_EMAIL: 'pu',
  E2E_POWER_USER_PASSWORD: 'pp',
};

test('nothing is missing when every variable is set', () => {
  expect(missingE2EEnv(config, { ...complete, CI: 'true' })).toEqual([]);
});

test('in CI with no secrets at all, names every missing variable', () => {
  expect(missingE2EEnv(config, { CI: 'true' })).toEqual([
    'E2E_BASE_URL',
    'E2E_RESET_TOKEN',
    'E2E_USER_EMAIL',
    'E2E_USER_PASSWORD',
    'E2E_POWER_USER_EMAIL',
    'E2E_POWER_USER_PASSWORD',
  ]);
});

test('E2E_BASE_URL is optional locally and when the app is started by webServer', () => {
  const { E2E_BASE_URL, ...rest } = complete;
  expect(missingE2EEnv(config, rest)).toEqual([]);
  expect(missingE2EEnv({ ...config, webServer: { command: 'x', url: 'y' } }, { ...rest, CI: 'true' })).toEqual([]);
});

test('E2E_RESET_TOKEN is not needed without a reset endpoint', () => {
  const { E2E_RESET_TOKEN, ...rest } = complete;
  expect(missingE2EEnv({ ...config, resetPath: null }, rest)).toEqual([]);
});

test('empty values count as missing', () => {
  expect(missingE2EEnv(config, { ...complete, E2E_USER_PASSWORD: '' })).toEqual(['E2E_USER_PASSWORD']);
});
