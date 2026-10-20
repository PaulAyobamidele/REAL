import { useMemo } from 'react';

import { bestScenario } from '@/domain/bestScenario';
import type { RoundSummary } from '@/domain/lineage';
import { testCases, type TestCase } from '@/domain/testCases';
import { useAsync } from '@/hooks/useAsync';
import { useWorkspace } from '@/state/WorkspaceContext';

/**
 * The round's best scenario (domain/bestScenario.ts) and CARLA's camera
 * recording of it, if the round has one: videos/<id>.mp4 (copied from the
 * job that recorded it), or the round's own best_scenario video when the
 * round names this test case as the one it recorded.
 */
export function useBestScenario(round: RoundSummary) {
  const { simulations } = useWorkspace();
  const rowsState = useAsync(() => simulations(round), [round.dir]);
  const cases = useMemo(
    () => (rowsState.status === 'ready' ? testCases(rowsState.data) : []),
    [rowsState],
  );
  const best = useMemo(() => bestScenario(cases, round.meta.worst_phenotype), [cases, round]);
  const testCase: TestCase | null = best?.testCase ?? null;
  const video = useMemo(() => {
    if (!testCase) return null;
    const own = `videos/${testCase.id}.mp4`;
    if (round.files.includes(own)) return own;
    if (round.meta.worst_phenotype && round.meta.worst_phenotype === testCase.phenotype)
      return (
        ['best_scenario_h264.mp4', 'best_scenario.mp4'].find((f) => round.files.includes(f)) ?? null
      );
    return null;
  }, [testCase, round]);
  return { rowsState, testCase, video };
}
