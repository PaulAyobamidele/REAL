import { useState } from 'react';

import { RunDialog } from '@/components/requirement/RunDialog';
import { Button } from '@/components/ui/Button';
import { Instructions } from '@/components/ui/Instructions';
import { runNumberOf, runOrdinal, type RoundSummary } from '@/domain/lineage';
import { useRunTest } from '@/state/runTest';
import { useWorkspace } from '@/state/WorkspaceContext';

/**
 * After signing (normal tool): run the refined requirement as the next run of
 * this requirement. The run records this round as its parent and the next
 * round number, and its results open on the Test Execution Report, marked as
 * that run (Step2Happened's banner).
 */
export function RunNext({ round, r1 }: { round: RoundSummary; r1: string }) {
  const { open, workspace } = useWorkspace();
  const next = runNumberOf(round, workspace?.rounds ?? []) + 1;
  const label = `R${next - 1}`;
  const [fileName, setFileName] = useState(`${label}_${new Date().toISOString().slice(0, 10)}`);
  const run = useRunTest({
    text: r1,
    fileName,
    open,
    landOn: 2,
    provenance: { parent_run_id: round.id, round: next },
  });
  return (
    <section className="flex flex-col gap-4" aria-label={`Run ${label}`}>
      <Instructions
        cta={`Press Run Compliance Test on ${label} to test it; its Test Execution Report opens when the run is done, marked as the ${runOrdinal(next).toLowerCase()}.`}
      >
        <p>
          The refined requirement, {label}, is signed. Running it is the{' '}
          {runOrdinal(next).toLowerCase()} of this requirement: the same scenarios, with your
          changes, so its report can be read beside this one.
        </p>
      </Instructions>
      <div className="flex justify-center">
        <Button
          variant="primary"
          size="lg"
          onClick={() => void run.start()}
          busy={Boolean(run.running)}
          disabled={!r1.trim()}
          title={`choose, check and run ${label} on the cluster`}
        >
          {run.running ?? `Run Compliance Test on ${label} ▸`}
        </Button>
      </div>
      {run.shown ? (
        <RunDialog
          title={`Run ${label} on the cluster: the ${runOrdinal(next).toLowerCase()}`}
          state={run.state}
          fileName={fileName}
          onFileName={setFileName}
          actions={{
            check: (o) => void run.check(o),
            back: run.back,
            submit: () => void run.submit(),
            close: run.close,
            openExisting: () => void run.openExisting(),
            openResults: (id) => void run.openResults(id),
            retry: () => void run.retry(),
            dismiss: run.dismiss,
          }}
        />
      ) : null}
    </section>
  );
}
