import { test, expect } from '@playwright/test';
import { safeBaseURL } from '../template/e2e/lib/base-url';

test('returns a plain URL unchanged', () => {
  expect(safeBaseURL('https://staging.example.com')).toBe('https://staging.example.com');
  expect(safeBaseURL('http://localhost:3000')).toBe('http://localhost:3000');
});

test('rejects credentials in the URL without echoing them', () => {
  let message = '';
  try {
    safeBaseURL('https://qa:s3cret-value@staging.example.com');
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toContain('E2E_BASE_URL must not contain credentials');
  expect(message).not.toContain('s3cret-value');
});

test('rejects a username-only URL too', () => {
  expect(() => safeBaseURL('https://qa@staging.example.com')).toThrow(/must not contain credentials/);
});

test('rejects a value that is not a URL, without echoing it', () => {
  expect(() => safeBaseURL('not a url')).toThrow('E2E_BASE_URL is not a valid URL');
});
