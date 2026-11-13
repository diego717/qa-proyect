import { credentialEnvNames } from './credentials';

type RequiredEnvConfig = {
  roles: string[];
  resetPath: string | null;
  webServer?: unknown;
};

/**
 * Names of required E2E variables that are missing or empty, so a CI run with
 * unset secrets fails with the variable names instead of a connection error.
 */
export function missingE2EEnv(config: RequiredEnvConfig, env: NodeJS.ProcessEnv = process.env): string[] {
  const required: string[] = [];
  // Locally the default baseURL is fine; in CI against staging it must be explicit.
  if (env.CI && !config.webServer) required.push('E2E_BASE_URL');
  if (config.resetPath !== null) required.push('E2E_RESET_TOKEN');
  for (const role of config.roles) required.push(...credentialEnvNames(role));
  return required.filter((name) => !env[name]);
}
