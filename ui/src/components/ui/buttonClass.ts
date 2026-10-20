import { cx } from '@/utils/format';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-action-primary text-action-primary-text hover:brightness-105 active:brightness-95 disabled:opacity-50 disabled:hover:brightness-100',
  secondary:
    'bg-fill text-text hover:bg-fill-strong active:bg-fill-strong disabled:opacity-60 disabled:text-text-faint',
  // a text-like action: underlined, since its colour is the text colour
  quiet:
    'bg-transparent text-human underline underline-offset-2 hover:bg-fill disabled:opacity-60 disabled:text-text-faint',
  danger: 'bg-fail-soft text-fail hover:brightness-95 disabled:opacity-60 disabled:text-text-faint',
};

export const SIZE = {
  sm: 'h-7 px-3 text-xs',
  md: 'h-8 px-4 text-sm',
  lg: 'h-11 min-w-36 px-6 text-sm',
};

/** A button's look, for a link that acts as one (Continue, Next). */
export function buttonClass(variant: ButtonVariant = 'secondary', size: 'sm' | 'md' | 'lg' = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap no-underline transition-all duration-fast hover:no-underline active:scale-[0.98]',
    SIZE[size],
    VARIANT[variant],
  );
}
