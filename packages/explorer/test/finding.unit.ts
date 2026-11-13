import { test, expect } from '@playwright/test';
import { findingId } from '../src/finding.ts';

test('findingId is stable and ignores origin and fragment', () => {
  const a = findingId('http-error', 'http://localhost:3100/lab/x?b=1#top', 'GET');
  const b = findingId('http-error', 'https://staging.acme.test/lab/x?b=1', 'GET');
  expect(a).toBe(b);
  expect(a).toMatch(/^http-error-[0-9a-f]{10}$/);
});

test('findingId changes with check, path or key', () => {
  const base = findingId('a11y', 'http://x/page', 'label');
  expect(findingId('broken-link', 'http://x/page', 'label')).not.toBe(base);
  expect(findingId('a11y', 'http://x/other', 'label')).not.toBe(base);
  expect(findingId('a11y', 'http://x/page?tab=2', 'label')).not.toBe(base);
  expect(findingId('a11y', 'http://x/page', 'color-contrast')).not.toBe(base);
});
