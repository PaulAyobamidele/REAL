import type { ReactNode } from 'react';

import { Notice } from '@/components/ui/Notice';
import { FileError } from '@/services/schemas';

/** An empty state with its own words: what is absent and what to do. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center">
      <p className="font-medium text-text">{title}</p>
      {children ? <div className="mt-1 text-sm text-text-muted">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <p role="status" className="text-sm text-text-muted">
      Loading {what}…
    </p>
  );
}

const KIND_WORDS = {
  missing: 'is missing',
  malformed: 'could not be read',
  'unsupported-version': 'has a schema version this build does not understand',
  unreadable: 'could not be opened',
} as const;

/** A file problem, by name, with what it means for the reviewer. */
export function FileErrorNotice({ error, consequence }: { error: Error; consequence?: ReactNode }) {
  if (error instanceof FileError) {
    return (
      <Notice tone="error" title={`${error.file} ${KIND_WORDS[error.kind]}`}>
        {error.message.replace(`${error.file}: `, '')}
        {error.details.length ? (
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {error.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        {consequence ? <span className="mt-1 block">{consequence}</span> : null}
      </Notice>
    );
  }
  return (
    <Notice tone="error">
      {error.message}
      {consequence ? <span className="mt-1 block">{consequence}</span> : null}
    </Notice>
  );
}
