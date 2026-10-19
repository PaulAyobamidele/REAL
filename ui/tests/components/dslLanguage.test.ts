import { describe, expect, it } from 'vitest';

import { contextOf, NEXT } from '@/components/requirement/dsl/language';

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
