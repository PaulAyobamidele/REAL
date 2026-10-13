import type { AnalysisReport } from '@/services/schemas';

import { SETTING_COLUMNS, setAsideReason, type SimulationRow } from './evidence';

/**
 * Test cases and runs, as a test report reads them: a test case is one
 * scenario (one combination of settings), a run is one simulation of it.
 * Every row of simulations.csv is a run except the video recording pass,
 * which repeats the worst scenario to film it and is not a sample.
 */

export type RunResult = 'passed' | 'passed, stopped and never moved on' | 'failed' | 'not counted';

export interface TestRun {
  row: SimulationRow;
  result: RunResult;
  /** Why a run is not counted (set aside, never crossed, ...), else null. */
  reason: string | null;
}

export interface TestCase {
  id: string;
  settings: Record<string, string>;
  phenotype: string;
  runs: TestRun[];
  passed: number;
  failed: number;
  stalled: number;
  notCounted: number;
}

export function isRecordingPass(row: SimulationRow): boolean {
  return Boolean(row.label?.recording_pass);
}

export function runResult(row: SimulationRow): TestRun {
  const reason = setAsideReason(row);
  if (reason) return { row, result: 'not counted', reason };
  if (row.label?.failed) return { row, result: 'failed', reason: null };
  if (row.label?.outcome === 'passed_stalled')
    return { row, result: 'passed, stopped and never moved on', reason: null };
  return { row, result: 'passed', reason: null };
}

export function testCases(rows: SimulationRow[]): TestCase[] {
  const byId = new Map<string, TestCase>();
  for (const row of rows) {
    if (isRecordingPass(row)) continue;
    let tc = byId.get(row.scenarioId);
    if (!tc) {
      tc = {
        id: row.scenarioId,
        settings: Object.fromEntries(SETTING_COLUMNS.map((c) => [c.key, row.csv[c.key] ?? ''])),
        phenotype: row.csv.phenotype ?? '',
        runs: [],
        passed: 0,
        failed: 0,
        stalled: 0,
        notCounted: 0,
      };
      byId.set(row.scenarioId, tc);
    }
    const run = runResult(row);
    tc.runs.push(run);
    if (run.result === 'failed') tc.failed += 1;
    else if (run.result === 'not counted') tc.notCounted += 1;
    else {
      tc.passed += 1;
      if (run.result !== 'passed') tc.stalled += 1;
    }
  }
  const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : Number.POSITIVE_INFINITY);
  return [...byId.values()].sort((a, b) => num(a.id) - num(b.id) || a.id.localeCompare(b.id));
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** One line per test case: its settings and how its runs ended. */
export function testCasesCsv(cases: TestCase[]): string {
  return csv(
    [
      'test_case',
      ...SETTING_COLUMNS.map((c) => c.key),
      'runs',
      'passed',
      'passed_stopped_never_moved_on',
      'failed',
      'not_counted',
      'scenario',
    ],
    cases.map((tc) => [
      tc.id,
      ...SETTING_COLUMNS.map((c) => tc.settings[c.key]),
      tc.runs.length,
      tc.passed,
      tc.stalled,
      tc.failed,
      tc.notCounted,
      tc.phenotype,
    ]),
  );
}

/** One line per run: its test case, settings, result and, when not counted, why. */
export function runsCsv(cases: TestCase[]): string {
  return csv(
    [
      'test_case',
      'run',
      ...SETTING_COLUMNS.map((c) => c.key),
      'result',
      'not_counted_because',
      'closest_distance_m',
    ],
    cases.flatMap((tc) =>
      tc.runs.map((r) => [
        tc.id,
        r.row.simIndex,
        ...SETTING_COLUMNS.map((c) => tc.settings[c.key]),
        r.result,
        r.reason,
        r.row.csv.min_distance_m,
      ]),
    ),
  );
}

export type PartStatus = 'failed' | 'held' | 'broken' | 'not checked' | 'rejected';

export interface RequirementPart {
  part: 'safety goal' | 'soft goal' | 'assumption';
  text: string;
  status: PartStatus;
  detail: string;
}

/**
 * Each part of the requirement with its result this round, from the
 * analysis report: the safety goal (failed if any counted run failed), each
 * soft goal (failed if missed in any run), each assumption (broken if any
 * run broke it - those runs are not counted). Failed parts come first.
 */
export function requirementResults(report: AnalysisReport): RequirementPart[] {
  const fm = report.failure_model;
  const tree = report.requirement.tree;
  const goal = tree ? `${tree.temporal ?? ''} "${tree.objective ?? ''}"`.trim() : 'the safety goal';
  const parts: RequirementPart[] = [
    fm.failures > 0
      ? {
          part: 'safety goal',
          text: goal,
          status: 'failed',
          detail: `violated in ${fm.failures} of ${fm.n_encounters} counted runs (the car came within the safety margin)`,
        }
      : {
          part: 'safety goal',
          text: goal,
          status: 'held',
          detail: `held in all ${fm.n_encounters} counted runs`,
        },
  ];
  for (const s of report.soft_goals ?? []) {
    const n = s.met + s.missed;
    parts.push(
      s.kind === 'free_text'
        ? {
            part: 'soft goal',
            text: s.text,
            status: 'not checked',
            detail: 'free text, not checked automatically',
          }
        : s.kind === 'rejected'
          ? { part: 'soft goal', text: s.text, status: 'rejected', detail: s.message }
          : s.missed > 0
            ? {
                part: 'soft goal',
                text: s.text,
                status: 'failed',
                detail: `not met in ${s.missed} of ${n} runs`,
              }
            : { part: 'soft goal', text: s.text, status: 'held', detail: `met in all ${n} runs` },
    );
  }
  for (const a of report.admissibility.assumptions ?? []) {
    const n = a.held + a.broken;
    parts.push(
      a.kind === 'free_text'
        ? {
            part: 'assumption',
            text: a.text,
            status: 'not checked',
            detail: 'free text, not checked automatically',
          }
        : a.kind === 'rejected'
          ? { part: 'assumption', text: a.text, status: 'rejected', detail: a.message }
          : a.broken > 0
            ? {
                part: 'assumption',
                text: a.text,
                status: 'broken',
                detail: `broken in ${a.broken} of ${n} runs; those runs are not counted`,
              }
            : { part: 'assumption', text: a.text, status: 'held', detail: `held in all ${n} runs` },
    );
  }
  const order: Record<PartStatus, number> = {
    failed: 0,
    broken: 1,
    rejected: 2,
    held: 3,
    'not checked': 4,
  };
  return parts.sort((x, y) => order[x.status] - order[y.status]);
}
