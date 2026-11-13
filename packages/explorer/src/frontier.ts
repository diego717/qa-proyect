import { isForbidden } from './never-click.ts';
import type { Target } from './target.ts';

export type LinkClass = 'crawl' | 'external' | 'never-click' | 'out-of-scope' | 'not-a-page';

const DOWNLOAD = /\.(pdf|zip|csv|xlsx|docx|png|jpe?g|gif|svg|mp4)$/i;

/**
 * Canonical form of a page URL, so the same page is visited once:
 * absolute, no fragment, no trailing slash, query parameters sorted. Null if not http(s).
 */
export function normalizeUrl(href: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** True if the link is forbidden in its raw or percent-decoded form (servers decode `%64elete` as `delete`). */
export function isForbiddenUrl(url: string, text: string, extra: string[]): boolean {
  const parsed = new URL(url);
  const raw = `${parsed.pathname}${parsed.search}`;
  return isForbidden({ text, href: raw }, extra) || isForbidden({ text, href: safeDecode(raw) }, extra);
}

/**
 * What the crawler does with a link. Never-click is checked first, for every origin:
 * a forbidden link is never visited nor checked. Scope patterns are regexes over the decoded path only.
 */
export function classifyLink(link: { href: string; text: string }, target: Target): LinkClass {
  const url = normalizeUrl(link.href, target.baseUrl);
  if (!url) return 'not-a-page';
  if (isForbiddenUrl(url, link.text, target.neverClick)) return 'never-click';
  const parsed = new URL(url);
  if (parsed.origin !== new URL(target.baseUrl).origin) return 'external';
  if (DOWNLOAD.test(parsed.pathname)) return 'not-a-page';
  const path = safeDecode(parsed.pathname);
  const { include, exclude } = target.scope;
  if (include.length && !include.some((pattern) => new RegExp(pattern).test(path))) return 'out-of-scope';
  if (exclude.some((pattern) => new RegExp(pattern).test(path))) return 'out-of-scope';
  return 'crawl';
}
