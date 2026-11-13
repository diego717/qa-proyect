import { test, expect } from '@playwright/test';
import { EXPLANATIONS, SEVERITY_LABEL } from '../src/report/explanations.ts';
import { renderReport, type ReportInput } from '../src/report/render.ts';
import type { Finding, ScanResult } from '../src/finding.ts';
import { demoTarget } from './helpers.ts';

// Every check the scanner can emit, plus the model's exploration findings.
const CHECKS = [
  'http-error',
  'broken-image',
  'js-error',
  'console-error',
  'broken-link',
  'a11y',
  'slow-page',
  'form-static',
  'form-accepts-invalid',
  'exploration',
];

const finding = (id: string, overrides: Partial<Finding> = {}): Finding => ({
  id,
  source: 'measured',
  check: 'http-error',
  title: `Título ${id}`,
  severity: 'critical',
  severitySource: 'HTTP 5xx',
  url: `http://localhost:3100/${id}`,
  steps: ['Abrir la página.', 'Ver el error.'],
  evidence: { detail: `detalle ${id}` },
  review: { status: 'not_required' },
  ...overrides,
});

const scan = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  target: { id: 'example', name: 'Demo', baseUrl: 'http://localhost:3100', mode: 'staging' },
  startedAt: '2026-11-13T10:00:00.000Z',
  finishedAt: '2026-11-13T10:05:00.000Z',
  status: 'completed',
  pages: [
    { url: 'http://localhost:3100/items', status: 'scanned', httpStatus: 200, title: 'Items' },
    { url: 'http://localhost:3100/reports', status: 'blocked', reason: 'session lost' },
  ],
  skippedLinks: [
    { url: 'http://localhost:3100/lab/delete-all', text: 'Delete all', reason: 'never-click' },
    { url: 'http://localhost:3100/admin', text: 'Admin', reason: 'out-of-scope' },
  ],
  findings: [],
  ...overrides,
});

const input = (overrides: Partial<ReportInput> = {}): ReportInput => ({
  target: demoTarget({ mode: 'staging', report: { brand: 'Marca QA' } }),
  scan: scan(),
  findings: [],
  summaryMarkdown: 'La app funciona en general.\n\n- El checkout falla en el celular.\n- Un link lleva a una página que no existe.',
  generatedOn: '2026-11-13',
  ...overrides,
});

