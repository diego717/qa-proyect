// Planted bugs ("lab") used to prove that the explorer finds each kind of problem.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

async function start(options) {
  const server = createServer(options);
  return { server, base: await listen(server) };
}

async function login(base) {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'user@demo.test', password: 'user-pass' }).toString(),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

const LAB_PAGES = [
  '/lab/clean',
  '/lab/broken-link',
  '/lab/broken-image',
  '/lab/server-error',
  '/lab/js-error',
  '/lab/unlabeled',
  '/lab/form',
  '/lab/form-ok',
  '/lab/slow',
  '/lab/delete-all',
  '/lab/redirect',
  '/lab/archive',
  '/lab/shared-a',
  '/lab/shared-b',
  '/lab/form-back',
];

let lab;
let cookie;
before(async () => {
  lab = await start({ plantedBugs: true });
  cookie = await login(lab.base);
});
after(() => lab.server.close());

const get = (path, base = lab.base) => fetch(`${base}${path}`, { headers: { cookie }, redirect: 'manual' });
const post = (path, data) =>
  fetch(`${lab.base}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  });

test('lab routes do not exist unless plantedBugs is on', async () => {
  const plain = await start({});
  try {
    const plainCookie = await login(plain.base);
    const lab404 = await fetch(`${plain.base}/lab`, { headers: { cookie: plainCookie } });
    assert.equal(lab404.status, 404);
    const items = await (await fetch(`${plain.base}/items`, { headers: { cookie: plainCookie } })).text();
    assert.ok(!items.includes('href="/lab"'));
  } finally {
    plain.server.close();
  }
  const items = await (await get('/items')).text();
  assert.ok(items.includes('<a href="/lab">Lab</a>'));
});

test('lab index links to every planted page', async () => {
  const html = await (await get('/lab')).text();
  for (const path of LAB_PAGES) assert.ok(html.includes(`href="${path}"`), `missing link to ${path}`);
  assert.match(html, /<a href="\/lab\/delete-all">Delete all<\/a>/);
});

test('server-error responds 500 and missing responds 404', async () => {
  assert.equal((await get('/lab/server-error')).status, 500);
  assert.equal((await get('/lab/missing')).status, 404);
  assert.ok((await (await get('/lab/broken-link')).text()).includes('href="/lab/missing"'));
  assert.ok((await (await get('/lab/broken-image')).text()).includes('src="/lab/missing.png"'));
});

test('form accepts an invalid email, form-ok rejects it with 400 and an alert', async () => {
  const accepted = await post('/lab/form', { email: 'not-an-email' });
  assert.equal(accepted.status, 200);
  assert.ok((await accepted.text()).includes('<p>Saved</p>'));
  const rejected = await post('/lab/form-ok', { email: 'not-an-email' });
  assert.equal(rejected.status, 400);
  assert.ok((await rejected.text()).includes('<p role="alert">Invalid email</p>'));
  const valid = await post('/lab/form-ok', { email: 'a@b.test' });
  assert.equal(valid.status, 200);
});

test('delete-all empties the items list', async () => {
  const own = await start({ plantedBugs: true });
  try {
    const ownCookie = await login(own.base);
    const res = await fetch(`${own.base}/lab/delete-all`, { headers: { cookie: ownCookie } });
    assert.equal(res.status, 200);
    const items = await (await fetch(`${own.base}/items`, { headers: { cookie: ownCookie } })).text();
    assert.ok(!items.includes('Seed item'));
  } finally {
    own.server.close();
  }
});

test('slow responds after at least 1900 ms', async () => {
  const started = Date.now();
  const res = await get('/lab/slow');
  assert.equal(res.status, 200);
  assert.ok(Date.now() - started >= 1900, `took ${Date.now() - started} ms`);
});

test('redirect leads to delete-all, archive-item deletes behind an innocent path', async () => {
  const redirected = await get('/lab/redirect');
  assert.equal(redirected.status, 303);
  assert.equal(redirected.headers.get('location'), '/lab/delete-all');
  const archive = await (await get('/lab/archive')).text();
  assert.ok(archive.includes('<a href="/lab/archive-item">Archived item</a>'));
  assert.ok(archive.includes('<a href="/lab/archive-item">Delete</a>'));
  const own = await start({ plantedBugs: true });
  try {
    const ownCookie = await login(own.base);
    await fetch(`${own.base}/lab/archive-item`, { headers: { cookie: ownCookie } });
    const items = await (await fetch(`${own.base}/items`, { headers: { cookie: ownCookie } })).text();
    assert.ok(!items.includes('Seed item'));
  } finally {
    own.server.close();
  }
});

test('form-ok accepts a valid email that contains an "s" and a dot', async () => {
  assert.equal((await post('/lab/form-ok', { email: 'test@demo.test' })).status, 200);
  assert.equal((await post('/lab/form-ok', { email: 'test@demotest' })).status, 400);
});

test('form-back redirects back with an error on invalid input', async () => {
  const res = await post('/lab/form-back', { email: 'not-an-email' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/lab/form-back?error=1');
  assert.ok((await (await get('/lab/form-back?error=1')).text()).includes('role="alert"'));
});

test('shared-a and shared-b use the same missing logo', async () => {
  for (const page of ['/lab/shared-a', '/lab/shared-b']) assert.ok((await (await get(page)).text()).includes('src="/lab/missing-logo.png"'));
});
