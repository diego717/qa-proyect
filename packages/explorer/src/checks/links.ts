import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { APIRequestContext } from '@playwright/test';
import { measured } from './page-events.ts';
import { isForbiddenUrl } from '../frontier.ts';
import type { Finding } from '../finding.ts';

export type LinkToCheck = { url: string; text: string; foundOn: string; thirdParty: boolean };

export type LinkCheckOptions = {
  /** Same-origin hops: carries the audit session. */
  sessionRequest: APIRequestContext;
  origin: string;
  /** Never-click and scope policy for same-origin hops (the crawler's own rules). */
  allowSameOrigin: (url: string) => boolean;
  onRequest?: (method: string, url: string) => void;
  /** Third-party hops: no cookies, public addresses only. Injectable for tests. */
  thirdPartyFetch?: typeof publicFetch;
};

const MAX_HOPS = 5;

function expandIPv6(ip: string): number[] | null {
  let address = ip.toLowerCase().split('%')[0];
  const v4Tail = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const [a, b, c, d] = v4Tail[1].split('.').map(Number);
    address = address.slice(0, -v4Tail[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const compressed = address.includes('::');
  const [head, tail] = address.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (compressed ? missing < 0 : headParts.length !== 8) return null;
  const groups = [...headParts, ...Array(compressed ? missing : 0).fill('0'), ...tailParts].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const v4FromGroups = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function isPublicIPv4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, documentation
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  return a < 224; // multicast and reserved above
}

/**
 * Deny by default. IPv4: everything but private, loopback, link-local (cloud metadata), CGNAT and reserved ranges.
 * IPv6: only global unicast (2000::/3); addresses that embed an IPv4 (mapped, compatible, NAT64, 6to4) are judged
 * by that IPv4; Teredo, documentation and ORCHID ranges are refused.
 */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) return isPublicIPv4(ip);
  if (isIP(ip) !== 6) return false;
  const g = expandIPv6(ip);
  if (!g) return false;
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 5) && g[5] === 0xffff) return isPublicIPv4(v4FromGroups(g[6], g[7])); // ::ffff:a.b.c.d
  if (zeros(0, 6)) return g[6] === 0 && g[7] <= 1 ? false : isPublicIPv4(v4FromGroups(g[6], g[7])); // ::, ::1, ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isPublicIPv4(v4FromGroups(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPublicIPv4(v4FromGroups(g[1], g[2])); // 6to4
  if ((g[0] & 0xe000) !== 0x2000) return false; // not global unicast: ULA, link/site-local, multicast, 100::/64...
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false; // documentation
  if (g[0] === 0x2001 && (g[1] & 0xfff0) === 0x10) return false; // ORCHID
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
export type LookupFn = (hostname: string, options: object, callback: LookupCallback) => void;

/** Wraps a DNS lookup so the connection itself refuses non-public addresses: no window for DNS rebinding. */
function publicOnly(base: LookupFn): LookupFn {
  return (hostname, options, callback) => {
    base(hostname, options, (err, address, family) => {
      if (err) return callback(err, address, family);
      const all = Array.isArray(address) ? address.map((a) => a.address) : [address];
      const bad = all.find((a) => !isPublicAddress(a));
      if (bad || !all.length) return callback(new Error(`${bad ?? hostname} is not a public address`), address, family);
      callback(null, address, family);
    });
  };
}

/**
 * One HTTP request to a third-party URL: no cookies, no automatic redirects, and the address is
 * validated when the socket connects. Returns the status and the Location header, if any.
 */
export function publicFetch(
  method: 'HEAD' | 'GET',
  url: string,
  options: { lookup?: LookupFn; timeoutMs?: number } = {},
): Promise<{ status: number; location?: string }> {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if ((isIP(host) && !isPublicAddress(host)) || host === 'localhost' || host.endsWith('.localhost')) {
    return Promise.reject(new Error(`${host} is not a public address`));
  }
  const client = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      parsed,
      {
        method,
        lookup: publicOnly(options.lookup ?? (dnsLookup as unknown as LookupFn)) as unknown as typeof dnsLookup,
        timeout: options.timeoutMs ?? 15_000,
        headers: { 'user-agent': 'qa-explorer link check' },
      },
      (res) => {
        res.resume();
        const location = res.headers.location;
        resolve({ status: res.statusCode ?? 0, ...(location ? { location } : {}) });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Follows a link hop by hop (no automatic redirects) so every hop is checked against the policy.
 * Returns the final status, or null when a hop is not allowed (nothing to report).
 */
async function finalStatus(method: 'HEAD' | 'GET', url: string, options: LinkCheckOptions): Promise<number | null> {
  const thirdPartyFetch = options.thirdPartyFetch ?? publicFetch;
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const parsed = new URL(current);
    const sameOrigin = parsed.origin === options.origin;
    if (sameOrigin ? !options.allowSameOrigin(current) : isForbiddenUrl(current, '', [])) return null;
    options.onRequest?.(method, current);
    let status: number;
    let location: string | undefined;
    if (sameOrigin) {
      const response = await options.sessionRequest.fetch(current, { method, timeout: 15_000, maxRedirects: 0, failOnStatusCode: false });
      status = response.status();
      location = response.headers()['location'];
    } else {
      ({ status, location } = await thirdPartyFetch(method, current));
    }
    if (status >= 300 && status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    return status;
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
