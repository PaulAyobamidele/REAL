import { useId, useMemo, useState } from 'react';

import { DslEditor, type DslMark } from '@/components/requirement/DslEditor';
import { Instructions } from '@/components/ui/Instructions';
import type { RoundSummary } from '@/domain/lineage';
import { useAsync } from '@/hooks/useAsync';
import { LAYER_WORDS } from '@/components/review/MitigationMenu';
import type {
  AnalysisReport,
  Change,
  Mitigation,
  Obstacle,
  ObstacleDecision,
} from '@/services/schemas';
import { STUDY } from '@/study/config';
import type { Draft, DraftAction } from '@/state/draft';
import { useWorkspace } from '@/state/WorkspaceContext';
import { cx } from '@/utils/format';

import { OTHER_LAYERS, STUDY_MENU, type StudyMitigation } from '@/study/menu';
import { rejudge, type RunQuantities } from '@/study/rejudge';
import {
  carRequest,
  remainingFailures,
  resolutionOf,
  worldChanges,
  type Resolution,
} from '@/domain/triage';

const QUANTITIES = 'study_quantities.json';
const CAR_FIXES = STUDY_MENU.filter((m) => m.choice.startsWith('car_'));
const OTHER = STUDY_MENU.find((m) => m.choice === 'other')!;

/** A fix for a real system failure, as offered in step 5. */
interface FixOption {
  key: string;
  label: string;
  hint: string;
  mitigation: Mitigation;
}

/**
 * The study: its three saved car changes (C2-C4). The normal tool: the
 * analysis's catalogue for this obstacle, every layer but the requirement's,
 * each with the change it would make to the REAL-DSL.
 */
function fixOptions(entry: ObstacleDecision, obstacle: Obstacle | undefined): FixOption[] {
  if (STUDY)
    return CAR_FIXES.map((m) => ({
      key: m.choice,
      label: m.label,
      hint: m.hint,
      mitigation: { layer: m.layer, action: m.label, choice: m.choice } as Mitigation,
    }));
  const changes = (obstacle?.changes ?? {}) as Record<string, Change | undefined>;
  return entry.options
    .filter((o) => o.layer !== 'requirement')
    .map((o) => ({
      key: o.layer,
      label: `${LAYER_WORDS[o.layer] ?? o.layer}: ${o.action}`,
      // the REAL-DSL change, unless it only repeats the action (a test change has no slot)
      hint:
        changes[o.layer]?.text && !changes[o.layer]!.text.includes(o.action)
          ? changes[o.layer]!.text
          : '',
      mitigation: o,
    }));
}

/**
 * Step 5, the guided part, both builds (domain/triage.ts): the refined
 * requirement with what the triage added highlighted - the assumptions and
 * soft goals accepted in step 4 - and beside it the failures that remain,
 * each to be refined, confirmed as a system failure (with a car fix), or left
 * for the next round. The counts are the same simulations re-judged against
 * the refined requirement (study/rejudge.ts).
 */
