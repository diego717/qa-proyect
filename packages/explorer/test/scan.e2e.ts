import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runScan } from '../src/scan.ts';
import type { Finding } from '../src/finding.ts';
import { DEMO, DEMO_ENV, ADMIN_PASSWORD, demoTarget, tempOut, resetDemo, itemsHtml } from './helpers.ts';

test.beforeEach(resetDemo);

const at = (findings: Finding[], check: string, pathname: string) =>
  findings.filter((f) => f.check === check && new URL(f.url).pathname === pathname);

test('finds the planted server error, broken image, js error and console error', async () => {
  const outDir = tempOut();
  const result = await runScan(demoTarget(), { outDir, env: DEMO_ENV });
  expect(result.status).toBe('completed');

  const serverError = at(result.findings, 'http-error', '/lab/server-error');
  expect(serverError).toHaveLength(1);
  expect(serverError[0].severity).toBe('critical');
  expect(at(result.findings, 'broken-image', '/lab/broken-image')).toHaveLength(1);
  expect(at(result.findings, 'js-error', '/lab/js-error')).toHaveLength(1);
  expect(at(result.findings, 'console-error', '/lab/js-error')).toHaveLength(1);

  for (const finding of result.findings) {
    expect(finding.source).toBe('measured');
    expect(finding.review.status).toBe('not_required');
    expect(finding.steps.length).toBeGreaterThan(0);
    expect(existsSync(path.join(outDir, finding.evidence.screenshot ?? 'missing')), finding.id).toBe(true);
  }
  const written = JSON.parse(readFileSync(path.join(outDir, 'findings', 'measured.json'), 'utf8'));
  expect(written.findings).toHaveLength(result.findings.length);
});

test('finds the planted broken link, the unlabeled field, the email typed as text and the slow page', async () => {
  const result = await runScan(demoTarget(), { outDir: tempOut(), env: DEMO_ENV });

  const broken = result.findings.filter((f) => f.check === 'broken-link');
  expect(broken).toHaveLength(1);
  expect(broken[0]).toMatchObject({ severity: 'moderate', url: `${DEMO}/lab/broken-link` });
  expect(broken[0].evidence.detail).toContain('/lab/missing');
  expect(broken[0].steps.join(' ')).toContain('/lab/broken-link');

  const a11y = at(result.findings, 'a11y', '/lab/unlabeled');
  expect(a11y.map((f) => f.evidence.detail ?? '').some((d) => d.includes('label'))).toBe(true);
  expect(a11y.every((f) => f.severitySource === 'axe impact')).toBe(true);

  expect(at(result.findings, 'form-static', '/lab/unlabeled')).toHaveLength(1);
  expect(at(result.findings, 'slow-page', '/lab/slow')).toHaveLength(1);
});

test('the pages without planted bugs have no findings at all', async () => {
  const result = await runScan(demoTarget(), { outDir: tempOut(), env: DEMO_ENV });
  for (const pathname of ['/items', '/lab', '/lab/clean', '/lab/form', '/lab/form-ok']) {
    expect(result.findings.filter((f) => new URL(f.url).pathname === pathname), pathname).toEqual([]);
  }
});

test('reports nothing on the clean page', async () => {
  const result = await runScan(demoTarget(), { outDir: tempOut(), env: DEMO_ENV });
  expect(result.pages.find((p) => p.url === `${DEMO}/lab/clean`)?.status).toBe('scanned');
  expect(result.findings.filter((f) => new URL(f.url).pathname === '/lab/clean')).toEqual([]);
});

test('never visits the delete-all link and leaves data untouched', async () => {
  const requested: string[] = [];
  const result = await runScan(demoTarget(), { outDir: tempOut(), env: DEMO_ENV, onRequest: (_m, url) => requested.push(url) });
  expect(result.skippedLinks).toContainEqual({ url: `${DEMO}/lab/delete-all`, text: 'Delete all', reason: 'never-click' });
  expect(requested.filter((url) => url.includes('/lab/delete-all'))).toEqual([]);
  expect(await itemsHtml()).toContain('Seed item');
});

test('the only POST of a read-only scan is the login', async () => {
  const writes: string[] = [];
  await runScan(demoTarget(), {
    outDir: tempOut(),
    env: DEMO_ENV,
    onRequest: (method, url) => {
      if (method !== 'GET' && method !== 'HEAD') writes.push(`${method} ${url}`);
    },
  });
  expect(writes).toEqual([`POST ${DEMO}/login`]);
});

test('stops at max_pages and says so', async () => {
  const result = await runScan(demoTarget({}, { maxPages: 3 }), { outDir: tempOut(), env: DEMO_ENV });
  expect(result.pages).toHaveLength(3);
  expect(result.skippedLinks.some((l) => l.reason === 'max-pages')).toBe(true);
});

test('a wrong password yields a blocked result without leaking it', async () => {
  const outDir = tempOut();
  const sentinel = 'wrong-pass-sentinel-41x';
  const result = await runScan(demoTarget(), { outDir, env: { ...DEMO_ENV, AUDIT_EXAMPLE_PASSWORD: sentinel } });
  expect(result.status).toBe('blocked');
  expect(result.blockedReason).toMatch(/Login failed/);
  expect(result.findings).toEqual([]);
  const written = readFileSync(path.join(outDir, 'findings', 'measured.json'), 'utf8');
  expect(written).not.toContain(sentinel);
  expect(written).not.toContain(ADMIN_PASSWORD);
});

test('missing credentials block the scan and only name the env vars', async () => {
  const result = await runScan(demoTarget(), { outDir: tempOut(), env: {} });
  expect(result.status).toBe('blocked');
  expect(result.blockedReason).toBe('Missing audit credentials: set AUDIT_EXAMPLE_EMAIL, AUDIT_EXAMPLE_PASSWORD');
});

test('pages that bounce to the login are blocked as "session lost"', async () => {
  const result = await runScan(demoTarget({ login: null, loginPath: '/login' }), { outDir: tempOut(), env: {} });
  expect(result.pages[0]).toMatchObject({ url: `${DEMO}/items`, status: 'blocked', reason: 'session lost' });
  expect(result.findings).toEqual([]);
  expect(result.status).toBe('blocked');
  expect(result.blockedReason).toMatch(/session lost/);
});

test('third-party failures are flagged and known_noise is ignored', async () => {
  const target = demoTarget(
    { knownNoise: [{ pattern: 'planted console error', reason: 'test' }] },
    { include: ['/items', '/lab/clean', '/lab/js-error', '/lab$'] },
  );
  const result = await runScan(target, {
    outDir: tempOut(),
    env: DEMO_ENV,
    prepareContext: async (context) => {
      await context.route(`${DEMO}/lab/clean`, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html lang="en"><head><title>Clean</title></head><body><main><h1>Clean</h1><script src="https://cdn.example.test/analytics.js"></script></main></body></html>',
        }),
      );
      await context.route('https://cdn.example.test/**', (route) => route.fulfill({ status: 404, body: 'nope' }));
    },
  });
  const thirdParty = result.findings.filter((f) => f.thirdParty);
  expect(thirdParty).toHaveLength(1);
  expect(thirdParty[0]).toMatchObject({ check: 'http-error', severity: 'moderate' });
  expect(thirdParty[0].evidence.detail).toContain('https://cdn.example.test/analytics.js');
  expect(at(result.findings, 'console-error', '/lab/js-error')).toEqual([]);
  expect(at(result.findings, 'js-error', '/lab/js-error')).toHaveLength(1);
});
