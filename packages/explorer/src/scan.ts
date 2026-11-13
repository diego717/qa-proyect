import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { isLoginUrl } from '../../e2e-template/template/e2e/lib/login-form.ts';
import { authenticate } from './login.ts';
import { classifyLink, normalizeUrl } from './frontier.ts';
import { measured, watchPage } from './checks/page-events.ts';
import type { Finding, PageRecord, ScanResult, SkippedLink } from './finding.ts';
import type { Target } from './target.ts';

export type ScanOptions = {
  outDir: string;
  env?: NodeJS.ProcessEnv;
  headless?: boolean;
  /** Sees every request the scan makes (browser and link checks). For tests and diagnostics. */
  onRequest?: (method: string, url: string) => void;
  /** Runs on the browser context before the login. For tests (e.g. routing a fake third party). */
  prepareContext?: (context: BrowserContext) => Promise<void>;
};

const NAV_TIMEOUT = 30_000;

/** Drops findings that match a `known_noise` pattern (case-insensitive substring). */
function isKnownNoise(finding: Finding, target: Target): boolean {
  const text = `${finding.title} ${finding.url} ${finding.evidence.detail ?? ''}`.toLowerCase();
  return target.knownNoise.some((noise) => text.includes(noise.pattern.toLowerCase()));
}

function write(outDir: string, result: ScanResult): ScanResult {
  result.finishedAt = new Date().toISOString();
  writeFileSync(path.join(outDir, 'findings', 'measured.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

/**
 * Read-only crawl of the audit target: only GET navigations through <a href> links, starting at
 * scope.start, breadth first, up to scope.maxPages. Writes findings/measured.json and evidence/<id>.png.
 */
export async function runScan(target: Target, options: ScanOptions): Promise<ScanResult> {
  const { outDir, env = process.env } = options;
  mkdirSync(path.join(outDir, 'findings'), { recursive: true });
  mkdirSync(path.join(outDir, 'evidence'), { recursive: true });

  const result: ScanResult = {
    target: { id: target.id, name: target.name, baseUrl: target.baseUrl, mode: target.mode },
    startedAt: new Date().toISOString(),
    finishedAt: '',
    status: 'completed',
    pages: [],
    skippedLinks: [],
    findings: [],
  };

  const browser = await chromium.launch({ headless: options.headless ?? true });
  try {
    let context: BrowserContext;
    try {
      context = await authenticate(browser, target, env, async (ctx) => {
        if (options.onRequest) ctx.on('request', (request) => options.onRequest?.(request.method(), request.url()));
        await options.prepareContext?.(ctx);
      });
    } catch (error) {
      // Messages from authenticate never include credential values.
      result.status = 'blocked';
      result.blockedReason = (error as Error).message;
      return write(outDir, result);
    }

    const page = await context.newPage();
    await crawl(page, target, result, outDir);

    if (!result.pages.some((p) => p.status === 'scanned')) {
      result.status = 'blocked';
      const first = result.pages[0];
      result.blockedReason = first ? `No page could be scanned: ${first.reason ?? 'unknown'}` : 'No start page';
    }
    return write(outDir, result);
  } finally {
    await browser.close();
  }
}

async function crawl(page: Page, target: Target, result: ScanResult, outDir: string): Promise<void> {
  const loginUrl = target.loginPath ? new URL(target.loginPath, target.baseUrl).href : null;
  const queue: string[] = [];
  const seen = new Set<string>();
  const linkText = new Map<string, string>();
  const skipped = new Set<string>();
  const findingIds = new Set<string>();

  const skip = (link: SkippedLink) => {
    const key = `${link.url}|${link.reason}`;
    if (skipped.has(key)) return;
    skipped.add(key);
    result.skippedLinks.push(link);
  };

  for (const start of target.scope.start) {
    const url = normalizeUrl(start, target.baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      queue.push(url);
    }
  }

  while (queue.length) {
    const url = queue.shift() as string;
    if (result.pages.length >= target.scope.maxPages) {
      skip({ url, text: linkText.get(url) ?? '', reason: 'max-pages' });
      continue;
    }

    const watcher = watchPage(page, target);
    const response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT }).catch(() => null);
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    const pageFindings = watcher.stop();

    if (!response) {
      result.pages.push({ url, status: 'blocked', reason: 'did not load' });
      continue;
    }
    const finalUrl = page.url();
    if (loginUrl && isLoginUrl(finalUrl, loginUrl) && !isLoginUrl(url, loginUrl)) {
      result.pages.push({ url, status: 'blocked', reason: 'session lost' });
      continue;
    }

    const status = response.status();
    const record: PageRecord = { url, status: 'scanned', httpStatus: status, title: await page.title().catch(() => '') };
    result.pages.push(record);
    if (status >= 500) {
      pageFindings.push(
        measured('http-error', url, `GET ${url}`, {
          title: `Error del servidor (HTTP ${status})`,
          severity: 'critical',
          severitySource: 'HTTP 5xx',
          detail: `GET ${url} → HTTP ${status}`,
        }),
      );
    }

    const links = await page
      .$$eval('a[href]', (anchors) => anchors.map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent ?? '').trim() })))
      .catch(() => [] as { href: string; text: string }[]);
    for (const link of links) {
      const normalized = normalizeUrl(link.href, finalUrl);
      const kind = classifyLink({ href: normalized ?? link.href, text: link.text }, target);
      if (kind === 'crawl' && normalized) {
        if (!seen.has(normalized)) {
          seen.add(normalized);
          linkText.set(normalized, link.text);
          queue.push(normalized);
        }
      } else if (kind === 'never-click' || kind === 'out-of-scope' || kind === 'not-a-page') {
        skip({ url: normalized ?? link.href, text: link.text, reason: kind });
      }
    }

    const fresh = pageFindings.filter((f) => !isKnownNoise(f, target) && !findingIds.has(f.id));
    if (fresh.length) {
      const shot = await page.screenshot({ fullPage: true }).catch(() => null);
      for (const finding of fresh) {
        findingIds.add(finding.id);
        if (shot) {
          finding.evidence.screenshot = `evidence/${finding.id}.png`;
          writeFileSync(path.join(outDir, finding.evidence.screenshot), shot);
        }
        result.findings.push(finding);
      }
    }
  }
}
