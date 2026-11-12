import './lib/env';

// The only file you need to edit per project.

export type QaConfig = {
  /** URL of the environment under test (staging). */
  baseURL: string;
  /** Test user roles. Each needs E2E_<ROLE>_EMAIL and E2E_<ROLE>_PASSWORD. The first one is the default. */
  roles: string[];
  /** Path of the login page. */
  loginPath: string;
  /** POST endpoint that resets test data, or null if the app has none. */
  resetPath: string | null;
  /**
   * Optional: start the app locally before the tests. It inherits this process's environment.
   * Never put secrets in webServer.env: the whole config is written to results/results.json.
   */
  webServer?: { command: string; url: string; env?: Record<string, string> };
};

export const qa: QaConfig = {
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
  roles: ['user'],
  loginPath: '/login',
  resetPath: '/__test__/reset',
};
