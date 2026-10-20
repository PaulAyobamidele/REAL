import { useCallback, useMemo, useState } from 'react';

import { CarlaVideo } from '@/components/evidence/CarlaVideo';
import { ScenarioReplay } from '@/components/evidence/ScenarioReplay';
import { FileErrorNotice, Loading } from '@/components/feedback';
import { Instructions } from '@/components/ui/Instructions';
import { SETTING_COLUMNS } from '@/domain/evidence';
import type { RoundSummary } from '@/domain/lineage';
import type { RunResult, TestCase } from '@/domain/testCases';
import { useAsync } from '@/hooks/useAsync';
import { useBestScenario } from '@/hooks/useBestScenario';
import { useWorkspace } from '@/state/WorkspaceContext';
import { cx } from '@/utils/format';

const RESULT_TONE: Record<RunResult, string> = {
  passed: 'text-pass',
  'passed, stopped and never moved on': 'text-caution',
  failed: 'text-fail font-medium',
  'not counted': 'text-text-faint',
};

/**
 * The worked example, its own page between steps 1 and 2: the round's best
 * scenario - the test case in which the system fails most often
 * (domain/bestScenario.ts) - with what the term means, CARLA's camera
 * recording of it where the round has one, and its runs replayed from their
 * recorded traces.
 */
export function StepExample({ round }: { round: RoundSummary }) {
  const { trace } = useWorkspace();
  const { rowsState, testCase: tc, video } = useBestScenario(round);

  const pathOf = useCallback(
    (run: TestCase['runs'][number]) => {
      const p = run.row.label?.trace ?? `traces/${run.row.key}.json`;
      return round.files.includes(p) ? p : null;
    },
    [round.files],
  );
  const withTrace = useMemo(() => (tc ? tc.runs.filter((r) => pathOf(r)) : []), [tc, pathOf]);
  const [chosen, setChosen] = useState<string | null>(null);
  const run =
    withTrace.find((r) => r.row.key === chosen) ??
    withTrace.find((r) => r.result === 'failed') ??
    withTrace[0] ??
    null;
  const path = run ? pathOf(run) : null;
  const traceState = useAsync(path ? () => trace(round, path) : null, [round.dir, path]);

  if (rowsState.status === 'loading') return <Loading what="simulations.csv" />;
  if (rowsState.status === 'error')
    return <FileErrorNotice error={rowsState.error} consequence="The example cannot be shown." />;
  if (!tc) return <p className="text-sm text-text-muted">No test case has a counted run yet.</p>;
  const counted = tc.passed + tc.failed;
  const settings = SETTING_COLUMNS.filter((c) => tc.settings[c.key]).map(
    (c) => `${c.header} ${tc.settings[c.key]}${c.unit ?? ''}`,
  );

  return (
    <div className="flex flex-col gap-5">
      <Instructions cta="Watch the recording to see the scene as the car's camera saw it, then use the replay to see exactly when the car entered the safety margin; switch runs to compare a failed run with one that passed.">
        <p>
          Before the full report, one test case shown in detail. In this project the{' '}
          <strong>best scenario</strong> is the test case the test search ranks highest: the one in
          which the system under test fails most often. It is “best” from the tester’s point of view
          because it exposes a weakness most reliably; for the car, it is the worst case. In this
          round it is <strong>test case {tc.id}</strong>, which failed in {tc.failed} of its{' '}
          {counted} counted runs.
        </p>
      </Instructions>

      <section className="card flex min-w-0 flex-col gap-4 p-5" aria-label="The best scenario">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg">Test case {tc.id}</h2>
          <span className="text-sm text-text-muted">
            {settings.join(' · ')} · failed in {tc.failed} of {counted} runs
          </span>
        </div>

        <div className={cx('grid items-start gap-5', video && 'xl:grid-cols-2')}>
          {video ? <CarlaVideo round={round} file={video} /> : null}

          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-semibold">Replay of a counted run, from its trace</h3>
            {withTrace.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Run to replay">
                {withTrace.map((r) => (
                  <button
                    key={r.row.key}
                    type="button"
                    aria-pressed={r === run}
                    onClick={() => setChosen(r.row.key)}
                    className={cx(
                      'rounded-full border px-3 py-1 text-xs transition-colors duration-fast',
                      r === run
                        ? 'border-text bg-text font-semibold text-white'
                        : 'border-border bg-surface-raised text-text hover:bg-fill',
                    )}
                  >
                    Run {r.row.simIndex ?? '?'} ·{' '}
                    <span className={r === run ? '' : RESULT_TONE[r.result]}>{r.result}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {!path ? (
              <p className="text-sm text-text-muted">No trace was saved for this test case.</p>
            ) : traceState.status === 'loading' ? (
              <Loading what={path} />
            ) : traceState.status === 'error' ? (
              <FileErrorNotice error={traceState.error} />
            ) : traceState.status === 'ready' ? (
              <ScenarioReplay key={path} trace={traceState.data} />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
