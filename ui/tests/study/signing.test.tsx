import './memoryStorage';

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDecisions } from '@/domain/decisions';
import type { RoundSummary } from '@/domain/lineage';
import { analysisReportSchema, parseWithSchema, type DecisionsDoc } from '@/services/schemas';
import { carChanges, carOf, savedCarOf } from '@/study/car';
import { installClickLog } from '@/study/clickLog';
import type * as StudyConfig from '@/study/config';
import { flushDecisionLog, logDecision } from '@/study/decisionLog';
import { logLines, startLog } from '@/study/log';
import { signStudy } from '@/study/signing';
import { zipFiles } from '@/study/zip';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';
import { C1, serveStudySite } from './fakeSite';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

const REPO = join(__dirname, '..', '..', '..');
const PYTHON = join(REPO, 'sim_env', 'bin', 'python');
const R0 = fixtureText(`${ROUND_2}/R0.dsl`);
const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);
const round = {
  id: C1,
  dir: C1,
  meta: { run_id: C1, study_round: 'study_C1' },
} as unknown as RoundSummary;

function decided(choices: Record<string, string | null>): DecisionsDoc {
  const doc = buildDecisions(report);
  for (const id of Object.keys(doc.obstacles)) {
    const o = doc.obstacles[id]!;
    const choice = choices[id];
    o.verdict = choice === undefined ? 'reject' : 'accept';
    o.reason = 'my reason';
    o.mitigation = choice ? { layer: 'system', action: choice, choice } : null;
  }
  for (const s of Object.values(doc.scope)) s.verdict = 'in_scope';
  for (const a of Object.values(doc.assumptions ?? {})) a.verdict = 'keep';
  // every diagnosis rated (study/helpfulness.ts): signing waits for it
  for (const item of [...Object.values(doc.obstacles), ...Object.values(doc.scope)])
    Object.assign(item, { helpful: { rating: 'helpful', why: null } });
  return doc;
}

const events = (id: string) =>
  logLines(id)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { event: string; target?: string; old?: unknown; new?: unknown });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    'real-av.study.session',
    JSON.stringify({
      id: 'S-TEST',
      expertise: 'Student',
      started_at: '2026-10-18T09:00:00Z',
      build: 'dev',
    }),
  );
  startLog('S-TEST');
  serveStudySite();
});
afterEach(() => vi.unstubAllGlobals());

const [A, B] = Object.keys(buildDecisions(report).obstacles) as [string, string];

describe('the car the decisions make', () => {
  it('adds up the car changes to one of the four saved cars', () => {
    expect(carOf(decided({})).id).toBe('C1');
    expect(carOf(decided({ [A]: 'car_path_aware' })).id).toBe('C2');
    expect(carOf(decided({ [A]: 'car_larger_detector' })).id).toBe('C3');
    expect(carOf(decided({ [A]: 'car_both' })).id).toBe('C4');
    expect(carOf(decided({ [A]: 'car_path_aware', [B]: 'car_larger_detector' })).id).toBe('C4');
  });

  it('writes the module swaps into R1, so R1 names the saved car', async () => {
    const { applyChanges } = await import('@/domain/requirementText');
    const r1 = applyChanges(R0, carChanges(decided({ [A]: 'car_both' })));
    expect(r1).toContain('performed by "path_aware_braking"');
    expect(r1).toContain('performed by "yolov5m"');
    expect(savedCarOf(r1)).toBe('C4');
    expect(savedCarOf(R0)).toBe('C1');
  });
});

describe('the zip', () => {
  it('is a valid zip with the files in it', () => {
    if (!existsSync(PYTHON)) return;
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const file = join(dir, 'a.zip');
    writeFileSync(file, zipFiles({ 'study_S-X/a.txt': 'héllo\n', 'study_S-X/b.json': '{}\n' }));
    const listed = execFileSync(PYTHON, [
      '-c',
      'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print({n: z.read(n).decode() for n in z.namelist()})',
      file,
    ]).toString();
    expect(listed).toContain("'study_S-X/a.txt': 'héllo\\n'");
    expect(listed).toContain("'study_S-X/b.json': '{}\\n'");
  });
});

