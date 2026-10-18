import { completionGaps } from '@/domain/decisions';
import type { AnalysisReport } from '@/services/schemas';
import { assumptionState, obstacleState, scopeState, type Draft } from '@/state/draft';
import { STUDY } from '@/study/config';

/**
 * Where a review stands, step by step, for the progress tracker. Each step
 * gets a state and one line of live status read from the round's own data:
 * the reading steps (1-3) are done once visited; triage (4) is done when
 * every verdict is the reviewer's own, and carries the fraction decided;
 * revision (5) is done when signed. "Attention" marks something a reviewer
 * should not miss on that step - a requirement that did not parse,
 * pre-filled verdicts not yet confirmed, a failed run.
 */
export type StepState = 'done' | 'current' | 'upcoming';

export interface StepProgress {
  step: number;
  state: StepState;
  /** One line of live status for the step. */
  detail: string;
  /** Something to look at on this step, worded; null when nothing. */
  attention: string | null;
  /** 0..1 for a step with measurable progress (triage), else null. */
  fraction: number | null;
}

export interface Decided {
  decided: number;
  proposed: number;
  total: number;
}

/** Verdicts the reviewer has made or confirmed, and those still only proposed. */
export function decidedCount(draft: Draft): Decided {
  const states = [
    ...Object.keys(draft.doc.obstacles).map((id) => obstacleState(draft, id)),
    ...Object.keys(draft.doc.scope).map((id) => scopeState(draft, id)),
    ...Object.keys(draft.doc.assumptions ?? {}).map((t) => assumptionState(draft, t)),
  ];
  return {
    decided: states.filter((s) => s === 'confirmed').length,
    proposed: states.filter((s) => s === 'prefilled').length,
    total: states.length,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Every run of the round: the ones the analysis counted plus those it set aside. */
export function totalRuns(report: AnalysisReport): number {
  return report.failure_model.n_simulations + report.admissibility.n_spurious;
}

export function reviewProgress({
  step,
  report,
  draft,
  visited,
}: {
  step: number;
  report: AnalysisReport | null;
  draft: Draft | null;
  visited: ReadonlySet<number>;
}): StepProgress[] {
  const stateOf = (n: number, done: boolean): StepState =>
    n === step ? 'current' : done ? 'done' : 'upcoming';
  if (!report) {
    return [1, 2, 3, 4, 5].map((n) => ({
      step: n,
      state: stateOf(n, false),
      detail: n === 1 ? 'not analysed yet' : '',
      attention: n === 1 ? 'no analysis report' : null,
      fraction: null,
    }));
  }
  const fm = report.failure_model;
  const req = report.requirement;
  const tree = req.tree;
  const assumptions = tree?.assumptions ?? req.assumptions ?? [];
  const softGoals = tree?.soft_goals ?? req.soft_goals ?? [];
  const supported = report.obstacles.filter((o) => o.verdict === 'supported').length;
  const below = report.obstacles.length - supported;
  const counts = draft ? decidedCount(draft) : { decided: 0, proposed: 0, total: 0 };
  const gaps = draft ? completionGaps(draft.doc).length : 0;

  return [
    {
      step: 1,
      state: stateOf(1, visited.has(1)),
      detail:
        req.parsed === false
          ? 'did not parse'
          : `${plural(assumptions.length, 'assumption')} · ${plural(softGoals.length, 'soft goal')}`,
      attention: req.parsed === false ? 'the requirement did not parse' : null,
      fraction: null,
    },
    {
      step: 2,
      state: stateOf(2, visited.has(2)),
      detail: `${plural(fm.n_scenarios, 'case')} · ${plural(totalRuns(report), 'run')} · ${fm.failures} failed`,
      attention: fm.failures > 0 ? `${plural(fm.failures, 'failed run')}` : null,
      fraction: null,
    },
    {
      step: 3,
      state: stateOf(3, visited.has(3)),
      detail: report.obstacles.length
        ? STUDY
          ? plural(report.obstacles.length, 'obstacle')
          : `${supported} supported · ${below} below the bar`
        : 'no obstacles named',
      attention: null,
      fraction: null,
    },
    {
      step: 4,
      state: stateOf(4, counts.total > 0 && counts.decided === counts.total),
      detail: counts.total ? `${counts.decided} of ${counts.total} decided` : 'nothing to decide',
      attention: counts.proposed
        ? `${plural(counts.proposed, 'proposed verdict')} to confirm`
        : null,
      fraction: counts.total ? counts.decided / counts.total : null,
    },
    {
      step: 5,
      state: stateOf(5, Boolean(draft?.signed)),
      detail: draft?.signed
        ? `signed by ${draft.signed.reviewer}`
        : gaps
          ? `not signed · ${gaps} to settle`
          : 'ready to sign',
      attention: null,
      fraction: null,
    },
  ];
}
