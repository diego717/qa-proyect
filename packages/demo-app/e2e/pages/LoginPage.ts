import { expect, type Page } from '@playwright/test';
import { qa } from '../qa.config';
import type { Credentials } from '../lib/credentials';
import { totp } from '../lib/totp';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Adjust the locators to the app's login form. Prefer labels and roles over CSS.
export class LoginPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(qa.loginPath);
  }

  async login(credentials: Credentials, role: string): Promise<void> {
    await this.goto();
    await this.page.getByLabel('Email').fill(credentials.email);
    await this.page.getByLabel('Password').fill(credentials.password);
    if (credentials.totpSecret) {
      await this.page.getByLabel(/code/i).fill(totp(credentials.totpSecret));
    }
    await this.page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(this.page, `Login failed for role "${role}"`).not.toHaveURL(
      new RegExp(`${escapeRegExp(qa.loginPath)}([?#]|$)`),
    );
  }
}
