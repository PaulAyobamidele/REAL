import { Chip, StatusChip, ToolVerdictChip } from '@/components/ui/Chip';
import { MeaningBox } from '@/components/ui/MeaningBox';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import type {
  AssumptionVerdict,
  Obstacle,
  ObstacleVerdict,
  ScopeVerdict,
} from '@/services/schemas';
import { aboutTheCar, needsLimit } from '@/domain/decisions';
import { assumptionState, obstacleState, scopeState, type Draft } from '@/state/draft';
import type { DraftAction } from '@/state/draft';
import { STUDY } from '@/study/config';
import { HelpfulQuestion } from '@/study/HelpfulQuestion';
import { TriageChoice } from '@/components/review/TriageChoice';

import { VerdictControl } from './VerdictControl';

/** The captions are the Streamlit page's, verbatim. */
export const OBSTACLE_OPTIONS = [
  { value: 'accept', label: 'accept', caption: 'real obstacle - act on it' },
  { value: 'rename', label: 'rename', caption: 'real, but the name is wrong' },
  { value: 'reject', label: 'reject', caption: 'noise / not an obstacle' },
  { value: 'defer', label: 'defer', caption: 'not enough evidence this round' },
] as const satisfies readonly { value: ObstacleVerdict; label: string; caption: string }[];

export const SCOPE_OPTIONS = [
  {
    value: 'out_of_scope',
    label: 'out of scope',
    caption: 'genuinely out of scope - state it in the requirement',
  },
  { value: 'in_scope', label: 'in scope', caption: 'actually realistic - drop the rule' },
  {
    value: 'scenario_defect',
    label: 'scenario defect',
    caption: 'defect in the test scenario - fix it, re-measure',
  },
] as const satisfies readonly { value: ScopeVerdict; label: string; caption: string }[];

export const ASSUMPTION_OPTIONS = [
  { value: 'keep', label: 'keep', caption: 'stays as written' },
  { value: 'tighten', label: 'tighten', caption: 'narrower - give the new text' },
  { value: 'loosen', label: 'loosen', caption: 'wider - give the new text' },
  { value: 'drop', label: 'drop', caption: 'remove it' },
] as const satisfies readonly { value: AssumptionVerdict; label: string; caption: string }[];

type Dispatch = (action: DraftAction) => void;

export function ObstacleDecisionCard({
  obstacle,
  draft,
  dispatch,
  hasPrevious,
  sampling,
  r0 = '',
}: {
  obstacle: Obstacle;
  draft: Draft;
  dispatch: Dispatch;
  hasPrevious: boolean;
  /** the requirement as run: the study's triage says what is already in it */
  r0?: string;
  sampling?: string;
}) {
  const entry = draft.doc.obstacles[obstacle.id];
  if (!entry) return null;
  const state = obstacleState(draft, obstacle.id);
  return (
    <article className="card flex flex-col gap-4 p-5" aria-labelledby={`obstacle-${obstacle.id}`}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`obstacle-${obstacle.id}`} className="text-lg">
            {obstacle.id}
          </h3>
          <ToolVerdictChip verdict={obstacle.verdict} sampling={sampling} />
          <StatusChip status={entry.status} hasPrevious={hasPrevious} />
        </div>
        <p className="num text-sm text-text-muted">{entry.evidence}</p>
        <MeaningBox label={STUDY ? 'What this means' : 'What the tool says'}>
          <p>{obstacle.description}</p>
        </MeaningBox>
      </header>
      <div data-tour="decision">
        {/* world or car (domain/triage.ts), in both builds; a remaining failure is resolved in step 5 */}
        <TriageChoice
          obstacle={obstacle}
          entry={entry}
          r0={r0}
          prefilled={state === 'prefilled'}
          dispatch={dispatch}
        />
      </div>
      {STUDY ? <HelpfulQuestion id={obstacle.id} doc={draft.doc} dispatch={dispatch} /> : null}
      <TextAreaField
        label="Reason, in your own words"
        value={entry.reason ?? ''}
        onChange={(e) =>
          dispatch({ type: 'obstacle/reason', id: obstacle.id, value: e.target.value })
        }
        hint={
          state === 'prefilled' && entry.reason
            ? 'Came with the tool’s proposal; replace it with yours.'
            : undefined
        }
      />
    </article>
  );
}

