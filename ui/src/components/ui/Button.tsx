import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from '@/utils/format';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  busy?: boolean;
  children: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-human text-white hover:brightness-110 active:brightness-95 disabled:bg-human-soft disabled:text-human disabled:hover:brightness-100',
  secondary:
    'bg-fill text-text hover:bg-fill-strong active:bg-fill-strong disabled:opacity-60 disabled:text-text-faint',
  quiet: 'bg-transparent text-human hover:bg-fill disabled:opacity-60 disabled:text-text-faint',
  danger: 'bg-fail-soft text-fail hover:brightness-95 disabled:opacity-60 disabled:text-text-faint',
};

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
        size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-4 text-sm',
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
