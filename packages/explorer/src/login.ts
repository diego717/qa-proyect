import type { Browser, BrowserContext } from '@playwright/test';
import { submitLoginForm } from '../../e2e-template/template/e2e/lib/login-form.ts';
import { totp } from '../../e2e-template/template/e2e/lib/totp.ts';
import { TOTP_LABEL } from '../../e2e-template/template/e2e/pages/login-labels.ts';
import type { Target } from './target.ts';

/**
 * Opens a browser context for the audit. With credentials, logs in once through the
 * same form helper the e2e template uses (secrets never reach step titles or logs).
 * Error messages only ever name env vars, never their values.
 */
export async function authenticate(
  browser: Browser,
  target: Target,
  env: NodeJS.ProcessEnv = process.env,
  prepare?: (context: BrowserContext) => Promise<void>,
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: target.baseUrl });
  await prepare?.(context);
  if (!target.login) return context;

  const { login } = target;
  const required = [login.emailEnv, login.passwordEnv, ...(login.totpSecretEnv ? [login.totpSecretEnv] : [])];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    await context.close();
    throw new Error(`Missing audit credentials: set ${missing.join(', ')}`);
  }

  const page = await context.newPage();
  try {
    await submitLoginForm(page, {
      loginUrl: new URL(login.path, target.baseUrl).href,
      email: env[login.emailEnv] as string,
      password: env[login.passwordEnv] as string,
      totpCode: login.totpSecretEnv ? totp(env[login.totpSecretEnv] as string) : undefined,
      labels: { ...login.labels, totp: login.labels.totp ?? TOTP_LABEL },
      who: `audit target "${target.id}"`,
    });
  } catch (error) {
    await context.close();
    throw error;
  } finally {
    if (!page.isClosed()) await page.close().catch(() => {});
  }
  return context;
}
