import { test as setup, expect } from '@playwright/test';
import { qa } from '../qa.config';

// Runs once before everything: puts the test data back in a known state.
setup('reset test data', async ({ request }) => {
  setup.skip(qa.resetPath === null, 'no reset endpoint');
  const response = await request.post(qa.resetPath as string, {
    headers: { 'x-test-reset-token': process.env.E2E_RESET_TOKEN ?? '' },
  });
  expect(response.ok(), `Test data reset failed: POST ${qa.resetPath} returned ${response.status()}`).toBe(true);
});
