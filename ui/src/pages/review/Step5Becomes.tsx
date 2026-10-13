import { useMemo, useState } from 'react';

import { ChangeList, RequirementDiff } from '@/components/requirement/RequirementDiff';
import { Button } from '@/components/ui/Button';
import { KindChip } from '@/components/ui/Chip';
import { Disclosure } from '@/components/ui/Disclosure';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { FileName } from '@/components/ui/Section';
import { planChanges } from '@/domain/changes';
import { completionGaps, isComplete, validateDecisions } from '@/domain/decisions';
import { isToolProposal, type RoundSummary } from '@/domain/lineage';
import { applyChanges } from '@/domain/requirementText';
import type { AnalysisReport } from '@/services/schemas';
import { deliverSignedFiles, prepareSigning } from '@/services/signing';
import { unconfirmedCount, type Draft, type DraftAction } from '@/state/draft';
import { useWorkspace } from '@/state/WorkspaceContext';
import { displayDate } from '@/utils/format';

/** Step 5: R0 and R1 side by side, the changes labelled, and the one action that records the decision. */
export function Step5Becomes({
  round,
  report,
  draft,
  dispatch,
}: {
  round: RoundSummary;
  report: AnalysisReport;
  draft: Draft;
  dispatch: (action: DraftAction) => void;
}) {
  const { workspace, reload } = useWorkspace();
  const r0 = round.requirementText ?? '';
  const plan = useMemo(() => planChanges(draft.doc, report, r0), [draft.doc, report, r0]);
  const r1Generated = useMemo(() => {
    try {
      return r0.trim() ? applyChanges(r0, plan.changes) : '';
    } catch (error) {
      return `# could not derive R1: ${error instanceof Error ? error.message : String(error)}\n${r0}`;
    }
  }, [r0, plan.changes]);
  const r1 = draft.r1Override ?? r1Generated;
  const edited = draft.r1Override !== null && draft.r1Override.trim() !== r1Generated.trim();
  const problems = validateDecisions(draft.doc);
  const gaps = completionGaps(draft.doc);
  const complete = isComplete(draft.doc);
  const unconfirmed = unconfirmedCount(draft);
  const reviewer = draft.reviewer.trim();
  const existing = round.decisions;
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = workspace?.source.canWrite ?? false;

  const blockers: string[] = [];
  if (!r0.trim()) blockers.push('no requirement text (R0) for this round');
  if (problems.length) blockers.push(...problems);
  if (!complete) blockers.push(...gaps);
  if (unconfirmed)
    blockers.push(
      `${unconfirmed} pre-filled verdict${unconfirmed === 1 ? '' : 's'} to confirm (step 4)`,
    );
  if (plan.problems.length) blockers.push(...plan.problems.map((p) => p.message));
  if (!reviewer) blockers.push('your name');
  if (existing && !isToolProposal(existing) && !replaceConfirmed)
    blockers.push('confirm replacing the signed decisions.json');

  const sign = async () => {
    if (!workspace) return;
    setBusy(true);
    setError(null);
    try {
      const result = prepareSigning({
        doc: draft.doc,
        report,
        r0,
        reviewer,
        r1Override: edited ? r1 : null,
      });
      const outcome = await deliverSignedFiles(workspace.source, round.dir, result.files);
      dispatch({
        type: 'signed',
        record: {
          at: new Date().toISOString(),
          mode: outcome.mode,
          paths: outcome.paths,
          reviewer,
        },
        doc: result.doc,
      });
      if (outcome.mode === 'written') await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      {draft.signed ? (
        <Notice
          tone="success"
          title={draft.signed.mode === 'written' ? 'Written' : 'Downloaded'}
          role="status"
        >
          Signed by {draft.signed.reviewer} at {displayDate(draft.signed.at)}.{' '}
          {draft.signed.mode === 'written' ? (
            <>
              In <FileName>{round.dir}/</FileName>:{' '}
              {draft.signed.paths.map((p) => (
                <FileName key={p}>{p.split('/').pop()}</FileName>
              ))}
              . Nothing was launched.
            </>
          ) : (
            <>
              Downloaded{' '}
              {draft.signed.paths.map((p) => (
                <FileName key={p}>{p}</FileName>
              ))}
              . Copy them into <FileName>{round.dir}/</FileName>.
            </>
          )}
        </Notice>
      ) : null}

      <section className="card flex flex-col gap-4 p-5" aria-label="Changes">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg">Changes</h2>
          <ul className="ml-auto flex flex-wrap gap-1.5" aria-label="Change kinds">
            {(['S', 'R', 'D', 'T'] as const).map((k) => (
              <li key={k}>
                <KindChip kind={k} long />
              </li>
            ))}
          </ul>
        </div>
        <ChangeList
          changes={plan.changes}
          emptyText="The decisions so far imply no change to the requirement."
        />
        {plan.problems.map((p) => (
          <Notice key={p.from} tone="error">
            {p.message}
          </Notice>
        ))}
      </section>

      <section className="card flex flex-col gap-4 p-5" aria-label="R0 and R1">
        {r0.trim() ? (
          <RequirementDiff r0={r0} r1={r1} />
        ) : (
          <Notice tone="error">No requirement text for this round.</Notice>
        )}
        <Disclosure summary={edited ? 'Edit R1 (edited by hand)' : 'Edit R1 before signing'}>
          <TextAreaField
            label="R1"
            rows={8}
            value={r1}
            onChange={(e) => dispatch({ type: 'r1/override', value: e.target.value })}
            hint={
              edited
                ? 'Edited by hand: not parse-checked here; the Python refiner re-checks it.'
                : undefined
            }
          />
          {draft.r1Override !== null ? (
            <Button
              size="sm"
              variant="quiet"
              className="mt-2"
              onClick={() => dispatch({ type: 'r1/override', value: null })}
            >
              Discard my edits
            </Button>
          ) : null}
        </Disclosure>
      </section>

      <section className="card flex flex-col gap-4 p-5" aria-label="Sign">
        <h2 className="text-lg">Sign</h2>
        <TextField
          label="Reviewer (your name)"
          required
          value={draft.reviewer}
          onChange={(e) => dispatch({ type: 'reviewer/set', value: e.target.value })}
          autoComplete="name"
          className="max-w-md"
        />
        {existing ? (
          <Notice
            tone={isToolProposal(existing) ? 'tool' : 'warning'}
            title="A decisions.json already exists"
          >
            {isToolProposal(existing) ? (
              <>It is the tool's proposal; signing replaces it.</>
            ) : (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(e) => setReplaceConfirmed(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Signed by {existing.reviewer ?? 'an unnamed reviewer'} on{' '}
                  {displayDate(existing.decided_at)}. Replace it.
                </span>
              </label>
            )}
          </Notice>
        ) : null}
        <p className="text-sm text-text-muted">
          Writes <FileName>decisions.json</FileName>, <FileName>R0.dsl</FileName>,{' '}
          <FileName>R1.dsl</FileName>, <FileName>requirement_diff.md</FileName>{' '}
          {canWrite ? (
            <>
              into <FileName>{round.dir}/</FileName>.
            </>
          ) : (
            <>as downloads (this source is read-only).</>
          )}
        </p>
        {blockers.length ? (
          <Disclosure summary={`Before signing (${blockers.length})`} defaultOpen compact>
            <ul className="list-disc pl-4 text-sm text-text-muted">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div>
          <Button
            variant="primary"
            disabled={blockers.length > 0 || busy || !workspace}
            busy={busy}
            onClick={sign}
          >
            Sign: write the decision files
          </Button>
        </div>
      </section>
    </div>
  );
}
