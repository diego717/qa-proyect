import type { Page } from '@playwright/test';
import { measured } from './page-events.ts';
import type { Finding } from '../finding.ts';

// Core Web Vitals "poor" thresholds (web.dev): TTFB > 1800 ms, LCP > 4000 ms. Lab data, one load.
const TTFB_POOR_MS = 1800;
const LCP_POOR_MS = 4000;

export function timingFindings(url: string, metrics: { ttfbMs: number; lcpMs: number | null }): Finding[] {
  const problems: string[] = [];
  if (metrics.ttfbMs > TTFB_POOR_MS) problems.push(`TTFB ${Math.round(metrics.ttfbMs)} ms (umbral ${TTFB_POOR_MS} ms)`);
  if (metrics.lcpMs !== null && metrics.lcpMs > LCP_POOR_MS) problems.push(`LCP ${Math.round(metrics.lcpMs)} ms (umbral ${LCP_POOR_MS} ms)`);
  if (!problems.length) return [];
  return [
    measured('slow-page', url, 'timing', {
      title: 'Página lenta',
      severity: 'moderate',
      severitySource: 'Core Web Vitals "poor" threshold (lab data)',
      detail: `${problems.join('; ')}. Medido en una sola carga desde el runner de la auditoría.`,
    }),
  ];
}

/** Reads TTFB (navigation timing) and LCP (buffered PerformanceObserver) of the loaded page. */
export async function measureTiming(page: Page): Promise<{ ttfbMs: number; lcpMs: number | null }> {
  return page.evaluate(
    () =>
      new Promise<{ ttfbMs: number; lcpMs: number | null }>((resolve) => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const ttfbMs = nav ? nav.responseStart : 0;
        let lcpMs: number | null = null;
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length) lcpMs = entries[entries.length - 1].startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch {
          // LCP not supported: report TTFB only.
        }
        setTimeout(() => resolve({ ttfbMs, lcpMs }), 100);
      }),
  );
}
