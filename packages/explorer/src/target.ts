import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { safeBaseURL } from '../../e2e-template/template/e2e/lib/base-url.ts';

export type Mode = 'staging' | 'read-only';
export type LoginLabels = { email: string; password: string; submit: string; totp?: string };
export type TargetLogin = {
  path: string;
  emailEnv: string;
  passwordEnv: string;
  totpSecretEnv?: string;
  labels: LoginLabels;
};

/** A prospect's audit profile: audits/<id>/target.yaml. Never holds secret values, only env var names. */
export type Target = {
  id: string;
  name: string;
  baseUrl: string;
  mode: Mode;
  login: TargetLogin | null;
  /** login.path, or `login_path` when there are no credentials. Used to detect a lost session. */
  loginPath: string | null;
  scope: { start: string[]; include: string[]; exclude: string[]; maxPages: number; flows: string[]; maxFlows: number };
  neverClick: string[];
  knownNoise: { pattern: string; reason: string }[];
  authorization: { by: string; date: string; scope: string };
  report: { brand: string };
  deliveredOn?: string;
};

const ENV_NAME = /^AUDIT_[A-Z0-9_]+$/;
const DEFAULT_LABELS: LoginLabels = { email: 'Email', password: 'Password', submit: 'Sign in' };

type Raw = Record<string, unknown>;

const fail = (file: string, message: string): never => {
  throw new Error(`${file}: ${message}`);
};

const asRecord = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const asString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const asDate = (value: unknown): string | undefined =>
  value instanceof Date ? value.toISOString().slice(0, 10) : asString(value);

const AUDIT_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

/**
 * The only repository secrets an audit may use: AUDIT_<ID>_EMAIL, _PASSWORD and _TOTP_SECRET.
 * Exact names, never a prefix: with a prefix, audit "acme" would also load the secrets of "acme-uy".
 */
export function auditSecretNames(auditId: string): [email: string, password: string, totpSecret: string] {
  if (!AUDIT_ID.test(auditId)) throw new Error(`invalid audit id "${auditId}": use lower case letters, digits and -`);
  const prefix = `AUDIT_${auditId.toUpperCase().replace(/-/g, '_')}_`;
  return [`${prefix}EMAIL`, `${prefix}PASSWORD`, `${prefix}TOTP_SECRET`];
}

function envName(file: string, field: string, value: unknown, expected: string): string {
  const name = asString(value);
  // Never echo the value: it could be a password pasted by mistake.
  if (!name || !ENV_NAME.test(name)) fail(file, `${field} must be an env var name like AUDIT_<ID>_EMAIL, not a value`);
  if (name !== expected) fail(file, `${field} must be ${expected} (each audit only uses its own secrets)`);
  return name as string;
}

export function loadTarget(file: string): Target {
  const raw = asRecord(parse(readFileSync(file, 'utf8')));
  const id = path.basename(path.dirname(path.resolve(file)));

  const name = asString(raw.name) ?? fail(file, 'name is required');
  const baseUrlRaw = asString(raw.base_url) ?? fail(file, 'base_url is required');
  let baseUrl: string;
  try {
    baseUrl = safeBaseURL(baseUrlRaw).replace(/\/+$/, '');
  } catch (error) {
    // safeBaseURL messages never include the value.
    return fail(file, (error as Error).message.replace('E2E_BASE_URL', 'base_url'));
  }

  const mode = (raw.mode ?? 'read-only') as Mode;
  if (mode !== 'staging' && mode !== 'read-only') fail(file, 'mode must be "staging" or "read-only"');

  const auth = asRecord(raw.authorization);
  const authorization = {
    by: asString(auth.by) ?? '',
    date: asDate(auth.date) ?? '',
    scope: asString(auth.scope) ?? '',
  };
  if (!authorization.by || !authorization.date || !authorization.scope) {
    fail(file, 'authorization is required (by, date, scope): never audit without written permission');
  }

  let login: TargetLogin | null = null;
  if (raw.login !== undefined && raw.login !== null) {
    const l = asRecord(raw.login);
    const labels = asRecord(l.labels);
    const [emailName, passwordName, totpName] = auditSecretNames(id);
    login = {
      path: asString(l.path) ?? '/login',
      emailEnv: envName(file, 'login.email_env', l.email_env, emailName),
      passwordEnv: envName(file, 'login.password_env', l.password_env, passwordName),
      labels: {
        email: asString(labels.email) ?? DEFAULT_LABELS.email,
        password: asString(labels.password) ?? DEFAULT_LABELS.password,
        submit: asString(labels.submit) ?? DEFAULT_LABELS.submit,
        ...(asString(labels.totp) ? { totp: asString(labels.totp) } : {}),
      },
    };
    if (l.totp_secret_env !== undefined) login.totpSecretEnv = envName(file, 'login.totp_secret_env', l.totp_secret_env, totpName);
  }

  const scope = asRecord(raw.scope);
  const maxPages = scope.max_pages === undefined ? 50 : Number(scope.max_pages);
  const maxFlows = scope.max_flows === undefined ? 8 : Number(scope.max_flows);
  if (!Number.isInteger(maxPages) || maxPages < 1) fail(file, 'scope.max_pages must be a positive integer');
  if (!Number.isInteger(maxFlows) || maxFlows < 1) fail(file, 'scope.max_flows must be a positive integer');

  const knownNoise = (Array.isArray(raw.known_noise) ? raw.known_noise : []).map((entry, index) => {
    const e = asRecord(entry);
    const pattern = asString(e.pattern) ?? fail(file, `known_noise[${index}].pattern is required`);
    const reason = asString(e.reason) ?? fail(file, `known_noise[${index}].reason is required: noise must be justified`);
    return { pattern, reason };
  });

  const start = asStrings(scope.start);
  // Patterns are compiled now: an invalid one would otherwise throw mid-crawl (inside the navigation guard).
  const patterns = (field: string, value: unknown) =>
    asStrings(value).map((source, index) => {
      try {
        new RegExp(source, 'i');
      } catch {
        fail(file, `${field}[${index}] is not a valid regular expression`);
      }
      return source;
    });
  const deliveredOn = asDate(raw.delivered_on);
  return {
    id,
    name,
    baseUrl,
    mode,
    login,
    loginPath: login?.path ?? asString(raw.login_path) ?? null,
    scope: {
      start: start.length ? start : ['/'],
      include: patterns('scope.include', scope.include),
      exclude: patterns('scope.exclude', scope.exclude),
      maxPages,
      flows: asStrings(scope.flows),
      maxFlows,
    },
    neverClick: patterns('never_click', raw.never_click),
    knownNoise,
    authorization,
    report: { brand: asString(asRecord(raw.report).brand) ?? 'QA' },
    ...(deliveredOn ? { deliveredOn } : {}),
  };
}
