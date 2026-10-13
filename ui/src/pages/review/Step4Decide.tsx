import {
  AssumptionDecisionCard,
  ObstacleDecisionCard,
  ScopeDecisionCard,
} from '@/components/review/DecisionCards';
import { prefillWords } from '@/components/review/VerdictControl';
import { Disclosure } from '@/components/ui/Disclosure';
import { TextAreaField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { belowBarWords, bySupport, isSupported } from '@/domain/support';
import type { AnalysisReport } from '@/services/schemas';
import type { Draft, DraftAction } from '@/state/draft';
import { unconfirmedCount } from '@/state/draft';

/** Step 4: a verdict per obstacle, per scope item and per domain assumption. */
export function Step4Decide({
  report,
  previous,
  draft,
  dispatch,
}: {
  report: AnalysisReport;
  previous: AnalysisReport | null;
  draft: Draft;
  dispatch: (action: DraftAction) => void;
}) {
  const obstacles = [...report.obstacles].sort(bySupport);
  const above = obstacles.filter(isSupported);
  const below = obstacles.filter((o) => !isSupported(o));
  const belowOpen = below.filter((o) => !draft.doc.obstacles[o.id]?.verdict).length;
  const card = (o: (typeof obstacles)[number]) => (
    <ObstacleDecisionCard
      key={o.id}
      obstacle={o}
      draft={draft}
      dispatch={dispatch}
      hasPrevious={Boolean(previous)}
      sampling={report.sampling}
    />
  );
  const scopeIds = Object.keys(draft.doc.scope);
  const assumptionTexts = Object.keys(draft.doc.assumptions ?? {});
  const unconfirmed = unconfirmedCount(draft);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      {draft.prefill ? (
        <Notice tone="tool" title="Pre-filled verdicts">
          {prefillWords(draft.prefill)}. {unconfirmed} still to confirm or change.
        </Notice>
      ) : null}
      {draft.signed ? (
        <Notice tone="success">
          Signed by {draft.signed.reviewer}. Changing anything starts a new, unsigned draft.
        </Notice>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="obstacles-title">
        <h2 id="obstacles-title" className="text-lg">
          Obstacles <span className="text-sm font-normal text-text-muted">in order of support</span>
        </h2>
        {obstacles.length === 0 ? (
          <p className="text-sm text-text-muted">The analysis lists no obstacles.</p>
        ) : null}
        {obstacles.length && !above.length ? (
          <p className="text-sm text-text-muted">
            No obstacle is above the support bar this round.
          </p>
        ) : null}
        {above.map(card)}
        {below.length ? (
          <Disclosure
            className="rounded-xl bg-surface-sunken px-4 py-2"
            summary={
              <>
                {belowBarWords(below)}
                {belowOpen ? (
                  <span className="font-normal text-text-muted">
                    {' '}
                    · {belowOpen} still need{belowOpen === 1 ? 's' : ''} a verdict
                  </span>
                ) : (
                  <span className="font-normal text-text-muted"> · all decided</span>
                )}
              </>
            }
          >
            <div className="flex flex-col gap-4 pb-2">{below.map(card)}</div>
          </Disclosure>
        ) : null}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="scope-title">
        <h2 id="scope-title" className="text-lg">
          Scope{' '}
          <span className="text-sm font-normal text-text-muted">
            set-aside rules and test artefacts
          </span>
        </h2>
        {scopeIds.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing set aside, no artefact candidates.</p>
        ) : null}
        {scopeIds.map((sid) => (
          <ScopeDecisionCard key={sid} sid={sid} draft={draft} dispatch={dispatch} />
        ))}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="assumptions-title">
        <h2 id="assumptions-title" className="text-lg">
          Domain assumptions{' '}
          <span className="text-sm font-normal text-text-muted">
            what is assumed about the world
          </span>
        </h2>
        {assumptionTexts.length === 0 ? (
          <p className="text-sm text-text-muted">
            none stated — every failure counted as the car's.
          </p>
        ) : null}
        {assumptionTexts.map((t) => (
          <AssumptionDecisionCard key={t} text={t} draft={draft} dispatch={dispatch} />
        ))}
        <Disclosure summary="Add assumptions">
          <TextAreaField
            label="One per line, about the world, never the car"
            rows={3}
            value={(draft.doc.added_assumptions ?? []).map((a) => a.text).join('\n')}
            onChange={(e) =>
              dispatch({ type: 'added_assumptions/set', lines: e.target.value.split('\n') })
            }
          />
        </Disclosure>
      </section>
    </div>
  );
}
