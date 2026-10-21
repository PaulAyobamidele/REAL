import { describe, expect, it } from 'vitest';

import { artefactApplies, buildDecisions } from '@/domain/decisions';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'analysis_report.json',
);
const withScene = (scene: Record<string, unknown> | null, noEncounter: number) => ({
  ...report,
  run_meta: { ...report.run_meta, scene },
  scenario_artefacts: (report.scenario_artefacts ?? []).map((a) =>
    a.id === 'no_encounter_geometry' ? { ...a, value: noEncounter } : a,
  ),
});
const artefacts = (r: typeof report) =>
  Object.keys(buildDecisions(r).scope).filter((k) => k.startsWith('artefact:'));

describe('test-defect candidates are put to the reviewer only when they apply', () => {
  it('on the v1 scene (none recorded) every candidate applies', () => {
    expect(artefacts(report)).toEqual([
      'artefact:crossing_trigger_8m',
      'artefact:no_encounter_geometry',
      'artefact:distance_parameter_dead',
    ]);
  });

  it('on the study round (scene v2, meet-the-car trigger, every run an encounter) none does', () => {
    expect(artefacts(withScene({ version: 2, crossing_trigger_m: 0 }, 0))).toEqual([]);
  });

  it('a v2 scene with a proximity trigger and runs that never met keeps those two', () => {
    const r = withScene({ version: 2, crossing_trigger_m: 20 }, 3);
    expect(artefactApplies({ id: 'crossing_trigger_8m' }, r)).toBe(true);
    expect(artefactApplies({ id: 'no_encounter_geometry', value: 3 }, r)).toBe(true);
    expect(artefactApplies({ id: 'distance_parameter_dead' }, r)).toBe(false);
  });
});
