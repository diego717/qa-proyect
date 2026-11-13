#!/usr/bin/env node
// QA explorer CLI. Usage: node src/cli.ts <command> <auditDir>
//   scan <auditDir>          read-only crawl → findings/measured.json (exit 2 if blocked)
//   review-file <auditDir>   creates or updates review.yaml from measured.json and observed.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTarget } from './target.ts';
import { runScan } from './scan.ts';
import { writeReviewFile } from './review.ts';
import type { Finding } from './finding.ts';

const USAGE = 'Usage: node src/cli.ts <scan|review-file> <auditDir>';

/** All findings of an audit: measured.json (required) and observed.json (written by the exploration, optional). */
export function loadFindings(auditDir: string): Finding[] {
  const measuredFile = path.join(auditDir, 'findings', 'measured.json');
  if (!existsSync(measuredFile)) throw new Error(`${measuredFile} not found: run the scan first`);
  const measured = JSON.parse(readFileSync(measuredFile, 'utf8')).findings as Finding[];
  const observedFile = path.join(auditDir, 'findings', 'observed.json');
  const observed = existsSync(observedFile) ? (JSON.parse(readFileSync(observedFile, 'utf8')).findings as Finding[]) : [];
  return [...measured, ...observed];
}

export async function main(argv: string[]): Promise<number> {
  const [command, auditDirArg] = argv;
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
