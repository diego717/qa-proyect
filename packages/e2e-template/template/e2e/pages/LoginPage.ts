import type { Page } from '@playwright/test';
import { qa } from '../qa.config';
import type { Credentials } from '../lib/credentials';
import { totp } from '../lib/totp';
import { submitLoginForm } from '../lib/login-form';
import { TOTP_LABEL } from './login-labels';

// Adjust the labels to the app's login form. Prefer labels and roles over CSS.
const LABELS = { email: 'Email', password: 'Password', submit: /sign in|log in/i, totp: TOTP_LABEL };

export class LoginPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(qa.loginPath);
  }

  async login(credentials: Credentials, role: string): Promise<void> {
    await submitLoginForm(this.page, {
      loginUrl: qa.loginPath,
      email: credentials.email,
      password: credentials.password,
      totpCode: credentials.totpSecret ? totp(credentials.totpSecret) : undefined,
      labels: LABELS,
      who: `role "${role}"`,
    });
  }
}
