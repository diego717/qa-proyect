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

const pathOf = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
};

/** What the crawler does with a link. Never-click is checked before scope: a forbidden link is never visited. */
export function classifyLink(link: { href: string; text: string }, target: Target): LinkClass {
  const url = normalizeUrl(link.href, target.baseUrl);
  if (!url) return 'not-a-page';
  if (new URL(url).origin !== new URL(target.baseUrl).origin) return 'external';
  if (DOWNLOAD.test(new URL(url).pathname)) return 'not-a-page';
  if (isForbidden({ text: link.text, href: url }, target.neverClick)) return 'never-click';
  const path = pathOf(url);
  const { include, exclude } = target.scope;
  if (include.length && !include.some((pattern) => new RegExp(pattern).test(path))) return 'out-of-scope';
  if (exclude.some((pattern) => new RegExp(pattern).test(path))) return 'out-of-scope';
  return 'crawl';
}
