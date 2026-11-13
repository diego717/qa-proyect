// Used by .github/workflows/e2e.yml before `npm ci` (plain Node, no dependencies).
// Exposes every repository secret named E2E_* (one per role, MFA, reset token) as an
// environment variable for the next steps, without listing them in the workflow.
// Usage in CI: ALL_SECRETS='${{ toJSON(secrets) }}' node lib/ci-env.mjs
// Other workflows can load an exact list instead: node lib/ci-env.mjs --names A,B,C
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Set by the workflow itself (matrix): a secret with the same name must not override it.
const WORKFLOW_OWNED = new Set(['E2E_QUARANTINE_MODE']);

/** @param {Record<string, string>} secrets @returns {[string, string][]} */
export function ciEnvEntries(secrets) {
  return Object.entries(secrets).filter(([key]) => key.startsWith('E2E_') && !WORKFLOW_OWNED.has(key));
}

/**
 * Exactly the named secrets that exist, nothing else (never a prefix match).
 * @param {Record<string, string>} secrets @param {string[]} names @returns {[string, string][]}
 */
export function ciEnvByName(secrets, names) {
  for (const name of names) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`invalid secret name "${name}"`);
  }
  return names.filter((name) => Object.hasOwn(secrets, name)).map((name) => [name, secrets[name]]);
}

/** @param {[string, string][]} entries @param {string} delimiter @returns {string} */
export function githubEnvBlock(entries, delimiter) {
  return entries
    .map(([key, value]) => {
      if (value.includes(delimiter)) throw new Error(`${key} contains the GITHUB_ENV delimiter`);
      return `${key}<<${delimiter}\n${value}\n${delimiter}\n`;
    })
    .join('');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secrets = JSON.parse(process.env.ALL_SECRETS || '{}');
  const namesArg = process.argv.indexOf('--names');
  const entries =
    namesArg === -1 ? ciEnvEntries(secrets) : ciEnvByName(secrets, (process.argv[namesArg + 1] ?? '').split(',').filter(Boolean));
  appendFileSync(process.env.GITHUB_ENV, githubEnvBlock(entries, `ENV_EOF_${randomUUID()}`));
  console.log(`Loaded ${entries.length} secret(s): ${entries.map(([key]) => key).join(', ') || 'none'}`);
}
