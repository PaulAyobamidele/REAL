import { describe, expect, it } from 'vitest';

import { scopeChange } from '@/domain/changes';
import { completionGaps, isComplete, needsLimit, validateDecisions } from '@/domain/decisions';
import type { DecisionsDoc } from '@/services/schemas';

const artefact = (over: Partial<DecisionsDoc['scope'][string]>): DecisionsDoc['scope'][string] => ({
  kind: 'artefact',
  evidence: 'n = 8',
  reason: 'I think these runs are not realistic',
  verdict: 'out_of_scope',
  ...over,
});

const doc = (s: DecisionsDoc['scope'][string]) =>
  ({ obstacles: {}, scope: { 'artefact:a': s }, assumptions: {} }) as unknown as DecisionsDoc;

describe('an out-of-scope test artefact', () => {
  it('writes its stated limit into R1, never the reason', () => {
    const c = scopeChange(
      'artefact:a',
      artefact({ limit: 'the pedestrian crosses ahead of the car' }),
      null,
    );
    expect(c?.item).toBe('the pedestrian crosses ahead of the car');
    expect(c?.text).not.toContain('I think');
  });

  it('cannot be signed without the limit', () => {
    const s = artefact({ limit: null });
    expect(needsLimit(s)).toBe(true);
    expect(isComplete(doc(s))).toBe(false);
    expect(completionGaps(doc(s)).join(' ')).toMatch(/without the limit/);
    expect(isComplete(doc(artefact({ limit: 'the pedestrian crosses ahead of the car' })))).toBe(
      true,
    );
  });

  it('is not needed when a rule states the limit itself, or for the other verdicts', () => {
    expect(
      needsLimit(artefact({ rule: { param: 'fog_density', op: '>', value: 80 } } as never)),
    ).toBe(false);
    expect(needsLimit(artefact({ verdict: 'in_scope' }))).toBe(false);
  });

  it('refuses a limit about the car under test', () => {
    expect(validateDecisions(doc(artefact({ limit: 'ego_speed <= 5' }))).join(' ')).toMatch(
      /about the car/,
    );
    expect(validateDecisions(doc(artefact({ limit: 'fog_density <= 30' }))).join(' ')).not.toMatch(
      /about the car/,
    );
  });
});
