import path from 'node:path';
import { chromium, type BrowserContext, type Page, type Response } from '@playwright/test';
import { isLoginUrl } from '../../e2e-template/template/e2e/lib/login-form.ts';
import { authenticate } from './login.ts';
import { classifyLink, isForbiddenUrl, normalizeUrl } from './frontier.ts';
import { measured, watchPage } from './checks/page-events.ts';
import { checkLinks, type LinkCheckOptions, type LinkToCheck } from './checks/links.ts';
import { checkA11y } from './checks/a11y.ts';
import { measureTiming, timingFindings } from './checks/timing.ts';
import { safeOutputPath, safeWriteFile } from './evidence.ts';
import { checkFormsInvalid, checkFormsStatic, type SubmitControl } from './checks/forms.ts';
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

/** Safety state shared by the navigation guard, the crawler and the link checks. */
export type Guard = {
  target: Target;
  loginUrl: string | null;
  /** True only while authenticate() runs: the one window where the login form may be posted. */
  loggingIn: boolean;
  startUrls: Set<string>;
  /** URLs that any link marked as never-click: never visited, whatever other links say. */
  forbiddenUrls: Set<string>;
  /** The one form submission a staging form check may make: exact URL, used at most once. */
  allowedSubmit: { url: string; used: boolean } | null;
  /** Status of the last navigation the guard fetched (used to read a form submission's outcome). */
  lastNavigationStatus: number | null;
  /** Last navigation the guard refused, to explain why a page did not load. */
  lastBlocked: { url: string; reason: 'never-click' | 'out-of-scope' } | null;
  /** Last redirect the guard stopped: the crawler follows it itself, so the next hop is checked again. */
  lastRedirect: { to: string; verdict: Verdict } | null;
};

type Verdict = 'allow' | 'never-click' | 'out-of-scope';
const MAX_REDIRECTS = 5;

/**
 * Whether a main-frame navigation may happen. Never-click rules come first, for every URL:
 * the login exemption only covers the same-origin login page, and its POST only while logging in.
 */
export function navigationVerdict(guard: Guard, url: string, method: string): Verdict {
  const normalized = normalizeUrl(url, guard.target.baseUrl);
  if (!normalized) return 'out-of-scope';
  if (guard.forbiddenUrls.has(normalized) || isForbiddenUrl(normalized, '', guard.target.neverClick)) return 'never-click';
  const sameOrigin = new URL(normalized).origin === new URL(guard.target.baseUrl).origin;
  const isLogin = sameOrigin && !!guard.loginUrl && isLoginUrl(normalized, guard.loginUrl);
  // While logging in, the login form may post to another path (GET /session/new → POST /session).
  if (method !== 'GET' && guard.loggingIn) return sameOrigin ? 'allow' : 'out-of-scope';
  if (isLogin) return method === 'GET' || guard.loggingIn ? 'allow' : 'never-click';
  const kind = classifyLink({ href: normalized, text: '' }, guard.target);
  if (method !== 'GET') {
    if (kind !== 'crawl') return kind === 'never-click' ? 'never-click' : 'out-of-scope';
    const submit = guard.allowedSubmit;
    return submit && !submit.used && submit.url === normalized ? 'allow' : 'never-click';
  }
  if (kind === 'never-click') return 'never-click';
  if (kind === 'crawl' || guard.startUrls.has(normalized)) return 'allow';
  return 'out-of-scope';
}

/** navigationVerdict, consuming the single allowed form submission when it is used. */
export function admitNavigation(guard: Guard, url: string, method: string): Verdict {
  const verdict = navigationVerdict(guard, url, method);
  if (verdict === 'allow' && method !== 'GET' && guard.allowedSubmit && !guard.loggingIn) guard.allowedSubmit.used = true;
  return verdict;
}

/**
 * Every main-frame navigation goes through here. The request is fetched without following redirects and
 * a redirect is never handed to the browser: Chromium would follow it without routing the next hop (verified).
 * Instead the navigation is aborted and the crawler navigates to the next hop itself, which is checked again.
 * Only the login POST is left to the browser: logging in is the one action the scan must perform.
 */