test('every check the scanner can emit has an explanation with a source', () => {
  for (const check of CHECKS) {
    const explanation = EXPLANATIONS[check];
    expect(explanation, check).toBeTruthy();
    expect(explanation.what.length, check).toBeGreaterThan(20);
    expect(explanation.why.length, check).toBeGreaterThan(20);
    expect(explanation.source.url, check).toMatch(/^https:\/\//);
  }
  expect(SEVERITY_LABEL).toEqual({ critical: 'Crítico', serious: 'Grave', moderate: 'Moderado', minor: 'Menor' });
});

test('layer 1 shows the summary, what was reviewed and what was not', () => {
  const html = renderReport(input());
  expect(html).toContain('Marca QA');
  expect(html).toContain('Demo');
  expect(html).toContain('<li>El checkout falla en el celular.</li>');
  expect(html).toContain('Qué se revisó');
  expect(html).toContain('Qué no se revisó');
  expect(html).toContain('http://localhost:3100/reports'); // blocked page, with its reason
  expect(html).toContain('se perdió la sesión');
  const redirected = renderReport(
    input({ scan: scan({ pages: [{ url: 'http://localhost:3100/go', status: 'blocked', reason: 'redirect to a forbidden URL (http://localhost:3100/delete)' }] }) }),
  );
  expect(redirected).toContain('redirige a una URL que el escáner nunca visita (http://localhost:3100/delete)');
  expect(html).toContain('Delete all'); // links never visited on purpose
  expect(html.indexOf('Qué no se revisó')).toBeLessThan(html.indexOf('Hallazgos'));
});

test('measured and model findings carry different labels', () => {
  const html = renderReport(
    input({
      findings: [
        finding('m1'),
        finding('o1', { source: 'model', check: 'exploration', checklistItem: 'login-sesion#2', review: { status: 'confirmed' } }),
      ],
    }),
  );
  expect(html).toContain('Medido');
  expect(html).toContain('Observado por el modelo, confirmado por un revisor');
  expect(html).toContain('login-sesion#2');
  expect(html).toContain(EXPLANATIONS['http-error'].why);
});

test('findings are ordered by severity', () => {
  const html = renderReport(
    input({ findings: [finding('low', { severity: 'minor' }), finding('high', { severity: 'critical' }), finding('mid', { severity: 'moderate' })] }),
  );
  expect(html.indexOf('Título high')).toBeLessThan(html.indexOf('Título mid'));
  expect(html.indexOf('Título mid')).toBeLessThan(html.indexOf('Título low'));
});

test('a pending or rejected model finding is not in the report', () => {
  const html = renderReport(
    input({
      findings: [
        finding('o1', { source: 'model', check: 'exploration', review: { status: 'pending_review' } }),
        finding('o2', { source: 'model', check: 'exploration', review: { status: 'rejected', note: 'no se reproduce' } }),
        finding('m1', { review: { status: 'rejected', note: 'ruido conocido' } }),
      ],
    }),
  );
  expect(html).not.toContain('Título o1');
  expect(html).not.toContain('Título o2');
  expect(html).not.toContain('Título m1');
  expect(html).toMatch(/Descartados por el revisor:\s*<strong>2<\/strong>/);
  expect(html).toMatch(/Pendientes de revisión:\s*<strong>1<\/strong>/);
});

test('third-party findings are listed apart', () => {
  const html = renderReport(input({ findings: [finding('own'), finding('cdn', { thirdParty: true, severity: 'moderate' })] }));
  const thirdPartySection = html.indexOf('De terceros');
  expect(thirdPartySection).toBeGreaterThan(-1);
  expect(html.indexOf('Título own')).toBeLessThan(thirdPartySection);
  expect(html.indexOf('Título cdn')).toBeGreaterThan(thirdPartySection);
});

test('HTML in titles, console messages and the summary is escaped', () => {
  const evil = '<script>alert(1)</script>';
  const html = renderReport(
    input({
      summaryMarkdown: `Resumen ${evil}\n\n- item ${evil}`,
      findings: [finding('x', { title: evil, evidence: { detail: evil }, steps: [evil], url: `http://localhost:3100/"><img src=x onerror=alert(1)>` })],
      scan: scan({ pages: [{ url: 'http://localhost:3100/a', status: 'blocked', reason: evil }] }),
    }),
  );
  expect(html).not.toContain(evil);
  expect(html).not.toContain('<img src=x');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('read-only reports state that no form was submitted', () => {
  const readOnly = renderReport(input({ target: demoTarget({ mode: 'read-only' }), scan: scan({ target: { ...scan().target, mode: 'read-only' } }) }));
  expect(readOnly).toContain('No se enviaron formularios ni se confirmaron acciones');
  expect(renderReport(input())).not.toContain('No se enviaron formularios ni se confirmaron acciones');
});

test('evidence images are embedded, not linked', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const html = renderReport(
    input({ findings: [finding('m1', { evidence: { screenshot: 'evidence/m1.png' } })], readEvidence: () => png }),
  );
  expect(html).toContain(`data:image/png;base64,${png.toString('base64')}`);
  expect(html).not.toContain('src="evidence/m1.png"');
});

test('a blocked scan is refused unless allowed, and then its reason leads the report', () => {
  const blocked = scan({ status: 'blocked', blockedReason: 'Login failed for audit target "example"', pages: [] });
  expect(() => renderReport(input({ scan: blocked }))).toThrow(/scan was blocked/);
  const html = renderReport(input({ scan: blocked, allowBlocked: true }));
  expect(html).toContain('El escaneo automático no se pudo completar');
  expect(html).toContain('Login failed for audit target');
  expect(html.indexOf('El escaneo automático no se pudo completar')).toBeLessThan(html.indexOf('Resumen'));
});

test('a finding seen on several pages lists them', () => {
  const html = renderReport(input({ findings: [finding('m1', { alsoOn: ['http://localhost:3100/b', 'http://localhost:3100/c'] })] }));
  expect(html).toContain('También aparece en 2 páginas más');
  expect(html).toContain('http://localhost:3100/c');
});
