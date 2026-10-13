import type { ReactNode } from 'react';

import { cx } from '@/utils/format';

/**
 * A titled block. Working rhythm from the design system: 16px between
 * related rows, 24px between panels, 32px between sections. Whitespace
 * separates; a divider is the next resort, a card the last.
 */
export function Section({
  title,
  level = 2,
  aside,
  children,
  className,
  id,
}: {
  title: ReactNode;
  level?: 2 | 3 | 4;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const Heading = `h${level}` as const;
  const size = level === 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm';
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cx('flex min-w-0 flex-col gap-3', className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Heading
          id={id ? `${id}-title` : undefined}
          className={cx('font-semibold text-text', size)}
        >
          {title}
        </Heading>
        {aside ? <div className="text-xs text-text-muted">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A labelled fact: term on the left, value on the right. */
export function Fact({
  term,
  children,
  className,
}: {
  term: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'grid grid-cols-[minmax(8rem,1fr)_2fr] gap-x-4 gap-y-1 border-b border-border/70 py-2 text-sm last:border-b-0',
        className,
      )}
    >
      <dt className="text-text-muted">{term}</dt>
      <dd className="m-0 text-text">{children}</dd>
    </div>
  );
}

export function FileName({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-sm bg-fill px-1.5 py-0.5 text-[11px] text-text-muted">{children}</code>
  );
}
