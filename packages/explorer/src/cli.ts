#!/usr/bin/env node
// QA explorer CLI. Usage: node src/cli.ts <command> <auditDir>
//   scan <auditDir>   read-only crawl → <auditDir>/findings/measured.json (exit 2 if blocked)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTarget } from './target.ts';
import { runScan } from './scan.ts';

const USAGE = 'Usage: node src/cli.ts scan <auditDir>';

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
