// Regression: secrets must never end up in files that are uploaded as CI artifacts
// or sent to the ingest service (results.json, which also holds every step title).
// Runs the real demo e2e suite, so it needs packages/demo-app/e2e installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const e2eDir = fileURLToPath(new URL('../e2e/', import.meta.url));
const RESET_TOKEN = 'reset-sentinel-9f3k';
const URL_PASSWORD = 'basic-auth-sentinel-7q2w';
const SECRETS = [RESET_TOKEN, 'user-pass', 'admin-pass', URL_PASSWORD];

function runSuite(extraEnv) {
  const env = {
    ...process.env,
    E2E_BASE_URL: 'http://localhost:3000',
    E2E_RESET_TOKEN: RESET_TOKEN,
    E2E_USER_EMAIL: 'user@demo.test',
    E2E_USER_PASSWORD: 'user-pass',
    E2E_ADMIN_EMAIL: 'admin@demo.test',
    E2E_ADMIN_PASSWORD: 'admin-pass',
    ...extraEnv,
  };
  // Fresh outputs every run, so a stale results.json can never make a test pass.
  for (const dir of ['results', 'test-results', 'playwright-report']) rmSync(path.join(e2eDir, dir), { recursive: true, force: true });
  const run = spawnSync('npx playwright test', { cwd: e2eDir, env, shell: true, encoding: 'utf8' });
  return `${run.stdout}${run.stderr}`;
}

function textFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map((f) => path.join(dir, f))
    .filter((f) => statSync(f).isFile() && /\.(json|md|txt|html)$/.test(f));
}

function leaksIn(files) {
  const found = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const secret of SECRETS) if (content.includes(secret)) found.push(`${secret} in ${path.relative(e2eDir, file)}`);
  }
  return found;
}

// The HTML report embeds its data as a base64 zip inside index.html. Minimal zip reader (stored/deflate).
function htmlReportTexts() {
  const html = path.join(e2eDir, 'playwright-report', 'index.html');
  if (!existsSync(html)) return [];
  const match = readFileSync(html, 'utf8').match(/data:application\/zip;base64,([A-Za-z0-9+/=]+)/);
  if (!match) return [];
  const zip = Buffer.from(match[1], 'base64');
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = zip.readUInt32LE(eocd + 16);
  const texts = [];
  for (let i = 0; i < zip.readUInt16LE(eocd + 10); i++) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const local = zip.readUInt32LE(offset + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    texts.push((method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return texts;
}

const uploaded = () =>
  [path.join(e2eDir, 'results', 'results.json'), ...textFiles(path.join(e2eDir, 'test-results'))].filter((f) => existsSync(f));

function allLeaks() {
  const found = leaksIn(uploaded());
  for (const text of htmlReportTexts()) for (const secret of SECRETS) if (text.includes(secret)) found.push(`${secret} in HTML report`);
  return [...new Set(found)];
}

test('a passing run leaks no password or reset token', () => {
  runSuite({});
  assert.ok(existsSync(path.join(e2eDir, 'results', 'results.json')), 'results.json was not produced');
  assert.deepEqual(allLeaks(), []);
});

test('basic-auth credentials in E2E_BASE_URL do not leak when staging is unreachable', () => {
  const output = runSuite({ E2E_BASE_URL: `http://qa:${URL_PASSWORD}@127.0.0.1:9` });
  assert.match(output, /E2E_BASE_URL must not contain credentials/);
  assert.ok(!output.includes(URL_PASSWORD), 'console output leaked the URL password');
  assert.deepEqual(allLeaks(), []);
});

test('a run against unreachable staging leaks no reset token', () => {
  runSuite({ E2E_BASE_URL: 'http://127.0.0.1:9' });
  assert.deepEqual(allLeaks(), []);
});
