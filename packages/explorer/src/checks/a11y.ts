import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { measured } from './page-events.ts';
import type { Finding, Severity } from '../finding.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const IMPACTS = new Set<Severity>(['critical', 'serious', 'moderate', 'minor']);

/** axe-core scan of the current page: one finding per violated rule, severity = axe's impact. */
export async function checkA11y(page: Page): Promise<Finding[]> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((violation) => {
    const selectors = violation.nodes.slice(0, 3).map((node) => node.target.join(' '));
    const impact = IMPACTS.has(violation.impact as Severity) ? (violation.impact as Severity) : 'minor';
    return measured('a11y', page.url(), violation.id, {
      title: `Accesibilidad: ${violation.help}`,
      severity: impact,
      severitySource: 'axe impact',
      detail: `${violation.id}: ${violation.help} (${violation.helpUrl}). Elementos: ${selectors.join(', ')}${
        violation.nodes.length > 3 ? ` y ${violation.nodes.length - 3} más` : ''
      }`,
    });
  });
}
