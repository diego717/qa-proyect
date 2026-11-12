import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.mjs';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

async function startServer(options) {
  const server = createServer(options);
  const base = await listen(server);
  return { server, base };
}

const form = (data) => ({
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(data).toString(),
});

async function login(base, email, password) {
  const res = await fetch(`${base}/login`, form({ email, password }));
  const cookie = res.headers.get('set-cookie');
  return cookie ? cookie.split(';')[0] : null;
}

let app;
before(async () => { app = await startServer({ resetToken: 'secret' }); });
after(() => app.server.close());

test('reset is disabled (404) when no resetToken is configured', async () => {
  for (const resetToken of [undefined, '']) {
    const { server, base } = await startServer({ resetToken });
    try {
      const res = await fetch(`${base}/__test__/reset`, { method: 'POST', headers: { 'x-test-reset-token': '' } });
      assert.equal(res.status, 404);
    } finally {
      server.close();
    }
  }
});

test('reset rejects a wrong token with 403', async () => {
  const res = await fetch(`${app.base}/__test__/reset`, { method: 'POST', headers: { 'x-test-reset-token': 'nope' } });
  assert.equal(res.status, 403);
});

test('reset with the right token restores seed items and returns 204', async () => {
  const cookie = await login(app.base, 'user@demo.test', 'user-pass');
  await fetch(`${app.base}/items`, { ...form({ name: 'temp-item' }), headers: { ...form({}).headers, cookie } });
  const res = await fetch(`${app.base}/__test__/reset`, { method: 'POST', headers: { 'x-test-reset-token': 'secret' } });
  assert.equal(res.status, 204);
  const page = await (await fetch(`${app.base}/items`, { headers: { cookie } })).text();
  assert.ok(page.includes('Seed item'));
  assert.ok(!page.includes('temp-item'));
});

test('invalid login returns 401 with message', async () => {
  const res = await fetch(`${app.base}/login`, form({ email: 'user@demo.test', password: 'wrong' }));
  assert.equal(res.status, 401);
  assert.ok((await res.text()).includes('Invalid email or password'));
});

test('user role gets 403 on /admin', async () => {
  const cookie = await login(app.base, 'user@demo.test', 'user-pass');
  const res = await fetch(`${app.base}/admin`, { headers: { cookie }, redirect: 'manual' });
  assert.equal(res.status, 403);
  assert.ok((await res.text()).includes('Forbidden'));
});

test('admin role sees the admin page', async () => {
  const cookie = await login(app.base, 'admin@demo.test', 'admin-pass');
  const res = await fetch(`${app.base}/admin`, { headers: { cookie }, redirect: 'manual' });
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('<h1>Admin</h1>'));
});

test('empty item name returns 400 "Name is required"', async () => {
  const cookie = await login(app.base, 'user@demo.test', 'user-pass');
  const res = await fetch(`${app.base}/items`, { ...form({ name: '   ' }), headers: { ...form({}).headers, cookie } });
  assert.equal(res.status, 400);
  assert.ok((await res.text()).includes('Name is required'));
});

test('unauthenticated /items redirects to /login', async () => {
  const res = await fetch(`${app.base}/items`, { redirect: 'manual' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/login');
});