describe('signing in the study build', () => {
  it('records the study, writes R1 for the chosen car, and zips everything with the log', async () => {
    const signed = await signStudy({
      doc: decided({ [A]: 'car_path_aware' }),
      report,
      r0: R0,
      round,
    });
    expect(signed.zipName).toBe('study_S-TEST.zip');
    expect(Object.keys(signed.files).sort()).toEqual(
      ['R0.dsl', 'R1.dsl', 'decisions.json', 'log.jsonl', 'requirement_diff.md'].map(
        (f) => `study_S-TEST/${f}`,
      ),
    );
    const doc = JSON.parse(signed.files['study_S-TEST/decisions.json']!);
    expect(doc.reviewer).toBe('S-TEST');
    expect(doc.study).toMatchObject({
      participant: 'S-TEST',
      expertise: 'Student',
      car: 'C2',
      verdicts_hidden: true,
      r1_written_by_tool: true,
      round: { study_round: 'study_C1', shown_run_id: C1 },
    });
    expect(doc.study.menu_offered).toHaveLength(6);
    expect(signed.files['study_S-TEST/R1.dsl']).toContain('performed by "path_aware_braking"');
    expect(signed.files['study_S-TEST/log.jsonl']).toContain('"event":"sign_attempted"');
    expect(signed.files['study_S-TEST/log.jsonl']).toContain('"event":"session_end"'); // the zip's log is complete

    // acceptance check 8: the participant's decisions.json passes the project's own validate()
    if (existsSync(PYTHON)) {
      const dir = mkdtempSync(join(tmpdir(), 'dec-'));
      writeFileSync(join(dir, 'decisions.json'), signed.files['study_S-TEST/decisions.json']!);
      const problems = execFileSync(
        PYTHON,
        [
          '-c',
          'import json, sys; from scripts.analysis import decisions; print(json.dumps(decisions.validate(json.load(open(sys.argv[1])))))',
          join(dir, 'decisions.json'),
        ],
        { cwd: REPO },
      ).toString();
      expect(JSON.parse(problems)).toEqual([]);
    }
    expect(events('S-TEST').map((e) => e.event)).toEqual([
      'sign_attempted',
      'signed',
      'session_end',
    ]);
  });

  it('refuses a car with no saved run on this site, says why, and logs the refusal', async () => {
    // the fake site bundles C1 and C2 only
    await expect(
      signStudy({ doc: decided({ [A]: 'car_larger_detector' }), report, r0: R0, round }),
    ).rejects.toThrow(/car C3 is not among the saved runs/);
    const log = events('S-TEST');
    expect(log.map((e) => e.event)).toEqual(['sign_attempted', 'sign_refused']);
    expect(String(log[1]?.new)).toMatch(/C3/);
  });

  it('refuses a double quote in an assumption text (R1 would not parse)', async () => {
    const doc = decided({});
    const [text] = Object.keys(doc.assumptions ?? {});
    if (!text) return;
    doc.assumptions![text]!.verdict = 'tighten';
    doc.assumptions![text]!.new_text = 'fog "dense"';
    await expect(signStudy({ doc, report, r0: R0, round })).rejects.toThrow(/double quote/);
  });

  it('waits until every diagnosis is rated as helpful or not', async () => {
    const doc = decided({});
    const [first] = Object.keys(doc.obstacles);
    Object.assign(doc.obstacles[first!]!, { helpful: { rating: null, why: null } });
    await expect(signStudy({ doc, report, r0: R0, round })).rejects.toThrow(
      new RegExp(`1 diagnosis not yet rated.*${first}`),
    );
  });
});

describe('the log reconstructs the session', () => {
  it('records each decision with its old and new value, typing as one entry', () => {
    const draft = { doc: buildDecisions(report), reviewer: '', r1Override: null } as never;
    logDecision(draft, { type: 'obstacle/verdict', id: A, verdict: 'accept' });
    logDecision(draft, { type: 'obstacle/reason', id: A, value: 'f' });
    logDecision(draft, { type: 'obstacle/reason', id: A, value: 'fo' });
    logDecision(draft, { type: 'obstacle/reason', id: A, value: 'fog hides her' });
    flushDecisionLog();
    const log = events('S-TEST');
    expect(log).toEqual([
      expect.objectContaining({ event: 'obstacle_verdict', target: A, old: null, new: 'accept' }),
      expect.objectContaining({
        event: 'obstacle_reason_written',
        target: A,
        old: null,
        new: 'fog hides her',
      }),
    ]);
  });

  it('records what was clicked to open evidence', () => {
    const stop = installClickLog();
    render(<button type="button">Trace 3_1</button>);
    fireEvent.click(screen.getByRole('button', { name: 'Trace 3_1' }));
    stop();
    expect(events('S-TEST').at(-1)).toMatchObject({
      event: 'clicked',
      target: 'button: Trace 3_1',
    });
  });
});
