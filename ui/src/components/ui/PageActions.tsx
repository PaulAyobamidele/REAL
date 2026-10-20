import type { ReactNode } from 'react';

/**
 * The page's way on: its main buttons, centred under the content, the same
 * on every page (the primary one in the action colour), with an optional
 * line under them saying why a button is not available yet.
 */
export function PageActions({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div
      data-tour="way-on"
      className="flex flex-col items-center gap-2 border-t border-border pt-6"
    >
      <div className="flex flex-wrap items-center justify-center gap-3">{children}</div>
      {hint ? <p className="text-center text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}
