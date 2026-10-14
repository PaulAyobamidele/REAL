import { useCallback } from 'react';

import { EmptyState, FileErrorNotice } from '@/components/feedback';
import { StepShell } from '@/components/review/StepShell';
import { Notice } from '@/components/ui/Notice';
import { FileName } from '@/components/ui/Section';
import { previousOf } from '@/domain/lineage';
import { reviewProgress } from '@/domain/reviewProgress';
import { reportVersion } from '@/services/schemas';
import { useDrafts } from '@/state/DraftContext';
import type { DraftAction } from '@/state/draft';
import { useVisitedSteps } from '@/state/visitedSteps';
import { useWorkspace } from '@/state/WorkspaceContext';

import { Step1Asked } from './review/Step1Asked';
import { Step2Happened } from './review/Step2Happened';
import { Step3Pattern } from './review/Step3Pattern';
import { Step4Decide } from './review/Step4Decide';
import { Step5Becomes } from './review/Step5Becomes';

/** The round review: five steps, one per screen, over one round of the loaded workspace. */
export function ReviewPage({
  runId,
  step,
  focus,
}: {
  runId: string;
  step: number;
  focus?: string;
}) {
  const { workspace, roundById, state } = useWorkspace();
  const { ensureDraft, dispatch } = useDrafts();
  const round = roundById(runId);
  const visited = useVisitedSteps(runId, step);
  const dispatchFor = useCallback(
    (action: DraftAction) => round && dispatch(round.id, action),
    [dispatch, round],
  );

  if (!workspace) {
    return (
      <EmptyState title="No workspace loaded" action={<a href="#/">Load a workspace</a>}>
        {state.status === 'loading'
          ? `Loading ${state.label}…`
          : 'Load the workspace that holds this round first.'}
      </EmptyState>
    );
  }
  if (!round) {
    return (
      <EmptyState title="Round not found" action={<a href="#/lineage">See the rounds</a>}>
        No round with id <span className="font-mono">{runId}</span> in {workspace.source.label}.
      </EmptyState>
    );
  }
  const prev = previousOf(round, workspace.rounds);
  const previousReport = prev?.round.report ?? null;
  const roundLabel = (
    <>
      Run <span className="font-mono">{round.id}</span>
      {round.meta.round !== null && round.meta.round !== undefined
        ? ` · round ${round.meta.round}`
        : ''}
      {workspace.source.isExample ? ' · example data (bundled)' : ''}
    </>
  );

  if (!round.report) {
    return (
      <StepShell
        runId={round.id}
        step={step}
        roundLabel={roundLabel}
        progress={reviewProgress({ step, report: null, draft: null, visited })}
      >
        {round.reportError ? (
          <FileErrorNotice
            error={round.reportError}
            consequence="This round cannot be reviewed until its report loads."
          />
        ) : (
          <EmptyState title="This round is not yet analysed">
            There is no <FileName>analysis_report.json</FileName> in{' '}
            <FileName>{round.dir}/</FileName>. Run{' '}
            <code>python -m scripts.analysis.report {round.dir}</code>, then reload the workspace.
          </EmptyState>
        )}
      </StepShell>
    );
  }
  const report = round.report;
  const draft = ensureDraft(round, previousReport);
  const version = reportVersion(report);

  return (
    <StepShell
      runId={round.id}
      step={step}
      roundLabel={roundLabel}
      progress={reviewProgress({ step, report, draft, visited })}
    >
      {report.banner && step !== 1 ? (
        // a run still running (PARTIAL) or ended early (INCOMPLETE): said on every step
        <Notice
          tone="warning"
          title={report.banner.startsWith('PARTIAL') ? 'Results so far' : 'Incomplete run'}
        >
          {report.banner}
        </Notice>
      ) : null}
      {version < 2 && step >= 3 ? (
        <Notice tone="warning" title="Older analysis report">
          <FileName>analysis_report.json</FileName> has schema version {version}: it lacks the goal
          tree, the per-simulation outcomes and the change each mitigation implies. The review is
          limited and signing may be blocked; re-run{' '}
          <code>python -m scripts.analysis.report {round.dir}</code> for the full set.
        </Notice>
      ) : null}
      {round.decisionsError && step >= 4 ? (
        <FileErrorNotice
          error={round.decisionsError}
          consequence="Its verdicts could not be pre-filled; the review starts blank."
        />
      ) : null}
      {step === 1 ? <Step1Asked round={round} report={report} /> : null}
      {step === 2 ? (
        <Step2Happened
          round={round}
          report={report}
          previous={prev && previousReport ? { round: prev.round, report: previousReport } : null}
          previousRecorded={prev?.recorded ?? false}
        />
      ) : null}
      {step === 3 ? (
        <Step3Pattern
          round={round}
          report={report}
          previous={previousReport}
          draft={draft}
          focus={focus}
        />
      ) : null}
      {step === 4 ? (
        draft ? (
          <Step4Decide
            report={report}
            previous={previousReport}
            draft={draft}
            dispatch={dispatchFor}
          />
        ) : null
      ) : null}
      {step === 5 ? (
        draft ? (
          <Step5Becomes round={round} report={report} draft={draft} dispatch={dispatchFor} />
        ) : null
      ) : null}
    </StepShell>
  );
}
