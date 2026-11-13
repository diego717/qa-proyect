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

function itemsPage(items, user, error, plantedBugs = false) {
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
${plantedBugs ? '<p><a href="/lab">Lab</a></p>' : ''}
<form method="post" action="/logout"><button type="submit">Sign out</button></form>`,
  );
}

// Planted bugs for the explorer (only with createServer({ plantedBugs: true })).
// Each page holds exactly one kind of problem, so a scan can prove it finds it.
const LAB_LINKS = [
  ['/lab/clean', 'Clean page'],
  ['/lab/broken-link', 'Broken link'],
  ['/lab/broken-image', 'Broken image'],
  ['/lab/server-error', 'Server error'],
  ['/lab/js-error', 'JavaScript error'],
  ['/lab/unlabeled', 'Unlabeled fields'],
  ['/lab/form', 'Form without validation'],
  ['/lab/form-ok', 'Form with validation'],
  ['/lab/slow', 'Slow page'],
  ['/lab/delete-all', 'Delete all'],
];

const labIndex = () =>
  layout('Lab', `<main><h1>Lab</h1><ul>${LAB_LINKS.map(([href, text]) => `<li><a href="${href}">${text}</a></li>`).join('')}</ul></main>`);

const subscribeForm = (action, message = '') =>
  layout(
    'Subscribe',
    `<main><h1>Subscribe</h1>${message}
<form method="post" action="${action}">
  <label for="sub-email">Email</label><input id="sub-email" name="email" type="email" required>
  <button type="submit">Subscribe</button>
</form></main>`,
  );

const LAB_PAGES = {
  '/lab/clean': () => layout('Clean', '<main><h1>Clean page</h1><p>Nothing wrong here.</p></main>'),
  '/lab/broken-link': () => layout('Broken link', '<main><h1>Broken link</h1><p><a href="/lab/missing">Missing page</a></p></main>'),
  '/lab/broken-image': () => layout('Broken image', '<main><h1>Broken image</h1><img src="/lab/missing.png" alt="Chart"></main>'),
  '/lab/js-error': () =>
    layout(
      'JavaScript error',
      `<main><h1>JavaScript error</h1></main><script>console.error('planted console error'); throw new Error('planted js error');</script>`,
    ),
  '/lab/unlabeled': () =>
    layout(
      'Unlabeled fields',
      `<main><h1>Contact</h1><form method="post" action="/lab/unlabeled">
  <input name="phone">
  <label for="mail">Email</label><input id="mail" name="email" type="text">
  <button type="submit">Send</button>
</form></main>`,
    ),
  '/lab/form': () => subscribeForm('/lab/form'),
  '/lab/form-ok': () => subscribeForm('/lab/form-ok'),
};

const EMAIL = /^[^s@]+@[^s@]+.[^s@]+$/;

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

export function createServer({ resetToken, users = DEFAULT_USERS, plantedBugs = false } = {}) {
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

      if (route === 'GET /items') return send(res, 200, itemsPage(items, user, undefined, plantedBugs));

      if (route === 'POST /items') {
        const name = ((await readBody(req)).get('name') ?? '').trim();
        if (!name) return send(res, 400, itemsPage(items, user, 'Name is required', plantedBugs));
        items.push(name);
        return redirect(res, '/items');
      }

      if (route === 'GET /admin') {
        if (user.role !== 'admin') return send(res, 403, layout('Forbidden', '<h1>Forbidden</h1>'));
        return send(res, 200, layout('Admin', `<h1>Admin</h1><p>${users.length} users</p>`));
      }

      if (plantedBugs && url.pathname.startsWith('/lab')) {
        if (route === 'GET /lab') return send(res, 200, labIndex());
        if (route === 'GET /lab/server-error') return send(res, 500, layout('Error', '<h1>Internal error</h1>'));
        if (route === 'GET /lab/slow') {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return send(res, 200, layout('Slow', '<main><h1>Slow page</h1></main>'));
        }
        if (route === 'GET /lab/delete-all') {
          items = [];
          return send(res, 200, layout('Deleted', '<main><h1>Deleted</h1></main>'));
        }
        if (route === 'POST /lab/form') {
          await readBody(req);
          return send(res, 200, subscribeForm('/lab/form', '<p>Saved</p>'));
        }
        if (route === 'POST /lab/form-ok') {
          const email = (await readBody(req)).get('email') ?? '';
          if (!EMAIL.test(email)) return send(res, 400, subscribeForm('/lab/form-ok', '<p role="alert">Invalid email</p>'));
          return send(res, 200, subscribeForm('/lab/form-ok', '<p>Saved</p>'));
        }
        if (req.method === 'GET' && LAB_PAGES[url.pathname]) return send(res, 200, LAB_PAGES[url.pathname]());
      }

      return send(res, 404, layout('Not found', '<h1>Not found</h1>'));
    } catch {
      if (!res.headersSent) send(res, 500, layout('Error', '<h1>Internal error</h1>'));
      else res.end();
    }
  });
}
