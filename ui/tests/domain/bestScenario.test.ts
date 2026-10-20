import { describe, expect, it } from 'vitest';

import { bestScenario } from '@/domain/bestScenario';
import type { TestCase } from '@/domain/testCases';

const tc = (id: string, passed: number, failed: number, phenotype = `p${id}`): TestCase => ({
  id,
  settings: {},
  phenotype,
  runs: [],
  passed,
  failed,
  stalled: 0,
  notCounted: 0,
});

describe('the best scenario', () => {
  it('is the test case that passes least often, the lowest id on a tie', () => {
    const r = bestScenario([tc('3', 3, 0), tc('7', 1, 2), tc('5', 1, 2), tc('9', 0, 0)], null);
    expect(r?.testCase.id).toBe('5');
    expect(r?.passRate).toBeCloseTo(1 / 3);
    expect(r?.from).toBe('computed');
  });

  it('is the one the run recorded, when it names one', () => {
    const r = bestScenario([tc('1', 0, 3), tc('2', 2, 1, 'the recorded one')], 'the recorded one');
    expect(r?.testCase.id).toBe('2');
    expect(r?.from).toBe('recorded');
  });
});
