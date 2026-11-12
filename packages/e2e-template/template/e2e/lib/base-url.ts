/**
 * Validates E2E_BASE_URL. Credentials in the URL (https://user:pass@host) are rejected:
 * Playwright writes the config's baseURL into results/results.json and the HTML report,
 * which are uploaded as CI artifacts and sent to the QA service.
 * Error messages never echo the value.
 */
export function safeBaseURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('E2E_BASE_URL is not a valid URL');
  }
  if (url.username || url.password) {
    throw new Error(
      'E2E_BASE_URL must not contain credentials (user:password@host): they would be written to test reports. ' +
        'Use a staging URL without basic auth, or an IP allowlist for the CI runners.',
    );
  }
  return value;
}
