import type { ReactNode } from 'react';

import { cx } from '@/utils/format';

/**
 * What to do on this screen. The only place the instructions green appears,
 * so the eye learns that this box is what to read first (the palette's rule).
 * Given `steps`, a short numbered list; above a container, the context and
 * the explanation as text, then `cta`, what to do.
 */
export function Instructions({
  children,
  steps,
  page = false,
  cta,
  label = true,
  className,
}: {
  children?: ReactNode;
  steps?: readonly ReactNode[];
  /** the box under a page title: the same width on every page */
  page?: boolean;
  /** the closing call to action, after the context and the explanation */
  cta?: ReactNode;
  /** the "What to do" label; off where the box only sets the scene (the study's welcome) */
  label?: boolean;
  className?: string;
}) {
  return (
    <div
      role="note"
      aria-label="Instructions"
      className={cx(
        'instructions px-5 py-3 text-left text-sm leading-6',
        page && 'mx-auto w-full max-w-4xl',
        className,
      )}
    >
      {label ? (
        <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-instructions uppercase">
          What to do
        </p>
      ) : null}
      {children}
      {steps?.length ? (
        <ol className="flex flex-col gap-1">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-instructions text-xs font-bold text-white"
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {cta ? (
        <p className="mt-2 flex items-start gap-2 font-semibold">
          <span aria-hidden="true" className="text-instructions">
            →
          </span>
          <span>{cta}</span>
        </p>
      ) : null}
    </div>
  );
}
