import { describe, expect, it } from 'vitest';

import { contextOf, NEXT, targetAt } from '@/components/requirement/dsl/language';

describe('REAL-DSL in the editor', () => {
  it('knows which clause a string belongs to, and when one is open', () => {
    expect(contextOf('MAINTAIN "G" ')).toMatchObject({ clause: 'goal', after: 'string' });
    expect(
      contextOf('MAINTAIN "G" by "S" using "A" operationalized as "T" performed by "yo'),
    ).toMatchObject({
      clause: 'module',
      inString: true,
    });
    expect(
      contextOf('... in scenario where "s"\n  assuming "fog_density <= 50" & "'),
    ).toMatchObject({
      clause: 'assuming',
      inString: true,
    });
    expect(contextOf('# a comment with "quotes" and by\nMAINTAIN')).toMatchObject({
      clause: 'goal',
      after: 'keyword',
    });
  });

  it('offers only what the grammar allows next', () => {
    expect(NEXT.start).toEqual(['MAINTAIN', 'ACHIEVE']);
    expect(NEXT.goal).toEqual(['by']);
    expect(NEXT.module).toEqual(['taking input']);
    expect(NEXT.scenario).toEqual(['assuming', 'ensuring']);
    expect(NEXT.ensuring).toEqual(['&']);
  });
});

describe('hovering the text marks its box in the goal model', () => {
  const text = [
    'MAINTAIN "Safety"',
    '  by "Check" using "Perception"',
    '    operationalized as "Detect" performed by "yolov5s"',
    '    taking input "image" producing output "flag"',
    '  followed by "braking" using "Brakes"',
    '    operationalized as "Apply Brakes" performed by "proportional_braking"',
    '    taking input "flag" producing output "status"',
    '  in scenario where "a crossing"',
    '  assuming "fog_density <= 50" & "on foot"',
    '  ensuring "resume_within_s <= 10"',
  ].join('\n');
  const at = (s: string, k = 1) => targetAt(text, text.indexOf(s) + k);

  it('maps each string to its own box', () => {
    expect(at('"Safety"')).toEqual(['goal']);
    expect(at('"Check"')).toEqual(['sub.0']);
    expect(at('"Detect"')).toEqual(['op.0.0']);
    expect(at('"yolov5s"')).toEqual(['agent.0.0']);
    expect(at('"braking"')).toEqual(['sub.1']);
    expect(at('"proportional_braking"')).toEqual(['agent.1.0']);
    expect(at('"status"')).toEqual(['op.1.0']);
    expect(at('"fog_density')).toEqual(['domain.0']);
    expect(at('"on foot"')).toEqual(['domain.1']);
    expect(at('"resume_within_s')).toEqual(['soft.0']);
  });

  it('maps a keyword to what it introduces, and blank space to nothing', () => {
    expect(at('assuming')).toEqual(['domain']);
    expect(at('ensuring')).toEqual(['soft']);
    expect(at('MAINTAIN')).toEqual(['goal']);
    expect(at('performed by "yolov5s"')).toEqual(['agent.0.0']);
    expect(targetAt(text, text.indexOf('  by') + 0)).toBeNull();
  });
});
