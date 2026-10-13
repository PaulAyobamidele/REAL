import { diffArrays } from 'diff';
import { useMemo } from 'react';

import { KindChip } from '@/components/ui/Chip';
import type { Change } from '@/services/schemas';

import { DslBlock, type LineMark } from './DslBlock';

/** R0 and R1 side by side, removed lines marked on the left and added lines on the right. */
export function RequirementDiff({ r0, r1 }: { r0: string; r1: string }) {
  const { leftMarks, rightMarks } = useMemo(() => {
    const a = r0.replace(/\s+$/, '').split('\n');
    const b = r1.replace(/\s+$/, '').split('\n');
    const leftMarks: LineMark[] = [];
    const rightMarks: LineMark[] = [];
    for (const part of diffArrays(a, b)) {
      for (const _ of part.value) {
        if (part.added) rightMarks.push('added');
        else if (part.removed) leftMarks.push('removed');
        else {
          leftMarks.push(null);
          rightMarks.push(null);
        }
      }
    }
    return { leftMarks, rightMarks };
  }, [r0, r1]);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-medium text-text-muted">R0 — what we asked (as run)</p>
        <DslBlock text={r0} marks={leftMarks} label="R0, the requirement as run" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-medium text-text-muted">R1 — what it becomes (proposed)</p>
        <DslBlock text={r1} marks={rightMarks} label="R1, the proposed requirement" />
      </div>
    </div>
  );
}

/** The change list with its kind marks, as it will be recorded. */
export function ChangeList({ changes, emptyText }: { changes: Change[]; emptyText: string }) {
  if (!changes.length) return <p className="text-sm text-text-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {changes.map((ch, i) => (
        <li key={`${ch.from}-${ch.kind}-${i}`} className="flex flex-wrap items-start gap-2 text-sm">
          <KindChip kind={ch.kind} long />
          <span className="min-w-0 flex-1">
            <span className="text-text">{ch.text}</span>
            <span className="text-text-muted">
              {' '}
              — from <span className="font-mono text-xs break-all">{ch.from}</span> ({ch.layer})
            </span>
            {ch.kind === 'S' && ch.available === false ? (
              <span className="ml-1 text-fail">
                {' '}
                the executor does not implement this module yet
              </span>
            ) : null}
            {ch.no_evidence ? (
              <span className="ml-1 text-fail">
                {' '}
                loosened although never broken: no evidence behind it
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
