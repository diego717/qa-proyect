import { test as setup } from '@playwright/test';
import { qa } from '../qa.config';
import { credentialsFor } from '../lib/credentials';
import { authFile } from '../lib/auth-file';
import { LoginPage } from '../pages/LoginPage';

// Logs in once per role and saves the session, so tests start already authenticated.
for (const role of qa.roles) {
  setup(`authenticate ${role}`, async ({ page }) => {
    await new LoginPage(page).login(credentialsFor(role), role);
    await page.context().storageState({ path: authFile(role) });
  });
}
