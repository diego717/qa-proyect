import { test, expect } from '@playwright/test';
import { navigationVerdict, type Guard } from '../src/scan.ts';
import { demoTarget } from './helpers.ts';

const guard = (overrides: Partial<Guard> = {}): Guard => ({
  target: demoTarget(),
  loginUrl: 'http://localhost:3100/login',
  loggingIn: false,
  startUrls: new Set(['http://localhost:3100/items']),
  forbiddenUrls: new Set(),
  allowSubmit: false,
  lastNavigationStatus: null,
  lastBlocked: null,
  lastRedirect: null,
  ...overrides,
});

test('the login POST is only allowed while logging in', () => {
  expect(navigationVerdict(guard({ loggingIn: true }), 'http://localhost:3100/login', 'POST')).toBe('allow');
  expect(navigationVerdict(guard(), 'http://localhost:3100/login', 'POST')).toBe('never-click');
});

test('a URL that looks like the login page still goes through never-click', () => {
  expect(navigationVerdict(guard(), 'http://localhost:3100/login?next=/lab/delete-all', 'GET')).toBe('never-click');
  const forbidden = guard({ forbiddenUrls: new Set(['http://localhost:3100/login?x=1']) });
  expect(navigationVerdict(forbidden, 'http://localhost:3100/login?x=1', 'GET')).toBe('never-click');
  expect(navigationVerdict(guard(), 'http://localhost:3100/login', 'GET')).toBe('allow'); // to detect a lost session
});

test('the login page of another origin is not the login page', () => {
  expect(navigationVerdict(guard(), 'http://evil.test/login', 'GET')).toBe('out-of-scope');
});
