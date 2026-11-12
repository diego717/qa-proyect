export type Credentials = { email: string; password: string; totpSecret?: string };

/** "power-user" -> "POWER_USER" */
function envRole(role: string): string {
  return role.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/** Required variable names for a role: [E2E_<ROLE>_EMAIL, E2E_<ROLE>_PASSWORD]. */
export function credentialEnvNames(role: string): [string, string] {
  const prefix = `E2E_${envRole(role)}`;
  return [`${prefix}_EMAIL`, `${prefix}_PASSWORD`];
}

/**
 * Reads a test user's credentials from E2E_<ROLE>_EMAIL / _PASSWORD / _TOTP_SECRET.
 * Fails fast with the exact variable names, so a missing CI secret is obvious
 * instead of surfacing as a login timeout.
 */
export function credentialsFor(role: string, env: NodeJS.ProcessEnv = process.env): Credentials {
  const [emailVar, passwordVar] = credentialEnvNames(role);
  const missing = [emailVar, passwordVar].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing E2E credentials for role "${role}": set ${missing.join(', ')}`);
  }
  return {
    email: env[emailVar] as string,
    password: env[passwordVar] as string,
    totpSecret: env[`E2E_${envRole(role)}_TOTP_SECRET`] || undefined,
  };
}
