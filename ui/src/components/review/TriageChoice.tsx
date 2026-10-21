import { useId } from 'react';

import type { Obstacle, ObstacleDecision } from '@/services/schemas';
import type { DraftAction } from '@/state/draft';
import { cx } from '@/utils/format';

import { TextField } from '@/components/ui/Field';
import { aboutTheCar } from '@/domain/decisions';
import { explainedBy, worldExplanation, worldMitigation } from '@/domain/triage';

/**
 * Step 4 (domain/triage.ts), in both builds: one question per obstacle, as two
 * plain sentences, each saying what it does - the world explains it (its
 * line goes into the refined requirement), or the car is at fault (it
 * remains a failure, decided in step 5).
 */
export function TriageChoice({
  obstacle,
  entry,
  r0,
  prefilled = false,
  dispatch,
}: {
  obstacle: Obstacle;
  entry: ObstacleDecision;
  r0: string;
  /** the choice came with the tool's proposal: selecting it (again) confirms it */
  prefilled?: boolean;
  dispatch: (action: DraftAction) => void;
}) {
  const name = useId();
  const x = worldExplanation(obstacle, r0);
  const by = explainedBy(entry);
  const world = {
    title:
      x.kind === 'R'
        ? 'The requirement leaves this out: it is not the car’s failure'
        : 'The world explains these failures, not the car',
    caption: x.own
      ? 'Write the assumption about the world that explains them; it is added to the refined requirement as you write it.'
      : !x.usable
        ? x.reason
        : x.alreadyIn
          ? `The requirement already says ${x.kind === 'R' ? 'ensuring' : 'assuming'} "${x.quoted}", so nothing is added.`
          : `Adds to the refined requirement: ${x.kind === 'R' ? 'ensuring' : 'assuming'} "${x.quoted}"`,
  };
  const choose = (value: 'world' | 'car') =>
    dispatch({
      type: 'obstacle/explained',
      id: obstacle.id,
      by: value,
      mitigation: value === 'world' ? worldMitigation(x, entry.mitigation?.action ?? '') : null,
    });
  return (
    <fieldset className="panel flex flex-col gap-2 rounded-xl p-3">
      <legend className="px-1 text-xs font-medium text-text-muted">
        World or car?{' '}
        <span className="text-text">
          · {prefilled ? 'proposed by the tool: select a choice to confirm it' : 'your decision'}
        </span>
      </legend>
      <div className="grid gap-2 md:grid-cols-2">
        <Option
          name={name}
          checked={by === 'world'}
          disabled={!x.usable}
          onChange={() => choose('world')}
          title={world.title}
          caption={world.caption ?? ''}
        />
        <Option
          name={name}
          checked={by === 'car'}
          onChange={() => choose('car')}
          title="The car is at fault"
          caption="It remains a failure. You decide what to do with it in Requirement revision."
        />
      </div>
      {x.own && by === 'world' ? (
        <TextField
          label="The assumption to add to the refined requirement"
          required
          hint="About the world, never the car (a quantity starting with ego is refused)."
          value={entry.mitigation?.action ?? ''}
          onChange={(e) =>
            dispatch({ type: 'obstacle/world_text', id: obstacle.id, value: e.target.value })
          }
          error={
            !(entry.mitigation?.action ?? '').trim()
              ? 'write the assumption'
              : aboutTheCar(entry.mitigation?.action ?? '')
                ? 'this is about the car under test, not the world'
                : undefined
          }
        />
      ) : null}
    </fieldset>
  );
}

function Option({
  name,
  checked,
  disabled = false,
  onChange,
  title,
  caption,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  caption: string;
}) {
  return (
    // the label's text is its title and caption below (the rule cannot see through the props)
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      className={cx(
        'flex cursor-pointer items-start gap-2.5 rounded-lg border-2 bg-surface-raised px-3 py-2.5 transition-colors duration-fast',
        checked ? 'border-text bg-human-soft' : 'border-transparent hover:border-border-strong',
        disabled && 'cursor-not-allowed opacity-60 hover:border-transparent',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        onClick={checked ? onChange : undefined}
        className="mt-1 accent-[#172033]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">{title}</span>
        <span className="text-xs text-text-muted">{caption}</span>
      </span>
    </label>
  );
}
