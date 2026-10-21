import { TextAreaField } from '@/components/ui/Field';
import type { DecisionsDoc } from '@/services/schemas';
import type { DraftAction } from '@/state/draft';

import { HELPFUL_OPTIONS, helpfulOf } from './helpfulness';

/** Study only: "Was this diagnosis helpful to your decision?", with an optional why. */
export function HelpfulQuestion({
  id,
  doc,
  dispatch,
}: {
  id: string;
  doc: DecisionsDoc;
  dispatch: (a: DraftAction) => void;
}) {
  const h = helpfulOf(doc, id);
  const name = `helpful-${id}`;
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
      <legend className="px-1 text-sm font-medium">
        Was this diagnosis helpful to your decision?
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2" role="radiogroup" aria-label="Helpfulness">
        {HELPFUL_OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={h.rating === o.value}
              onChange={() => dispatch({ type: 'helpful/rating', id, value: o.value })}
            />
            {o.label}
          </label>
        ))}
      </div>
      {h.rating === 'partly' || h.rating === 'not_helpful' ? (
        <TextAreaField
          label="What was missing or misleading? (optional)"
          value={h.why ?? ''}
          onChange={(e) => dispatch({ type: 'helpful/why', id, value: e.target.value })}
        />
      ) : null}
    </fieldset>
  );
}
