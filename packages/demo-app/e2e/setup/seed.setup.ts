import { test as setup } from '@playwright/test';
import { qa } from '../qa.config';
import { missingE2EEnv } from '../lib/required-env';

// Runs once before everything: puts the test data back in a known state.
// Uses Node's fetch on purpose: Playwright's request API would write the token header
// into results.json and the HTML report when the call fails.
setup('reset test data', async () => {
  const missing = missingE2EEnv(qa);
  if (missing.length > 0) throw new Error(`Missing E2E environment variables: ${missing.join(', ')}`);

  setup.skip(qa.resetPath === null, 'no reset endpoint');
  const url = new URL(qa.resetPath as string, qa.baseURL);
  // Never print userinfo (https://user:pass@host) that a basic-auth staging URL may carry.
  const shown = `${url.origin}${url.pathname}`;
  let status: number;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'x-test-reset-token': process.env.E2E_RESET_TOKEN ?? '' },
      signal: AbortSignal.timeout(30_000),
    });
    status = response.status;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name;
    throw new Error(`Test data reset failed: POST ${shown} could not connect (${cause})`);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`Test data reset failed: POST ${shown} returned ${status}`);
  }
});
