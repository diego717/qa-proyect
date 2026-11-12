# End-to-end tests

Standard [Playwright](https://playwright.dev) tests for this repository's critical user flows.
**These tests are yours.** They depend only on `@playwright/test`. If you stop working with us, they keep working as they are.

## Run locally

```bash
cd e2e
npm install                     # first time only; commit package-lock.json
npx playwright install chromium
cp .env.example .env            # fill in staging URL and test users
npx playwright test
npx playwright show-report      # HTML report with traces and videos of failures
```

## Layout

| Path | What it is |
|---|---|
| `qa.config.ts` | The only file to edit per project: staging URL, roles, login path, reset endpoint |
| `setup/seed.setup.ts` | Runs first: `POST <resetPath>` with header `x-test-reset-token` to reset test data |
| `setup/auth.setup.ts` | Logs in once per role and saves the session to `.auth/<role>.json` |
| `fixtures/index.ts` | `test` and `expect` to import in every spec (adds `role` and quarantine) |
| `pages/` | Page objects. `LoginPage` holds the login form locators |
| `tests/` | The specs |
| `quarantine.json` | Keys of tests that are temporarily quarantined as flaky |

## Writing a test

```ts
import { test, expect } from '../fixtures';

test.describe('as admin', () => {
  test.use({ role: 'admin' });            // default is the first role in qa.config.ts

  test('sees the admin page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
  });
});
```

- Use role, label and text locators (`getByRole`, `getByLabel`), not CSS classes.
- Create the data each test needs with unique names (`uniqueName('order')` from `lib/unique.ts`) so tests can run in parallel.
- For a logged-out test: `test.use({ storageState: { cookies: [], origins: [] } })`.

## Adding a role

1. Add it to `roles` in `qa.config.ts`, for example `'power-user'`.
2. Set `E2E_POWER_USER_EMAIL` and `E2E_POWER_USER_PASSWORD` in `.env` and in the CI secrets. If the user has MFA, also set `E2E_POWER_USER_TOTP_SECRET` (base32).

## Flaky tests and quarantine

- In CI every failing test is retried up to 2 times. A test that passes on retry is reported as **flaky** and does not fail the PR.
- A test that is flaky over time gets its key added to `quarantine.json` through a pull request. The blocking job skips it. A separate, non-blocking job runs only the quarantined tests (`E2E_QUARANTINE_MODE=only`) so it can be fixed and released.
- A test's key is in the `qa-key` annotation of `results/results.json`, with the form `tests/file.spec.ts > describe > title`.

## CI (`.github/workflows/e2e.yml`)

Runs on every pull request, nightly, and on demand. Repository secrets:

| Secret | Required | Purpose |
|---|---|---|
| `E2E_BASE_URL` | yes | Staging URL |
| `E2E_<ROLE>_EMAIL`, `E2E_<ROLE>_PASSWORD` | yes, per role | Test users |
| `E2E_<ROLE>_TOTP_SECRET` | if MFA | Authenticator secret of the test user |
| `E2E_RESET_TOKEN` | if `resetPath` is set | Token for the reset endpoint |
| `QA_INGEST_URL`, `QA_INGEST_TOKEN` | optional | Sends results to the QA service. If it is down, CI is not affected |

Repository variable `QA_CLIENT_ID` identifies the project in the QA service.

Each run uploads the `e2e-artifacts` artifact with the HTML report, traces, videos and `results.json`.
