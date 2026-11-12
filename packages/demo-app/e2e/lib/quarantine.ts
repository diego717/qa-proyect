import { existsSync, readFileSync } from 'node:fs';

export type QuarantineMode = 'exclude' | 'only';

/** Stable id of a test: "file > describe > title", always with forward slashes. */
export function quarantineKey(titlePath: string[]): string {
  return titlePath.join(' > ').replace(/\\/g, '/');
}

/** Reads quarantine.json (array of test keys). A missing file means nothing is quarantined. */
export function loadQuarantine(file: string): string[] {
  if (!existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in quarantine file ${file}: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed) || !parsed.every((k) => typeof k === 'string')) {
    throw new Error(`Quarantine file ${file} must be a JSON array of test keys (strings)`);
  }
  return parsed;
}

/** "exclude" (blocking PR job) skips quarantined tests; "only" (non-blocking job) runs just them. */
export function quarantineAction(key: string, list: string[], mode: QuarantineMode): 'run' | 'skip' {
  const quarantined = list.includes(key);
  if (mode === 'only') return quarantined ? 'run' : 'skip';
  return quarantined ? 'skip' : 'run';
}
