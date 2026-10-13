import { describe, expect, it } from 'vitest';

import {
  applyChanges,
  joinClauses,
  renderDiff,
  replaceModule,
  splitClauses,
  unifiedDiff,
} from '@/domain/requirementText';
import type { Change } from '@/services/schemas';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const REQUIREMENT = `
MAINTAIN "Pedestrian Safety"
    by
        "Pedestrian Check" using "Perception Module"
            operationalized as
                "Detect Pedestrian" performed by "yolov5s"
                taking input "image" producing output "pedestrian detection confidence" & "pedestrian detection flag"
    followed by
        "braking" using "braking module"
            operationalized as
                "Bring down throttle" & "Apply Brakes" if "pedestrian detection flag=True" performed by "proportional_braking"
                taking input "pedestrian detection flag" producing output "Braking Status Flag"
    in scenario where
        "A pedestrian trying to cross the street in fog."
`;

describe('clauses', () => {
  it('splits and joins the assuming / ensuring tail', () => {
    const text =
      REQUIREMENT.trimEnd() +
      '\n    assuming "fog_density <= 50" & "daylight"\n    ensuring "keep moving"\n';
    const c = splitClauses(text);
    expect(c.assuming).toEqual(['fog_density <= 50', 'daylight']);
    expect(c.ensuring).toEqual(['keep moving']);
    expect(c.head.trimEnd()).toBe(REQUIREMENT.trimEnd());
    expect(joinClauses(c.head, c.assuming, c.ensuring)).toBe(text);
    expect(splitClauses(REQUIREMENT)).toEqual({
      head: REQUIREMENT.trimEnd(),
      assuming: [],
      ensuring: [],
    }); // the regex leaves trailing whitespace out of the body, as Python's does
  });
  it('leaves comment lines that mention the keywords alone', () => {
    const text = '#   assuming  - the baseline\n' + REQUIREMENT.trimEnd() + '\n    assuming "x"\n';
    expect(splitClauses(text).assuming).toEqual(['x']);
  });
});

describe('applyChanges mirrors refine.apply_changes', () => {
  it('swaps modules, adds clause items once, extends existing clauses', () => {
    const changes: Change[] = [
      {
        kind: 'S',
        from: 'a',
        layer: 'system',
        task: 'Apply Brakes',
        module: 'latched_braking',
        text: '',
      },
      {
        kind: 'R',
        from: 'b',
        layer: 'requirement',
        clause: 'ensuring',
        item: 'vehicle resumes within 10 s once the crossing is clear',
        text: '',
      },
      {
        kind: 'D',
        from: 'c',
        layer: 'requirement',
        clause: 'assuming',
        item: 'fog_density <= 50',
        text: '',
      },
      {
        kind: 'D',
        from: 'c',
        layer: 'requirement',
        clause: 'assuming',
        item: 'fog_density <= 50',
        text: '',
      },
      { kind: 'T', from: 'd', layer: 'scenario', text: 'fix the trigger' },
    ];
    const r1 = applyChanges(REQUIREMENT, changes);
    expect(r1).toContain(
      '"Apply Brakes" if "pedestrian detection flag=True" performed by "latched_braking"',
    );
    expect(r1).toContain('performed by "yolov5s"');
    expect(r1).toContain(
      '\n    assuming "fog_density <= 50"\n    ensuring "vehicle resumes within 10 s once the crossing is clear"\n',
    );
    expect(r1).not.toContain('proportional_braking');
    const r2 = applyChanges(r1, [
      {
        kind: 'D',
        from: 'e',
        layer: 'requirement',
        clause: 'assuming',
        item: 'ego_speed <= 5',
        text: '',
      },
    ]);
    expect(splitClauses(r2).assuming).toEqual(['fog_density <= 50', 'ego_speed <= 5']);
    expect((r2.match(/assuming/g) ?? []).length).toBe(1);
    expect((r2.match(/ensuring/g) ?? []).length).toBe(1);
  });
  it('replaces and removes items for tighten / loosen / drop', () => {
    const base = REQUIREMENT.trimEnd() + '\n    assuming "fog_density <= 50" & "daylight"\n';
    const tightened = applyChanges(base, [
      {
        kind: 'D',
        from: 'x',
        layer: 'requirement',
        clause: 'assuming',
        item: 'fog_density <= 30',
        replaces: 'fog_density <= 50',
        text: '',
      },
    ]);
    expect(splitClauses(tightened).assuming).toEqual(['fog_density <= 30', 'daylight']);
    const dropped = applyChanges(base, [
      {
        kind: 'D',
        from: 'x',
        layer: 'requirement',
        clause: 'assuming',
        item: 'daylight',
        remove: true,
        text: '',
      },
    ]);
    expect(splitClauses(dropped).assuming).toEqual(['fog_density <= 50']);
  });
  it('refuses a task that is not there', () => {
    expect(() => replaceModule(REQUIREMENT, 'Fly', 'x')).toThrow(/not found/);
  });
});

describe('renderDiff reproduces requirement_diff.md', () => {
  it('matches the file the Python refiner wrote for round 2', () => {
    const r0 = fixtureText(`${ROUND_2}/R0.dsl`);
    const r1 = fixtureText(`${ROUND_2}/R1.dsl`);
    const expected = fixtureText(`${ROUND_2}/requirement_diff.md`);
    const changes: Change[] = [
      {
        kind: 'R',
        from: 'StandoffUnnecessaryStop',
        layer: 'requirement',
        clause: 'ensuring',
        item: 'vehicle resumes within 10 s once the crossing is clear',
        text: 'ensuring "vehicle resumes within 10 s once the crossing is clear"',
      },
      {
        kind: 'T',
        from: 'artefact:crossing_trigger_8m',
        layer: 'scenario',
        text: "scratch.temp: trigger the crossing on a timer or on the pedestrian's own distance to the crossing point, not on proximity to the ego.",
      },
      {
        kind: 'T',
        from: 'artefact:no_encounter_geometry',
        layer: 'scenario',
        text: 'scratch.temp: choose the lane/spot so the ego approaches the crossing point; or reject such samples with a Scenic `require`.',
      },
      {
        kind: 'T',
        from: 'artefact:distance_parameter_dead',
        layer: 'scenario',
        text: "scratch.temp: place the pedestrian from `distance` (as scenic_template.py's get_pedestrian_pos did), or drop the parameter from old.bnf.",
      },
    ];
    expect(renderDiff(r0, r1, changes, ROUND_2)).toBe(expected);
  });
  it('formats hunks like difflib for a one-line change in the middle', () => {
    const a = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const b = ['a', 'b', 'c', 'd', 'X', 'f', 'g', 'h', 'i'];
    expect(unifiedDiff(a, b, 'A', 'B')).toEqual([
      '--- A',
      '+++ B',
      '@@ -2,7 +2,7 @@',
      ' b',
      ' c',
      ' d',
      '-e',
      '+X',
      ' f',
      ' g',
      ' h',
    ]);
    expect(unifiedDiff(a, a, 'A', 'B')).toEqual([]);
  });
});
