import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Target } from '../src/target.ts';

export const DEMO = 'http://localhost:3100';
export const ADMIN_PASSWORD = 'admin-pass';
export const DEMO_ENV = { AUDIT_EXAMPLE_EMAIL: 'admin@demo.test', AUDIT_EXAMPLE_PASSWORD: ADMIN_PASSWORD };

export function demoTarget(overrides: Partial<Target> = {}, scope: Partial<Target['scope']> = {}): Target {
  return {
    id: 'example',
    name: 'Demo',
    baseUrl: DEMO,
    mode: 'read-only',
    login: {
      path: '/login',
      emailEnv: 'AUDIT_EXAMPLE_EMAIL',
      passwordEnv: 'AUDIT_EXAMPLE_PASSWORD',
      labels: { email: 'Email', password: 'Password', submit: 'Sign in' },
    },
    loginPath: '/login',
    scope: { start: ['/items'], include: [], exclude: [], maxPages: 50, flows: [], maxFlows: 8, ...scope },
    neverClick: [],
    knownNoise: [],
    authorization: { by: 'test', date: '2026-11-12', scope: 'demo' },
    report: { brand: 'QA' },
    ...overrides,
  };
}

export const tempOut = () => mkdtempSync(path.join(tmpdir(), 'qa-scan-'));

/** Puts the demo data back to its seed state. */
export async function resetDemo(): Promise<void> {
  const res = await fetch(`${DEMO}/__test__/reset`, { method: 'POST', headers: { 'x-test-reset-token': 'e2e-reset' } });
  if (res.status !== 204) throw new Error(`demo reset failed: ${res.status}`);
}

/** Items page HTML for a fresh session, to check that a scan changed no data. */
export async function itemsHtml(): Promise<string> {
  const login = await fetch(`${DEMO}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'admin@demo.test', password: ADMIN_PASSWORD }).toString(),
  });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  return (await fetch(`${DEMO}/items`, { headers: { cookie } })).text();
}
