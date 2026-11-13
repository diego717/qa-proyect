import { test, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTarget } from '../src/target.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const AUTH = `authorization:
  by: Ana Pérez (CTO)
  date: 2026-11-10
  scope: staging, módulos de ventas
`;

function profile(yaml: string, id = 'acme'): string {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'qa-target-')), 'audits', id);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'target.yaml');
  writeFileSync(file, yaml);
  return file;
}

test('loads a full profile and applies defaults', () => {
  const target = loadTarget(
    profile(`name: Acme
base_url: https://staging.acme.test
login:
  path: /signin
  email_env: AUDIT_ACME_EMAIL
  password_env: AUDIT_ACME_PASSWORD
${AUTH}`),
  );
  expect(target.mode).toBe('read-only');
  expect(target.scope).toEqual({ start: ['/'], include: [], exclude: [], maxPages: 50, flows: [], maxFlows: 8 });
  expect(target.login).toEqual({
    path: '/signin',
    emailEnv: 'AUDIT_ACME_EMAIL',
    passwordEnv: 'AUDIT_ACME_PASSWORD',
    labels: { email: 'Email', password: 'Password', submit: 'Sign in' },
  });
  expect(target.loginPath).toBe('/signin');
  expect(target.report.brand).toBe('QA');
  expect(target.authorization).toEqual({ by: 'Ana Pérez (CTO)', date: '2026-11-10', scope: 'staging, módulos de ventas' });
});

test('fails without authorization', () => {
  expect(() => loadTarget(profile('name: Acme\nbase_url: https://acme.test\n'))).toThrow(/authorization is required/);
});

test('fails when base_url contains credentials, without echoing them', () => {
  let message = '';
  try {
    loadTarget(profile(`name: Acme\nbase_url: https://qa:s3cret-pw@acme.test\n${AUTH}`));
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toMatch(/must not contain credentials/);
  expect(message).not.toContain('s3cret-pw');
});

test('fails on an unknown mode', () => {
  expect(() => loadTarget(profile(`name: Acme\nbase_url: https://acme.test\nmode: prod\n${AUTH}`))).toThrow(
    /mode must be "staging" or "read-only"/,
  );
});

test('credential fields must be AUDIT_* env var names, never values', () => {
  const yaml = `name: Acme
base_url: https://acme.test
login:
  path: /login
  email_env: qa@acme.test
  password_env: AUDIT_ACME_PASSWORD
${AUTH}`;
  let message = '';
  try {
    loadTarget(profile(yaml));
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toMatch(/must be an env var name like AUDIT_/);
  expect(message).not.toContain('qa@acme.test');
});

test('takes the id from the folder name', () => {
  expect(loadTarget(profile(`name: Acme\nbase_url: https://acme.test\n${AUTH}`, 'acme-uy')).id).toBe('acme-uy');
});

test('without credentials, login_path is still used to detect a lost session', () => {
  const target = loadTarget(profile(`name: Acme\nbase_url: https://acme.test\nlogin_path: /login\n${AUTH}`));
  expect(target.login).toBeNull();
  expect(target.loginPath).toBe('/login');
});

test('the committed example profile is valid', () => {
  const target = loadTarget(path.join(repoRoot, 'audits', 'example', 'target.yaml'));
  expect(target.id).toBe('example');
  expect(target.baseUrl).toBe('http://localhost:3100');
  expect(target.mode).toBe('staging');
  expect(target.login?.emailEnv).toBe('AUDIT_EXAMPLE_EMAIL');
  expect(target.scope.start).toEqual(['/items']);
});
