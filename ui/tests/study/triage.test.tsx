import './memoryStorage';

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { planChanges } from '@/domain/changes';
import { completionGaps, isComplete, validateDecisions } from '@/domain/decisions';
import { applyChanges } from '@/domain/requirementText';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';
import { createDraft, draftReducer, type Draft, type DraftAction } from '@/state/draft';
import type * as StudyConfig from '@/study/config';
import { carRequest, remainingFailures, worldExplanation, worldMitigation } from '@/domain/triage';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

const REPO = join(__dirname, '..', '..', '..');
const PYTHON = join(REPO, 'sim_env', 'bin', 'python');
const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'analysis_report.json',
);
const R0 = (JSON.parse(fixtureText(`${ROUND_2}/run_meta.json`)) as { requirement: string })
  .requirement;
const obstacle = (id: string) => report.obstacles.find((o) => o.id === id)!;

describe('the study triage: world or car', () => {
  it('says what "the world explains it" adds, or why it cannot', () => {
    // a child is part of the world the car must handle: no proposed assumption; the
    // engineer may still write one (option C), even though the old report proposes one
    const size = worldExplanation(obstacle('PedestrianSizeTooSmall'), R0);
    expect(size).toMatchObject({ own: true, kind: 'D', usable: true, quoted: null });
    // a soft goal where the analysis proposes one instead of an assumption
    expect(worldExplanation(obstacle('BrakingNotLatched'), R0)).toMatchObject({
      kind: 'R',
      usable: true,
    });
    // an assumption about the car itself would define its failures away
    const late = worldExplanation(obstacle('DetectionTooLate'), R0);
    expect(late.usable).toBe(false);
    expect(late.reason).toMatch(/Only the car can be at fault here/);
    // the idea is not lost: step 5 offers it as a requirement on the car
    expect(carRequest(obstacle('DetectionTooLate'))).toBe(
      'The car must travel at most 5 m/s where a pedestrian may cross.',
    );
    expect(carRequest(obstacle('PedestrianSizeTooSmall'))).toBeNull();
    // already in the requirement: chosen, it adds nothing
    expect(
      worldExplanation(obstacle('AdverseWeather'), 'assuming "fog_density <= 50"').alreadyIn,
    ).toBe(true);
  });

  it('adds the accepted lines to R1, leaves the rest to step 5, and stores valid decisions', () => {
    const act = (d: Draft, a: DraftAction) => draftReducer(d, a);
    let d = createDraft(report, null, null, 2);
    const world = (id: string) =>
      (d = act(d, {
        type: 'obstacle/explained',
        id,
        by: 'world',
        mitigation: worldMitigation(worldExplanation(obstacle(id), R0)),
      }));
    const car = (id: string) =>
      (d = act(d, { type: 'obstacle/explained', id, by: 'car', mitigation: null }));
    world('PedestrianSizeTooSmall');
    d = act(d, {
      type: 'obstacle/world_text',
      id: 'PedestrianSizeTooSmall',
      value: 'pedestrian is visible before stepping out',
    });
    world('BrakingNotLatched');
    world('AdverseWeather');
    car('DetectionTooLate');
    car('PedestrianClothingNotVisible');
    car('StandoffUnnecessaryStop');
    for (const id of Object.keys(d.doc.scope))
      d = act(d, { type: 'scope/verdict', id, verdict: 'in_scope' });
    for (const text of Object.keys(d.doc.assumptions ?? {}))
      d = act(d, { type: 'assumption/verdict', text, verdict: 'keep' });

    // what remains is what step 5 asks about
    expect(remainingFailures(d.doc).sort()).toEqual([
      'DetectionTooLate',
      'PedestrianClothingNotVisible',
      'StandoffUnnecessaryStop',
    ]);
    expect(isComplete(d.doc)).toBe(false);
    expect(completionGaps(d.doc).join(' ')).toMatch(/3 remaining failures to decide/);

    // step 5: a system failure with a car fix, a refinement in words, one left for later
    d = act(d, {
      type: 'obstacle/resolve',
      id: 'DetectionTooLate',
      resolution: 'system',
      mitigation: {
        layer: 'system',
        action: 'Change the car: a larger detector',
        choice: 'car_larger_detector',
      } as never,
    });
    d = act(d, {
      type: 'obstacle/resolve',
      id: 'PedestrianClothingNotVisible',
      resolution: 'refine',
      mitigation: {
        layer: 'requirement',
        action: 'Ask for detection of low-contrast clothing',
        choice: 'requirement',
      } as never,
    });
    d = act(d, {
      type: 'obstacle/resolve',
      id: 'StandoffUnnecessaryStop',
      resolution: 'later',
      mitigation: null,
    });
    expect(d.doc.obstacles.StandoffUnnecessaryStop!.verdict).toBe('defer');
    expect(d.doc.obstacles.DetectionTooLate!.verdict).toBe('accept');
    expect(isComplete(d.doc)).toBe(true);
    expect(validateDecisions(d.doc)).toEqual([]);

    // R1: the accepted assumption and soft goal, added for them, and the car fix
    const plan = planChanges(d.doc, report, R0);
    expect(plan.problems).toEqual([]);
    const r1 = applyChanges(R0, plan.changes);
    expect(r1).toContain('"pedestrian is visible before stepping out"');
    expect(r1).not.toContain('1.2 m tall');
    expect(r1).toContain(
      '"once braking has started it continues until the vehicle has stopped or the pedestrian is clear"',
    );
    expect(r1).toContain('performed by "yolov5m"');

    // the project's own validate() accepts the result
    if (existsSync(PYTHON)) {
      const dir = mkdtempSync(join(tmpdir(), 'triage-'));
      writeFileSync(join(dir, 'decisions.json'), JSON.stringify(d.doc));
      const problems = execFileSync(
        PYTHON,
        [
          '-c',
          'import json, sys; from scripts.analysis import decisions; print(json.dumps(decisions.validate(json.load(open(sys.argv[1])))))',
          join(dir, 'decisions.json'),
        ],
        { cwd: REPO },
      ).toString();
      expect(JSON.parse(problems)).toEqual([]);
    }
  });
});

describe('the world explains it, in the engineer own words (option C)', () => {
  it('writes nothing until the assumption is written, and refuses one about the car', () => {
    const act = (d: Draft, a: DraftAction) => draftReducer(d, a);
    let d = createDraft(report, null, null, 2);
    const x = worldExplanation(obstacle('PedestrianSizeTooSmall'), R0);
    d = act(d, {
      type: 'obstacle/explained',
      id: 'PedestrianSizeTooSmall',
      by: 'world',
      mitigation: worldMitigation(x),
    });
    expect(validateDecisions(d.doc).join(' ')).toMatch(/needs an action/);
    d = act(d, {
      type: 'obstacle/world_text',
      id: 'PedestrianSizeTooSmall',
      value: 'ego_speed <= 5',
    });
    expect(validateDecisions(d.doc).join(' ')).toMatch(/is about the car under test/);
  });
});
