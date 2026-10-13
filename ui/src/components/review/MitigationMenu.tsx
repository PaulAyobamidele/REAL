import * as RadioGroup from '@radix-ui/react-radio-group';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Chip, KindChip } from '@/components/ui/Chip';
import { TextAreaField } from '@/components/ui/Field';
import { mitigationChange } from '@/domain/changes';
import type { Change, Mitigation, Obstacle } from '@/services/schemas';
import { cx } from '@/utils/format';

export const LAYER_ORDER = ['data', 'model', 'system', 'requirement', 'scenario'] as const;

export const LAYER_WORDS: Record<string, string> = {
  data: 'data',
  model: 'model',
  system: 'system',
  requirement: 'requirement',
  scenario: 'test scenario',
};

/** The implied change for a layer, in one line, with its kind mark. */
export function ImpliedChange({ change }: { change: Change | undefined }) {
  if (!change)
    return <span className="text-xs text-text-faint">implied change not in this report</span>;
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
      <KindChip kind={change.kind} />
      <span>{change.text}</span>
      {change.kind === 'S' && change.task && change.available === false ? (
        <Chip tone="caution">module not implemented yet</Chip>
      ) : null}
    </span>
  );
}

/**
 * The mitigation menu for an accepted obstacle, as a radio group: "none
 * yet", the catalogue's options by layer, and "write your own". A chosen
 * catalogue option can be reworded; your own fix takes a layer and an
 * action. Each shows the change it would make to the requirement, derived
 * as refine.py derives it, so an edit is visible before signing.
 */
