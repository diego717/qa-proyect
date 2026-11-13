import { test, expect, request as playwrightRequest } from '@playwright/test';
import http from 'node:http';
import { checkLinks, isPublicAddress, publicFetch } from '../src/checks/links.ts';

test('private, loopback, link-local and metadata addresses are not public', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    expect(isPublicAddress(ip), ip).toBe(false);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700::1111']) {
    expect(isPublicAddress(ip), ip).toBe(true);
  }
});

test('IPv6 is deny-by-default and embedded IPv4 is checked', () => {
  for (const ip of [
    '64:ff9b::7f00:1', // NAT64 of 127.0.0.1
    '64:ff9b::a9fe:a9fe', // NAT64 of 169.254.169.254
    '2002:7f00:1::', // 6to4 of 127.0.0.1
    '::7f00:1', // IPv4-compatible 127.0.0.1
    'fec0::1', // site-local
    'ff02::1', // multicast
    '2001:db8::1', // documentation
    '2001:0:4136:e378::1', // Teredo
    '100::1', // discard-only
  ]) {
    expect(isPublicAddress(ip), ip).toBe(false);
  }
  expect(isPublicAddress('64:ff9b::808:808')).toBe(true); // NAT64 of 8.8.8.8
  expect(isPublicAddress('2002:808:808::1')).toBe(true); // 6to4 of 8.8.8.8
});

test('third-party links to private hosts are never requested; same-origin links are', async () => {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const session = await playwrightRequest.newContext();
  try {
    const options = {
      sessionRequest: session,
      origin: 'http://app.test',
      allowSameOrigin: () => true,
    };
    const thirdParty = await checkLinks([{ url: `${base}/x`, text: 'x', foundOn: 'http://app.test/', thirdParty: true }], options);
    expect(thirdParty).toEqual([]);
    expect(hits).toBe(0);

    const sameOrigin = await checkLinks([{ url: `${base}/y`, text: 'y', foundOn: `${base}/`, thirdParty: false }], { ...options, origin: base });
    expect(sameOrigin).toHaveLength(1);
    expect(hits).toBeGreaterThan(0);
  } finally {
    await session.dispose();
    server.close();
  }
});

test('a same-origin redirect hop that the policy forbids is not followed', async () => {
  const paths: string[] = [];
  const server = http.createServer((req, res) => {
    paths.push(`${req.method} ${req.url}`);
    if (req.url === '/go') {
      res.writeHead(302, { location: '/danger' });
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const session = await playwrightRequest.newContext();
  try {
    const findings = await checkLinks([{ url: `${base}/go`, text: 'Go', foundOn: `${base}/`, thirdParty: false }], {
      sessionRequest: session,
      origin: base,
      allowSameOrigin: (url) => !url.includes('/danger'),
    });
    expect(findings).toEqual([]);
    expect(paths.filter((p) => p.includes('/danger'))).toEqual([]);
  } finally {
    await session.dispose();
    server.close();
  }
});

test('third-party requests check the address at connect time (no DNS rebinding window)', async () => {
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    res.writeHead(200);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  // A resolver that answers with a loopback address, as a rebinding attacker's DNS would on the second lookup.
  const rebinding = (_host: string, _options: object, callback: (err: Error | null, address: string, family: number) => void) =>
    callback(null, '127.0.0.1', 4);
  try {
    await expect(publicFetch('HEAD', `http://rebind.test:${port}/`, { lookup: rebinding })).rejects.toThrow(/not a public address/);
    expect(hits).toBe(0);
  } finally {
    server.close();
  }
});
