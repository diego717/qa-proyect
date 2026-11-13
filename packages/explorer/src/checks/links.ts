import type { APIRequestContext } from '@playwright/test';
import { measured } from './page-events.ts';
import type { Finding } from '../finding.ts';

export type LinkToCheck = { url: string; text: string; foundOn: string; thirdParty: boolean };

/**
 * Checks each link once with HEAD, confirming any error with GET. Never-click links are never
 * passed here: even a HEAD can have side effects in a badly built app.
 * Only 404/410 and 5xx count: 401/403 from other sites are usually bot protection, not broken links.
 */
export async function checkLinks(
  request: APIRequestContext,
  links: LinkToCheck[],
  onRequest?: (method: string, url: string) => void,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const link of links) {
    let status: number;
    try {
      onRequest?.('HEAD', link.url);
      let response = await request.head(link.url, { timeout: 15_000, maxRedirects: 5, failOnStatusCode: false });
      // Many apps answer HEAD with 404/405/501 while GET works: an error is always confirmed with GET.
      if (response.status() >= 400) {
        onRequest?.('GET', link.url);
        response = await request.get(link.url, { timeout: 15_000, maxRedirects: 5, failOnStatusCode: false });
      }
      status = response.status();
    } catch {
      continue; // Network failures of external sites are not attributable to the prospect.
    }
    if (status !== 404 && status !== 410 && status < 500) continue;
    // A same-origin page answering 5xx is reported once, as http-error, when the crawler visits it.
    if (status >= 500 && !link.thirdParty) continue;
    findings.push(
      measured('broken-link', link.foundOn, link.url, {
        title: status >= 500 ? `Link a una página que da error (HTTP ${status})` : `Link roto (HTTP ${status})`,
        severity: status >= 500 ? 'serious' : 'moderate',
        severitySource: `HTTP ${status}`,
        detail: `${link.url} → HTTP ${status}`,
        thirdParty: link.thirdParty,
        steps: [
          `Abrir ${link.foundOn} con la sesión del usuario de prueba.`,
          `Hacer click en el link "${link.text || link.url}" (${link.url}).`,
          `La página de destino responde HTTP ${status}.`,
        ],
      }),
    );
  }
  return findings;
}
