// Regression: the audit user's credentials must never reach anything the scan writes or prints.
// Runs the real CLI against an own demo server whose user has a sentinel password.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error plain ESM module without type declarations
import { createServer } from '../../demo-app/src/server.mjs';
import { tempOut } from './helpers.ts';

const explorerDir = fileURLToPath(new URL('../', import.meta.url));
const EMAIL = 'leak-sentinel@demo.test';
const PASSWORD = 'pw-sentinel-8Kq2!x';

function textFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map((f) => path.join(dir, String(f)))
    .filter((f) => statSync(f).isFile() && /\.(json|md|txt|html|yaml)$/.test(f));
}

test('no credential appears in measured.json, evidence text files or console output', async () => {
  const server = createServer({ plantedBugs: true, users: [{ email: EMAIL, password: PASSWORD, role: 'admin' }] });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const auditDir = path.join(tempOut(), 'leak');
  mkdirSync(auditDir);
  writeFileSync(
    path.join(auditDir, 'target.yaml'),
    `name: Leak check
base_url: http://127.0.0.1:${port}
mode: staging
login:
  path: /login
  email_env: AUDIT_LEAK_EMAIL
  password_env: AUDIT_LEAK_PASSWORD
scope:
  start: [/items]
authorization:
  by: test
  date: 2026-11-13
  scope: leak test
`,
  );
  // Async spawn: the demo server runs in this process, a sync spawn would block it.
  const cli = (...args: string[]) =>
    new Promise<{ stdout: string; stderr: string; status: number | null }>((resolve) => {
      const child = spawn(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'src/cli.ts', ...args], {
        cwd: explorerDir,
        env: { ...process.env, AUDIT_LEAK_EMAIL: EMAIL, AUDIT_LEAK_PASSWORD: PASSWORD },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('close', (status) => resolve({ stdout, stderr, status }));
    });
  try {
    const scan = await cli('scan', auditDir);
    expect(scan.status, scan.stderr).toBe(0);
    const review = await cli('review-file', auditDir);
    expect(review.status, review.stderr).toBe(0);
    writeFileSync(path.join(auditDir, 'summary.md'), 'Resumen de la auditoría de prueba.\n');
    const report = await cli('report', auditDir);
    expect(report.status, report.stderr).toBe(0);

    for (const run of [scan, review, report]) expect(`${run.stdout}${run.stderr}`).not.toContain(PASSWORD);
    const files = textFiles(auditDir);
    expect(files.some((f) => f.endsWith('measured.json'))).toBe(true);
    expect(files.some((f) => f.endsWith('informe.html'))).toBe(true);
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toContain(PASSWORD);
  } finally {
    server.close();
  }
});
