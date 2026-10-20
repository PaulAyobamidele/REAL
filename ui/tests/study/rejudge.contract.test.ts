// @vitest-environment node
/**
 * Contract: the study page's re-judging (src/study/rejudge.ts) gives what the
 * project's Python gives - scripts/analysis/report.py analyse(run,
 * requirement=R1) - on a real run (run 2b, 160 simulations), for revised
 * requirements that tighten, drop, add a string comparison, name an
 * unmeasured quantity, name the car (refused) and change a soft goal.
 * Skipped where the run or the project's Python is not present.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { joinClauses, splitClauses } from '@/domain/requirementText';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';
import { rejudge, type RunQuantities } from '@/study/rejudge';

const REPO = join(__dirname, '..', '..', '..');
const PYTHON = join(REPO, 'sim_env', 'bin', 'python');
// REJUDGE_RUN=<run folder> checks another run (e.g. the study's round C1)
const RUN =
  process.env.REJUDGE_RUN ?? join(REPO, 'artifacts', 'runs', '657a1447d0ba43af9c3aa54f3c8698ce');
const present = existsSync(PYTHON) && existsSync(join(RUN, 'simulations.csv'));

const R0: string = present
  ? JSON.parse(readFileSync(join(RUN, 'run_meta.json'), 'utf8')).requirement
  : '';
const { head, assuming, ensuring } = splitClauses(R0);
const variant = (a: string[], e: string[] = ensuring) => joinClauses(head, a, e);

const VARIANTS: Record<string, string> = present
  ? {
      'as run': R0,
      'tightened fog': variant(['fog_density <= 30', ...assuming.slice(1)]),
      'separation dropped, sun added (not recorded in this run)': variant([
        assuming[0]!,
        'sun_altitude_angle >= 0',
        ...assuming.slice(2),
      ]),
      'a string comparison and a slower walker': variant([
        'pedestrian == Adult',
        'pedestrian_speed_mps <= 1.2',
        'pedestrian on foot',
      ]),
      'an assumption about the car (refused)': variant([...assuming, 'ego_speed_max <= 5']),
      'every assumption dropped, a soft goal added': variant(
        [],
        [...ensuring, 'peak_jerk_mps3 <= 10'],
      ),
    }
  : {};

function python(args: string[], input?: string): string {
  return execFileSync(PYTHON, args, {
    cwd: REPO,
    input,
    env: { ...process.env, PYTHONPATH: REPO },
    maxBuffer: 256 << 20,
  }).toString();
}

/** The parts of a report the Test Execution Report reads, in one comparable shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Python's dict and the page's report, compared field by field
function shown(r: Record<string, any>) {
  const fm = r.failure_model;
  return {
    failure_model: Object.fromEntries(
      [
        'n_simulations',
        'n_no_encounter',
        'n_left_road',
        'n_not_crossed',
        'n_encounters',
        'n_scenarios',
        'failures',
        'failure_rate',
        'passes',
        'passed_clean',
        'passed_stalled',
      ].map((k) => [k, fm[k]]),
    ),
    assumptions: r.admissibility.assumptions,
    free_text_assumptions: r.admissibility.free_text_assumptions,
    n_admissible: r.admissibility.n_admissible,
    n_spurious: r.admissibility.n_spurious,
    spurious: r.admissibility.spurious,
    soft_goals: r.soft_goals,
    simulations: (r.simulations ?? [])
      .filter((s: { scenario_id: string }) => s.scenario_id !== 'best_video')
      .map((s: Record<string, unknown>) => ({
        id: `${s.scenario_id}_${s.sim_index}`,
        admissible: s.admissible,
        set_aside_reason: s.set_aside_reason,
        assumptions: s.assumptions,
        soft_goals: s.soft_goals,
      })),
  };
}

describe.skipIf(!present)('re-judging matches the project Python', () => {
  const quantities = present
    ? (JSON.parse(python([join('ui', 'scripts', 'study_quantities.py'), RUN])) as RunQuantities)
    : null;
  const report = present
    ? parseWithSchema(
        readFileSync(join(RUN, 'analysis_report.json'), 'utf8'),
        analysisReportSchema,
        'report',
      )
    : null;
  const expected: Record<string, Record<string, unknown>> = present
    ? JSON.parse(
        python(
          [
            '-c',
            [
              'import json, sys',
              'from scripts.analysis import report',
              'variants = json.loads(sys.stdin.read())',
              'out = {name: report._json_safe(report.analyse(sys.argv[1], requirement=text)) for name, text in variants.items()}',
              'print(json.dumps(out))',
            ].join('\n'),
            RUN,
          ],
          JSON.stringify(VARIANTS),
        ).trim() || '{}',
      )
    : {};

  it('compares something real: the variants judge the run differently', () => {
    const seen = Object.values(expected).map((r) => {
      const a = r.admissibility as { n_admissible: number; assumptions: unknown[] };
      return `${a.n_admissible}/${a.assumptions.length}/${(r.failure_model as { failures: number }).failures}`;
    });
    expect(seen).toHaveLength(Object.keys(VARIANTS).length);
    expect(new Set(seen).size).toBeGreaterThan(3);
    expect((expected['as run']!.simulations as unknown[]).length).toBeGreaterThan(100);
    console.log('n_admissible/assumptions/failures per variant:', seen.join('  '));
  });

  it.each(Object.keys(VARIANTS))('%s', (name) => {
    const ours = rejudge(report!, quantities!, VARIANTS[name]!);
    const theirs = expected[name]!;
    expect(shown(ours as never)).toEqual(shown(theirs));
  });
});
