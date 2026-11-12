export type Credentials = { email: string; password: string; totpSecret?: string };

/** "power-user" -> "POWER_USER" */
function envRole(role: string): string {
  return role.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/**
 * Reads a test user's credentials from E2E_<ROLE>_EMAIL / _PASSWORD / _TOTP_SECRET.
 * Fails fast with the exact variable names, so a missing CI secret is obvious
 * instead of surfacing as a login timeout.
 */
export function credentialsFor(role: string, env: NodeJS.ProcessEnv = process.env): Credentials {
  const prefix = `E2E_${envRole(role)}`;
  const emailVar = `${prefix}_EMAIL`;
  const passwordVar = `${prefix}_PASSWORD`;
  const missing = [emailVar, passwordVar].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing E2E credentials for role "${role}": set ${missing.join(', ')}`);
  }
  return {
    email: env[emailVar] as string,
    password: env[passwordVar] as string,
    totpSecret: env[`${prefix}_TOTP_SECRET`] || undefined,
  };
}
