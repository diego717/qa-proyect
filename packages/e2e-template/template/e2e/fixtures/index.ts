import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import { qa } from '../qa.config';
import { authFile } from '../lib/auth-file';
import { loadQuarantine, quarantineAction, quarantineKey } from '../lib/quarantine';

const quarantined = loadQuarantine(path.join(__dirname, '..', 'quarantine.json'));
const mode = process.env.E2E_QUARANTINE_MODE === 'only' ? 'only' : 'exclude';

type Options = {
  /** Which test user the test runs as. Change it with test.use({ role: 'admin' }). */
  role: string;
};

type AutoFixtures = {
  quarantine: void;
};

/** Always import test/expect from here in spec files. */
export const test = base.extend<Options & AutoFixtures>({
  role: [qa.roles[0], { option: true }],

  storageState: async ({ role }, use) => {
    await use(authFile(role));
  },

  quarantine: [
    async ({}, use, testInfo) => {
      const key = quarantineKey(testInfo.titlePath);
      testInfo.annotations.push({ type: 'qa-key', description: key });
      if (quarantineAction(key, quarantined, mode) === 'skip') testInfo.skip(true, 'quarantined');
      await use();
    },
    { auto: true },
  ],
});

export { expect };