export function MitigationMenu({
  legend,
  obstacleId,
  obstacle,
  options,
  value,
  onChange,
  required,
}: {
  legend: string;
  obstacleId: string;
  obstacle: Obstacle | undefined;
  options: Mitigation[];
  value: Mitigation | null;
  onChange: (m: Mitigation | null) => void;
  required: boolean;
}) {
  const id = useId();
  const ordered = [...options].sort(
    (a, b) => LAYER_ORDER.indexOf(a.layer as never) - LAYER_ORDER.indexOf(b.layer as never),
  );
  const isCatalogueLayer = (layer: string) => ordered.some((o) => o.layer === layer);
  // "own" survives picking a catalogue layer in the layer menu; a saved fix
  // on a layer the catalogue lacks opens as your own
  const [own, setOwn] = useState(() => value !== null && !isCatalogueLayer(value.layer));
  const selected = value === null ? 'none' : own ? OWN : value.layer;
  const catalogueText = (layer: string) => ordered.find((o) => o.layer === layer)?.action ?? '';

  const select = (choice: string) => {
    if (choice === 'none') {
      setOwn(false);
      onChange(null);
    } else if (choice === OWN) {
      setOwn(true);
      onChange({ layer: value?.layer ?? 'requirement', action: own ? (value?.action ?? '') : '' });
    } else {
      setOwn(false);
      onChange({ layer: choice, action: catalogueText(choice) });
    }
  };

  const items = [
    { key: 'none', layer: null as string | null, action: '' },
    ...ordered.map((o) => ({ key: o.layer, layer: o.layer as string | null, action: o.action })),
    { key: OWN, layer: null, action: '' },
  ];

  return (
    <fieldset className="rounded-xl bg-surface-sunken p-2.5">
      <legend
        id={`${id}-legend`}
        className="float-left mb-2 w-full px-1 text-xs font-medium text-text-muted"
      >
        {legend}
        {required ? <span className="text-fail"> (required: supported this round)</span> : null}
        {!ordered.length ? (
          <span className="block font-normal">
            The catalogue lists no mitigation for this obstacle; write your own or record it without
            one.
          </span>
        ) : null}
      </legend>
      <RadioGroup.Root
        aria-labelledby={`${id}-legend`}
        value={selected}
        onValueChange={select}
        className="clear-both flex flex-col gap-1.5"
      >
        {items.map((opt) => {
          const itemId = `${id}-${opt.key}`;
          const isSelected = selected === opt.key;
          const edited =
            isSelected && opt.layer !== null && value !== null && value.action !== opt.action;
          const change = isSelected && value ? mitigationChange(obstacleId, value, obstacle) : null;
          return (
            <div
              key={opt.key}
              className={cx(
                'flex flex-col gap-2 rounded-lg px-3 py-2 shadow-[0_0.5px_1.5px_rgb(0_0_0/0.08)] transition-all duration-fast',
                'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-human/40',
                isSelected ? 'bg-human-soft ring-2 ring-human' : 'bg-surface-raised',
              )}
            >
              <div className="relative flex items-start gap-2">
                <RadioGroup.Item
                  id={itemId}
                  value={opt.key}
                  className={cx(
                    'relative z-10 mt-0.5 size-4 shrink-0 rounded-full border transition-colors duration-fast focus-visible:outline-none',
                    isSelected ? 'border-human bg-human' : 'border-border-strong bg-surface-raised',
                  )}
                >
                  <RadioGroup.Indicator className="flex size-full items-center justify-center after:block after:size-1.5 after:rounded-full after:bg-white" />
                </RadioGroup.Item>
                <label
                  htmlFor={itemId}
                  className="flex cursor-pointer flex-col gap-1 text-sm after:absolute after:inset-0 after:content-['']"
                >
                  {opt.key === 'none' ? (
                    <span className="text-text-muted">none yet</span>
                  ) : opt.key === OWN ? (
                    <span className="font-medium">Write your own fix</span>
                  ) : (
                    <>
                      <span>
                        <Chip tone="neutral" className="mr-1">
                          {LAYER_WORDS[opt.key] ?? opt.key} layer
                        </Chip>
                        {opt.action}
                      </span>
                      {!isSelected ? <ImpliedChange change={obstacle?.changes?.[opt.key]} /> : null}
                    </>
                  )}
                </label>
              </div>
              {isSelected && value && opt.key !== 'none' ? (
                <div className="flex flex-col gap-2 pl-6">
                  {opt.key === OWN ? (
                    <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                      Layer
                      <select
                        value={value.layer}
                        onChange={(e) => onChange({ layer: e.target.value, action: value.action })}
                        className="w-full max-w-xs rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-sm font-normal text-text"
                      >
                        {LAYER_ORDER.map((l) => (
                          <option key={l} value={l}>
                            {LAYER_WORDS[l]} layer
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <TextAreaField
                    label={opt.key === OWN ? 'Your fix' : 'Wording (editable)'}
                    value={value.action}
                    placeholder={
                      opt.key === OWN ? 'What should change, in one sentence' : undefined
                    }
                    onChange={(e) => onChange({ layer: value.layer, action: e.target.value })}
                    error={!value.action.trim() ? 'a fix needs its action' : undefined}
                    hint={
                      edited &&
                      typeof change === 'object' &&
                      change?.text === obstacle?.changes?.[value.layer]?.text
                        ? 'The catalogue maps this fix to a set requirement change: your wording is recorded in decisions.json, the change below stays.'
                        : ACTION_HINT[value.layer]
                    }
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {typeof change === 'string' ? (
                      <span className="text-xs text-fail">{change}</span>
                    ) : (
                      <ImpliedChange change={change ?? undefined} />
                    )}
                    {edited ? (
                      <>
                        <Chip tone="human">edited by you</Chip>
                        <Button
                          size="sm"
                          variant="quiet"
                          onClick={() => onChange({ layer: value.layer, action: opt.action })}
                        >
                          Reset to catalogue
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </RadioGroup.Root>
    </fieldset>
  );
}

const OWN = 'own';

/** Where the action text goes, per layer (refine.change_for). */
const ACTION_HINT: Record<string, string> = {
  data: 'Recorded as a data-level change; it fills no requirement slot unless the catalogue maps it.',
  model:
    'Recorded as a model-level change; it fills no requirement slot unless the catalogue maps it.',
  system:
    'Recorded as a system-level change; it fills no requirement slot unless the catalogue maps it.',
  requirement:
    'Becomes an assuming item in the revised requirement, unless the catalogue maps this obstacle.',
  scenario: 'Becomes a fix to the test scenario, not requirement text.',
};

/** The read-only list for "Failure Analysis": candidate mitigations by layer, as tool output. */
export function MitigationList({
  options,
  changes,
}: {
  options: Mitigation[];
  changes: Record<string, Change> | undefined;
}) {
  if (!options.length) {
    return (
      <p className="prose-width text-sm text-text-muted">
        The catalogue lists no mitigations for this obstacle. An unnamed candidate is named or
        rejected by a person before any fix is proposed.
      </p>
    );
  }
  const byLayer = new Map(options.map((o) => [o.layer, o]));
  return (
    <dl className="flex flex-col gap-3">
      {LAYER_ORDER.filter((l) => byLayer.has(l)).map((layer) => {
        const opt = byLayer.get(layer) as Mitigation;
        return (
          <div key={layer} className="tool-output px-3.5 py-2.5">
            <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {LAYER_WORDS[layer] ?? layer} layer
            </dt>
            <dd className="m-0 mt-1 flex flex-col gap-1 text-sm">
              <span>{opt.action}</span>
              <ImpliedChange change={changes?.[layer]} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
