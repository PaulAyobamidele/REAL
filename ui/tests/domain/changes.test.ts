import { describe, expect, it } from 'vitest';

import {
  assumptionChanges,
  mitigationChange,
  planChanges,
  scopeChange,
  toRequirementChanges,
} from '@/domain/changes';
import { buildDecisions } from '@/domain/decisions';
import { analysisReportSchema, decisionsSchema, parseWithSchema } from '@/services/schemas';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);
const onDisk = parseWithSchema(
  fixtureText(`${ROUND_2}/decisions.json`),
  decisionsSchema,
  'decisions',
);
const r0 = fixtureText(`${ROUND_2}/R0.dsl`);

describe('planChanges selects the changes the Python refiner recorded', () => {
  it('reproduces requirement_changes of the scripted demo review', () => {
    const doc = buildDecisions(report, { round: 2 });
    for (const [id, saved] of Object.entries(onDisk.obstacles)) {
      const o = doc.obstacles[id]!;
      o.verdict = saved.verdict;
      o.reason = saved.reason;
      o.mitigation = saved.mitigation;
    }
    for (const [sid, saved] of Object.entries(onDisk.scope))
      doc.scope[sid]!.verdict = saved.verdict;
    const plan = planChanges(doc, report, r0);
    expect(plan.problems).toEqual([]);
    expect(toRequirementChanges(plan.changes)).toEqual(onDisk.requirement_changes);
  });

  it('reports a problem instead of guessing when the report lacks the implied change', () => {
    const doc = buildDecisions(report, { round: 2 });
    doc.obstacles.StandoffUnnecessaryStop!.verdict = 'accept';
    doc.obstacles.StandoffUnnecessaryStop!.mitigation = { layer: 'requirement', action: 'x' };
    const stripped = {
      ...report,
      obstacles: report.obstacles.map((o) => ({ ...o, changes: undefined })),
    };
    const plan = planChanges(doc, stripped, r0);
    expect(plan.changes).toEqual([]);
    expect(plan.problems[0]?.from).toBe('StandoffUnnecessaryStop');
  });
});

describe('mitigationChange follows refine.change_for for edited and written fixes', () => {
  const byId = (id: string) => report.obstacles.find((o) => o.id === id);

  it('selects the recorded change for a catalogue fix taken as written', () => {
    const o = byId('DetectionTooLate')!;
    const m = { layer: 'system', action: o.mitigations.system! };
    expect(mitigationChange(o.id, m, o)).toEqual(o.changes!.system);
  });

  it('keeps a table entry whatever the wording', () => {
    const o = byId('DetectionTooLate')!;
    expect(mitigationChange(o.id, { layer: 'system', action: 'anything' }, o)).toEqual(
      o.changes!.system,
    );
  });

  it('builds the change from the text where no table entry exists', () => {
    const o = byId('BrakingNotLatched')!;
    expect(mitigationChange(o.id, { layer: 'scenario', action: 'fix the spawn' }, o)).toEqual({
      kind: 'T',
      from: o.id,
      layer: 'scenario',
      target: 'scripts/scenarios/scratch.temp',
      text: 'fix the spawn',
    });
    expect(mitigationChange(o.id, { layer: 'model', action: 'bigger' }, o)).toMatchObject({
      kind: 'S',
      task: null,
      text: 'model-level change with no requirement slot: bigger',
    });
  });

  it('reports a problem for a report written before changes were recorded', () => {
    const o = { ...byId('BrakingNotLatched')!, changes: undefined };
    expect(typeof mitigationChange(o.id, { layer: 'data', action: 'x' }, o)).toBe('string');
  });
});

describe('scopeChange and assumptionChanges', () => {
  it('turns scope verdicts into [D] and [T] changes', () => {
    const base = {
      kind: 'rule' as const,
      evidence: '',
      reason: 'too dark',
      rule: { param: 'fog_density', op: '>', value: 80, source: 'rules file' },
    };
    expect(
      scopeChange('rule:extreme_fog', { ...base, verdict: 'out_of_scope' }, 'fog_density <= 80'),
    ).toEqual({
      kind: 'D',
      from: 'rule:extreme_fog',
      layer: 'requirement',
      clause: 'assuming',
      item: 'fog_density <= 80',
      text: 'assuming "fog_density <= 80"',
    });
    expect(scopeChange('rule:x', { ...base, verdict: 'out_of_scope' }, null)?.item).toBe(
      'too dark',
    );
    expect(scopeChange('rule:x', { ...base, verdict: 'in_scope' }, null)?.layer).toBe('scope');
    expect(
      scopeChange(
        'artefact:a',
        {
          kind: 'artefact',
          evidence: '',
          reason: null,
          verdict: 'scenario_defect',
          suggested_fix: 'fix it',
        },
        null,
      )?.text,
    ).toBe('fix it');
    expect(scopeChange('rule:x', { ...base, verdict: null }, null)).toBeNull();
  });

  it('keeps, tightens, loosens, drops and adds assumptions like refine.assumption_changes', () => {
    const doc = buildDecisions(report, { round: 2 });
    doc.assumptions = {
      'fog_density <= 50': {
        verdict: 'keep',
        new_text: null,
        tool_verdict: 'untested',
        kind: 'scenario',
        evidence: '',
        reason: null,
      },
      'initial_separation_m >= 15': {
        verdict: 'tighten',
        new_text: 'initial_separation_m >= 20',
        tool_verdict: 'insufficient data',
        kind: 'run',
        evidence: '',
        reason: null,
      },
      'pedestrian_speed_mps <= 3': {
        verdict: 'loosen',
        new_text: 'pedestrian_speed_mps <= 4',
        tool_verdict: 'untested',
        kind: 'run',
        evidence: '',
        reason: null,
      },
      daylight: {
        verdict: 'drop',
        new_text: null,
        tool_verdict: null,
        kind: 'free_text',
        evidence: '',
        reason: null,
      },
    };
    doc.added_assumptions = [{ text: 'dry road', reason: null }];
    const inR0 = ['initial_separation_m >= 15', 'daylight'];
    const changes = assumptionChanges(doc, inR0);
    expect(changes.map((c) => c.text)).toEqual([
      'assuming "fog_density <= 50" (kept; stated after the run)',
      'assuming "initial_separation_m >= 20" (tightened from "initial_separation_m >= 15")',
      'assuming "pedestrian_speed_mps <= 4" (loosened from "pedestrian_speed_mps <= 3")',
      'drop assuming "daylight"',
      'assuming "dry road" (added)',
    ]);
    expect(changes[1]?.replaces).toBe('initial_separation_m >= 15');
    expect(changes[2]?.replaces).toBeNull();
    expect(changes[2]?.no_evidence).toBe(true);
    expect(changes[3]?.remove).toBe(true);
    expect(changes.every((c) => c.kind === 'D')).toBe(true);
  });
});
