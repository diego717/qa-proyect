import http from 'node:http';
import { randomUUID } from 'node:crypto';

const DEFAULT_USERS = [
  { email: 'user@demo.test', password: 'user-pass', role: 'user' },
  { email: 'admin@demo.test', password: 'admin-pass', role: 'admin' },
];
const SEED_ITEMS = ['Seed item'];

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const layout = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

function loginPage(error) {
  return layout(
    'Sign in',
    `<h1>Sign in</h1>
${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/login">
  <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username">
  <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password">
  <button type="submit">Sign in</button>
</form>`,
  );
}

function itemsPage(items, user, error) {
  return layout(
    'Items',
    `<h1>Items</h1>
<p>Signed in as ${escapeHtml(user.email)}</p>
<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
${error ? `<p role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/items">
  <label for="name">New item</label><input id="name" name="name">
  <button type="submit">Add</button>
</form>
<form method="post" action="/logout"><button type="submit">Sign out</button></form>`,
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e5) req.destroy();
    });
    req.on('end', () => resolve(new URLSearchParams(data)));
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((p) => p.trim().split('='))
      .filter(([k, v]) => k && v !== undefined)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
}

export function createServer({ resetToken, users = DEFAULT_USERS } = {}) {
  let items = [...SEED_ITEMS];
  const sessions = new Map(); // id -> user

  const send = (res, status, html, headers = {}) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
    res.end(html);
  };
  const redirect = (res, location, headers = {}) => {
    res.writeHead(303, { location, ...headers });
    res.end();
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = `${req.method} ${url.pathname}`;
      const user = sessions.get(parseCookies(req.headers.cookie).session);

      if (route === 'POST /__test__/reset') {
        if (!resetToken) return send(res, 404, layout('Not found', '<h1>Not found</h1>'));
        if (req.headers['x-test-reset-token'] !== resetToken) return send(res, 403, layout('Forbidden', '<h1>Forbidden</h1>'));
        items = [...SEED_ITEMS];
        res.writeHead(204);
        return res.end();
      }

      if (route === 'GET /login') return send(res, 200, loginPage());

      if (route === 'POST /login') {
        const body = await readBody(req);
        const match = users.find((u) => u.email === body.get('email') && u.password === body.get('password'));
        if (!match) return send(res, 401, loginPage('Invalid email or password'));
        const id = randomUUID();
        sessions.set(id, match);
        return redirect(res, '/items', { 'set-cookie': `session=${id}; HttpOnly; Path=/; SameSite=Lax` });
      }

      if (!user) return redirect(res, '/login');

      if (route === 'GET /') return redirect(res, '/items');

      if (route === 'POST /logout') {
        sessions.delete(parseCookies(req.headers.cookie).session);
        return redirect(res, '/login', { 'set-cookie': 'session=; Path=/; Max-Age=0' });
      }

      if (route === 'GET /items') return send(res, 200, itemsPage(items, user));

      if (route === 'POST /items') {
        const name = ((await readBody(req)).get('name') ?? '').trim();
        if (!name) return send(res, 400, itemsPage(items, user, 'Name is required'));
        items.push(name);
        return redirect(res, '/items');
      }

      if (route === 'GET /admin') {
        if (user.role !== 'admin') return send(res, 403, layout('Forbidden', '<h1>Forbidden</h1>'));
        return send(res, 200, layout('Admin', `<h1>Admin</h1><p>${users.length} users</p>`));
      }

      return send(res, 404, layout('Not found', '<h1>Not found</h1>'));
    } catch {
      if (!res.headersSent) send(res, 500, layout('Error', '<h1>Internal error</h1>'));
      else res.end();
    }
  });
}
