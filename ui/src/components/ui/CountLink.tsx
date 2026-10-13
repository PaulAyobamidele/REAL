import type { ReactNode } from 'react';

import { cx } from '@/utils/format';

/**
 * A number that leads to the rows behind it. Every quantity shown anywhere
 * in the interface is one of these or says why it cannot be followed.
 */
export function CountLink({
  href,
  children,
  title,
  className,
  onClick,
}: {
  href: string;
  children: ReactNode;
  title?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cx('count-link', className)}
      title={title ?? 'show the simulations behind this number'}
    >
      {children}
    </a>
  );
}
