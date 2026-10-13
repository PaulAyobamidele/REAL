import { describe, expect, it } from 'vitest';

import {
  isCountedEncounter,
  joinRows,
  reportedCounts,
  selectEvidence,
  setAsideReason,
} from '@/domain/evidence';
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

describe('simulations.csv joined with the report labels', () => {
  it('labels every row, including the recording pass', () => {
    expect(rows.length).toBe(161);
    expect(rows.every((r) => r.label)).toBe(true);
    const recording = rows.find((r) => r.scenarioId === 'best_video');
    expect(recording?.label?.recording_pass).toBe(true);
    expect(setAsideReason(recording!)).toMatch(/recording pass/);
    expect(isCountedEncounter(recording!)).toBe(false);
  });

  it('never counts a set-aside row and matches the report counts', () => {
    const fm = report.failure_model;
    const counted = rows.filter(isCountedEncounter);
    expect(counted.length).toBe(fm.n_encounters);
    expect(counted.filter((r) => r.label?.failed).length).toBe(fm.failures);
    const noEncounter = rows.filter((r) => setAsideReason(r) === 'no encounter');
    expect(noEncounter.length).toBe(fm.n_no_encounter);
    expect(noEncounter.every((r) => !isCountedEncounter(r))).toBe(true);
    expect(rows.filter((r) => r.label?.outcome === 'passed_stalled').length).toBe(
      fm.passed_stalled,
    );
  });

  it('selects the rows behind each kind of obstacle and agrees with the reported numbers', () => {
    const byId = new Map(report.obstacles.map((o) => [o.id, o]));
    const standoff = selectEvidence(byId.get('StandoffUnnecessaryStop')!, rows);
    expect(standoff.hits.length).toBe(113);
    expect(standoff.scope.length).toBe(124);
    expect(reportedCounts(byId.get('StandoffUnnecessaryStop')!)).toEqual({ scope: 124, hits: 113 });
    const late = selectEvidence(byId.get('DetectionTooLate')!, rows);
    expect(late.hits.length).toBe(1);
    expect(late.scope.length).toBe(4);
    expect(reportedCounts(byId.get('DetectionTooLate')!)).toEqual({ scope: 4, hits: 1 });
    const child = selectEvidence(byId.get('PedestrianSizeTooSmall')!, rows);
    expect(child.scope.length).toBe(63);
    expect(child.hits.length).toBe(3);
    expect(reportedCounts(byId.get('PedestrianSizeTooSmall')!)).toEqual({ scope: 63, hits: 3 });
  });
});
