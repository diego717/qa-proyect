#!/usr/bin/env node
// Smoke test for an execution environment: can it launch Chromium and load a URL?
// Usage: node scripts/browser-check.mjs <url>
// Prints "OK <status> <title>" (exit 0) or "FAIL <reason>" (exit 1).
import { chromium } from '@playwright/test';

const url = process.argv[2];
if (!url) {
  console.error('Usage: browser-check.mjs <url>');
  process.exit(1);
}

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const response = await page.goto(url, { timeout: 30_000 });
  console.log(`OK ${response?.status() ?? 'no-response'} ${await page.title()}`);
} catch (error) {
  console.log(`FAIL ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
