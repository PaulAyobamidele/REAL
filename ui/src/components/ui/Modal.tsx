import { useEffect, useRef, type ReactNode } from 'react';

import { cx } from '@/utils/format';

/** A pop-up over the page: Escape, the × or a click on the dimmed backdrop closes it. */
export function Modal({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [onClose]);
  return (
    // the keyboard has Escape and the ×; a click on the backdrop is a shortcut
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'card flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-3 p-4 shadow-xl',
          className ?? 'max-w-5xl',
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg">{title}</h2>
          <button
            ref={close}
            type="button"
            aria-label={`Close the ${title.toLowerCase()}`}
            onClick={onClose}
            className="rounded-full px-2 text-2xl leading-none text-text-muted hover:bg-fill"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
