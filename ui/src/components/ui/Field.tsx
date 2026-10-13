import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { cx } from '@/utils/format';

const CONTROL =
  'w-full rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text shadow-[0_0.5px_1px_rgb(0_0_0/0.05)] placeholder:text-text-faint ' +
  'transition-colors duration-fast hover:border-border-strong focus-visible:border-human ' +
  'disabled:bg-surface-sunken disabled:text-text-faint aria-[invalid=true]:border-fail';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

export function TextField({
  label,
  hint,
  error,
  required,
  className,
  ...input
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
        {required ? <span className="text-fail"> *</span> : null}
      </label>
      <input
        id={id}
        {...input}
        required={required}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        className={CONTROL}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-fail">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  className,
  ...textarea
}: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
        {required ? <span className="text-fail"> *</span> : null}
      </label>
      <textarea
        id={id}
        rows={2}
        {...textarea}
        required={required}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        className={cx(CONTROL, 'min-h-[2.5rem] resize-y')}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-fail">
          {error}
        </p>
      ) : null}
    </div>
  );
}
