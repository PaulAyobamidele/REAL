import type { Draft, DraftAction } from '@/state/draft';

import { logEvent } from './log';

/**
 * Every decision a participant makes goes into the log with its old and new
 * value (brief 4.5). Typing is one entry per field, written when the
 * participant pauses (or before signing), not one per key.
 */
const TYPED = new Set([
  'obstacle/mitigation', // a fix in the participant's own words arrives key by key
  'obstacle/reason',
  'obstacle/world_text',
  'obstacle/renamed_to',
  'scope/reason',
  'scope/limit',
  'helpful/why',
  'assumption/new_text',
  'assumption/reason',
  'added_assumptions/set',
  'r1/override',
]);
const QUIET_MS = 2_000;
const pending = new Map<string, { old: unknown; new: unknown; screen: string; timer: number }>();

function target(a: DraftAction): string {
  if ('id' in a) return a.id;
  if ('text' in a) return a.text;
  return '';
}

function value(a: DraftAction): unknown {
  switch (a.type) {
    case 'obstacle/verdict':
    case 'scope/verdict':
    case 'assumption/verdict':
      return a.verdict;
    case 'obstacle/mitigation':
      return a.mitigation;
    // the triage's side, and step 5's outcome, with what each carries
    case 'obstacle/explained':
      return { by: a.by, mitigation: a.mitigation };
    case 'obstacle/resolve':
      return { resolution: a.resolution, mitigation: a.mitigation };
    case 'added_assumptions/set':
      return a.lines;
    case 'signed':
      return null;
    default:
      return 'value' in a ? a.value : null;
  }
}

function previous(d: Draft | undefined, a: DraftAction): unknown {
  if (!d) return null;
  const o = 'id' in a ? d.doc.obstacles[a.id] : undefined;
  const s = 'id' in a ? d.doc.scope[a.id] : undefined;
  const as = 'text' in a ? d.doc.assumptions?.[a.text] : undefined;
  switch (a.type) {
    case 'obstacle/verdict':
      return o?.verdict ?? null;
    case 'obstacle/renamed_to':
      return o?.renamed_to ?? null;
    case 'obstacle/reason':
      return o?.reason ?? null;
    case 'obstacle/mitigation':
      return o?.mitigation ?? null;
    case 'obstacle/explained': {
      const x = o as (typeof o & { explained_by?: unknown }) | undefined;
      return x ? { by: x.explained_by ?? null, mitigation: x.mitigation ?? null } : null;
    }
    case 'obstacle/resolve': {
      const x = o as (typeof o & { resolution?: unknown }) | undefined;
      return x ? { resolution: x.resolution ?? null, mitigation: x.mitigation ?? null } : null;
    }
    case 'scope/verdict':
      return s?.verdict ?? null;
    case 'scope/reason':
      return s?.reason ?? null;
    case 'assumption/verdict':
      return as?.verdict ?? null;
    case 'assumption/new_text':
      return as?.new_text ?? null;
    case 'assumption/reason':
      return as?.reason ?? null;
    case 'added_assumptions/set':
      return d.doc.added_assumptions ?? [];
    case 'reviewer/set':
      return d.reviewer;
    case 'r1/override':
      return d.r1Override;
    default:
      return null;
  }
}

function screenOf(): string {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'workspace';
}

/** Log one decision action, given the draft as it was before it. */
export function logDecision(before: Draft | undefined, a: DraftAction): void {
  if (a.type === 'signed' || a.type === 'reviewer/set') return; // signing logs itself; the ID signs
  const key = `${a.type}:${target(a)}`;
  if (TYPED.has(a.type)) {
    const p = pending.get(key);
    if (p) window.clearTimeout(p.timer);
    const entry = {
      old: p ? p.old : previous(before, a),
      new: value(a),
      screen: screenOf(),
      timer: window.setTimeout(() => flushOne(key), QUIET_MS),
    };
    pending.set(key, entry);
    return;
  }
  logEvent({
    screen: screenOf(),
    event: a.type.replace('/', '_'),
    target: target(a),
    old: previous(before, a),
    new: value(a),
  });
}

function flushOne(key: string): void {
  const p = pending.get(key);
  if (!p) return;
  pending.delete(key);
  window.clearTimeout(p.timer);
  const [type, ...rest] = key.split(':');
  logEvent({
    screen: p.screen,
    event: `${(type ?? '').replace('/', '_')}_written`,
    target: rest.join(':'),
    old: p.old,
    new: p.new,
  });
}

/** Write what is still being typed (before signing, so the zip has it). */
export function flushDecisionLog(): void {
  for (const key of [...pending.keys()]) flushOne(key);
}
