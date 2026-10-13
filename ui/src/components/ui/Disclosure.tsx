import { useState, type ReactNode } from 'react';

import { cx } from '@/utils/format';

/**
 * A dropdown for text that is useful but not needed at a glance. The
 * summary is the one line that stays; everything else waits behind it.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
  compact = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  compact?: boolean;
}) {
  // read once: after mounting, only the person opens or closes it (a later
  // re-render, e.g. choosing a fix inside, must not snap it shut)
  const [initiallyOpen] = useState(defaultOpen);
  return (
    <details className={cx('group', className)} open={initiallyOpen || undefined}>
      <summary
        className={cx(
          'flex items-center gap-2 rounded-md text-text-muted transition-colors duration-fast hover:text-text',
          compact ? 'py-0.5 text-sm' : 'py-1.5 text-sm font-medium',
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex w-3 justify-center transition-transform duration-fast group-open:rotate-90"
        >
          <svg
            viewBox="0 0 8 12"
            className="h-2.5 w-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 1.5 6.5 6 2 10.5" />
          </svg>
        </span>
        <span>{summary}</span>
      </summary>
      <div className={cx('pl-5', compact ? 'pt-1' : 'pt-2')}>{children}</div>
    </details>
  );
}
