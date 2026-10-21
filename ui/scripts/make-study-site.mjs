#!/usr/bin/env node
/**
 * The study site's data, from artifacts/study (read only):
 *
 *   <out>/workspace/   the round participants review (study_C1) + index.json
 *   <out>/followups/   the pre-computed follow-ups (study_C2..C4) + index.json,
 *                      each with its report re-judged against the v2
 *                      requirement (rounds/Cn/judged_v2/)
 *
 *   node scripts/make-study-site.mjs [<artifacts/study>] [--out study-public]
 *
 * Only the files the interface reads are copied (workspaceFiles.mjs). A round
 * carrying decisions.json, R1.dsl or requirement_diff.md is refused: a study
 * session starts with no decisions.
 *
 * The site shows neutral run ids: each study round gets a fixed id that looks
 * like any run (the first 32 hex characters of sha256("<study id>")),
 * replacing the study id in the copied run_meta.json, analysis_report.json,
 * cluster_map.json and simulations.csv, and naming the copied folder (the
 * researchers' Markdown report is not copied: workspaceFiles.mjs). The
 * copy's run_meta.json keeps "study_round": "<study id>" so a session records
 * which round it was; the interface never shows that field.
 *
 * The study page has no helper, so "Write a requirement" gets its answers from
 * files: <out>/study-authoring/catalog.json and check-R0.json (the requirement under
 * test and its check), made once here by the project's own Python
 * (scripts/redsl/serve.py catalog() and check(); read only). The Python is
 * $REAL_PYTHON or <repository>/sim_env/bin/python. A caller may pass its own
 * `authoring` function instead (the tests do).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import Papa from 'papaparse';

import { listRound } from './workspaceFiles.mjs';

const REVIEWED = { id: 'study_C1', from: 'presented/study_C1' };
const FOLLOWUPS = ['C2', 'C3', 'C4'].map((c) => ({
  id: `study_${c}`,
  from: `rounds/${c}`,
  report: `rounds/${c}/judged_v2`,
}));
const REFUSED = ['decisions.json', 'R1.dsl', 'requirement_diff.md'];
const REWRITTEN = ['run_meta.json', 'analysis_report.json', 'cluster_map.json', 'simulations.csv'];

/**
 * The requirement texts carry the researchers' comment lines ("# Study
 * requirement v2 ..., car C1 ..."); participants see the requirement, so the
 * copy drops lines starting with '#' from every "requirement" and
 * "requirement_as_run" string (run_meta.json keeps the original as
 * study_requirement_original, never shown).
 */
const DSL_KEYS = new Set(['requirement', 'requirement_as_run']);
export function withoutComments(value, key = null) {
  if (typeof value === 'string' && DSL_KEYS.has(key))
    return value
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n')
      .replace(/^\n+/, '');
  if (Array.isArray(value)) return value.map((v) => withoutComments(v));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutComments(v, k)]));
  return value;
}

export function neutralId(studyId) {
  return createHash('sha256').update(studyId).digest('hex').slice(0, 32);
}

function parseArgs(argv) {
  const args = { study: null, out: 'study-public' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (!args.study) args.study = argv[i];
  }
  return { study: resolve(args.study ?? '../artifacts/study'), out: resolve(args.out) };
}

/** Copy one round under its neutral id; returns its index entry. */
function copyRound(study, out, round) {
  const src = join(study, round.from);
  if (!existsSync(join(src, 'run_meta.json'))) throw new Error(`${src}: no run_meta.json`);
  for (const f of REFUSED)
    if (existsSync(join(src, f)))
      throw new Error(`${src}/${f}: a study round must start with no decisions; refused`);
  const id = neutralId(round.id);
  const files = listRound(src);
  for (const f of files) {
    // the follow-ups' reports come from judged_v2/ (the v2 requirement)
    const from =
      round.report && f.startsWith('analysis_report.')
        ? join(study, round.report, f)
        : join(src, f);
    const to = join(out, id, f);
    mkdirSync(join(to, '..'), { recursive: true });
    if (REWRITTEN.includes(f)) {
      let text = readFileSync(from, 'utf8').replaceAll(round.id, id);
      if (f.endsWith('.json')) {
        const original = JSON.parse(text);
        const doc = withoutComments(original);
        if (f === 'run_meta.json') {
          doc.study_round = round.id;
          doc.study_requirement_original = original.requirement ?? null;
        }
        text = JSON.stringify(doc, null, 2) + '\n';
      }
      writeFileSync(to, text);
    } else {
      copyFileSync(from, to);
    }
  }
  return { dir: id, files };
}

function writeIndex(folder, label, rounds) {
  const index = {
    schema_version: 1,
    label,
    example: false,
    generated_at: new Date().toISOString(),
    rounds,
    ignored: [],
  };
  writeFileSync(join(folder, 'index.json'), JSON.stringify(index, null, 2) + '\n');
}