async function installNavigationGuard(context: BrowserContext, guard: Guard): Promise<void> {
  await context.route('**/*', async (route) => {
    const request = route.request();
    let mainFrameNavigation = false;
    try {
      mainFrameNavigation = request.isNavigationRequest() && request.frame().parentFrame() === null;
    } catch {
      mainFrameNavigation = false;
    }
    if (!mainFrameNavigation) return route.fallback();
    const verdict = admitNavigation(guard, request.url(), request.method());
    if (verdict !== 'allow') {
      guard.lastBlocked = { url: request.url(), reason: verdict };
      return route.abort('blockedbyclient');
    }
    if (guard.loggingIn && request.method() !== 'GET') return route.fallback(); // the login POST and its redirect
    try {
      const response = await route.fetch({ maxRedirects: 0 });
      guard.lastNavigationStatus = response.status();
      const location = response.headers()['location'];
      if (response.status() >= 300 && response.status() < 400 && location) {
        const to = new URL(location, request.url()).href;
        guard.lastRedirect = { to, verdict: navigationVerdict(guard, to, 'GET') };
        return route.abort('blockedbyclient');
      }
      await route.fulfill({ response });
    } catch {
      await route.abort('failed').catch(() => {});
    }
  });
}

/** Drops findings that match a `known_noise` pattern (case-insensitive substring). */
function isKnownNoise(finding: Finding, target: Target): boolean {
  const text = `${finding.title} ${finding.url} ${finding.evidence.detail ?? ''}`.toLowerCase();
  return target.knownNoise.some((noise) => text.includes(noise.pattern.toLowerCase()));
}

