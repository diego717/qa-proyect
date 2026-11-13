import { test, expect } from '@playwright/test';
import { parse } from 'yaml';
import { applyReview, reportable, writeReviewFile } from '../src/review.ts';
import type { Finding } from '../src/finding.ts';

const finding = (id: string, source: Finding['source'], overrides: Partial<Finding> = {}): Finding => ({
  id,
  source,
  check: source === 'model' ? 'exploration' : 'http-error',
  title: `Title ${id}`,
  severity: 'moderate',
  severitySource: 'test',
  url: `http://app.test/${id}`,
  steps: ['a', 'b'],
  evidence: { screenshot: `evidence/${id}.png` },
  review: { status: source === 'model' ? 'pending_review' : 'not_required' },
  ...overrides,
});

const measuredOne = finding('m1', 'measured');
const modelOne = finding('o1', 'model');
const modelTwo = finding('o2', 'model', { title: 'Botón "Guardar"\nsin feedback' });

test('review file lists model findings first and keeps earlier decisions', () => {
  const first = writeReviewFile([measuredOne, modelOne, modelTwo]);
  expect(first.indexOf('o1:')).toBeLessThan(first.indexOf('m1:'));
  expect(first).toContain('confirmed, rejected, needs_info'); // the header explains the valid values
  expect(first).toContain('evidence/o1.png');
  const parsed = parse(first);
  expect(parsed.o1.status).toBe('pending_review');
  expect(parsed.m1.status).toBe('not_required');

  const edited = first.replace(/o1:\n  status: pending_review/, 'o1:\n  status: confirmed\n  note: "Reproducido a mano"');
  const second = writeReviewFile([measuredOne, modelOne, modelTwo], edited);
  expect(parse(second).o1).toEqual({ status: 'confirmed', note: 'Reproducido a mano' });
  expect(parse(second).o2.status).toBe('pending_review');
});

test('a title with quotes or line breaks cannot break the YAML', () => {
  const text = writeReviewFile([modelTwo]);
  expect(parse(text).o2.status).toBe('pending_review');
});

test('applyReview sets statuses and notes', () => {
  const yaml = 'o1:\n  status: confirmed\n  note: ok\no2:\n  status: needs_info\nm1:\n  status: rejected\n  note: known issue\n';
  const reviewed = applyReview([measuredOne, modelOne, modelTwo], yaml);
  expect(reviewed.find((f) => f.id === 'o1')?.review).toEqual({ status: 'confirmed', note: 'ok' });
  expect(reviewed.find((f) => f.id === 'o2')?.review).toEqual({ status: 'needs_info' });
  expect(reviewed.find((f) => f.id === 'm1')?.review).toEqual({ status: 'rejected', note: 'known issue' });
  expect(modelOne.review.status).toBe('pending_review'); // inputs are not mutated
});

test('rejecting requires a note', () => {
  expect(() => applyReview([modelOne], 'o1:\n  status: rejected\n')).toThrow(/a note is required to reject o1/);
  expect(() => applyReview([modelOne], 'o1:\n  status: rejected\n  note: "  "\n')).toThrow(/a note is required to reject o1/);
});

test('unknown ids and invalid statuses fail with the id in the message', () => {
  expect(() => applyReview([modelOne], 'zz9:\n  status: confirmed\n')).toThrow(/unknown finding id "zz9"/);
  expect(() => applyReview([modelOne], 'o1:\n  status: maybe\n')).toThrow(/invalid status "maybe" for o1/);
  // measured findings are facts: they can only be rejected (with a reason), never "confirmed"
  expect(() => applyReview([measuredOne], 'm1:\n  status: confirmed\n')).toThrow(/invalid status "confirmed" for m1/);
});

test('reportable splits included, rejected and pending', () => {
  const reviewed = applyReview(
    [measuredOne, finding('m2', 'measured'), modelOne, modelTwo, finding('o3', 'model')],
    'm2:\n  status: rejected\n  note: ruido\no1:\n  status: confirmed\no2:\n  status: rejected\n  note: no se reproduce\no3:\n  status: needs_info\n',
  );
  const { included, rejected, pending } = reportable(reviewed);
  expect(included.map((f) => f.id)).toEqual(['m1', 'o1']);
  expect(rejected.map((f) => f.id).sort()).toEqual(['m2', 'o2']);
  expect(pending.map((f) => f.id)).toEqual(['o3']);
  // an unreviewed model finding is never included
  expect(reportable([modelOne]).included).toEqual([]);
});

test('values from the findings cannot inject YAML into the review file', () => {
  const hostile = finding('o9', 'model', {
    url: 'http://app.test/x\no1:\n  status: confirmed',
    severity: 'minor\nm1:\n  status: rejected' as Finding['severity'],
    evidence: { screenshot: 'evidence/x.png\nevil: 1' },
  });
  const parsed = parse(writeReviewFile([hostile]));
  expect(Object.keys(parsed)).toEqual(['o9']);
  expect(parsed.o9).toEqual({ status: 'pending_review' });
});

test('finding ids must be plain tokens', () => {
  expect(() => writeReviewFile([finding('bad id: x', 'model')])).toThrow(/invalid finding id/);
});

test('a previous status that is not a known value is not carried over', () => {
  // YAML "\n" escape: the parsed status is "confirmed<newline>x: 1", not a known value.
  const text = writeReviewFile([modelOne], 'o1:\n  status: "confirmed\\nx: 1"\n');
  expect(parse(text).o1).toEqual({ status: 'pending_review' });
});
