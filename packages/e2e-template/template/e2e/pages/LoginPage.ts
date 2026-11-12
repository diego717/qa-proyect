import { expect, type Locator, type Page } from '@playwright/test';
import { qa } from '../qa.config';
import type { Credentials } from '../lib/credentials';
import { totp } from '../lib/totp';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Types a secret into an input without it appearing in step titles
 * (locator.fill would record `Fill "<password>"` in the HTML report and results.json).
 * Uses the native value setter so React/Vue controlled inputs see the change.
 */
async function fillSecret(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((element, secret) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, secret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

// Adjust the locators to the app's login form. Prefer labels and roles over CSS.
export class LoginPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(qa.loginPath);
  }

  async login(credentials: Credentials, role: string): Promise<void> {
    await this.goto();
    await this.page.getByLabel('Email').fill(credentials.email);
    await fillSecret(this.page.getByLabel('Password'), credentials.password);
    if (credentials.totpSecret) {
      await fillSecret(this.page.getByLabel(/code/i), totp(credentials.totpSecret));
    }
    await this.page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(this.page, `Login failed for role "${role}"`).not.toHaveURL(
      new RegExp(`${escapeRegExp(qa.loginPath)}([?#]|$)`),
    );
  }
}
