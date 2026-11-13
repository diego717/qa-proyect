import { test, expect } from '@playwright/test';
import { timingFindings } from '../src/checks/timing.ts';

const url = 'http://app.test/page';

test('timing: poor TTFB or LCP is a finding, good values are not', () => {
  const ttfb = timingFindings(url, { ttfbMs: 1900, lcpMs: null });
  expect(ttfb).toHaveLength(1);
  expect(ttfb[0]).toMatchObject({ check: 'slow-page', severity: 'moderate', source: 'measured' });
  expect(ttfb[0].severitySource).toBe('Core Web Vitals "poor" threshold (lab data)');
  expect(ttfb[0].evidence.detail).toContain('1900');

  expect(timingFindings(url, { ttfbMs: 300, lcpMs: 4100 })).toHaveLength(1);
  expect(timingFindings(url, { ttfbMs: 300, lcpMs: 1200 })).toEqual([]);
  expect(timingFindings(url, { ttfbMs: 1800, lcpMs: 4000 })).toEqual([]); // thresholds are exclusive
});

test('timing: both poor values make a single finding', () => {
  const both = timingFindings(url, { ttfbMs: 2500, lcpMs: 5000 });
  expect(both).toHaveLength(1);
  expect(both[0].evidence.detail).toContain('2500');
  expect(both[0].evidence.detail).toContain('5000');
});
