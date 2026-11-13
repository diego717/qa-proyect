import { test, expect } from '@playwright/test';
import { normalizeUrl, classifyLink } from '../src/frontier.ts';
import type { Target } from '../src/target.ts';

const target = (scope: Partial<Target['scope']> = {}, neverClick: string[] = []): Target => ({
  id: 't',
  name: 'T',
  baseUrl: 'http://app.test',
  mode: 'read-only',
  login: null,
  loginPath: null,
  scope: { start: ['/'], include: [], exclude: [], maxPages: 50, flows: [], maxFlows: 8, ...scope },
  neverClick,
  knownNoise: [],
  authorization: { by: 'x', date: '2026-11-12', scope: 'x' },
  report: { brand: 'QA' },
});

const base = 'http://app.test/items';

test('normalizes fragment, trailing slash and query order', () => {
  expect(normalizeUrl('/a/?b=2&a=1#x', base)).toBe('http://app.test/a?a=1&b=2');
  expect(normalizeUrl('http://app.test/a?a=1&b=2', base)).toBe('http://app.test/a?a=1&b=2');
  expect(normalizeUrl('/', base)).toBe('http://app.test/');
  expect(normalizeUrl('mailto:a@b.test', base)).toBeNull();
  expect(normalizeUrl('javascript:void(0)', base)).toBeNull();
});

test('same-origin page links are crawled', () => {
  expect(classifyLink({ href: '/lab/clean', text: 'Clean page' }, target())).toBe('crawl');
  expect(classifyLink({ href: 'http://app.test/reports?tab=2', text: 'Reports' }, target())).toBe('crawl');
});

test('other origins are external, never crawled', () => {
  expect(classifyLink({ href: 'https://twitter.com/acme', text: 'Twitter' }, target())).toBe('external');
  expect(classifyLink({ href: 'https://app.test/items', text: 'Items (https)' }, target())).toBe('external');
});

test('mailto, tel, javascript and downloads are not pages', () => {
  for (const href of ['mailto:a@b.test', 'tel:+59899000000', 'javascript:void(0)', '/files/report.pdf', '/export.CSV', '/a.zip']) {
    expect(classifyLink({ href, text: 'x' }, target()), href).toBe('not-a-page');
  }
});

test('never-click wins over scope', () => {
  expect(classifyLink({ href: '/lab/delete-all', text: 'Delete all' }, target())).toBe('never-click');
  expect(classifyLink({ href: '/archive/1', text: 'One' }, target({}, ['archive']))).toBe('never-click');
});

test('include and exclude patterns limit the scope', () => {
  const t = target({ include: ['/lab'], exclude: ['/lab/slow'] });
  expect(classifyLink({ href: '/lab/clean', text: 'Clean' }, t)).toBe('crawl');
  expect(classifyLink({ href: '/admin', text: 'Admin' }, t)).toBe('out-of-scope');
  expect(classifyLink({ href: '/lab/slow', text: 'Slow' }, t)).toBe('out-of-scope');
});
