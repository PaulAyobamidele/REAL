import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from '@/utils/format';

/**
 * An optional action (download, print, expand) as an icon: the words are its
 * accessible name and its tooltip. A page's way on is never an icon - that is
 * a full button, centred under the page (PageActions).
 */
export function IconButton({
  label,
  children,
  className,
  ...rest
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex size-8 items-center justify-center rounded-full border border-border bg-surface-raised text-text transition-colors duration-fast hover:bg-fill disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Download, with a small badge saying what (e.g. "CSV"). */
export function DownloadIcon({ badge }: { badge?: string }) {
  return (
    <span className="relative inline-flex">
      <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" {...STROKE}>
        <path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12" />
      </svg>
      {badge ? (
        <span
          aria-hidden="true"
          className="absolute -right-3 -bottom-2.5 rounded bg-text px-0.5 text-[7.5px] leading-[10px] font-bold text-white"
        >
          {badge}
        </span>
      ) : null}
    </span>
  );
}

export function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" {...STROKE}>
      <path d="M6 8l4-4 4 4M6 12l4 4 4-4" />
    </svg>
  );
}

export function CollapseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" {...STROKE}>
      <path d="M6 4l4 4 4-4M6 16l4-4 4 4" />
    </svg>
  );
}
