import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from '@/utils/format';

import { SIZE, VARIANT, type ButtonVariant } from './buttonClass';

export type { ButtonVariant } from './buttonClass';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** lg: a page's main action, centred under it (PageActions) */
  size?: 'sm' | 'md' | 'lg';
  busy?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-all duration-fast active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        SIZE[size],
        VARIANT[variant],
        className,
      )}
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
