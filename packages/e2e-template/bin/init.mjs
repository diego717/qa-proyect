#!/usr/bin/env node
// Installs the e2e template (e2e/ + .github/workflows/e2e.yml) into a client repository.
// Usage: node packages/e2e-template/bin/init.mjs <targetDir> [--force]
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_TEMPLATE_DIR = fileURLToPath(new URL('../template/', import.meta.url));

// Generated or secret files that must never travel to a client repo.
const EXCLUDED = new Set(['node_modules', '.auth', 'results', 'test-results', 'playwright-report', '.env']);

async function listFiles(root, dir = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    const relative = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

/**
 * @param {{ targetDir: string, force?: boolean, templateDir?: string }} options
 * @returns {Promise<{ created: string[], skipped: string[], overwritten: string[] }>}
 */
export async function initTemplate({ targetDir, force = false, templateDir = DEFAULT_TEMPLATE_DIR }) {
  if (!existsSync(targetDir) || !(await stat(targetDir)).isDirectory()) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }
  const result = { created: [], skipped: [], overwritten: [] };
  for (const file of await listFiles(templateDir)) {
    const destination = path.join(targetDir, ...file.split('/'));
    const exists = existsSync(destination);
    if (exists && !force) {
      result.skipped.push(file);
      continue;
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(templateDir, ...file.split('/')), destination);
    (exists ? result.overwritten : result.created).push(file);
  }
  return result;
}

async function main(argv) {
  const force = argv.includes('--force');
  const [targetDir] = argv.filter((arg) => arg !== '--force');
  if (!targetDir) {
    console.error('Usage: init.mjs <targetDir> [--force]');
    return 1;
  }
  try {
    const { created, skipped, overwritten } = await initTemplate({ targetDir: path.resolve(targetDir), force });
    const print = (label, list) => list.length && console.log(`${label} (${list.length}):\n${list.map((f) => `  ${f}`).join('\n')}`);
    print('Created', created);
    print('Overwritten', overwritten);
    print('Skipped, already exists (use --force to overwrite)', skipped);
    console.log('\nNext: cd e2e && npm install && npx playwright install chromium, then edit e2e/qa.config.ts');
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
