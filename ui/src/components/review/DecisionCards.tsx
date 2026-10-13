import { Chip, StatusChip, ToolVerdictChip } from '@/components/ui/Chip';
import { Disclosure } from '@/components/ui/Disclosure';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import type {
  AssumptionVerdict,
  Obstacle,
  ObstacleVerdict,
  ScopeVerdict,
} from '@/services/schemas';
import { assumptionState, obstacleState, scopeState, type Draft } from '@/state/draft';
import type { DraftAction } from '@/state/draft';

import { MitigationMenu } from './MitigationMenu';
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
}: {
  obstacle: Obstacle;
  draft: Draft;
  dispatch: Dispatch;
  hasPrevious: boolean;
  sampling?: string;
}) {
  const entry = draft.doc.obstacles[obstacle.id];
  if (!entry) return null;
  const state = obstacleState(draft, obstacle.id);
  const accepted = entry.verdict === 'accept' || entry.verdict === 'rename';
  const mitigationRequired =
    accepted &&
    entry.tool_verdict === 'supported' &&
    (entry.status === 'new' || entry.status === 'persisting');
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
        <Disclosure summary="What the tool says" compact>
          <p className="prose-width text-sm text-text-muted">{obstacle.description}</p>
        </Disclosure>
      </header>
      <VerdictControl<ObstacleVerdict>
        legend="Verdict"
        options={OBSTACLE_OPTIONS}
        value={entry.verdict}
        state={state}
        prefill={draft.prefill}
        onChange={(verdict) => dispatch({ type: 'obstacle/verdict', id: obstacle.id, verdict })}
        onConfirm={() => dispatch({ type: 'obstacle/confirm', id: obstacle.id })}
      />
      {entry.verdict === 'rename' ? (
        <TextField
          label="New name"
          required
          value={entry.renamed_to ?? ''}
          onChange={(e) =>
            dispatch({ type: 'obstacle/renamed_to', id: obstacle.id, value: e.target.value })
          }
          error={!entry.renamed_to ? 'a renamed obstacle needs its new name' : undefined}
        />
      ) : null}
      <TextAreaField
        label="Reason, in your own words"
        value={entry.reason ?? ''}
        onChange={(e) =>
          dispatch({ type: 'obstacle/reason', id: obstacle.id, value: e.target.value })
        }
        hint={
          state === 'prefilled' && entry.reason
            ? 'Came with the pre-filled verdict; replace it with yours.'
            : undefined
        }
      />
      {accepted ? (
        <Disclosure
          summary={entry.mitigation ? `Fix: ${entry.mitigation.layer} layer` : 'Choose a fix'}
          defaultOpen={mitigationRequired && !entry.mitigation}
        >
          <MitigationMenu
            legend="Mitigation"
            obstacleId={obstacle.id}
            obstacle={obstacle}
            options={entry.options}
            value={entry.mitigation}
            onChange={(m) =>
              dispatch({ type: 'obstacle/mitigation', id: obstacle.id, mitigation: m })
            }
            required={mitigationRequired}
          />
        </Disclosure>
      ) : null}
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
          <Disclosure summary="What the tool says" compact>
            {entry.description ? (
              <p className="prose-width text-sm text-text-muted">{entry.description}</p>
            ) : null}
            {entry.suggested_fix ? (
              <p className="prose-width text-sm text-text-muted">
                Suggested fix: {entry.suggested_fix}
              </p>
            ) : null}
            {entry.rule?.param ? (
              <p className="text-sm text-text-muted">
                Rule:{' '}
                <span className="font-mono">{`${entry.rule.param} ${entry.rule.op} ${String(entry.rule.value)}`}</span>
                {entry.rule.source ? ` (${entry.rule.source})` : ''}
              </p>
            ) : null}
          </Disclosure>
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
          {entry.tool_verdict ? <Chip tone="tool">tool: {entry.tool_verdict}</Chip> : null}
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
      {entry.verdict === 'loosen' && entry.tool_verdict === 'untested' ? (
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
