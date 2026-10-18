import { useState } from 'react';

import { TextAreaField } from '@/components/ui/Field';
import type { Mitigation } from '@/services/schemas';
import { cx } from '@/utils/format';

import { OTHER_LAYERS, STUDY_MENU, type StudyChoice, type StudyMitigation } from './menu';

/**
 * The study's menu in place of the catalogue's: six choices, one per accepted
 * obstacle. A choice in the participant's own words counts only once written.
 */
export function StudyMitigationMenu({
  obstacleId,
  value,
  onChange,
}: {
  obstacleId: string;
  value: Mitigation | null;
  onChange: (m: Mitigation | null) => void;
}) {
  const saved = value as StudyMitigation | null;
  const [choice, setChoice] = useState<StudyChoice | null>(saved?.choice ?? null);
  const [words, setWords] = useState(
    saved && STUDY_MENU.find((m) => m.choice === saved.choice)?.ownWords ? saved.action : '',
  );
  const [otherLayer, setOtherLayer] = useState(saved?.choice === 'other' ? saved.layer : 'data');

  // every change is logged by the decision log (study/decisionLog.ts), typing grouped
  const emit = (c: StudyChoice | null, text: string, layer: string) => {
    const item = STUDY_MENU.find((m) => m.choice === c);
    const next: StudyMitigation | null = !item
      ? null
      : item.ownWords
        ? text.trim()
          ? { layer: c === 'other' ? layer : item.layer, action: text.trim(), choice: item.choice }
          : null
        : { layer: item.layer, action: item.label, choice: item.choice };
    onChange(next);
  };

  return (
    <fieldset
      data-obstacle={obstacleId}
      className="flex flex-col gap-2 rounded-xl bg-surface-sunken p-2.5"
    >
      <legend className="mb-1 px-1 text-xs font-medium text-text-muted">
        Mitigation (one choice)
      </legend>
      <div role="radiogroup" aria-label="Mitigation" className="flex flex-col gap-1.5">
        {STUDY_MENU.map((m) => {
          const selected = choice === m.choice;
          return (
            <div
              key={m.choice}
              className={cx(
                'flex flex-col gap-2 rounded-lg px-3 py-2',
                selected ? 'bg-human-soft ring-2 ring-human' : 'bg-surface-raised',
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setChoice(m.choice);
                  emit(m.choice, words, otherLayer);
                }}
                className="flex items-start gap-2 text-left text-sm"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'mt-1 inline-block size-3 shrink-0 rounded-full border-2',
                    selected ? 'border-human bg-human' : 'border-border-strong',
                  )}
                />
                <span className="flex flex-col">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-xs text-text-muted">{m.hint}</span>
                </span>
              </button>
              {selected && m.choice === 'other' ? (
                <label className="flex items-center gap-2 pl-5 text-xs text-text-muted">
                  It is about
                  <select
                    aria-label="Something else: what it is about"
                    value={otherLayer}
                    onChange={(e) => {
                      setOtherLayer(e.target.value);
                      emit(choice, words, e.target.value);
                    }}
                    className="rounded-md border border-border bg-surface-raised px-2 py-0.5 text-xs"
                  >
                    {OTHER_LAYERS.map(([layer, text]) => (
                      <option key={layer} value={layer}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {selected && m.ownWords ? (
                <div className="pl-5">
                  <TextAreaField
                    label={`${m.label}, in your words`}
                    required
                    value={words}
                    onChange={(e) => {
                      setWords(e.target.value);
                      emit(choice, e.target.value, otherLayer);
                    }}
                    error={!words.trim() ? 'write what you would change' : undefined}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
