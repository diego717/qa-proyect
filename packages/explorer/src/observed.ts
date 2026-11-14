import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { evidenceReader } from './evidence.ts';
import { findingId, type Finding, type Severity } from './finding.ts';

/** One item of a checklist (checklists/<file>.md): id is `<file>#<number>`, e.g. "login-sesion#3". */
export type ChecklistItem = { id: string; title: string; what: string; why: string; source: string };

const FIELDS = { what: 'Qué mirar', why: 'Por qué importa', source: 'Fuente' } as const;

/**
 * Parses every checklist. Format of an item:
 *   ### 3. Title
 *   - **Qué mirar:** ...
 *   - **Por qué importa:** ...
 *   - **Fuente:** [label](https://...)
 */
export function loadChecklists(dir: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()) {
    const name = file.replace(/\.md$/, '');
    const blocks = readFileSync(path.join(dir, file), 'utf8').split(/^### /m).slice(1);
    for (const block of blocks) {
      const heading = block.match(/^(\d+)\.\s+(.+)$/m);
      if (!heading) throw new Error(`${file}: item heading must be "### <number>. <title>"`);
      const id = `${name}#${heading[1]}`;
      const field = (label: string) => block.match(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`, 'm'))?.[1].trim();
      const values = Object.fromEntries(Object.entries(FIELDS).map(([key, label]) => [key, field(label)]));
      for (const [key, label] of Object.entries(FIELDS)) {
        if (!values[key]) throw new Error(`${id}: missing "${label}"`);
      }
      items.push({ id, title: heading[2].trim(), what: values.what!, why: values.why!, source: values.source! });
    }
  }
  return items;
}

const SEVERITIES = new Set<Severity>(['critical', 'serious', 'moderate', 'minor']);

/**
 * Id of an observed finding: derived from its whole content (url, checklist item, title, severity, steps,
 * screenshot), so a finding that changes in a new exploration gets a new id and is reviewed again
 * instead of inheriting an old "confirmed".
 */
export function observedId(f: { url: string; checklistItem: string; title: string; severity: string; steps: string[]; screenshot: string }): string {
  return findingId('exploration', f.url, JSON.stringify([f.checklistItem, f.title, f.severity, f.steps, f.screenshot]));
}

/**
 * Validates observed.json, written by the exploring model. It is untrusted input: a finding is accepted only
 * if it is an exploration finding pending review, cites an existing checklist item, has at least 2 steps,
 * evidence inside the audit's evidence folder, and the id the content implies.
 */
export function validateObserved(json: unknown, context: { auditDir: string; checklistIds: Set<string> }): { findings: Finding[]; errors: string[] } {
  const errors: string[] = [];
  const list = (json as { findings?: unknown })?.findings;
  if (!json || typeof json !== 'object' || Array.isArray(json) || !Array.isArray(list)) {
    return { findings: [], errors: ['observed.json must be { "findings": [...] }'] };
  }
  const readEvidence = evidenceReader(context.auditDir);
  const findings: Finding[] = [];
  list.forEach((raw: Record<string, unknown>, index: number) => {
    const where = `findings[${index}]${typeof raw?.id === 'string' ? ` (${raw.id})` : ''}`;
    const problems: string[] = [];
    const f = (raw ?? {}) as Partial<Finding> & Record<string, unknown>;
    if (f.source !== 'model') problems.push('source must be "model"');
    if (f.check !== 'exploration') problems.push('check must be "exploration"');
    if (typeof f.title !== 'string' || !f.title.trim()) problems.push('title is required');
    if (!SEVERITIES.has(f.severity as Severity)) problems.push('severity must be critical, serious, moderate or minor');
    if (typeof f.severitySource !== 'string' || !f.severitySource.trim()) problems.push('severitySource is required (why that severity)');
    let urlOk = false;
    try {
      urlOk = typeof f.url === 'string' && /^https?:$/.test(new URL(f.url).protocol);
    } catch {
      urlOk = false;
    }
    if (!urlOk) problems.push('url must be an http(s) URL');
    if (!Array.isArray(f.steps) || f.steps.filter((s) => typeof s === 'string' && s.trim()).length < 2) problems.push('at least 2 steps are required');
    if (typeof f.checklistItem !== 'string' || !context.checklistIds.has(f.checklistItem)) {
      problems.push(`unknown checklist item ${JSON.stringify(f.checklistItem ?? null)}`);
    }
    const screenshot = (f.evidence as Finding['evidence'] | undefined)?.screenshot;
    if (typeof screenshot !== 'string' || !readEvidence(screenshot)) {
      problems.push('evidence.screenshot must be a PNG inside the evidence/ folder of the audit');
    }
    if ((f.review as Finding['review'] | undefined)?.status !== 'pending_review') problems.push('review.status must be "pending_review"');
    if (urlOk && typeof f.checklistItem === 'string' && typeof f.title === 'string' && Array.isArray(f.steps) && typeof screenshot === 'string') {
      const expected = observedId({
        url: f.url as string,
        checklistItem: f.checklistItem,
        title: f.title,
        severity: String(f.severity),
        steps: f.steps as string[],
        screenshot,
      });
      if (f.id !== expected) problems.push(`id must be ${expected}`);
    }
    if (problems.length) errors.push(...problems.map((p) => `${where}: ${p}`));
    else findings.push(f as Finding);
  });
  return { findings, errors };
}
