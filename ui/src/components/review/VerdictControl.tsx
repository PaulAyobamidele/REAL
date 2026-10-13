import * as RadioGroup from '@radix-ui/react-radio-group';
import { useId } from 'react';

import { Button } from '@/components/ui/Button';
import type { Prefill, VerdictState } from '@/state/draft';
import { cx, displayDate } from '@/utils/format';

/**
 * A verdict: a real radio group with labels, laid out as a row of tiles
 * (each tile is the whole click target), in one of three states that never
 * look alike:
 *   empty      - nothing entered: sunken surface, plain tiles;
 *   prefilled  - loaded from a decisions.json on disk (the tool's proposal
 *                or an earlier signature) and NOT yet confirmed by the person
 *                reviewing now: the tool-output treatment (sunken surface,
 *                left rule), labelled "proposed", with its provenance
 *                written out and a Confirm button;
 *   confirmed  - entered or confirmed in this session: the chosen tile in
 *                the `human` colour, with its tint, ring and filled mark.
 */
export interface VerdictOption<V extends string> {
  value: V;
  label: string;
  caption: string;
}

export interface VerdictControlProps<V extends string> {
  legend: string;
  options: readonly VerdictOption<V>[];
  value: V | null;
  state: VerdictState;
  prefill: Prefill | null;
  onChange: (value: V | null) => void;
  onConfirm: () => void;
}

export function prefillWords(prefill: Prefill | null): string {
  if (!prefill) return 'pre-filled from decisions.json';
  if (prefill.toolProposal) {
    return `proposed by the tool${prefill.reviewer ? ` (${prefill.reviewer})` : ''}, not yet confirmed`;
  }
  return `signed by ${prefill.reviewer ?? 'an unnamed reviewer'} on ${displayDate(prefill.decidedAt)}, not yet confirmed by you`;
}

export function VerdictControl<V extends string>({
  legend,
  options,
  value,
  state,
  prefill,
  onChange,
  onConfirm,
}: VerdictControlProps<V>) {
  const id = useId();
  return (
    <fieldset
      className={cx(
        'p-2.5',
        state === 'prefilled' && 'tool-output',
        state !== 'prefilled' && 'rounded-xl bg-surface-sunken',
      )}
    >
      <legend
        id={`${id}-legend`}
        className="float-left mb-2 w-full px-1 text-xs font-medium text-text-muted"
      >
        {legend}
        {state === 'prefilled' ? (
          <span className="ml-1"> · pre-filled: {prefillWords(prefill)}</span>
        ) : null}
        {state === 'confirmed' ? <span className="ml-1 text-human"> · your verdict</span> : null}
      </legend>
      <RadioGroup.Root
        aria-labelledby={`${id}-legend`}
        value={value ?? ''}
        onValueChange={(v) => onChange((v || null) as V | null)}
        className="clear-both grid grid-cols-2 gap-1.5 md:grid-flow-col md:auto-cols-fr md:grid-cols-none"
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          const itemId = `${id}-${opt.value}`;
          return (
            <div
              key={opt.value}
              className={cx(
                'relative flex items-start gap-2 rounded-lg px-3 py-2 shadow-[0_0.5px_1.5px_rgb(0_0_0/0.08)] transition-all duration-fast',
                'hover:shadow-[0_1px_4px_rgb(0_0_0/0.1)] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-human/40',
                selected && state === 'prefilled' && 'ring-1 ring-border-strong',
                selected && state === 'confirmed'
                  ? 'bg-human-soft ring-2 ring-human'
                  : 'bg-surface-raised',
              )}
            >
              <RadioGroup.Item
                id={itemId}
                value={opt.value}
                className={cx(
                  'relative z-10 mt-0.5 size-4 shrink-0 rounded-full border transition-colors duration-fast focus-visible:outline-none',
                  selected && state === 'prefilled' && 'border-text-muted bg-text-muted',
                  selected && state === 'confirmed' && 'border-human bg-human',
                  !selected && 'border-border-strong bg-surface-raised',
                )}
              >
                <RadioGroup.Indicator className="flex size-full items-center justify-center after:block after:size-1.5 after:rounded-full after:bg-white" />
              </RadioGroup.Item>
              <label
                htmlFor={itemId}
                className="flex cursor-pointer flex-col text-sm after:absolute after:inset-0 after:content-['']"
              >
                <span
                  className={cx(
                    'font-medium',
                    selected && (state === 'prefilled' ? 'text-text' : 'text-human'),
                  )}
                >
                  {opt.label}
                </span>
                <span className="text-[11px] leading-4 text-text-muted">{opt.caption}</span>
              </label>
            </div>
          );
        })}
      </RadioGroup.Root>
      {state === 'prefilled' ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 px-1 text-xs text-text-muted">
          <Button size="sm" variant="secondary" onClick={onConfirm}>
            Confirm as my verdict
          </Button>
          <span>or choose another option above.</span>
        </div>
      ) : null}
    </fieldset>
  );
}
