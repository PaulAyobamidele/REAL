import type { ReactNode } from 'react';

import { cx } from '@/utils/format';

/**
 * A message with a word for its kind, so colour is never the only signal.
 *   info     - plain note on the raised surface
 *   tool     - tool output: sunken surface, left rule in border-strong
 *   refusal  - the tool declining to let someone off the hook: sunken
 *              surface, caution left rule, calm and explanatory
 *   warning  - the same treatment, worded as a caution
 *   error    - a file problem, named: sunken surface, fail left rule
 *   success  - the one consequential action done: pass left rule
 */
export type NoticeTone = 'info' | 'tool' | 'refusal' | 'warning' | 'error' | 'success';

const TONE: Record<NoticeTone, { box: string; word: string }> = {
  info: { box: 'bg-fill rounded-lg', word: 'Note' },
  tool: { box: 'tool-output', word: 'Tool output' },
  refusal: { box: 'refusal', word: 'The tool declines' },
  warning: { box: 'refusal', word: 'Caution' },
  error: { box: 'bg-fail-soft border-l-2 border-fail rounded-r-lg', word: 'Problem' },
  success: { box: 'bg-pass-soft border-l-2 border-pass rounded-r-lg', word: 'Done' },
};

export function Notice({
  tone = 'info',
  title,
  children,
  className,
  role,
}: {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  return (
    <div
      role={role ?? (tone === 'error' ? 'alert' : undefined)}
      className={cx('px-3.5 py-2.5 text-sm', TONE[tone].box, className)}
    >
      <span className="font-medium">{title ?? TONE[tone].word}. </span>
      <span>{children}</span>
    </div>
  );
}