function write(outDir: string, result: ScanResult): ScanResult {
  result.finishedAt = new Date().toISOString();
  safeWriteFile(outDir, 'findings/measured.json', `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

/**
 * Read-only crawl of the audit target: only GET navigations through <a href> links, starting at
 * scope.start, breadth first, up to scope.maxPages. Writes findings/measured.json and evidence/<id>.png.
 */
export async function runScan(target: Target, options: ScanOptions): Promise<ScanResult> {
  const { outDir, env = process.env } = options;
  // Fail early, before any browsing, if the output folders are links (the model can write in the audit folder).
  safeOutputPath(outDir, 'findings/measured.json');
  safeOutputPath(outDir, 'evidence/.check');

  const result: ScanResult = {
    target: { id: target.id, name: target.name, baseUrl: target.baseUrl, mode: target.mode },
    startedAt: new Date().toISOString(),
    finishedAt: '',
    status: 'completed',
    pages: [],
    skippedLinks: [],
    findings: [],
  };

  const guard: Guard = {
    target,
    loginUrl: target.loginPath ? new URL(target.loginPath, target.baseUrl).href : null,
    loggingIn: true,
    startUrls: new Set(target.scope.start.map((s) => normalizeUrl(s, target.baseUrl)).filter((u): u is string => !!u)),
    forbiddenUrls: new Set(),
    allowedSubmit: null,
    lastNavigationStatus: null,
    lastBlocked: null,
    lastRedirect: null,
  };

  const browser = await chromium.launch({ headless: options.headless ?? true });
  try {
    let context: BrowserContext;
    try {
      context = await authenticate(browser, target, env, async (ctx) => {
        if (options.onRequest) ctx.on('request', (request) => options.onRequest?.(request.method(), request.url()));
        // Registered before the test hooks: later routes run first, so tests can still fake responses.
        await installNavigationGuard(ctx, guard);
        await options.prepareContext?.(ctx);
      }, async (loginPage, url) => {
        // The login page may redirect (/login → /login/, or to an SSO): follow it through the guard.
        const { response, blocked } = await gotoGuarded(loginPage, guard, url);
        if (!response) {
          throw new Error(blocked ? `login page redirects out of scope (${blocked.url})` : `login page did not load (${url})`);
        }
        guard.loginUrl = loginPage.url(); // where the app really logs in: also how a lost session is recognized
        return loginPage.url();
      });
    } catch (error) {
      guard.loggingIn = false;
      // Messages from authenticate never include credential values.
      result.status = 'blocked';
      result.blockedReason = (error as Error).message;
      return write(outDir, result);
    }

    guard.loggingIn = false;
    const page = await context.newPage();
    const crawled = await crawl(page, guard, result, outDir, {
      sessionRequest: context.request,
      origin: new URL(target.baseUrl).origin,
      allowSameOrigin: (url) => navigationVerdict(guard, url, 'GET') === 'allow',
      neverClick: target.neverClick,
      onRequest: options.onRequest,
    });
    if (crawled.sessionLostAfter) {
      result.status = 'blocked';
      result.blockedReason =
        `session lost mid-scan: the last page scanned was ${crawled.sessionLostAfter} (its links were checked too) ` +
        `and the first one sent back to the login was ${crawled.firstBounced}. If one of them ends the session, add it to never_click; ` +
        'otherwise the session expires too soon.';
      return write(outDir, result);
    }

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

/** Records another page where an already reported problem was seen. */
function seenAgain(finding: Finding, pageUrl: string): void {
  if (pageUrl === finding.url || finding.alsoOn?.includes(pageUrl)) return;
  finding.alsoOn = [...(finding.alsoOn ?? []), pageUrl];
}

/**
 * Navigates through the guard, following each allowed redirect hop itself (the guard never hands a redirect
 * to the browser). Returns the final response, or why it was blocked.
 */
async function gotoGuarded(page: Page, guard: Guard, url: string): Promise<{ response: Response | null; blocked: Guard['lastBlocked'] }> {
  let response: Response | null = null;
  let blocked: Guard['lastBlocked'] = null;
  let next: string | null = url;
  for (let hop = 0; next && hop <= MAX_REDIRECTS; hop++) {
    guard.lastBlocked = null;
    guard.lastRedirect = null;
    const current: string = next;
    next = null;
    response = await page.goto(current, { waitUntil: 'load', timeout: NAV_TIMEOUT }).catch(() => null);
    if (response) break;
    // An aborted navigation loads Chrome's error page; let it finish or it interrupts the next hop.
    await page.waitForURL(/^chrome-error:/, { timeout: 2_000 }).catch(() => {});
    const redirect = guard.lastRedirect as Guard['lastRedirect'];
    if (redirect && redirect.verdict === 'allow') next = redirect.to;
    else if (redirect) blocked = { url: redirect.to, reason: redirect.verdict === 'never-click' ? 'never-click' : 'out-of-scope' };
    else blocked = guard.lastBlocked as Guard['lastBlocked'];
  }
  return { response, blocked };
}

async function crawl(
  page: Page,
  guard: Guard,
  result: ScanResult,
  outDir: string,
  linkOptions: LinkCheckOptions,
): Promise<{ sessionLostAfter?: string; firstBounced?: string }> {
  const { target, loginUrl } = guard;
  const origin = new URL(target.baseUrl).origin;
  const checkedLinks = new Set<string>();
  let queue: string[] = [];
  const seen = new Set<string>();
  const linkText = new Map<string, string>();
  const skipped = new Set<string>();
  const byId = new Map<string, Finding>();
  const testedForms = new Set<string>();
  const submitControl: SubmitControl = {
    begin(actionUrl: string) {
      guard.lastNavigationStatus = null;
      guard.lastRedirect = null;
      const normalized = normalizeUrl(actionUrl, target.baseUrl);
      guard.allowedSubmit = normalized ? { url: normalized, used: false } : null;
    },
    status: () => guard.lastNavigationStatus,
    end() {
      guard.allowedSubmit = null;
      const redirect = guard.lastRedirect as Guard['lastRedirect'];
      return { status: guard.lastNavigationStatus, redirectedTo: redirect && redirect.verdict === 'allow' ? redirect.to : null };
    },
  };
  const saveShot = (findingId: string, png: Buffer) => {
    const file = `evidence/${findingId}.png`;
    safeWriteFile(outDir, file, png);
    return file;
  };

  const skip = (link: SkippedLink) => {
    const key = `${link.url}|${link.reason}`;
    if (skipped.has(key)) return;
    skipped.add(key);
    result.skippedLinks.push(link);
  };

  for (const url of guard.startUrls) {
    seen.add(url);
    queue.push(url);
  }

  while (queue.length) {
    const url = queue.shift() as string;
    if (guard.forbiddenUrls.has(url)) continue;
    if (result.pages.length >= target.scope.maxPages) {
      skip({ url, text: linkText.get(url) ?? '', reason: 'max-pages' });
      continue;
    }

    const watcher = watchPage(page, target);
    const { response, blocked } = await gotoGuarded(page, guard, url);
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    const pageFindings = watcher.stop();

    if (!response) {
      if (blocked) {
        const label = blocked.reason === 'never-click' ? 'redirect to a forbidden URL' : 'redirect out of scope';
        result.pages.push({ url, status: 'blocked', reason: `${label} (${blocked.url})` });
        skip({ url: blocked.url, text: `(redirect from ${url})`, reason: blocked.reason });
      } else {
        result.pages.push({ url, status: 'blocked', reason: 'did not load' });
      }
      continue;
    }
    const finalUrl = page.url();
    const currentLogin = guard.loginUrl ?? loginUrl;
    if (currentLogin && isLoginUrl(finalUrl, currentLogin) && !isLoginUrl(url, currentLogin)) {
      result.pages.push({ url, status: 'blocked', reason: 'session lost' });
      const lastScanned = [...result.pages].reverse().find((p) => p.status === 'scanned');
      // Lost after some pages were scanned: every later page would bounce too, so stop and say where it happened.
      if (lastScanned) return { sessionLostAfter: lastScanned.url, firstBounced: url };
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
    if (status < 400) {
      // Error pages are already findings (http-error / broken-link): no content checks on them.
      pageFindings.push(...timingFindings(page.url(), await measureTiming(page).catch(() => ({ ttfbMs: 0, lcpMs: null }))));
      pageFindings.push(...(await checkA11y(page).catch(() => [])));
      pageFindings.push(...(await checkFormsStatic(page).catch(() => [])));
    }

    const links = (
      await page
        .$$eval('a[href]', (anchors) => anchors.map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent ?? '').trim() })))
        .catch(() => [] as { href: string; text: string }[])
    ).map((link) => {
      const normalized = normalizeUrl(link.href, finalUrl);
      return { ...link, normalized, kind: classifyLink({ href: normalized ?? link.href, text: link.text }, target) };
    });

    // First pass: a URL is forbidden as soon as any link to it looks destructive, whatever its other links say.
    for (const link of links) {
      if (link.kind === 'never-click' && link.normalized) guard.forbiddenUrls.add(link.normalized);
    }
    queue = queue.filter((queued) => !guard.forbiddenUrls.has(queued));

    const toCheck: LinkToCheck[] = [];
    for (const link of links) {
      const { normalized, kind, text } = link;
      if (normalized && guard.forbiddenUrls.has(normalized)) {
        if (kind === 'never-click') skip({ url: normalized, text, reason: 'never-click' });
        continue;
      }
      if ((kind === 'crawl' || kind === 'external') && normalized && !checkedLinks.has(normalized)) {
        checkedLinks.add(normalized);
        toCheck.push({ url: normalized, text, foundOn: url, thirdParty: new URL(normalized).origin !== origin });
      }
      if (kind === 'crawl' && normalized) {
        if (!seen.has(normalized)) {
          seen.add(normalized);
          linkText.set(normalized, text);
          queue.push(normalized);
        }
      } else if (kind === 'out-of-scope' || kind === 'not-a-page') {
        skip({ url: normalized ?? link.href, text, reason: kind });
      }
    }

    pageFindings.push(...(await checkLinks(toCheck, linkOptions)));

    const kept = pageFindings.filter((f) => !isKnownNoise(f, target));
    const fresh = kept.filter((f) => !byId.has(f.id));
    for (const repeated of kept.filter((f) => byId.has(f.id))) seenAgain(byId.get(repeated.id) as Finding, repeated.url);
    if (fresh.length) {
      const shot = await page.screenshot({ fullPage: true }).catch(() => null);
      for (const finding of fresh) {
        byId.set(finding.id, finding);
        if (shot) {
          finding.evidence.screenshot = `evidence/${finding.id}.png`;
          safeWriteFile(outDir, finding.evidence.screenshot, shot);
        }
        result.findings.push(finding);
      }
    }

    // Last, because it leaves the page on the form's response: staging only, one submission per form.
    if (status < 400) {
      const formFindings = await checkFormsInvalid(page, target, submitControl, testedForms, saveShot).catch(() => []);
      for (const finding of formFindings) {
        if (isKnownNoise(finding, target) || byId.has(finding.id)) continue;
        byId.set(finding.id, finding);
        result.findings.push(finding);
      }
    }
  }  return {};
}

/**
 * Logs in once and saves the browser session to <outDir>/.auth/session.json, so the exploration can start
 * authenticated without ever typing the password. The file holds session cookies: it is git-ignored (.auth/).
 */
export async function saveSession(target: Target, options: { outDir: string; env?: NodeJS.ProcessEnv; headless?: boolean }): Promise<string> {
  const browser = await chromium.launch({ headless: options.headless ?? true });
  try {
    const context = await authenticate(browser, target, options.env ?? process.env);
    // Session cookies: never written through a link the model could have planted in the audit folder.
    return safeWriteFile(options.outDir, '.auth/session.json', JSON.stringify(await context.storageState(), null, 2), 0o600);
  } finally {
    await browser.close();
  }
}
