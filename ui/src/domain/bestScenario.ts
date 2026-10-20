import type { TestCase } from './testCases';

/**
 * The round's best scenario, as the test search defines it
 * (scripts/evolve/grid.py: `worst = min(rows, key=(pct, scenario_id))`): the
 * test case in which the system passes least often - the best at exposing a
 * weakness, so the worst case for the car. The run's own record wins when it
 * names one (run_meta `worst_phenotype`, the scenario the video was made of).
 */
export function bestScenario(
  cases: TestCase[],
  recorded: string | null | undefined,
): { testCase: TestCase; passRate: number; from: 'recorded' | 'computed' } | null {
  const rate = (c: TestCase) => c.passed / (c.passed + c.failed);
  const counted = cases.filter((c) => c.passed + c.failed > 0);
  if (recorded) {
    const hit = counted.find((c) => c.phenotype === recorded);
    if (hit) return { testCase: hit, passRate: rate(hit), from: 'recorded' };
  }
  let best: TestCase | null = null;
  for (const c of counted) {
    if (!best || rate(c) < rate(best) || (rate(c) === rate(best) && Number(c.id) < Number(best.id)))
      best = c;
  }
  return best ? { testCase: best, passRate: rate(best), from: 'computed' } : null;
}
