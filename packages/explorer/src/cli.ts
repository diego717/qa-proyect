#!/usr/bin/env node
// QA explorer CLI. Usage: node src/cli.ts <command> <auditDir>
//   scan <auditDir>          read-only crawl → findings/measured.json (exit 2 if blocked)
//   review-file <auditDir>   creates or updates review.yaml from measured.json and observed.json
//   report <auditDir> [--allow-pending]   review.yaml + summary.md → report/informe.html
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTarget } from './target.ts';
import { runScan } from './scan.ts';
import { applyReview, reportable, writeReviewFile } from './review.ts';
import { renderReport } from './report/render.ts';
import type { Finding, ScanResult } from './finding.ts';

const USAGE = 'Usage: node src/cli.ts <scan|review-file|report> <auditDir> [--allow-pending]';

/** All findings of an audit: measured.json (required) and observed.json (written by the exploration, optional). */
export function loadFindings(auditDir: string): Finding[] {
  const measuredFile = path.join(auditDir, 'findings', 'measured.json');
  if (!existsSync(measuredFile)) throw new Error(`${measuredFile} not found: run the scan first`);
  const measured = JSON.parse(readFileSync(measuredFile, 'utf8')).findings as Finding[];
  const observedFile = path.join(auditDir, 'findings', 'observed.json');
  const raw = existsSync(observedFile) ? (JSON.parse(readFileSync(observedFile, 'utf8')).findings as Finding[]) : [];
  // observed.json is written by the model: never trust its source or review state. Decisions live in review.yaml.
  const measuredIds = new Set(measured.map((f) => f.id));
  const observed = raw.map((finding): Finding => {
    if (measuredIds.has(finding.id)) throw new Error(`observed.json: ${JSON.stringify(finding.id)} duplicates a measured finding`);
    return { ...finding, source: 'model', review: { status: 'pending_review' } };
  });
  return [...measured, ...observed];
}

/**
 * Reads evidence for the report. Paths may come from the model (observed.json), so only relative
 * paths to .png files inside <auditDir>/evidence are read; anything else returns null.
 */
export function evidenceReader(auditDir: string): (relativePath: string) => Buffer | null {
  const evidenceDir = path.resolve(auditDir, 'evidence');
  return (relativePath) => {
    if (path.isAbsolute(relativePath) || !relativePath.toLowerCase().endsWith('.png')) return null;
    const resolved = path.resolve(auditDir, relativePath);
    if (path.dirname(resolved) !== evidenceDir) return null;
    try {
      return readFileSync(resolved);
    } catch {
      return null;
    }
  };
}

function report(auditDir: string, allowPending: boolean): number {
  const target = loadTarget(path.join(auditDir, 'target.yaml'));
  const scan = JSON.parse(readFileSync(path.join(auditDir, 'findings', 'measured.json'), 'utf8')) as ScanResult;
  const reviewFile = path.join(auditDir, 'review.yaml');
  if (!existsSync(reviewFile)) throw new Error(`${reviewFile} not found: run review-file and review the findings first`);
  const summaryFile = path.join(auditDir, 'summary.md');
  if (!existsSync(summaryFile)) throw new Error(`${summaryFile} not found: the summary (layer 1) is required`);
  const findings = applyReview(loadFindings(auditDir), readFileSync(reviewFile, 'utf8'));
  const { pending } = reportable(findings);
  if (pending.length && !allowPending) {
    throw new Error(`${pending.length} findings are still pending review (${pending.map((f) => f.id).join(', ')}). Use --allow-pending to render anyway.`);
  }
  const html = renderReport({
    target,
    scan,
    findings,
    summaryMarkdown: readFileSync(summaryFile, 'utf8'),
    generatedOn: new Date().toISOString().slice(0, 10),
    readEvidence: evidenceReader(auditDir),
  });
  mkdirSync(path.join(auditDir, 'report'), { recursive: true });
  const out = path.join(auditDir, 'report', 'informe.html');
  writeFileSync(out, html);
  console.log(`${out} written.`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const allowPending = argv.includes('--allow-pending');
  const [command, auditDirArg] = argv.filter((arg) => arg !== '--allow-pending');
  if (!command || !auditDirArg) {
    console.error(USAGE);
    return 1;
  }
  const auditDir = path.resolve(auditDirArg);
  try {
    if (command === 'scan') {
      const target = loadTarget(path.join(auditDir, 'target.yaml'));
      const result = await runScan(target, { outDir: auditDir });
      const scanned = result.pages.filter((p) => p.status === 'scanned').length;
      console.log(`Scan ${result.status}: ${scanned} page(s) scanned, ${result.findings.length} finding(s).`);
      if (result.status === 'blocked') {
        console.error(`Blocked: ${result.blockedReason}`);
        return 2;
      }
      return 0;
    }
    if (command === 'review-file') {
      const reviewFile = path.join(auditDir, 'review.yaml');
      const existing = existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8') : undefined;
      const findings = loadFindings(auditDir);
      writeFileSync(reviewFile, writeReviewFile(findings, existing));
      const toReview = findings.filter((f) => f.source === 'model').length;
      console.log(`${reviewFile} written: ${findings.length} finding(s), ${toReview} from the model to review.`);
      return 0;
    }
    if (command === 'report') return report(auditDir, allowPending);
    console.error(`Unknown command "${command}". ${USAGE}`);
    return 1;
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