/** {catalog, check} for R0 from the project's Python (serve.catalog(), serve.check()). */
export function pythonAuthoring(study, text) {
  const repo = resolve(study, '..', '..');
  const python = process.env.REAL_PYTHON ?? join(repo, 'sim_env', 'bin', 'python');
  const code =
    'import json, sys\n' +
    'from scripts.redsl import serve\n' +
    'text = sys.stdin.read()\n' +
    'print(json.dumps({"catalog": serve.catalog(), "check": serve.check(text)}))\n';
  const out = execFileSync(python, ['-c', code], { cwd: repo, input: text, maxBuffer: 64 << 20 });
  return JSON.parse(out.toString().trim().split('\n').pop());
}

/**
 * Each round's per-simulation quantities (ui/scripts/study_quantities.py), so
 * the page can re-judge a revised requirement on the same simulations
 * (src/study/rejudge.ts). The project's Python, read only.
 */
export function pythonQuantities(study, roundDir) {
  const repo = resolve(study, '..', '..');
  const python = process.env.REAL_PYTHON ?? join(repo, 'sim_env', 'bin', 'python');
  const script = join(repo, 'ui', 'scripts', 'study_quantities.py');
  const out = execFileSync(python, [script, roundDir], {
    cwd: repo,
    env: { ...process.env, PYTHONPATH: repo },
    maxBuffer: 256 << 20,
  });
  return out.toString();
}

export const QUANTITIES_FILE = 'study_quantities.json';

/**
 * CARLA's recordings for a round merged from several cluster jobs
 * (run_meta `merged_from`): each job re-ran the worst scenario of its slice
 * on camera (best_scenario.mp4). Those with a browser-playable copy
 * (best_scenario_h264.mp4, from `python -m scripts.evolve.video <run>`) are
 * copied next to the round as videos/<scenario id>.mp4, matched by the exact
 * phenotype the job recorded (its run_meta `worst_phenotype`). Returns the
 * files written, relative to the round's copy.
 */
export function copyRecordings(study, src, dest) {
  const meta = JSON.parse(readFileSync(join(src, 'run_meta.json'), 'utf8'));
  const jobs = meta.merged_from ?? [];
  if (!jobs.length || !existsSync(join(src, 'simulations.csv'))) return [];
  const rows = Papa.parse(readFileSync(join(src, 'simulations.csv'), 'utf8'), {
    header: true,
    skipEmptyLines: true,
  }).data;
  const byPhenotype = new Map(rows.map((r) => [r.phenotype, r.scenario_id]));
  const runs = resolve(study, '..', 'runs');
  const written = [];
  for (const job of jobs) {
    const dir = join(runs, job.run_id);
    const video = join(dir, 'best_scenario_h264.mp4');
    if (!existsSync(video) || !existsSync(join(dir, 'run_meta.json'))) continue;
    const recorded = JSON.parse(readFileSync(join(dir, 'run_meta.json'), 'utf8')).worst_phenotype;
    const id = byPhenotype.get(recorded);
    if (id === undefined) continue;
    const name = `videos/${id}.mp4`;
    mkdirSync(join(dest, 'videos'), { recursive: true });
    copyFileSync(video, join(dest, name));
    written.push(name);
  }
  return written.sort();
}

export function makeStudySite(
  study,
  out,
  authoring = pythonAuthoring,
  quantities = pythonQuantities,
) {
  rmSync(out, { recursive: true, force: true });
  const workspace = join(out, 'workspace');
  const followups = join(out, 'followups');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(followups, { recursive: true });
  // a round, its copy and the file the page re-judges with (listed in the index like any file)
  const withQuantities = (folder, round) => {
    const entry = copyRound(study, folder, round);
    const videos = copyRecordings(study, join(study, round.from), join(folder, entry.dir));
    writeFileSync(
      join(folder, entry.dir, QUANTITIES_FILE),
      quantities(study, join(study, round.from)),
    );
    return { ...entry, files: [...new Set([...entry.files, QUANTITIES_FILE, ...videos])].sort() };
  };
  const reviewed = withQuantities(workspace, REVIEWED);
  writeIndex(workspace, 'Test rounds', [reviewed]);
  writeIndex(
    followups,
    'Test rounds',
    FOLLOWUPS.map((r) => withQuantities(followups, r)),
  );
  const r0 = JSON.parse(
    readFileSync(join(workspace, reviewed.dir, 'run_meta.json'), 'utf8'),
  ).requirement;
  if (!r0) throw new Error('the reviewed round has no requirement in run_meta.json');
  const { catalog, check } = authoring(study, r0);
  if (!check?.ok)
    throw new Error(`the requirement under test does not pass the check: ${JSON.stringify(check)}`);
  // not 'authoring/': the dev and preview servers forward that path to the helper
  const authoringDir = join(out, 'study-authoring');
  mkdirSync(authoringDir, { recursive: true });
  writeFileSync(join(authoringDir, 'catalog.json'), JSON.stringify(catalog) + '\n');
  writeFileSync(
    join(authoringDir, 'check-R0.json'),
    JSON.stringify({ text: r0, result: check }) + '\n',
  );
  return { workspace, followups, authoring: authoringDir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { study, out } = parseArgs(process.argv.slice(2));
  makeStudySite(study, out);
  console.log(`study site data -> ${out} (workspace: study_C1; followups: study_C2..C4)`);
}
