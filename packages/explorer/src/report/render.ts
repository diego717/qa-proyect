import { EXPLANATIONS, SEVERITY_LABEL } from './explanations.ts';
import { reportable } from '../review.ts';
import type { Finding, ScanResult, Severity, SkippedLink } from '../finding.ts';
import type { Target } from '../target.ts';

export type ReportInput = {
  target: Target;
  scan: ScanResult;
  /** All findings with the review applied (measured + observed). */
  findings: Finding[];
  /** Layer 1 summary, drafted by the model and edited by the reviewer: paragraphs and "- " lists. */
  summaryMarkdown: string;
  generatedOn: string;
  /** Reads an evidence file (path relative to the audit dir) to embed it. Omitted: images are left out. */
  readEvidence?: (relativePath: string) => Buffer | null;
  /** A blocked scan is refused (it would read as "no problems") unless explicitly allowed; then its reason leads the report. */
  allowBlocked?: boolean;
};

const SEVERITY_ORDER: Severity[] = ['critical', 'serious', 'moderate', 'minor'];

const PAGE_REASON: Record<string, string> = {
  'session lost': 'se perdió la sesión (la app redirigió al login)',
  'did not load': 'no cargó',
};

// Reasons with a URL attached, written by the scanner as "<reason> (<url>)".
const PAGE_REASON_PREFIX: [string, string][] = [
  ['redirect to a forbidden URL', 'redirige a una URL que el escáner nunca visita'],
  ['redirect out of scope', 'redirige fuera del alcance acordado'],
];

function pageReason(reason: string | undefined): string {
  if (!reason) return 'sin motivo';
  if (PAGE_REASON[reason]) return PAGE_REASON[reason];
  const prefix = PAGE_REASON_PREFIX.find(([english]) => reason.startsWith(english));
  return prefix ? `${prefix[1]}${reason.slice(prefix[0].length)}` : reason;
}

const SKIP_REASON: Record<SkippedLink['reason'], string> = {
  'never-click': 'Links que el escáner nunca visita a propósito (cerrar sesión, borrar, pagar, enviar...)',
  'out-of-scope': 'Fuera del alcance acordado',
  'max-pages': 'No se llegó por el tope de páginas del escaneo',
  'not-a-page': 'Descargas, links de email o teléfono',
};

/** Escapes text for HTML content and attribute values. Everything that comes from findings goes through here. */
export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Minimal, safe markdown: blank-line separated paragraphs and "- " lists. Everything else is plain escaped text. */
function renderSummary(markdown: string): string {
  return markdown
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length && lines.every((line) => line.startsWith('- '))) {
        return `<ul>${lines.map((line) => `<li>${escapeHtml(line.slice(2))}</li>`).join('')}</ul>`;
      }
      return `<p>${escapeHtml(lines.join(' '))}</p>`;
    })
    .join('\n');
}

