import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { APIRequestContext } from '@playwright/test';
import { measured } from './page-events.ts';
import { isForbiddenUrl } from '../frontier.ts';
import type { Finding } from '../finding.ts';

export type LinkToCheck = { url: string; text: string; foundOn: string; thirdParty: boolean };

export type LinkCheckOptions = {
  /** Same-origin hops: carries the audit session. */
  sessionRequest: APIRequestContext;
  /** Third-party hops: no cookies, never the prospect's session. */
  anonymousRequest: APIRequestContext;
  origin: string;
  /** Never-click and scope policy for same-origin hops (the crawler's own rules). */
  allowSameOrigin: (url: string) => boolean;
  onRequest?: (method: string, url: string) => void;
  /** Injectable for tests; defaults to a DNS lookup that rejects private addresses. */
  isPublicHost?: (hostname: string) => Promise<boolean>;
};

const MAX_HOPS = 5;

const v4 = (ip: string) => ip.split('.').map(Number);

/** False for loopback, private, link-local (cloud metadata), CGNAT, unspecified and IPv6 local ranges. */
export function isPublicAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(.+)$/);
  if (mapped) {
    const inner = mapped[1];
    if (isIP(inner) === 4) return isPublicAddress(inner);
    const hex = inner.split(':').map((h) => parseInt(h, 16));
    if (hex.length === 2) return isPublicAddress(`${hex[0] >> 8}.${hex[0] & 255}.${hex[1] >> 8}.${hex[1] & 255}`);
    return false;
  }
  if (isIP(ip) === 4) {
    const [a, b] = v4(ip);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return a < 224;
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return false;
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)) return false;
    return true;
  }
  return false;
}

async function defaultIsPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (isIP(host)) return isPublicAddress(host);
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address));
  } catch {
    return false;
  }
}

/**
 * Follows a link hop by hop (no automatic redirects) so every hop is checked against the policy.
 * Returns the final status, or null when a hop is not allowed (nothing to report).
 */
async function finalStatus(method: 'HEAD' | 'GET', url: string, options: LinkCheckOptions): Promise<number | null> {
  const isPublicHost = options.isPublicHost ?? defaultIsPublicHost;
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const parsed = new URL(current);
    const sameOrigin = parsed.origin === options.origin;
    const allowed = sameOrigin
      ? options.allowSameOrigin(current)
      : !isForbiddenUrl(current, '', []) && (await isPublicHost(parsed.hostname));
    if (!allowed) return null;
    const request = sameOrigin ? options.sessionRequest : options.anonymousRequest;
    options.onRequest?.(method, current);
    const response = await request.fetch(current, { method, timeout: 15_000, maxRedirects: 0, failOnStatusCode: false });
    const location = response.headers()['location'];
    if (response.status() >= 300 && response.status() < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    return response.status();
  }
  return null; // too many redirects: not reported
}

/**
 * Checks each link once with HEAD, confirming any error with GET. Never-click links are never
 * passed here: even a HEAD can have side effects in a badly built app.
 * Only 404/410 and 5xx count: 401/403 from other sites are usually bot protection, not broken links.
 */
export async function checkLinks(links: LinkToCheck[], options: LinkCheckOptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const link of links) {
    let status: number | null;
    try {
      status = await finalStatus('HEAD', link.url, options);
      // Many apps answer HEAD with 404/405/501 while GET works: an error is always confirmed with GET.
      if (status !== null && status >= 400) status = await finalStatus('GET', link.url, options);
    } catch {
      continue; // Network failures of external sites are not attributable to the prospect.
    }
    if (status === null) continue;
    if (status !== 404 && status !== 410 && status < 500) continue;
    // A same-origin page answering 5xx is reported once, as http-error, when the crawler visits it.
    if (status >= 500 && !link.thirdParty) continue;
    findings.push(
      measured('broken-link', link.foundOn, link.url, {
        title: status >= 500 ? `Link a una página que da error (HTTP ${status})` : `Link roto (HTTP ${status})`,
        severity: status >= 500 ? 'serious' : 'moderate',
        severitySource: `HTTP ${status}`,
        detail: `${link.url} → HTTP ${status}`,
        thirdParty: link.thirdParty,
        steps: [
          `Abrir ${link.foundOn} con la sesión del usuario de prueba.`,
          `Hacer click en el link "${link.text || link.url}" (${link.url}).`,
          `La página de destino responde HTTP ${status}.`,
        ],
      }),
    );
  }
  return findings;
}
