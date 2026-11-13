import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';
import { findingId, type Finding, type Severity } from '../finding.ts';
import type { Target } from '../target.ts';

/** Measured finding found while a page was open. `key` makes the id unique per page. */
export function measured(
  check: string,
  pageUrl: string,
  key: string,
  fields: { title: string; severity: Severity; severitySource: string; detail?: string; thirdParty?: boolean; steps?: string[] },
): Finding {
  return {
    id: findingId(check, pageUrl, key),
    source: 'measured',
    check,
    title: fields.title,
    severity: fields.severity,
    severitySource: fields.severitySource,
    url: pageUrl,
    steps: fields.steps ?? [`Abrir ${pageUrl} con la sesión del usuario de prueba.`],
    evidence: fields.detail ? { detail: fields.detail } : {},
    ...(fields.thirdParty ? { thirdParty: true } : {}),
    review: { status: 'not_required' },
  };
}

// Chrome logs every failed resource as a console error; those are reported as http-error / broken-image instead.
const RESOURCE_NOISE = /^Failed to load resource/;

/**
 * Listens to one page load and turns what the browser reports into measured findings:
 * failing sub-resources (http-error, broken-image), uncaught exceptions (js-error) and console.error (console-error).
 * The main document's own status is handled by the crawler.
 */
export function watchPage(page: Page, target: Target): { stop(): Finding[] } {
  const findings: Finding[] = [];
  const origin = new URL(target.baseUrl).origin;
  const isThirdParty = (url: string) => new URL(url).origin !== origin;
  const isMainDocument = (request: Request) => request.isNavigationRequest() && request.frame() === page.mainFrame();

  const onResponse = (response: Response) => {
    const request = response.request();
    const status = response.status();
    if (status < 400 || isMainDocument(request)) return;
    const url = response.url();
    const thirdParty = isThirdParty(url);
    const detail = `${request.method()} ${url} → HTTP ${status}`;
    if (request.resourceType() === 'image') {
      findings.push(measured('broken-image', page.url(), url, { title: 'Imagen rota', severity: 'moderate', severitySource: 'HTTP status', detail, thirdParty }));
      return;
    }
    const serverError = status >= 500;
    findings.push(
      measured('http-error', page.url(), `${request.method()} ${url}`, {
        title: serverError ? `Error del servidor (HTTP ${status})` : `Recurso que falla (HTTP ${status})`,
        severity: serverError && !thirdParty ? 'critical' : 'moderate',
        severitySource: serverError ? 'HTTP 5xx' : 'HTTP 4xx',
        detail,
        thirdParty,
      }),
    );
  };

  const onRequestFailed = (request: Request) => {
    if (request.resourceType() !== 'image') return;
    const url = request.url();
    findings.push(
      measured('broken-image', page.url(), url, {
        title: 'Imagen rota',
        severity: 'moderate',
        severitySource: 'HTTP status',
        detail: `GET ${url} → ${request.failure()?.errorText ?? 'failed'}`,
        thirdParty: isThirdParty(url),
      }),
    );
  };

  const onPageError = (error: Error) => {
    findings.push(
      measured('js-error', page.url(), error.message, {
        title: 'Error de JavaScript sin capturar',
        severity: 'serious',
        severitySource: 'uncaught exception',
        detail: error.message,
      }),
    );
  };

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== 'error' || RESOURCE_NOISE.test(message.text())) return;
    findings.push(
      measured('console-error', page.url(), message.text(), {
        title: 'Error en la consola del navegador',
        severity: 'minor',
        severitySource: 'console.error',
        detail: message.text(),
      }),
    );
  };

  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  return {
    stop() {
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
      return findings;
    },
  };
}
