import { createHash } from 'node:crypto';
import type { Mode } from './target.ts';

/** Severity as given by the source of the finding (axe impact, HTTP status class...). Never re-scored. */
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';
export type ReviewStatus = 'not_required' | 'pending_review' | 'confirmed' | 'rejected' | 'needs_info';

export type Finding = {
  id: string;
  /** measured: produced by deterministic code. model: proposed by the exploring agent, needs human review. */
  source: 'measured' | 'model';
  check: string;
  title: string;
  severity: Severity;
  severitySource: string;
  url: string;
  steps: string[];
  evidence: { screenshot?: string; trace?: string; detail?: string };
  thirdParty?: boolean;
  /** Other pages where the same problem was seen (shared layout, same asset or message). */
  alsoOn?: string[];
  checklistItem?: string;
  review: { status: ReviewStatus; note?: string };
};

export type PageRecord = { url: string; status: 'scanned' | 'blocked'; reason?: string; httpStatus?: number; title?: string };
export type SkippedLink = { url: string; text: string; reason: 'never-click' | 'out-of-scope' | 'max-pages' | 'not-a-page' };

export type ScanResult = {
  target: { id: string; name: string; baseUrl: string; mode: Mode };
  startedAt: string;
  finishedAt: string;
  status: 'completed' | 'blocked';
  blockedReason?: string;
  pages: PageRecord[];
  skippedLinks: SkippedLink[];
  findings: Finding[];
};

/**
 * Stable id across runs and environments: depends on the check, the path + query of the URL
 * (not the origin, not the fragment) and a check-specific key (rule id, selector, method...).
 */
export function findingId(check: string, url: string, key: string): string {
  const parsed = new URL(url);
  const hash = createHash('sha256').update(`${check}|${parsed.pathname}${parsed.search}|${key}`).digest('hex');
  return `${check}-${hash.slice(0, 10)}`;
}
