import { diffArrays } from 'diff';

import type { Change } from '@/services/schemas';

/**
 * Assembling the proposed requirement (R1) from R0 and a list of changes,
 * and rendering requirement_diff.md - a port of the text operations in
 * scripts/analysis/refine.py. The *knowledge* of which change a mitigation
 * implies stays in Python and reaches this code through the analysis
 * report (obstacles[].changes); only the text assembly lives here, and it is
 * held to the Python original by the contract tests.
 */

export interface Clauses {
  head: string;
  assuming: string[];
  ensuring: string[];
}

// Python: _TAIL = ^(?P<head>.*?)(?P<assuming>\s+assuming\s+"[^"]*"(?:\s*&\s*"[^"]*")*)?(?P<ensuring>...)?\s*$  (DOTALL)
const TAIL =
  /^(?<head>[\s\S]*?)(?<assuming>\s+assuming\s+"[^"]*"(?:\s*&\s*"[^"]*")*)?(?<ensuring>\s+ensuring\s+"[^"]*"(?:\s*&\s*"[^"]*")*)?\s*$/;

function quotedItems(clause: string | undefined): string[] {
  if (!clause) return [];
  return Array.from(clause.matchAll(/"([^"]*)"/g), (m) => m[1] ?? '');
}

/** `_split_clauses`: the requirement body and its `assuming` / `ensuring` items. */
export function splitClauses(text: string): Clauses {
  const m = TAIL.exec(text);
  const groups = m?.groups ?? {};
  return {
    head: groups.head ?? text,
    assuming: quotedItems(groups.assuming),
    ensuring: quotedItems(groups.ensuring),
  };
}

/** `_join`: body + clauses, each item quoted and joined with ' & '. */
export function joinClauses(head: string, assuming: string[], ensuring: string[]): string {
  let out = head.replace(/\s+$/, '');
  if (assuming.length) out += '\n    assuming ' + assuming.map((a) => `"${a}"`).join(' & ');
  if (ensuring.length) out += '\n    ensuring ' + ensuring.map((e) => `"${e}"`).join(' & ');
  return out + '\n';
}

/** `_replace_module`: swap the module in `"<task>" ... performed by "<old>"` (first occurrence). */
export function replaceModule(
  text: string,
  task: string,
  newModule: string,
): { text: string; previous: string } {
  const i = text.indexOf(`"${task}"`);
  if (i < 0) throw new Error(`task "${task}" not found in the requirement`);
  const re = /performed by\s+"([^"]*)"/g;
  re.lastIndex = i;
  const m = re.exec(text);
  if (!m || m.index < i) throw new Error(`no "performed by" after task "${task}"`);
  const start = m.index + m[0].indexOf('"') + 1;
  const previous = m[1] ?? '';
  return { text: text.slice(0, start) + newModule + text.slice(start + previous.length), previous };
}

/**
 * `apply_changes`: R0 + changes -> R1. [S] changes swap modules; [R] and [D]
 * changes add, replace or remove clause items (never twice). [T] changes are
 * not requirement text.
 */
export function applyChanges(r0: string, changes: Change[]): string {
  let text = r0;
  for (const ch of changes) {
    if (ch.kind === 'S' && ch.task && ch.module) {
      text = replaceModule(text, ch.task, ch.module).text;
    }
  }
  const { head, assuming, ensuring } = splitClauses(text);
  for (const ch of changes) {
    if ((ch.kind !== 'R' && ch.kind !== 'D') || !ch.clause || ch.item === undefined) continue;
    const target = ch.clause === 'assuming' ? assuming : ensuring;
    if (ch.remove) {
      const at = target.indexOf(ch.item);
      if (at >= 0) target.splice(at, 1);
      continue;
    }
    const replaces = ch.replaces ?? null;
    const replaceAt = replaces === null ? -1 : target.indexOf(replaces);
    if (replaceAt >= 0) {
      target[replaceAt] = ch.item;
    } else if (!target.includes(ch.item)) {
      target.push(ch.item);
    }
  }
  return joinClauses(head, assuming, ensuring);
}

// ------------------------------------------------------------------ unified diff

/** Python difflib's hunk range: "start" alone for one line, "start-1,0" for none, else "start,length". */
function formatRange(start1: number, length: number): string {
  if (length === 1) return `${start1}`;
  if (length === 0) return `${start1 - 1},0`;
  return `${start1},${length}`;
}

interface Op {
  tag: ' ' | '-' | '+';
  line: string;
}

