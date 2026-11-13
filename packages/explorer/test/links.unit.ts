import { test, expect, request as playwrightRequest } from '@playwright/test';
import http from 'node:http';
import { checkLinks, isPublicAddress } from '../src/checks/links.ts';

test('private, loopback, link-local and metadata addresses are not public', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    expect(isPublicAddress(ip), ip).toBe(false);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700::1111']) {
    expect(isPublicAddress(ip), ip).toBe(true);
  }
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
  const anonymous = await playwrightRequest.newContext();
  try {
    const options = {
      sessionRequest: session,
      anonymousRequest: anonymous,
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
    await anonymous.dispose();
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
      anonymousRequest: session,
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