export function ScopeDecisionCard({
  sid,
  draft,
  dispatch,
}: {
  sid: string;
  draft: Draft;
  dispatch: Dispatch;
}) {
  const entry = draft.doc.scope[sid];
  if (!entry) return null;
  const state = scopeState(draft, sid);
  return (
    <article className="card flex flex-col gap-4 p-5" aria-labelledby={`scope-${sid}`}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`scope-${sid}`} className="font-mono text-base font-semibold break-all">
            {sid}
          </h3>
          <Chip tone="neutral">{entry.kind === 'rule' ? 'scope rule' : 'test artefact'}</Chip>
        </div>
        <p className="num text-sm text-text-muted">{entry.evidence}</p>
        {entry.description || entry.suggested_fix || entry.rule?.param ? (
          <MeaningBox label={STUDY ? 'What this means' : 'What the tool says'}>
            {entry.description ? <p>{entry.description}</p> : null}
            {entry.suggested_fix ? <p>Suggested fix: {entry.suggested_fix}</p> : null}
            {entry.rule?.param ? (
              <p className="text-text-muted">
                Rule:{' '}
                <span className="font-mono">{`${entry.rule.param} ${entry.rule.op} ${String(entry.rule.value)}`}</span>
                {entry.rule.source ? ` (${entry.rule.source})` : ''}
              </p>
            ) : null}
          </MeaningBox>
        ) : null}
      </header>
      <VerdictControl<ScopeVerdict>
        legend="Scope verdict"
        options={SCOPE_OPTIONS}
        value={entry.verdict}
        state={state}
        prefill={draft.prefill}
        onChange={(verdict) => dispatch({ type: 'scope/verdict', id: sid, verdict })}
        onConfirm={() => dispatch({ type: 'scope/confirm', id: sid })}
      />
      {needsLimit(entry) ? (
        <TextField
          label="The limit to state in the requirement"
          required
          hint="Added to the refined requirement as an assumption about the world, never about the car."
          value={entry.limit ?? ''}
          onChange={(e) => dispatch({ type: 'scope/limit', id: sid, value: e.target.value })}
          error={
            !entry.limit?.trim()
              ? 'out of scope needs the limit it states'
              : aboutTheCar(entry.limit)
                ? 'this is about the car under test, not the world'
                : undefined
          }
        />
      ) : null}
      {STUDY ? <HelpfulQuestion id={sid} doc={draft.doc} dispatch={dispatch} /> : null}
      <TextAreaField
        label="Reason"
        value={entry.reason ?? ''}
        onChange={(e) => dispatch({ type: 'scope/reason', id: sid, value: e.target.value })}
      />
    </article>
  );
}

export function AssumptionDecisionCard({
  text,
  draft,
  dispatch,
}: {
  text: string;
  draft: Draft;
  dispatch: Dispatch;
}) {
  const entry = draft.doc.assumptions?.[text];
  if (!entry) return null;
  const state = assumptionState(draft, text);
  const needsText = entry.verdict === 'tighten' || entry.verdict === 'loosen';
  return (
    <article className="card flex flex-col gap-4 p-5" aria-labelledby={`assumption-${text}`}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`assumption-${text}`} className="dsl-assuming font-mono text-base font-semibold">
            {text}
          </h3>
          <Chip tone="neutral">{entry.kind.replace('_', ' ')}</Chip>
          {entry.tool_verdict && !STUDY ? (
            <Chip tone="tool">tool: {entry.tool_verdict}</Chip>
          ) : null}
        </div>
        <p className="num text-sm text-text-muted">{entry.evidence}</p>
      </header>
      <VerdictControl<AssumptionVerdict>
        legend="Assumption verdict"
        options={ASSUMPTION_OPTIONS}
        value={entry.verdict}
        state={state}
        prefill={draft.prefill}
        onChange={(verdict) => dispatch({ type: 'assumption/verdict', text, verdict })}
        onConfirm={() => dispatch({ type: 'assumption/confirm', text })}
      />
      {needsText ? (
        <TextField
          label="New text"
          required
          hint="About the world, never the car (a quantity starting with ego is refused)."
          value={entry.new_text ?? ''}
          onChange={(e) => dispatch({ type: 'assumption/new_text', text, value: e.target.value })}
          error={!entry.new_text ? `${entry.verdict} needs the new text` : undefined}
        />
      ) : null}
      {entry.verdict === 'loosen' && entry.tool_verdict === 'untested' && !STUDY ? (
        <Notice tone="refusal">
          Never broken in this run: loosening it has no evidence behind it.
        </Notice>
      ) : null}
      <TextAreaField
        label="Reason"
        value={entry.reason ?? ''}
        onChange={(e) => dispatch({ type: 'assumption/reason', text, value: e.target.value })}
      />
    </article>
  );
}
