import {
  AssumptionDecisionCard,
  ObstacleDecisionCard,
  ScopeDecisionCard,
} from '@/components/review/DecisionCards';
import { prefillWords } from '@/components/review/VerdictControl';
import { Disclosure } from '@/components/ui/Disclosure';
import { TextAreaField } from '@/components/ui/Field';
import { Instructions } from '@/components/ui/Instructions';
import { Notice } from '@/components/ui/Notice';
import { belowBarWords, bySupport, isSupported } from '@/domain/support';
import type { AnalysisReport } from '@/services/schemas';
import type { Draft, DraftAction } from '@/state/draft';
import { unconfirmedCount } from '@/state/draft';
import { STUDY } from '@/study/config';

/** Step 4: a verdict per obstacle, per scope item and per domain assumption. */
export function Step4Decide({
  report,
  previous,
  draft,
  dispatch,
  r0 = '',
}: {
  /** the requirement as run (the study's triage shows what is already in it) */
  r0?: string;
  report: AnalysisReport;
  previous: AnalysisReport | null;
  draft: Draft;
  dispatch: (action: DraftAction) => void;
}) {
  // the study build: one list, A to Z - nothing says which obstacles the tool supports
  const obstacles = [...report.obstacles].sort((a, b) =>
    STUDY ? a.id.localeCompare(b.id) : bySupport(a, b),
  );
  const above = STUDY ? obstacles : obstacles.filter(isSupported);
  const below = STUDY ? [] : obstacles.filter((o) => !isSupported(o));
  const belowOpen = below.filter((o) => !draft.doc.obstacles[o.id]?.verdict).length;
  const card = (o: (typeof obstacles)[number]) => (
    <ObstacleDecisionCard
      key={o.id}
      obstacle={o}
      draft={draft}
      dispatch={dispatch}
      hasPrevious={Boolean(previous)}
      sampling={report.sampling}
      r0={r0}
    />
  );
  const scopeIds = Object.keys(draft.doc.scope);
  const assumptionTexts = Object.keys(draft.doc.assumptions ?? {});
  const unconfirmed = unconfirmedCount(draft);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      {draft.prefill ? (
        <Notice tone="tool" title="Pre-filled decisions">
          {prefillWords(draft.prefill)}. Select a choice on each card to confirm or change it;{' '}
          {unconfirmed} still to confirm.
        </Notice>
      ) : null}
      {draft.signed ? (
        <Notice tone="success">
          Signed by {draft.signed.reviewer}. Changing anything starts a new, unsigned draft.
        </Notice>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="obstacles-title">
        <Instructions cta="Decide world or car for each obstacle, and give your reason in your own words.">
          <p>
            Each obstacle is a group of failed runs that share a likely cause. Decide, for each one,
            whether <strong>the world explains these failures</strong>, in which case the obstacle’s
            domain assumption (or soft goal) is added to the refined requirement for you, or whether{' '}
            <strong>the car is at fault</strong>, in which case it remains a failure.
          </p>
          <p className="mt-2">
            You decide what to do with the failures that remain in the next step, Requirement
            revision: refine the requirement, confirm a real system failure and choose a fix, or
            leave it for the next round.
          </p>
        </Instructions>
        <h2 id="obstacles-title" className="text-lg">
          Obstacles{' '}
          {STUDY ? null : (
            <span className="text-sm font-normal text-text-muted">in order of support</span>
          )}
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
        <Instructions cta="Give each item a verdict and a short reason.">
          <p>
            Some runs were set aside by a scope rule, or flagged as possible test artefacts, so they
            were not counted. Decide whether each is right. <strong>Out of scope</strong>: the
            situation is genuinely outside what the car must handle, and the requirement will say
            so. <strong>In scope</strong>: the situation is realistic, so the rule is dropped and
            those runs count. <strong>Scenario defect</strong>: the test itself was wrong and must
            be fixed and measured again.
          </p>
        </Instructions>
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
        <Instructions cta="Decide each assumption and give your reason; add any new assumption about the world, never about the car.">
          <p>
            Domain assumptions say what must be true of the world for a failure to count against the
            car. <strong>Keep</strong> an assumption as written, <strong>tighten</strong> it to
            cover less or <strong>loosen</strong> it to cover more (giving the new text in either
            case), or <strong>drop</strong> it.
          </p>
        </Instructions>
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
