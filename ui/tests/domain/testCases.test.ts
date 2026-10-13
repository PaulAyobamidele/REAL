import { describe, expect, it } from 'vitest';

import { joinRows } from '@/domain/evidence';
import { requirementResults, runsCsv, testCases, testCasesCsv } from '@/domain/testCases';
import { parseSimulationsCsv } from '@/services/csv';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);
const rows = joinRows(
  parseSimulationsCsv(fixtureText(`${ROUND_2}/simulations.csv`), 'simulations.csv'),
  report.simulations,
);

describe('test cases and runs, as a test report counts them', () => {
  const cases = testCases(rows);

  it('one test case per scenario, every run except the recording pass', () => {
    expect(cases).toHaveLength(report.failure_model.n_scenarios);
    const runs = cases.reduce((n, c) => n + c.runs.length, 0);
    expect(runs).toBe(rows.filter((r) => !r.label?.recording_pass).length);
  });

  it('passed and failed add up to the report', () => {
    expect(cases.reduce((n, c) => n + c.passed, 0)).toBe(report.failure_model.passes);
    expect(cases.reduce((n, c) => n + c.failed, 0)).toBe(report.failure_model.failures);
    expect(cases.reduce((n, c) => n + c.stalled, 0)).toBe(report.failure_model.passed_stalled);
  });

  it('downloads one line per test case and one per run', () => {
    expect(testCasesCsv(cases).trim().split('\n')).toHaveLength(cases.length + 1);
    const runs = cases.reduce((n, c) => n + c.runs.length, 0);
    expect(runsCsv(cases).trim().split('\n')).toHaveLength(runs + 1);
    expect(testCasesCsv(cases).split('\n')[0]).toContain('test_case');
  });
});

describe('what failed in the requirement', () => {
  it('names the safety goal and every soft goal and assumption, failed parts first', () => {
    const parts = requirementResults(report);
    const safety = parts.find((p) => p.part === 'safety goal')!;
    expect(safety.text).toContain('Pedestrian Safety');
    expect(safety.status).toBe(report.failure_model.failures > 0 ? 'failed' : 'held');
    const firstNotFailed = parts.findIndex((p) => p.status !== 'failed');
    if (firstNotFailed >= 0)
      expect(parts.slice(firstNotFailed).some((p) => p.status === 'failed')).toBe(false);
  });
});
