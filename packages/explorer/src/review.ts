import { parse } from 'yaml';
import type { Finding, ReviewStatus } from './finding.ts';

const MODEL_STATUSES = new Set<ReviewStatus>(['pending_review', 'confirmed', 'rejected', 'needs_info']);
// Measured findings are facts: they are not reviewed, only rejected with a reason (e.g. noise the prospect knows).
const MEASURED_STATUSES = new Set<ReviewStatus>(['not_required', 'rejected']);

const HEADER = `# Revisión de hallazgos. Editá solo "status" y "note".
#
# Hallazgos del modelo (observados explorando): status inicial pending_review.
#   confirmed, rejected, needs_info
#   - confirmed: lo reproduje y es un problema real. Entra en el informe.
#   - rejected: no es un problema o no se reproduce. "note" es obligatoria (el motivo).
#   - needs_info: falta información; no entra en el informe hasta resolverlo.
#
# Hallazgos medidos (código determinístico): status not_required.
#   Entran en el informe salvo que los marques rejected, con el motivo en "note".
#
# Para revisar: abrí la evidencia (ruta en el comentario de cada hallazgo) y seguí los pasos del hallazgo.
`;

type Decision = { status: ReviewStatus; note?: string };

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function entry(finding: Finding, decision: Decision): string {
  const kind = finding.source === 'model' ? 'observado por el modelo' : 'medido';
  const evidence = finding.evidence.screenshot ?? 'sin screenshot';
  const lines = [
    `# [${kind}] ${oneLine(finding.title)} (${finding.severity})`,
    `# ${finding.url} · evidencia: ${evidence}`,
    `${finding.id}:`,
    `  status: ${decision.status}`,
  ];
  if (decision.note) lines.push(`  note: ${JSON.stringify(decision.note)}`);
  return `${lines.join('\n')}\n`;
}

function parseDecisions(yaml: string): Record<string, { status?: unknown; note?: unknown }> {
  const parsed = parse(yaml) ?? {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('review.yaml must be a map of finding ids');
  return parsed as Record<string, { status?: unknown; note?: unknown }>;
}

/**
 * Builds review.yaml: model findings first (they need a decision), then measured ones.
 * Decisions already present in `existing` are kept, so it can be regenerated after a new scan.
 */
export function writeReviewFile(findings: Finding[], existing?: string): string {
  const previous = existing ? parseDecisions(existing) : {};
  const ordered = [...findings.filter((f) => f.source === 'model'), ...findings.filter((f) => f.source === 'measured')];
  const body = ordered.map((finding) => {
    const kept = previous[finding.id];
    const decision: Decision =
      kept && typeof kept.status === 'string'
        ? { status: kept.status as ReviewStatus, ...(typeof kept.note === 'string' && kept.note ? { note: kept.note } : {}) }
        : { status: finding.review.status };
    return entry(finding, decision);
  });
  return `${HEADER}\n${body.join('\n')}`;
}

/** Applies review.yaml to the findings. Returns new objects; never mutates the input. */
export function applyReview(findings: Finding[], reviewYaml: string): Finding[] {
  const decisions = parseDecisions(reviewYaml);
  const byId = new Map(findings.map((f) => [f.id, f]));
  for (const id of Object.keys(decisions)) {
    if (!byId.has(id)) throw new Error(`review.yaml: unknown finding id "${id}"`);
  }
  return findings.map((finding) => {
    const decision = decisions[finding.id];
    if (!decision) return { ...finding, review: { ...finding.review } };
    const status = decision.status as ReviewStatus;
    const allowed = finding.source === 'model' ? MODEL_STATUSES : MEASURED_STATUSES;
    if (!allowed.has(status)) throw new Error(`review.yaml: invalid status "${String(decision.status)}" for ${finding.id}`);
    const note = typeof decision.note === 'string' && decision.note.trim() ? decision.note.trim() : undefined;
    if (status === 'rejected' && !note) throw new Error(`review.yaml: a note is required to reject ${finding.id}`);
    return { ...finding, review: { status, ...(note ? { note } : {}) } };
  });
}

/**
 * What goes in the report: measured findings not rejected, and model findings a reviewer confirmed.
 * Rejected ones are counted apart; pending ones (pending_review, needs_info) block the report.
 */
export function reportable(findings: Finding[]): { included: Finding[]; rejected: Finding[]; pending: Finding[] } {
  const included: Finding[] = [];
  const rejected: Finding[] = [];
  const pending: Finding[] = [];
  for (const finding of findings) {
    if (finding.review.status === 'rejected') rejected.push(finding);
    else if (finding.source === 'measured' || finding.review.status === 'confirmed') included.push(finding);
    else pending.push(finding);
  }
  return { included, rejected, pending };
}
