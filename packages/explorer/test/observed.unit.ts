import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateObserved } from '../src/observed.ts';
import { findingId } from '../src/finding.ts';

const PNG = Buffer.from('89504e470d0a1a0a00', 'hex');

function context() {
  const auditDir = mkdtempSync(path.join(tmpdir(), 'qa-observed-'));
  mkdirSync(path.join(auditDir, 'evidence'));
  writeFileSync(path.join(auditDir, 'evidence', 'shot.png'), PNG);
  return { auditDir, checklistIds: new Set(['login-sesion#2', 'formularios#4']) };
}

const url = 'http://localhost:3100/lab/form';
const good = () => ({
  id: findingId('exploration', url, 'formularios#4' + 'El botón no da feedback'),
  source: 'model',
  check: 'exploration',
  title: 'El botón no da feedback',
  severity: 'moderate',
  severitySource: 'criterio del agente',
  url,
  steps: ['Abrir el formulario.', 'Tocar Subscribe dos veces.'],
  evidence: { screenshot: 'evidence/shot.png' },
  checklistItem: 'formularios#4',
  review: { status: 'pending_review' },
});

test('accepts a correct observed finding', () => {
  const { findings, errors } = validateObserved({ findings: [good()] }, context());
  expect(errors).toEqual([]);
  expect(findings).toHaveLength(1);
});

test('rejects a finding that claims to be measured', () => {
  const { errors } = validateObserved({ findings: [{ ...good(), source: 'measured' }] }, context());
  expect(errors.join('\n')).toMatch(/source must be "model"/);
});

test('rejects an unknown checklist item', () => {
  const finding = { ...good(), checklistItem: 'inventado#9' };
  const { errors } = validateObserved({ findings: [{ ...finding, id: findingId('exploration', url, 'inventado#9' + finding.title) }] }, context());
  expect(errors.join('\n')).toMatch(/unknown checklist item "inventado#9"/);
});

test('rejects a missing screenshot or one outside the evidence folder', () => {
  expect(validateObserved({ findings: [{ ...good(), evidence: { screenshot: 'evidence/none.png' } }] }, context()).errors.join('\n')).toMatch(
    /screenshot/,
  );
  expect(validateObserved({ findings: [{ ...good(), evidence: { screenshot: '../x.png' } }] }, context()).errors.join('\n')).toMatch(/screenshot/);
  expect(validateObserved({ findings: [{ ...good(), evidence: {} }] }, context()).errors.join('\n')).toMatch(/screenshot/);
});

test('rejects fewer than 2 steps', () => {
  const { errors } = validateObserved({ findings: [{ ...good(), steps: ['Solo un paso.'] }] }, context());
  expect(errors.join('\n')).toMatch(/at least 2 steps/);
});

test('rejects a status other than pending_review', () => {
  const { errors } = validateObserved({ findings: [{ ...good(), review: { status: 'confirmed' } }] }, context());
  expect(errors.join('\n')).toMatch(/review.status must be "pending_review"/);
});

test('rejects an id that does not match the finding', () => {
  const { errors } = validateObserved({ findings: [{ ...good(), id: 'exploration-0000000000' }] }, context());
  expect(errors.join('\n')).toMatch(/id must be exploration-/);
});

test('rejects an invalid severity, check or url, and a file that is not { findings: [] }', () => {
  expect(validateObserved({ findings: [{ ...good(), severity: 'urgent' }] }, context()).errors.join('\n')).toMatch(/severity/);
  expect(validateObserved({ findings: [{ ...good(), check: 'http-error' }] }, context()).errors.join('\n')).toMatch(/check must be "exploration"/);
  expect(validateObserved({ findings: [{ ...good(), url: 'javascript:alert(1)' }] }, context()).errors.join('\n')).toMatch(/url/);
  expect(validateObserved([], context()).errors.join('\n')).toMatch(/\{ "findings": \[\.\.\.\] \}/);
});
