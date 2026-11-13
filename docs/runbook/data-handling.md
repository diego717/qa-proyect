# How we handle your data

A one-page summary for your security and engineering teams.

## The short version

- We only test **staging**, never production.
- Your **secrets stay in your CI** (GitHub Actions secrets). We never store them.
- The **tests are yours**: standard Playwright code in your repository. If you leave, they keep working.

## Access we need

| Access | Scope | Why |
|---|---|---|
| Your repository | Pull requests only, no direct pushes | To add and maintain the tests in `/e2e` |
| Staging environment | Dedicated test users, one per role | To run the tests |
| Test-data reset endpoint (optional) | Staging only, token-protected | To start every run from known data |

We do not need, and do not accept, production credentials or real customer data.

## Where things run

- **Tests run in your CI**, on your GitHub Actions runners. Compute, logs and test-user credentials stay in your account.
- **Traces, videos and HTML reports** stay as artifacts in your repository for 7 days. They may contain staging session cookies, so on public repositories they are not uploaded. Only a pass/fail summary is.
- **Credentials are never recorded.** Login and data-reset steps run with tracing, video and screenshots turned off.

## What we store

If you enable the reporting integration, your CI sends us the **test results summary** (`results.json`): test names, pass/fail/flaky status, durations and error messages. With it we track flakiness and write your weekly report.

| What | Where | How long |
|---|---|---|
| Test result summaries | Cloudflare (D1 database) | 90 days |
| Failure artifacts you choose to share for triage | Cloudflare (R2 storage) | 90 days |
| Weekly reports | Cloudflare (R2 storage) | Duration of the contract |

We do not store credentials, source code (it stays in your repository) or production data.

## When the contract ends

- Within 30 days we delete all your stored results, artifacts and reports, and confirm in writing.
- You revoke our repository and staging access. Nothing on your side depends on us.
- The tests, fixtures and CI workflow stay in your repository and are yours.

## Contact

Questions about security or data handling: reply to your onboarding email thread.
