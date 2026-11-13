import { test, expect } from '@playwright/test';
import { isLoginUrl } from '../template/e2e/lib/login-form';

test('isLoginUrl compares pathnames and ignores query and fragment', () => {
  expect(isLoginUrl('http://x/login?next=/a', '/login')).toBe(true);
  expect(isLoginUrl('http://x/login#top', 'http://x/login')).toBe(true);
  expect(isLoginUrl('http://x/login/', '/login')).toBe(true);
  expect(isLoginUrl('http://x/items', '/login')).toBe(false);
  expect(isLoginUrl('http://x/login-help', '/login')).toBe(false);
});
