import { useMemo, type ReactNode } from 'react';

import { cx } from '@/utils/format';

/**
 * The requirement text with its three parts marked: what the system is
 * (`performed by`), what is assumed about the world (`assuming`), and what
 * is promised (`ensuring`). Pure text rendering: nothing here parses the
 * language; the marks are the keywords themselves and the quoted strings
 * that follow them.
 */
const KEYWORDS = [
  'MAINTAIN',
  'ACHIEVE',
  'operationalized as',
  'in scenario where',
  'taking input',
  'producing output',
  'performed by',
  'followed by',
  'parallely',
  'assuming',
  'ensuring',
  'using',
  'by',
  'if',
];
const KEYWORD_RE = new RegExp(
  `(${KEYWORDS.map((k) => k.replace(/ /g, '\\s+')).join('|')})(?![\\w])`,
  'g',
);

export type LineMark = 'added' | 'removed' | null;

function renderLine(line: string, key: number): ReactNode {
  if (line.trimStart().startsWith('#')) return <span className="dsl-comment">{line}</span>;
  const nodes: ReactNode[] = [];
  let i = 0;
  // the clause a quoted string belongs to is the last keyword seen on the line
  let clause: 'performed' | 'assuming' | 'ensuring' | null = null;
  const tokens = Array.from(line.matchAll(/("[^"]*")|(\S+)/g));
  for (const t of tokens) {
    const start = t.index ?? 0;
    if (start > i) nodes.push(line.slice(i, start));
    const text = t[0];
    if (t[1]) {
      const cls =
        clause === 'performed'
          ? 'dsl-performed'
          : clause === 'assuming'
            ? 'dsl-assuming'
            : clause === 'ensuring'
              ? 'dsl-ensuring'
              : undefined;
      nodes.push(
        <span key={`${key}-${start}`} className={cls}>
          {text}
        </span>,
      );
      if (clause === 'performed') clause = null;
    } else {
      nodes.push(text);
      const lower = text.toLowerCase();
      if (lower === 'by' && line.slice(0, start).trimEnd().endsWith('performed'))
        clause = 'performed';
      else if (lower === 'assuming') clause = 'assuming';
      else if (lower === 'ensuring') clause = 'ensuring';
      else if (lower === '&' || lower === 'in' || lower === 'taking' || lower === 'producing') {
        if (clause === 'performed') clause = null;
      }
    }
    i = start + text.length;
  }
  if (i < line.length) nodes.push(line.slice(i));
  // keywords in the plain segments
  return nodes.map((n, j) =>
    typeof n === 'string' ? (
      <span key={`${key}-k${j}`}>
        {n.split(KEYWORD_RE).map((part, k) =>
          KEYWORDS.includes(part.replace(/\s+/g, ' ')) ? (
            <span key={k} className="dsl-keyword">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </span>
    ) : (
      n
    ),
  );
}

export function DslBlock({
  text,
  marks,
  label,
  className,
}: {
  text: string;
  /** Per line: added / removed / null, for the side-by-side view. */
  marks?: LineMark[];
  label: string;
  className?: string;
}) {
  const lines = useMemo(() => text.replace(/\s+$/, '').split('\n'), [text]);
  return (
    <pre className={cx('dsl', className)} role="region" aria-label={label} tabIndex={0}>
      {lines.map((line, i) => (
        <span
          key={i}
          className={cx(
            'block',
            marks?.[i] === 'added' && 'dsl-added',
            marks?.[i] === 'removed' && 'dsl-removed',
          )}
        >
          {renderLine(line, i)}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

export function DslLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
      <li>
        <span className="dsl-performed font-mono">performed by</span> what the system is
      </li>
      <li>
        <span className="dsl-assuming font-mono">assuming</span> what is assumed about the world
      </li>
      <li>
        <span className="dsl-ensuring font-mono">ensuring</span> what is promised beyond safety
      </li>
    </ul>
  );
}
