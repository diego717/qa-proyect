import { test, expect } from '@playwright/test';
import { uniqueName } from '../template/e2e/lib/unique';

test('has the prefix, a base36 timestamp and 4 random chars', () => {
  expect(uniqueName('item')).toMatch(/^item-[0-9a-z]+-[0-9a-z]{4}$/);
});

test('two calls produce different names', () => {
  expect(uniqueName('item')).not.toBe(uniqueName('item'));
});
