import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { analysisReportSchema, parseWithSchema } from '@/services/schemas';
import { prepareSigning } from '@/services/signing';
import { createDraft, draftReducer, type Draft } from '@/state/draft';

import { FIXTURE_WORKSPACE, fixtureText, ROUND_1, ROUND_2 } from '../helpers/memorySource';

/**
 * The shared contract: for the same inputs, this interface writes the same
 * bytes as `python -m scripts.analysis.review` + `refine`. The Python side
 * is the oracle (tests/contract/oracle.py); the test is skipped when no
 * interpreter with the project's packages is found.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const ORACLE = resolve(__dirname, 'oracle.py');

function findPython(): string | null {
  const candidates = [
    process.env.REAL_PYTHON,
    join(REPO_ROOT, 'sim_env', 'bin', 'python'),
    'python3',
    'python',
  ].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    if (candidate.includes('/') && !existsSync(candidate)) continue;
    try {
      execFileSync(
        candidate,
        ['-c', 'import scripts.analysis.decisions, scripts.analysis.refine'],
        { cwd: REPO_ROOT, stdio: 'ignore' },
      );
      return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

const python = findPython();
const describeIf = python ? describe : describe.skip;

interface Answers {
  round?: number;
  obstacles?: Record<
    string,
    {
      verdict: string | null;
      reason?: string | null;
      mitigation_layer?: string;
      mitigation_action?: string;
      renamed_to?: string | null;
    }
  >;
  scope?: Record<string, { verdict: string | null; reason?: string | null }>;
  assumptions?: Record<
    string,
    { verdict: string | null; new_text?: string | null; reason?: string | null }
  >;
  added_assumptions?: { text: string; reason: string | null }[];
}

function oracle(
  runDir: string,
  answers: Answers,
  reviewer: string,
  decidedAt: string,
  previousDir?: string,
) {
  const dir = mkdtempSync(join(tmpdir(), 'real-contract-'));
  const answersPath = join(dir, 'answers.json');
  writeFileSync(answersPath, JSON.stringify(answers));
  const args = [
    ORACLE,
    runDir,
    answersPath,
    reviewer,
    decidedAt,
    ...(previousDir ? [previousDir] : []),
  ];
  const out = execFileSync(python as string, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: REPO_ROOT },
  });
  return JSON.parse(out) as { decisions: string; r1: string; diff: string };
}

function applyAnswers(draft: Draft, answers: Answers): Draft {
  let d = draft;
  for (const [id, a] of Object.entries(answers.obstacles ?? {})) {
    d = draftReducer(d, { type: 'obstacle/verdict', id, verdict: a.verdict as never });
    if (a.renamed_to) d = draftReducer(d, { type: 'obstacle/renamed_to', id, value: a.renamed_to });
    d = draftReducer(d, { type: 'obstacle/reason', id, value: a.reason ?? '' });
    if (a.mitigation_layer) {
      const opt = d.doc.obstacles[id]?.options.find((o) => o.layer === a.mitigation_layer);
      const action = a.mitigation_action || opt?.action || '';
      d = draftReducer(d, {
        type: 'obstacle/mitigation',
        id,
        mitigation: { layer: a.mitigation_layer, action },
      });
    }
  }
  for (const [id, s] of Object.entries(answers.scope ?? {})) {
    d = draftReducer(d, { type: 'scope/verdict', id, verdict: s.verdict as never });
    d = draftReducer(d, { type: 'scope/reason', id, value: s.reason ?? '' });
  }
  for (const [text, a] of Object.entries(answers.assumptions ?? {})) {
    d = draftReducer(d, { type: 'assumption/verdict', text, verdict: a.verdict as never });
    if (a.new_text) d = draftReducer(d, { type: 'assumption/new_text', text, value: a.new_text });
    d = draftReducer(d, { type: 'assumption/reason', text, value: a.reason ?? '' });
  }
  if (answers.added_assumptions)
    d = draftReducer(d, {
      type: 'added_assumptions/set',
      lines: answers.added_assumptions.map((a) => a.text),
    });
  return d;
}

describeIf('contract with the Python tools', () => {
  const decidedAt = new Date('2026-10-08T12:34:56.789Z');
  const decidedAtText = '2026-10-08T12:34:56.789000+00:00';

  it('round 2 with the demo’s answers: decisions.json, R1.dsl and requirement_diff.md are byte-identical', () => {
    const runDir = join(FIXTURE_WORKSPACE, ROUND_2);
    const report = parseWithSchema(
      fixtureText(`${ROUND_2}/analysis_report.json`),
      analysisReportSchema,
      'report',
    );
    const previous = parseWithSchema(
      fixtureText(`${ROUND_1}/analysis_report.json`),
      analysisReportSchema,
      'report',
    );
    const answers: Answers = {
      round: 2,
      obstacles: {
        StandoffUnnecessaryStop: {
          verdict: 'accept',
          mitigation_layer: 'requirement',
          reason: '113 standoffs — progress must be promised.',
        },
        DetectionTooLate: { verdict: 'accept', reason: 'Masked, not resolved.' },
        PedestrianClothingNotVisible: {
          verdict: 'rename',
          renamed_to: 'LowContrastClothing',
          reason: 'Right obstacle, wrong name.',
        },
        BrakingNotLatched: { verdict: 'defer', reason: 'Not enough evidence this round.' },
        PedestrianSizeTooSmall: { verdict: 'reject', reason: 'No child effect in the data.' },
        AdverseWeather: {
          verdict: 'reject',
          reason: 'Fog 50 % did not go with more failures (café → non-ASCII on purpose).',
        },
      },
      scope: {
        'artefact:crossing_trigger_8m': {
          verdict: 'scenario_defect',
          reason: 'built into the test',
        },
        'artefact:no_encounter_geometry': { verdict: 'in_scope', reason: 'keep measuring it' },
        'artefact:distance_parameter_dead': {
          verdict: 'out_of_scope',
          reason: 'the distance setting has no effect',
        },
      },
    };
    const expected = oracle(
      runDir,
      answers,
      'Contract Tester',
      decidedAtText,
      join(FIXTURE_WORKSPACE, ROUND_1),
    );
    const draft = applyAnswers(createDraft(report, previous, null, 2), answers);
    const result = prepareSigning({
      doc: draft.doc,
      report,
      r0: fixtureText(`${ROUND_2}/R0.dsl`),
      reviewer: 'Contract Tester',
      r1Override: null,
      decidedAt,
    });
    expect(result.files['decisions.json']).toBe(expected.decisions);
    expect(result.files['R1.dsl']).toBe(expected.r1);
    expect(result.files['requirement_diff.md']).toBe(expected.diff);
  });

  it('round 2 with reworded and reviewer-written fixes: the change follows the text as refine.py does', () => {
    const runDir = join(FIXTURE_WORKSPACE, ROUND_2);
    const report = parseWithSchema(
      fixtureText(`${ROUND_2}/analysis_report.json`),
      analysisReportSchema,
      'report',
    );
    const answers: Answers = {
      round: 2,
      obstacles: {
        // reworded catalogue fixes: a test fix takes the new text, a table entry ignores it
        StandoffUnnecessaryStop: {
          verdict: 'accept',
          mitigation_layer: 'scenario',
          mitigation_action: 'let the pedestrian finish crossing before the timer starts',
          reason: 'the test, not the car',
        },
        DetectionTooLate: {
          verdict: 'accept',
          mitigation_layer: 'requirement',
          mitigation_action: 'ego speed stays low near crossings',
          reason: 'reworded',
        },
        AdverseWeather: {
          verdict: 'accept',
          mitigation_layer: 'requirement',
          mitigation_action: 'fog density at most 50 %',
          reason: 'reworded; the table entry stands',
        },
        // reviewer-written fixes on layers the catalogue does not offer
        BrakingNotLatched: {
          verdict: 'accept',
          mitigation_layer: 'data',
          mitigation_action: 'record more late-braking cases',
          reason: 'own fix',
        },
        PedestrianClothingNotVisible: {
          verdict: 'rename',
          renamed_to: 'LowContrastClothing',
          mitigation_layer: 'model',
          mitigation_action: 'a detector trained for low contrast',
          reason: 'own fix',
        },
        PedestrianSizeTooSmall: { verdict: 'reject', reason: 'n' },
      },
    };
    const expected = oracle(runDir, answers, 'Contract Tester', decidedAtText);
    // the edited and written texts reach the change list, not only decisions.json
    expect(expected.diff).toContain('let the pedestrian finish crossing before the timer starts');
    expect(expected.diff).toContain('data-level change with no requirement slot: record more');
    // a table entry wins over the wording (refine.R_CHANGES)
    expect(expected.r1).toContain('fog_density <= 50');
    expect(expected.r1).not.toContain('fog density at most 50 %');
    const draft = applyAnswers(createDraft(report, null, null, 2), answers);
    const result = prepareSigning({
      doc: draft.doc,
      report,
      r0: fixtureText(`${ROUND_2}/R0.dsl`),
      reviewer: 'Contract Tester',
      r1Override: null,
      decidedAt,
    });
    expect(result.files['decisions.json']).toBe(expected.decisions);
    expect(result.files['R1.dsl']).toBe(expected.r1);
    expect(result.files['requirement_diff.md']).toBe(expected.diff);
  });

  it('round 2 re-judged under the baseline assumptions: keep / tighten / loosen / drop / add and a system change', () => {
    const runDir = join(FIXTURE_WORKSPACE, ROUND_2, 'baseline_D0');
    const report = parseWithSchema(
      fixtureText(`${ROUND_2}/baseline_D0/analysis_report.json`),
      analysisReportSchema,
      'report',
    );
    const r0 = report.run_meta.requirement as string;
    const answers: Answers = {
      round: 2,
      obstacles: {
        StandoffUnnecessaryStop: {
          verdict: 'accept',
          mitigation_layer: 'system',
          reason: 'time-box the stop',
        },
        DetectionTooLate: {
          verdict: 'accept',
          mitigation_layer: 'requirement',
          reason: 'state the speed assumption',
        },
        PedestrianClothingNotVisible: { verdict: 'reject', reason: 'n' },
        BrakingNotLatched: { verdict: 'accept', mitigation_layer: 'system', reason: 'latch it' },
        PedestrianSizeTooSmall: { verdict: 'reject', reason: 'n' },
        AdverseWeather: { verdict: 'reject', reason: 'n' },
      },
      scope: {
        'artefact:crossing_trigger_8m': { verdict: 'scenario_defect', reason: 'x' },
        'artefact:no_encounter_geometry': { verdict: 'scenario_defect', reason: 'x' },
        'artefact:distance_parameter_dead': { verdict: 'scenario_defect', reason: 'x' },
      },
      assumptions: {
        'fog_density <= 50': { verdict: 'keep', reason: 'as is' },
        'initial_separation_m >= 15': {
          verdict: 'tighten',
          new_text: 'initial_separation_m >= 20',
          reason: 'closer starts are unfair',
        },
        'pedestrian_speed_mps <= 3': {
          verdict: 'loosen',
          new_text: 'pedestrian_speed_mps <= 4',
          reason: 'running happens',
        },
        'daylight, dry road': { verdict: 'drop', reason: 'not needed' },
        'pedestrian on foot': { verdict: 'keep', reason: 'as is' },
      },
      added_assumptions: [{ text: 'no parked cars at the kerb', reason: null }],
    };
    const expected = oracle(runDir, answers, 'Contract Tester', decidedAtText);
    const draft = applyAnswers(createDraft(report, null, null, 2), answers);
    const result = prepareSigning({
      doc: draft.doc,
      report,
      r0,
      reviewer: 'Contract Tester',
      r1Override: null,
      decidedAt,
    });
    expect(result.files['decisions.json']).toBe(expected.decisions);
    expect(result.files['R1.dsl']).toBe(expected.r1);
    expect(result.files['requirement_diff.md']).toBe(expected.diff);
  });
});