/**
 * A unified diff with three lines of context, grouped as difflib groups
 * hunks (an unchanged run longer than 2n lines ends one hunk and starts
 * another). Headers as `difflib.unified_diff(a, b, "R0.dsl", "R1.dsl", lineterm="")`.
 */
export function unifiedDiff(
  oldLines: string[],
  newLines: string[],
  oldName: string,
  newName: string,
  context = 3,
): string[] {
  const ops: Op[] = [];
  for (const part of diffArrays(oldLines, newLines)) {
    const tag: Op['tag'] = part.added ? '+' : part.removed ? '-' : ' ';
    for (const line of part.value) ops.push({ tag, line });
  }
  if (!ops.some((op) => op.tag !== ' ')) return [];

  // split into groups of ops; a run of >= 2*context+1 equal lines separates groups
  const groups: Op[][] = [];
  let current: Op[] = [];
  let equalRun: Op[] = [];
  let seenChange = false;
  for (const op of ops) {
    if (op.tag === ' ') {
      equalRun.push(op);
      continue;
    }
    if (equalRun.length > 2 * context && seenChange) {
      current.push(...equalRun.slice(0, context));
      groups.push(current);
      current = equalRun.slice(-context);
    } else {
      current.push(...(seenChange ? equalRun : equalRun.slice(-context)));
    }
    equalRun = [];
    current.push(op);
    seenChange = true;
  }
  current.push(...equalRun.slice(0, context));
  groups.push(current);

  const out = [`--- ${oldName}`, `+++ ${newName}`];
  let oldPos = 1;
  let newPos = 1;
  let cursor = 0; // index into ops of the first op of the current group
  for (const group of groups) {
    // advance positions over the ops skipped between groups
    const groupStart = ops.indexOf(group[0] as Op, cursor);
    for (let i = cursor; i < groupStart; i++) {
      const op = ops[i] as Op;
      if (op.tag !== '+') oldPos++;
      if (op.tag !== '-') newPos++;
    }
    const oldCount = group.filter((op) => op.tag !== '+').length;
    const newCount = group.filter((op) => op.tag !== '-').length;
    out.push(`@@ -${formatRange(oldPos, oldCount)} +${formatRange(newPos, newCount)} @@`);
    for (const op of group) out.push(`${op.tag}${op.line}`);
    cursor = groupStart + group.length;
    oldPos += oldCount;
    newPos += newCount;
  }
  return out;
}

/** The change-kind legend, as refine.render_diff words it. */
export const KIND_LEGEND: Record<Change['kind'], string> = {
  S: 'we changed the car (`performed by`)',
  R: 'we changed the promise (an `ensuring` soft goal added)',
  D: 'we changed the assumptions (an `assuming` domain assumption added, changed or dropped)',
  T: 'we fix the test (a scenario or scope fix - not requirement text)',
};

/** `render_diff`: requirement_diff.md. */
export function renderDiff(
  r0: string,
  r1: string,
  changes: Change[],
  runId: string | null,
): string {
  const L: string[] = [];
  L.push(`# Proposed requirement change${runId ? ` - after run \`${runId}\`` : ''}`);
  L.push('');
  L.push(
    'Labels: **[S]** we changed the car (`performed by`), ' +
      '**[R]** we changed the promise (an `ensuring` soft goal added), ' +
      '**[D]** we changed the assumptions (an `assuming` domain assumption added, changed or dropped), ' +
      '**[T]** we fix the test (a scenario or scope fix - not requirement text). ' +
      'R1 is a proposal: edit or accept; nothing is applied automatically.',
  );
  L.push('');
  L.push('## Changes');
  if (!changes.length) L.push('- none - the decisions imply no change to the requirement');
  for (const ch of changes) {
    let note = '';
    if (ch.kind === 'S' && ch.available === false) {
      note =
        '  **(executor does not implement this module yet - round 3 cannot run it until it does)**';
    }
    if (ch.no_evidence) {
      note =
        '  **(loosened although the assumption was never broken in this run - no evidence behind it)**';
    }
    L.push(`- [${ch.kind}] from \`${ch.from}\` (${ch.layer}): ${ch.text}${note}`);
  }
  L.push('');
  L.push('## R0 (as run)');
  L.push('```');
  L.push(r0.trim());
  L.push('```');
  L.push('## R1 (proposed)');
  L.push('```');
  L.push(r1.trim());
  L.push('```');
  L.push('## Unified diff');
  L.push('```diff');
  L.push(...unifiedDiff(r0.trim().split('\n'), r1.trim().split('\n'), 'R0.dsl', 'R1.dsl'));
  L.push('```');
  return L.join('\n') + '\n';
}
