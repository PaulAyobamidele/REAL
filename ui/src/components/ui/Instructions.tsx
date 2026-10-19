import type { ReactNode } from 'react';

import { cx } from '@/utils/format';

/**
 * What to do on this screen. The only place the bright green appears, so the
 * eye learns that this box is what to read first (the palette's rule).
 */
export function Instructions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="note"
      aria-label="Instructions"
      className={cx('instructions px-4 py-2.5 text-sm', className)}
    >
      {children}
    </div>
  );
}
