import { Button } from '@/components/ui/Button';
import type { RunTestState } from '@/state/runTest';
import { cx, displayDate } from '@/utils/format';

/** Where a Run Test stands: the confirmation, the job on the cluster, the run coming back. */
export function RunPanel({
  state,
  fileName,
  onSubmit,
  onRetry,
  onDismiss,
}: {
  state: RunTestState;
  fileName: string;
  onSubmit: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (state.phase === 'idle') return null;
  const name = fileName.endsWith('.dsl') ? fileName : `${fileName}.dsl`;
  return (
    <section
      className={cx(
        'card flex flex-col gap-2.5 p-4',
        state.phase === 'error' && 'ring-1 ring-fail/40',
      )}
      aria-label="Run test"
      aria-live="polite"
    >
      {state.phase === 'looking' ? <Line>Looking for runs of this requirement…</Line> : null}

      {state.phase === 'confirm' ? (
        <>
          <p className="text-sm text-text">
            {state.again
              ? 'Run it again on the cluster?'
              : 'No run used this requirement yet. Run it on the cluster?'}
          </p>
          <p className="text-xs text-text-muted">
            32 test cases × 5 runs, about 2 h plus queue time, on your allocation. Saved as{' '}
            <code>requirements/{name}</code>.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={onSubmit}>
              Submit to the cluster
            </Button>
            <Button size="sm" variant="quiet" onClick={onDismiss}>
              Cancel
            </Button>
          </div>
        </>
      ) : null}

      {state.phase === 'submitting' ? <Line>Submitting…</Line> : null}

      {state.phase === 'tracking' ? (
        <>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>
              Job <span className="num">{state.job.job_id}</span> ·{' '}
              <span className="text-text-muted">{state.job.state.toLowerCase()}</span>
            </span>
            <span className="text-xs text-text-faint">
              since {displayDate(state.job.submitted_at)}
            </span>
          </div>
          <Progress done={state.job.progress?.done ?? 0} total={state.job.progress?.total ?? 32} />
          <p className="text-xs text-text-muted">
            {state.job.progress
              ? `test case ${state.job.progress.done} of ${state.job.progress.total}`
              : state.job.state === 'PENDING'
                ? 'waiting in the queue'
                : 'starting the simulator'}
            . The results open here when it is done; you can leave this page.
          </p>
        </>
      ) : null}

      {state.phase === 'fetching' ? (
        <>
          <Progress done={1} total={1} />
          <Line>Bringing the run back and analysing it…</Line>
        </>
      ) : null}

      {state.phase === 'opening' ? <Line>Opening the test execution result…</Line> : null}

      {state.phase === 'error' ? (
        <>
          <p className="text-sm text-fail">{state.message}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onRetry}>
              {state.job ? 'Check again' : 'Try again'}
            </Button>
            <Button size="sm" variant="quiet" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Line({ children }: { children: string }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-fill-strong"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <div
        className="h-full rounded-full bg-human motion-safe:transition-all motion-safe:duration-step"
        style={{ width: `${total ? (done / total) * 100 : 0}%` }}
      />
    </div>
  );
}
