import type { AnalysisReport, DecisionsDoc, RunMeta } from '@/services/schemas';
import type { FileError } from '@/services/schemas';

/**
 * Ordering the rounds of a workspace into a chain and reading each round's
 * state from the files it has. Nothing is inferred beyond file presence and
 * the provenance fields the run wrote about itself.
 */

export type RoundState =
  | 'not-finished' // run_meta.status is not "complete"
  | 'not-analysed' // no analysis_report.json
  | 'report-unreadable' // analysis_report.json present but not loadable
  | 'awaiting-signature' // analysed, no decisions.json
  | 'tool-proposal' // decisions.json present, marked as the tool's proposal
  | 'signed'; // decisions.json with a reviewer and a date

export const ROUND_STATE_WORDS: Record<RoundState, string> = {
  'not-finished': 'not finished',
  'not-analysed': 'not yet analysed',
  'report-unreadable': 'analysis report unreadable',
  'awaiting-signature': 'analysed, awaiting signature',
  'tool-proposal': 'tool proposal on file, awaiting signature',
  signed: 'signed',
};

export interface RoundSummary {
  id: string;
  dir: string;
  meta: RunMeta;
  report: AnalysisReport | null;
  reportError: FileError | null;
  decisions: DecisionsDoc | null;
  decisionsError: FileError | null;
  requirementText: string | null;
  files: string[];
  /** A line about the round from the workspace index, when it has one. */
  note?: string | null;
}

/** Is a decisions file the tool's own proposal rather than a person's signature? */
export function isToolProposal(doc: DecisionsDoc): boolean {
  if (doc.proposed_by_tool) return true;
  const reviewer = (doc.reviewer ?? '').toLowerCase();
  return reviewer.includes('proposed') || reviewer.includes('scripted');
}

export function roundState(round: RoundSummary): RoundState {
  if (round.meta.status && round.meta.status !== 'complete') return 'not-finished';
  if (round.reportError) return 'report-unreadable';
  if (!round.report) return 'not-analysed';
  if (!round.decisions) return 'awaiting-signature';
  if (isToolProposal(round.decisions)) return 'tool-proposal';
  if (round.decisions.reviewer && round.decisions.decided_at) return 'signed';
  return 'awaiting-signature';
}

/**
 * Oldest first: by `round` when recorded, then by creation time, then by id.
 * Rounds 1 and 2 of the project recorded neither a round number nor a parent,
 * so creation time carries them.
 */
export function orderRounds<T extends { meta: RunMeta; id: string }>(rounds: T[]): T[] {
  return [...rounds].sort((a, b) => {
    const ra = a.meta.round ?? null;
    const rb = b.meta.round ?? null;
    if (ra !== null && rb !== null && ra !== rb) return ra - rb;
    const ca = a.meta.created_at ?? '';
    const cb = b.meta.created_at ?? '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Identical requirement texts get the same label (A, B, C ...) in order of
 * first appearance, so two rounds run under one requirement are visibly not
 * two iterations of the loop. Comments and whitespace do not count.
 */
export function requirementVersions(
  rounds: { id: string; requirementText: string | null }[],
): Map<string, string | null> {
  const labels = new Map<string, string>();
  const out = new Map<string, string | null>();
  for (const r of rounds) {
    const key = normaliseRequirement(r.requirementText);
    if (key === null) {
      out.set(r.id, null);
      continue;
    }
    if (!labels.has(key)) labels.set(key, String.fromCharCode(65 + labels.size));
    out.set(r.id, labels.get(key) ?? null);
  }
  return out;
}

export function normaliseRequirement(text: string | null): string | null {
  if (!text) return null;
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return lines.join('\n').replace(/\s+/g, ' ') || null;
}

/** The link from a round to the one before it in the chain, as recorded or not. */
export interface Link {
  from: RoundSummary;
  to: RoundSummary;
  /** True when `to.meta.parent_run_id === from.id`. */
  recorded: boolean;
  /** False when the two ran different test scenes with no recorded parent: not compared. */
  sameScene: boolean;
  /** The parent's recorded decision, if it carries one. */
  changes: NonNullable<DecisionsDoc['requirement_changes']>;
  signedBy: string | null;
  decidedAt: string | null;
}

export function links(ordered: RoundSummary[]): Link[] {
  const out: Link[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const from = ordered[i - 1] as RoundSummary;
    const to = ordered[i] as RoundSummary;
    const recorded = to.meta.parent_run_id === from.id;
    const sameScene = recorded || sceneVersion(from) === sceneVersion(to);
    // another scene is another test: the earlier round's decision did not lead here
    const d = sameScene ? from.decisions : null;
    out.push({
      from,
      to,
      recorded,
      sameScene,
      changes: d?.requirement_changes ?? [],
      signedBy: d && !isToolProposal(d) ? (d.reviewer ?? null) : null,
      decidedAt: d?.decided_at ?? null,
    });
  }
  return out;
}

/** Headline counts for a round row, straight from the report. */
export interface Headline {
  simulations: number;
  encounters: number;
  failures: number;
  failureRate: number | null;
  stalled: number;
  noEncounter: number;
  setAside: number;
}

export function headline(report: AnalysisReport): Headline {
  const fm = report.failure_model;
  return {
    simulations: fm.n_simulations,
    encounters: fm.n_encounters,
    failures: fm.failures,
    failureRate: fm.failure_rate,
    stalled: fm.passed_stalled,
    noEncounter: fm.n_no_encounter,
    setAside: report.admissibility.n_spurious,
  };
}

/** The previous round in the chain, as recorded (`parent_run_id`) or by order. */
/**
 * Which run of the requirement a round is: 1 for a first run, 2 for the run of
 * R1 (its parent recorded), and so on along the recorded parents; a recorded
 * `round` number counts when it says more.
 */
export function runNumberOf(round: RoundSummary, rounds: readonly RoundSummary[]): number {
  let n = 1;
  let r: RoundSummary | undefined = round;
  const seen = new Set<string>();
  while (r?.meta.parent_run_id && !seen.has(r.id)) {
    seen.add(r.id);
    r = rounds.find((x) => x.id === r!.meta.parent_run_id);
    if (!r) break;
    n++;
  }
  return Math.max(n, round.meta.round ?? 1);
}

/** "Second run", "Third run" … for a run number. */
export function runOrdinal(n: number): string {
  const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  return n >= 1 && n <= words.length ? `${words[n - 1]} run` : `Run ${n}`;
}

/** The recorded test scene version (run_meta.scene.version); null before scene v2 recorded itself. */
export function sceneVersion(round: RoundSummary): number | null {
  const scene = round.meta.scene as { version?: unknown } | null | undefined;
  return typeof scene?.version === 'number' ? scene.version : null;
}

export function previousOf(
  round: RoundSummary,
  ordered: RoundSummary[],
): { round: RoundSummary; recorded: boolean } | null {
  const parent = round.meta.parent_run_id
    ? ordered.find((r) => r.id === round.meta.parent_run_id)
    : undefined;
  if (parent) return { round: parent, recorded: true };
  // by date, only among rounds of the same test scene: another scene is another test
  const i = ordered.findIndex((r) => r.id === round.id);
  for (let j = i - 1; j >= 0; j--) {
    const earlier = ordered[j] as RoundSummary;
    if (sceneVersion(earlier) === sceneVersion(round)) return { round: earlier, recorded: false };
  }
  return null;
}