export function Refinement({
  round,
  report,
  draft,
  dispatch,
  r0,
  r1,
  changes,
}: {
  round: RoundSummary;
  report: AnalysisReport;
  draft: Draft;
  dispatch: (action: DraftAction) => void;
  r0: string;
  r1: string;
  changes: Change[];
}) {
  const { workspace } = useWorkspace();
  const hasQuantities = round.files.includes(QUANTITIES);
  const qState = useAsync(
    hasQuantities && workspace
      ? async () =>
          JSON.parse(await workspace.source.readText(`${round.dir}/${QUANTITIES}`)) as RunQuantities
      : null,
    [round.dir, hasQuantities],
  );
  const rejudged = useMemo(() => {
    if (qState.status !== 'ready') return null;
    try {
      return rejudge(report, qState.data, r1).failure_model.failures;
    } catch {
      return null;
    }
  }, [qState, report, r1]);

  const added = useMemo(
    () => worldChanges(draft.doc, report.obstacles, r0),
    [draft.doc, report, r0],
  );
  const marks: DslMark[] = changes
    .map((c) => c.text.match(/"([^"]+)"\s*$/)?.[1] ?? c.text.match(/"([^"]+)"/)?.[1] ?? '')
    .filter(Boolean)
    .map((needle) => ({ needle, tone: 'added' as const }));
  const remaining = remainingFailures(draft.doc);
  const before = report.failure_model.failures;

  return (
    <div className="flex flex-col gap-5">
      <Instructions cta="Where you think the requirement should be adapted, refine it. For the others, confirm that they are real system failures, or leave them for the next round if the evidence is not enough.">
        <p>
          Highlighted in the refined requirement are the domain assumptions, and any soft goals,
          that you accepted in Obstacle triage: they have been added for you. Beside it are the
          failures that remain, the obstacles you judged to be the car’s.
          {rejudged !== null
            ? ` With the refined requirement, ${rejudged} of the ${before} failures still count against the car.`
            : ''}
        </p>
      </Instructions>

      {/* the refined requirement and what remains of its failures explain each other */}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="card flex min-w-0 flex-col gap-3 p-5" aria-label="Refined requirement">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg">Refined requirement</h2>
            <span className="text-sm text-text-muted">
              {added.length
                ? `${added.length} line${added.length === 1 ? '' : 's'} added from your triage`
                : 'nothing added from your triage yet'}
            </span>
          </div>
          <DslEditor
            value={r1}
            readOnly
            marks={marks}
            fileName="R1.dsl"
            status={
              <span className="rounded-sm px-1 text-text outline-2 outline-offset-1 outline-instructions outline-solid">
                added
              </span>
            }
          />
          {added.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {added.map((c) => (
                <li key={c.text} className="flex flex-wrap gap-x-2">
                  <code className="text-text">{c.text}</code>
                  <span className="text-text-muted">from {c.from}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {rejudged !== null ? (
            <p className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-surface-sunken px-3 py-2 text-sm">
              <span className="text-text-muted">Failures that count against the car:</span>
              <span className="num font-semibold text-text">{before}</span>
              <span aria-hidden="true">→</span>
              <span className={cx('num font-semibold', rejudged ? 'text-fail' : 'text-text')}>
                {rejudged}
              </span>
              <span className="text-xs text-text-muted">the same runs, re-judged</span>
            </p>
          ) : null}
          {rejudged !== null && rejudged === before && added.length ? (
            <p className="text-xs text-text-muted">
              The count does not change because the lines added are not measured in these
              simulations (free text, or already assumed). They are recorded in the refined
              requirement, but the tool cannot check them automatically.
            </p>
          ) : null}
        </section>

        <section className="card flex min-w-0 flex-col gap-3 p-5" aria-label="Failures that remain">
          <h2 className="text-lg">Failures that remain</h2>
          {remaining.length === 0 ? (
            <p className="text-sm text-text-muted">
              None: you judged every obstacle to be explained by the world, or have not triaged the
              car’s yet.
            </p>
          ) : (
            remaining.map((id) => (
              <RemainingFailure
                key={id}
                id={id}
                entry={draft.doc.obstacles[id]!}
                suggestion={carRequest(report.obstacles.find((o) => o.id === id))}
                fixes={fixOptions(
                  draft.doc.obstacles[id]!,
                  report.obstacles.find((o) => o.id === id),
                )}
                dispatch={dispatch}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function RemainingFailure({
  id,
  entry,
  suggestion,
  fixes,
  dispatch,
}: {
  id: string;
  entry: ObstacleDecision;
  /** the fixes for a real system failure */
  fixes: FixOption[];
  /** an idea the analysis had for this obstacle, worded as a requirement on the car */
  suggestion: string | null;
  dispatch: (action: DraftAction) => void;
}) {
  const name = useId();
  const resolution = resolutionOf(entry);
  const saved = entry.mitigation as StudyMitigation | null;
  const [words, setWords] = useState(resolution === 'refine' ? (saved?.action ?? '') : '');
  // which fix is picked, kept here so "another change" shows as picked before its words
  const [fix, setFix] = useState<string | null>(() => {
    if (resolution !== 'system' || !saved) return null;
    const listed = fixes.find(
      (f) =>
        f.mitigation.layer === saved.layer &&
        (f.mitigation.action === saved.action || f.key === saved.choice),
    );
    return listed ? listed.key : 'other';
  });
  const [otherWords, setOtherWords] = useState(fix === 'other' ? (saved?.action ?? '') : '');
  const [otherLayer, setOtherLayer] = useState(fix === 'other' ? (saved?.layer ?? 'data') : 'data');

  const resolve = (r: Resolution | null, m: Mitigation | null) =>
    dispatch({ type: 'obstacle/resolve', id, resolution: r, mitigation: m });
  const refine = (text: string): StudyMitigation | null =>
    text.trim() ? { layer: 'requirement', action: text.trim(), choice: 'requirement' } : null;
  const other = (text: string, layer: string): Mitigation | null =>
    text.trim()
      ? STUDY
        ? ({ layer, action: text.trim(), choice: 'other' } as StudyMitigation)
        : { layer, action: text.trim() }
      : null;

  return (
    <article className="panel flex flex-col gap-3 rounded-xl p-4" aria-label={`Remaining: ${id}`}>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-semibold">{id}</h3>
        <p className="num text-xs text-text-muted">{entry.evidence}</p>
        {entry.reason ? (
          <p className="text-xs text-text-muted">
            Your reason in triage: <span className="text-text italic">“{entry.reason}”</span>
          </p>
        ) : null}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-text-muted">What should happen?</legend>

        <Choice
          name={name}
          checked={resolution === 'refine'}
          onChange={() => resolve('refine', refine(words))}
          title="Refine the requirement"
          caption={
            suggestion
              ? `The requirement asks the wrong thing here; say how it should change. Suggested: “${suggestion}”`
              : 'The requirement asks the wrong thing here; say how it should change.'
          }
        />
        {resolution === 'refine' ? (
          <textarea
            aria-label={`How should the requirement change for ${id}?`}
            placeholder="How should the requirement change? In your own words."
            value={words}
            onChange={(e) => {
              setWords(e.target.value);
              resolve('refine', refine(e.target.value));
            }}
            rows={2}
            className="ml-7 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
          />
        ) : null}
        {resolution === 'refine' && !STUDY ? (
          <p className="ml-7 text-xs text-text-muted">
            Your words are recorded with the decision. Make the edit itself in R1, under “Edit R1
            before signing” below.
          </p>
        ) : null}
        {resolution === 'refine' && suggestion && words.trim() !== suggestion ? (
          <p className="ml-7 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span>Suggested by the analysis: “{suggestion}”</span>
            <button
              type="button"
              onClick={() => {
                setWords(suggestion);
                resolve('refine', refine(suggestion));
              }}
              className="rounded-full border border-border-strong bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-text hover:bg-fill"
            >
              Use this
            </button>
          </p>
        ) : null}

        <Choice
          name={name}
          checked={resolution === 'system'}
          onChange={() => resolve('system', fix && fix !== 'other' ? saved : null)}
          title="It is a real system failure"
          caption={
            STUDY
              ? 'The car is at fault; choose how the car should change.'
              : 'The car is at fault; choose a fix from the analysis, or write your own.'
          }
        />
        {resolution === 'system' ? (
          <div
            className="ml-7 flex flex-col gap-1.5"
            role="radiogroup"
            aria-label={`Car fix for ${id}`}
          >
            {fixes.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={`${name}-fix`}
                  checked={fix === f.key}
                  onChange={() => {
                    setFix(f.key);
                    resolve('system', f.mitigation);
                  }}
                  className="mt-1 accent-[#172033]"
                />
                <span>
                  {f.label}
                  {f.hint ? (
                    <span className="block font-mono text-xs text-text-muted">{f.hint}</span>
                  ) : null}
                </span>
              </label>
            ))}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`${name}-fix`}
                checked={fix === 'other'}
                onChange={() => {
                  setFix('other');
                  resolve('system', other(otherWords, otherLayer));
                }}
                className="mt-1 accent-[#172033]"
              />
              <span>
                Another change to the car or its test{' '}
                <span className="text-xs text-text-muted">
                  · {STUDY ? OTHER.hint : 'data, model, system or test, in your words'}
                </span>
              </span>
            </label>
            {fix === 'other' ? (
              <div className="ml-6 flex flex-wrap gap-2">
                <select
                  aria-label="What it changes"
                  value={otherLayer}
                  onChange={(e) => {
                    setOtherLayer(e.target.value);
                    resolve('system', other(otherWords, e.target.value));
                  }}
                  className="rounded-lg border border-border-strong bg-surface-raised px-2 py-1 text-sm"
                >
                  {OTHER_LAYERS.map(([layer, words]) => (
                    <option key={layer} value={layer}>
                      {words}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="The change, in your own words"
                  placeholder="The change, in your own words"
                  value={otherWords}
                  onChange={(e) => {
                    setOtherWords(e.target.value);
                    resolve('system', other(e.target.value, otherLayer));
                  }}
                  className="min-w-[14rem] flex-1 rounded-lg border border-border-strong bg-surface-raised px-3 py-1 text-sm"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <Choice
          name={name}
          checked={resolution === 'later'}
          onChange={() => resolve('later', null)}
          title="Not enough evidence: leave it for the next round"
          caption="Too few runs to decide now; it is carried to the next round."
        />
      </fieldset>
    </article>
  );
}

function Choice({
  name,
  checked,
  onChange,
  title,
  caption,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  caption: string;
}) {
  return (
    // the label's text is its title and caption below (the rule cannot see through the props)
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      className={cx(
        'flex cursor-pointer items-start gap-2.5 rounded-lg border-2 bg-surface-raised px-3 py-2',
        checked ? 'border-text bg-human-soft' : 'border-transparent hover:border-border-strong',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 accent-[#172033]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">{title}</span>
        <span className="text-xs text-text-muted">{caption}</span>
      </span>
    </label>
  );
}
