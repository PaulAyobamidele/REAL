import { describe, expect, it } from 'vitest';

import { checkResultSchema } from '@/services/authoring';

const moduleCheck = { module: null, task: 'T', runs: false, default: 'd' };

describe("the parser's answer", () => {
  it('accepts a requirement with one sub-goal (the sub-goal itself, no combinator)', () => {
    const result = checkResultSchema.parse({
      ok: true,
      tree: {
        temporal: 'MAINTAIN',
        objective: 'goal',
        refinement: { objective: 'sub-goal', agent: 'component', operations: [] },
        scenario: 'situation',
      },
      covered: null,
      assumptions: [],
      soft_goals: [],
      scenario_constraints: {},
      modules: { perception: moduleCheck, braking: moduleCheck },
    });
    expect(result.ok && result.tree.refinement).toMatchObject({ objective: 'sub-goal' });
  });
});
