import type { ReactNode } from 'react';

import type { ChangeKind, ToolVerdict } from '@/services/schemas';
import type { ObstacleStatus } from '@/services/schemas/decisions';
import { cx } from '@/utils/format';

/**
 * Small labelled marks. Every colour is paired with a word; none carries
 * meaning alone. Tags are borderless tinted capsules; tool output and human
 * judgement keep their own marks and are never styled alike: `tool` has a
 * left rule, `human` a `human`-coloured ring.
 */
export type ChipTone =
  | 'neutral'
  | 'tool'
  | 'human'
  | 'fail'
  | 'pass'
  | 'set-aside'
  | 'caution'
  | 'change-s'
  | 'change-r'
  | 'change-d'
  | 'change-t';

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-fill text-text-muted',
  tool: 'bg-surface-sunken text-text-muted border-l-2 border-l-border-strong rounded-l-sm',
  human: 'bg-human-soft text-human ring-1 ring-inset ring-human',
  fail: 'bg-fail-soft text-fail',
  pass: 'bg-pass-soft text-pass',
  'set-aside': 'bg-set-aside-soft text-set-aside',
  caution: 'bg-caution-soft text-caution',
  'change-s': 'bg-change-s-soft text-change-s',
  'change-r': 'bg-change-r-soft text-change-r',
  'change-d': 'bg-change-d-soft text-change-d',
  'change-t': 'bg-change-t-soft text-change-t',
};

export function Chip({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] leading-4 font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const KIND_WORDS: Record<ChangeKind, string> = {
  S: 'the car changed',
  R: 'the promise changed',
  D: 'the assumptions changed',
  T: 'the test changed',
};

export const KIND_LONG: Record<ChangeKind, string> = {
  S: '[S] system: the car changed (a `performed by` module)',
  R: '[R] requirement: the promise changed (an `ensuring` soft goal)',
  D: '[D] assumptions: what is assumed about the world changed (an `assuming` item)',
  T: '[T] test scenario: a fix to the test or the scope rules, not requirement text',
};

/** The [S] / [R] / [D] / [T] mark: always the bracketed letter, so it survives greyscale. */
export function KindChip({ kind, long = false }: { kind: ChangeKind; long?: boolean }) {
  const tone = `change-${kind.toLowerCase()}` as ChipTone;
  return (
    <Chip tone={tone} title={KIND_LONG[kind]}>
      <span className="font-mono font-medium">[{kind}]</span>
      {long ? <span>{KIND_WORDS[kind]}</span> : null}
    </Chip>
  );
}

export const TOOL_VERDICT_WORDS: Record<ToolVerdict, string> = {
  supported: 'supported',
  not_supported: 'below the support bar',
  insufficient_data: 'insufficient data',
};

const TOOL_VERDICT_TONE: Record<ToolVerdict, ChipTone> = {
  supported: 'fail',
  not_supported: 'caution',
  insufficient_data: 'caution',
};

/** The tool's verdict on an obstacle: always worded, coloured by what it means. */
export function ToolVerdictChip({
  verdict,
  sampling,
}: {
  verdict: ToolVerdict;
  sampling?: string;
}) {
  const lead = sampling === 'ge' && verdict === 'supported' ? ' (GE lead, confirm on a grid)' : '';
  return (
    <Chip tone={TOOL_VERDICT_TONE[verdict]} title="the tool's verdict, from the analysis report">
      tool: {TOOL_VERDICT_WORDS[verdict]}
      {lead}
    </Chip>
  );
}

export const STATUS_WORDS: Record<ObstacleStatus, string> = {
  new: 'new this round',
  persisting: 'persisting from the previous round',
  resolved: 'no longer supported this round',
  absent: 'not supported in either round',
};

const STATUS_TONE: Record<ObstacleStatus, ChipTone> = {
  new: 'fail',
  persisting: 'fail',
  resolved: 'pass',
  absent: 'set-aside',
};

export function StatusChip({
  status,
  hasPrevious,
}: {
  status: ObstacleStatus;
  hasPrevious: boolean;
}) {
  if (!hasPrevious && status === 'new')
    return <Chip tone="neutral">no previous round to compare</Chip>;
  return <Chip tone={STATUS_TONE[status]}>{STATUS_WORDS[status]}</Chip>;
}
