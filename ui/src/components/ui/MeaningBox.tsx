import type { ReactNode } from 'react';

/**
 * What something means, always shown in the same place on its card: a soft
 * wheat panel with a quiet label and a muted rule, in ink. Neutral on
 * purpose: the olive rule belongs to the instructions box (what to do), so
 * the eye keeps "what this means" and "what to do" apart.
 */
export function MeaningBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="note"
      aria-label={label}
      className="rounded-lg border border-border border-l-4 border-l-border-strong bg-surface px-4 py-3"
    >
      <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-text-muted uppercase">
        {label}
      </p>
      <div className="flex max-w-[72ch] flex-col gap-1.5 text-sm leading-6 text-text">
        {children}
      </div>
    </div>
  );
}
