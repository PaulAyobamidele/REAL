// @vitest-environment node
/**
 * The study site's data (scripts/make-study-site.mjs) on a small copy of the
 * study folder's layout: only the files the interface reads, the v2 reports
 * for the follow-ups, neutral run ids, nothing written into the source, and
 * a round carrying decisions refused.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// @ts-expect-error - a plain build script, without type declarations
import { makeStudySite, neutralId } from '../../scripts/make-study-site.mjs';

// stands in for the project's Python (serve.catalog(), serve.check()) at build time
const checked: string[] = [];
const fakeQuantities = (_study: string, roundDir: string) => JSON.stringify({ from: roundDir });
const fakeAuthoring = (_study: string, text: string) => {
  checked.push(text);
  return { catalog: { modules: [] }, check: { ok: true, tree: {} } };
};

function round(dir: string, id: string, extra: Record<string, string> = {}) {
  mkdirSync(join(dir, 'traces'), { recursive: true });
  const files: Record<string, string> = {
    'run_meta.json': JSON.stringify({
      run_id: id,
      presented_note: 'x',
      requirement: `# Study requirement, car ${id}\n# a second researcher note\nMAINTAIN "G" by ...\n`,
    }),
    'analysis_report.json': JSON.stringify({
      run_id: id,
      banner: `as run: ${id}`,
      run_meta: { requirement_as_run: '# note\nMAINTAIN "G"\n' },
    }),
    'analysis_report.md': `# Failure analysis - run \`${id}\`\n`,
    'cluster_map.json': JSON.stringify({ run_id: id }),
    'simulations.csv': `source_run_id,run_id,scenario_id\nabc,${id},0\n`,
    'scenarios.csv': 'scenario_id\n0\n',
    'notes.txt': 'not read by the interface',
    'traces/0_0.json': JSON.stringify({ run_id: 'abc' }),
    ...extra,
  };
  for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
}

function study(withDecisions = false) {
  const root = mkdtempSync(join(tmpdir(), 'study-'));
  round(
    join(root, 'presented', 'study_C1'),
    'study_C1',
    withDecisions ? { 'decisions.json': '{}' } : {},
  );
  for (const c of ['C2', 'C3', 'C4']) {
    round(join(root, 'rounds', c), `study_${c}`);
    mkdirSync(join(root, 'rounds', c, 'judged_v2'));
    writeFileSync(
      join(root, 'rounds', c, 'judged_v2', 'analysis_report.json'),
      JSON.stringify({ run_id: `study_${c}`, banner: 'v2' }),
    );
    writeFileSync(join(root, 'rounds', c, 'judged_v2', 'analysis_report.md'), 'v2\n');
  }
  return root;
}

function fingerprint(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else h.update(f).update(readFileSync(f));
    }
  };
  walk(dir);
  return h.digest('hex');
}

describe('the study site data', () => {
  it('copies only what the interface reads, under fixed neutral ids, and never writes into the source', () => {
    const src = study();
    const before = fingerprint(src);
    const out = join(mkdtempSync(join(tmpdir(), 'site-')), 'study-public');
    makeStudySite(src, out, fakeAuthoring, fakeQuantities);
    expect(fingerprint(src)).toBe(before);

    const c1 = neutralId('study_C1');
    expect(c1).toMatch(/^[0-9a-f]{32}$/);
    expect(neutralId('study_C1')).toBe(c1); // the same id every time
    const index = JSON.parse(readFileSync(join(out, 'workspace', 'index.json'), 'utf8'));
    expect(index.rounds.map((r: { dir: string }) => r.dir)).toEqual([c1]);
    expect(index.example).toBe(false);
    expect(existsSync(join(out, 'workspace', c1, 'notes.txt'))).toBe(false);
    expect(existsSync(join(out, 'workspace', c1, 'traces', '0_0.json'))).toBe(true);

    const meta = JSON.parse(readFileSync(join(out, 'workspace', c1, 'run_meta.json'), 'utf8'));
    expect(meta.run_id).toBe(c1);
    expect(meta.study_round).toBe('study_C1');
    // the researchers' comment lines are not shown to participants; the original is kept
    expect(meta.requirement).toBe('MAINTAIN "G" by ...\n');
    expect(meta.study_requirement_original).toMatch(/^# Study requirement/);
    const c1report = JSON.parse(
      readFileSync(join(out, 'workspace', c1, 'analysis_report.json'), 'utf8'),
    );
    expect(c1report.run_meta.requirement_as_run).toBe('MAINTAIN "G"\n');
    // Write a requirement's answers, from the project's Python at build time, for R0 as shown
    expect(checked.at(-1)).toBe('MAINTAIN "G" by ...\n');
    const r0 = JSON.parse(readFileSync(join(out, 'study-authoring', 'check-R0.json'), 'utf8'));
    expect(r0).toEqual({ text: 'MAINTAIN "G" by ...\n', result: { ok: true, tree: {} } });
    expect(existsSync(join(out, 'study-authoring', 'catalog.json'))).toBe(true);
    // each round carries its quantities for re-judging, listed in the index
    const q = JSON.parse(readFileSync(join(out, 'workspace', c1, 'study_quantities.json'), 'utf8'));
    expect(q.from).toBe(join(src, 'presented', 'study_C1'));
    expect(index.rounds[0].files).toContain('study_quantities.json');
    for (const f of ['analysis_report.json', 'cluster_map.json', 'simulations.csv'])
      expect(readFileSync(join(out, 'workspace', c1, f), 'utf8')).not.toContain('study_C');
    // the researchers' Markdown (report, diff) is not part of the site: the interface never reads it
    expect(existsSync(join(out, 'workspace', c1, 'analysis_report.md'))).toBe(false);

    const c2 = neutralId('study_C2');
    const report = JSON.parse(
      readFileSync(join(out, 'followups', c2, 'analysis_report.json'), 'utf8'),
    );
    expect(report).toEqual({ run_id: c2, banner: 'v2' }); // the v2 judgement, not the one as run
  });

  it('refuses to build when the requirement under test does not pass the check', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'site-')), 'study-public');
    const failing = () => ({ catalog: {}, check: { ok: false, error: { message: 'x' } } });
    expect(() => makeStudySite(study(), out, failing, fakeQuantities)).toThrow(
      /does not pass the check/,
    );
  });

  it('refuses a round that carries decisions', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'site-')), 'study-public');
    expect(() => makeStudySite(study(true), out, fakeAuthoring, fakeQuantities)).toThrow(
      /start with no decisions/,
    );
  });
});
