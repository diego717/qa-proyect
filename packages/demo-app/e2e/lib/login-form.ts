import type { Locator, Page } from '@playwright/test';

/**
 * Login form steps shared by the e2e setup (pages/LoginPage.ts) and the QA explorer.
 * No runtime imports: only types from Playwright, so it can be reused anywhere.
 */
export type LoginFormOptions = {
  /** Path or absolute URL of the login page. */
  loginUrl: string;
  email: string;
  password: string;
  totpCode?: string;
  labels: { email: string | RegExp; password: string | RegExp; submit: string | RegExp; totp?: string | RegExp };
  /** Who is logging in, for the error message: a role or an audit target. Never a credential. */
  who: string;
  timeoutMs?: number;
};

const trimSlash = (pathname: string) => pathname.replace(/\/+$/, '') || '/';

/** True when `current` is the login page: same pathname, any query or fragment. */
export function isLoginUrl(current: string, loginUrl: string): boolean {
  const currentPath = new URL(current).pathname;
  const loginPath = new URL(loginUrl, current).pathname;
  return trimSlash(currentPath) === trimSlash(loginPath);
}

/**
 * Types a secret into an input without it appearing in step titles
 * (locator.fill would record `Fill "<password>"` in the HTML report and results.json).
 * Uses the native value setter so React/Vue controlled inputs see the change.
 */
export async function fillSecret(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((element, secret) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, secret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Fills and submits the login form, then waits to leave the login page. Throws `Login failed for <who>`. */
export async function submitLoginForm(page: Page, options: LoginFormOptions): Promise<void> {
  const { labels } = options;
  await page.goto(options.loginUrl);
  await page.getByLabel(labels.email).fill(options.email);
  await fillSecret(page.getByLabel(labels.password), options.password);
  if (options.totpCode && labels.totp) await fillSecret(page.getByLabel(labels.totp), options.totpCode);
  await page.getByRole('button', { name: labels.submit }).click();
  try {
    await page.waitForURL((url) => !isLoginUrl(url.href, options.loginUrl), { timeout: options.timeoutMs ?? 15_000 });
  } catch {
    // The original error is dropped on purpose: never risk echoing form values.
    throw new Error(`Login failed for ${options.who}`);
  }
}
