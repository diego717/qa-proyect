import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { auditSecretNames, loadTarget } from './target.ts';

export { auditSecretNames };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Audits whose data must be deleted: delivered more than `days` ago (default 30). Undelivered audits never expire. */
export function expiredAudits(
  audits: { id: string; deliveredOn?: string }[],
  today: string,
  days = 30,
): { id: string; deliveredOn: string; daysOverdue: number }[] {
  const now = Date.parse(`${today}T00:00:00Z`);
  return audits.flatMap((audit) => {
    if (!audit.deliveredOn) return [];
    const age = Math.round((now - Date.parse(`${audit.deliveredOn}T00:00:00Z`)) / DAY_MS);
    return age > days ? [{ id: audit.id, deliveredOn: audit.deliveredOn, daysOverdue: age - days }] : [];
  });
}

/** Reads <dir>/<id>/target.yaml for every audit folder (the retention workflow extracts them from the audit/* branches). */
export function readAudits(dir: string): { audits: { id: string; deliveredOn?: string }[]; errors: string[] } {
  const audits: { id: string; deliveredOn?: string }[] = [];
  const errors: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(path.join(dir, entry.name, 'target.yaml'))) continue;
    try {
      const target = loadTarget(path.join(dir, entry.name, 'target.yaml'));
      audits.push({ id: target.id, ...(target.deliveredOn ? { deliveredOn: target.deliveredOn } : {}) });
    } catch (error) {
      // One broken profile must not hide the others: report it and keep going.
      errors.push(`${entry.name}: ${(error as Error).message}`);
    }
  }
  return { audits, errors };
}