const sortBySeverity = (findings: Finding[]) =>
  [...findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

function renderFinding(finding: Finding, readEvidence?: ReportInput['readEvidence']): string {
  const explanation = EXPLANATIONS[finding.check] ?? EXPLANATIONS.exploration;
  const label = finding.source === 'measured' ? 'Medido' : 'Observado por el modelo, confirmado por un revisor';
  const image = finding.evidence.screenshot && readEvidence ? readEvidence(finding.evidence.screenshot) : null;
  return `<article class="finding sev-${escapeHtml(finding.severity)}">
  <header>
    <span class="badge sev">${escapeHtml(SEVERITY_LABEL[finding.severity] ?? finding.severity)}</span>
    <span class="badge kind kind-${finding.source === 'measured' ? 'measured' : 'model'}">${label}</span>
    <h3>${escapeHtml(finding.title)}</h3>
    <p class="meta"><code>${escapeHtml(finding.id)}</code> · ${escapeHtml(explanation.name)} · severidad según: ${escapeHtml(finding.severitySource)}${
      finding.checklistItem ? ` · ítem de checklist: <code>${escapeHtml(finding.checklistItem)}</code>` : ''
    }</p>
  </header>
  <p class="url">${escapeHtml(finding.url)}</p>
  <h4>Cómo reproducirlo</h4>
  <ol>${finding.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
  ${finding.evidence.detail ? `<p class="detail">${escapeHtml(finding.evidence.detail)}</p>` : ''}
  ${
    finding.alsoOn?.length
      ? `<details><summary>También aparece en ${finding.alsoOn.length} ${finding.alsoOn.length === 1 ? 'página más' : 'páginas más'}</summary><ul>${finding.alsoOn
          .map((u) => `<li>${escapeHtml(u)}</li>`)
          .join('')}</ul></details>`
      : ''
  }
  ${
    !image
      ? '<p class="meta">Sin captura de pantalla: no se pudo tomar durante la revisión. Los pasos alcanzan para reproducirlo.</p>'
      : ''
  }
  ${
    image
      ? `<details class="shot" open><summary>Evidencia (captura de la página; tocá para ocultarla)</summary><img class="evidence" alt="Evidencia de ${escapeHtml(finding.id)}" src="data:image/png;base64,${image.toString('base64')}"></details>`
      : ''
  }
  <div class="explain">
    <p><strong>Qué es:</strong> ${escapeHtml(explanation.what)}</p>
    <p><strong>Por qué importa:</strong> ${escapeHtml(explanation.why)}</p>
    <p><strong>Fuente:</strong> <a href="${escapeHtml(explanation.source.url)}">${escapeHtml(explanation.source.label)}</a></p>
  </div>
</article>`;
}

function renderNotReviewed(scan: ScanResult, readOnly: boolean): string {
  const blocked = scan.pages.filter((p) => p.status === 'blocked');
  const byReason = new Map<SkippedLink['reason'], SkippedLink[]>();
  for (const link of scan.skippedLinks) byReason.set(link.reason, [...(byReason.get(link.reason) ?? []), link]);
  const items: string[] = [];
  if (readOnly) items.push('<li>No se enviaron formularios ni se confirmaron acciones (modo solo lectura: la app es de producción).</li>');
  items.push(
    '<li>El escáner automático solo sigue links: las pantallas a las que se llega sin un link (por ejemplo, en aplicaciones que cambian de pantalla con botones) solo se revisaron si las recorrió la exploración del agente.</li>',
  );
  if (blocked.length) {
    items.push(
      `<li>Páginas que no se pudieron revisar:<ul>${blocked
        .map((p) => `<li>${escapeHtml(p.url)}: ${escapeHtml(pageReason(p.reason))}</li>`)
        .join('')}</ul></li>`,
    );
  }
  for (const [reason, links] of byReason) {
    const shown = links.slice(0, 10);
    items.push(
      `<li>${escapeHtml(SKIP_REASON[reason])} (${links.length}):<ul>${shown
        .map((l) => `<li>${escapeHtml(l.text || '(sin texto)')}: ${escapeHtml(l.url)}</li>`)
        .join('')}${links.length > shown.length ? `<li>y ${links.length - shown.length} más</li>` : ''}</ul></li>`,
    );
  }
  return items.length ? `<ul>${items.join('')}</ul>` : '<p>Nada quedó afuera del alcance acordado.</p>';
}

const STYLE = `
:root { --ink: #1d2433; --muted: #5b6475; --line: #d9dee7; --bg: #ffffff; --soft: #f5f7fa;
  --critical: #b42318; --serious: #c4320a; --moderate: #b54708; --minor: #475467; --measured: #175cd3; --model: #6941c6; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; } h2 { font-size: 21px; margin: 36px 0 12px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
h3 { font-size: 17px; margin: 8px 0 4px; } h4 { font-size: 14px; margin: 14px 0 4px; color: var(--muted); }
.brand { color: var(--muted); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; font-size: 12px; }
.meta, .url { color: var(--muted); font-size: 13px; margin: 2px 0; word-break: break-all; }
.mode { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
.finding { border: 1px solid var(--line); border-left: 5px solid var(--minor); border-radius: 8px; padding: 14px 16px; margin: 16px 0; break-inside: avoid; }
.sev-critical { border-left-color: var(--critical); } .sev-serious { border-left-color: var(--serious); } .sev-moderate { border-left-color: var(--moderate); }
.badge { display: inline-block; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 2px 9px; margin-right: 6px; background: var(--soft); border: 1px solid var(--line); }
.kind-measured { color: var(--measured); } .kind-model { color: var(--model); }
.detail { font-family: ui-monospace, Consolas, monospace; font-size: 13px; background: var(--soft); padding: 8px 10px; border-radius: 6px; word-break: break-all; }
.evidence { display: block; width: 100%; max-height: 340px; object-fit: cover; object-position: top; border: 1px solid var(--line); border-radius: 6px; margin-top: 8px; }
.shot summary { cursor: pointer; color: var(--muted); font-size: 13px; margin-top: 10px; }
.explain { background: var(--soft); border-radius: 6px; padding: 8px 12px; margin-top: 12px; font-size: 14px; }
.explain p { margin: 4px 0; }
.blocked { border: 2px solid var(--critical); border-radius: 8px; padding: 4px 16px; margin-top: 24px; }
.blocked h2 { border: 0; color: var(--critical); }
.counters { display: flex; gap: 24px; flex-wrap: wrap; }
@media print { main { padding: 0; } .finding { page-break-inside: avoid; } a { color: inherit; } }
`;

/** Self-contained HTML report in Spanish, in two layers: a one-page summary, then the reproducible detail. */
export function renderReport(input: ReportInput): string {
  const { target, scan } = input;
  if (scan.status === 'blocked' && !input.allowBlocked) {
    throw new Error(`The scan was blocked (${scan.blockedReason ?? 'no reason'}): fix it and scan again, or render with --allow-blocked.`);
  }
  const blockedBanner =
    scan.status === 'blocked'
      ? `<section class="blocked"><h2>El escaneo automático no se pudo completar</h2><p>${escapeHtml(scan.blockedReason ?? 'Sin motivo registrado.')}</p><p>Los chequeos automáticos no cubren esta app: la ausencia de hallazgos medidos no significa que no haya problemas.</p></section>`
      : '';
  const readOnly = scan.target.mode === 'read-only';
  const { included, rejected, pending } = reportable(input.findings);
  const own = sortBySeverity(included.filter((f) => !f.thirdParty));
  const thirdParty = sortBySeverity(included.filter((f) => f.thirdParty));
  const scanned = scan.pages.filter((p) => p.status === 'scanned');
  const scannedUrls = new Set(scanned.map((p) => p.url));
  const pagesWithProblems = new Set(own.flatMap((f) => [f.url, ...(f.alsoOn ?? [])]).filter((u) => scannedUrls.has(u))).size;
  const counts = SEVERITY_ORDER.map((s) => `${SEVERITY_LABEL[s]}: ${own.filter((f) => f.severity === s).length}`).join(' · ');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Informe de auditoría: ${escapeHtml(target.name)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
  <p class="brand">${escapeHtml(target.report.brand)}</p>
  <h1>Informe de auditoría de calidad: ${escapeHtml(target.name)}</h1>
  <p class="meta">${escapeHtml(target.baseUrl)} · generado el ${escapeHtml(input.generatedOn)} · escaneo del ${escapeHtml(scan.startedAt.slice(0, 10))}</p>
  <p class="mode">${
    readOnly
      ? '<strong>Modo solo lectura</strong> (producción): se recorrió la app sin modificar ningún dato.'
      : '<strong>Modo staging</strong>: además de recorrer la app, se enviaron formularios con datos de prueba.'
  }</p>
</header>
${blockedBanner}
<section>
  <h2>Resumen</h2>
  ${renderSummary(input.summaryMarkdown)}
  <p><strong>${own.length}</strong> hallazgos en la app (${counts})${thirdParty.length ? ` y ${thirdParty.length} de servicios de terceros` : ''}.</p>
</section>

<section>
  <h2>Qué se revisó</h2>
  <p>Se escanearon <strong>${scanned.length}</strong> páginas con chequeos automáticos (errores HTTP, imágenes y links rotos, errores de JavaScript, accesibilidad WCAG 2.1 AA, tiempos de carga y formularios). Los flujos explorados a mano por el agente se detallan en el resumen.</p>
  <div class="counters">
    <p>Páginas revisadas: <strong>${scanned.length}</strong></p>
    <p>Con problemas: <strong>${pagesWithProblems}</strong></p>
    <p>No se pudieron revisar: <strong>${scan.pages.length - scanned.length}</strong></p>
  </div>
  <details><summary>Páginas escaneadas</summary><ul>${scanned.map((p) => `<li>${escapeHtml(p.url)}</li>`).join('')}</ul></details>
</section>

<section>
  <h2>Qué no se revisó</h2>
  ${renderNotReviewed(scan, readOnly)}
</section>

<section>
  <h2>Hallazgos</h2>
  <p class="meta"><strong>Medido</strong>: lo detectó código automático y se repite igual en cada corrida. <strong>Observado por el modelo</strong>: lo encontró el agente explorando y una persona lo reprodujo y confirmó.</p>
  ${own.length ? own.map((f) => renderFinding(f, input.readEvidence)).join('\n') : '<p>No hay hallazgos en la app.</p>'}
</section>
${
  thirdParty.length
    ? `<section>
  <h2>De terceros</h2>
  <p class="meta">Problemas en servicios externos que la app usa (analítica, CDNs, widgets). No son código del sitio, pero el usuario los sufre igual.</p>
  ${thirdParty.map((f) => renderFinding(f, input.readEvidence)).join('\n')}
</section>`
    : ''
}
<section>
  <h2>Revisión</h2>
  <div class="counters">
    <p>Incluidos en el informe: <strong>${included.length}</strong></p>
    <p>Descartados por el revisor: <strong>${rejected.length}</strong></p>
    <p>Pendientes de revisión: <strong>${pending.length}</strong></p>
  </div>
</section>
</main>
</body>
</html>
`;
}
