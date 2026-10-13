#!/usr/bin/env node
/**
 * Write the index.json a statically served workspace needs.
 *
 *   node scripts/make-workspace-index.mjs <workspace folder> [--out <folder>] [--label "..."] [--example]
 *
 * The workspace folder holds one sub-folder per round (each with a
 * run_meta.json). With --out, the rounds are copied there (only the files
 * the interface reads) and the index is written in the copy; without it,
 * the index is written into the workspace folder itself. A folder with no
 * run_meta.json is listed under "ignored", never dropped silently.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TOP_LEVEL = [
  'run_meta.json',
  'analysis_report.json',
  'analysis_report.md',
  'cluster_map.json',
  'simulations.csv',
  'scenarios.csv',
  'decisions.json',
  'R0.dsl',
  'R1.dsl',
  'requirement_diff.md',
  'best_scenario_h264.mp4',
  'best_scenario.mp4',
];

function parseArgs(argv) {
  const args = { out: null, label: null, example: false, workspace: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--label') args.label = argv[++i];
    else if (a === '--example') args.example = true;
    else if (!args.workspace) args.workspace = a;
  }
  if (!args.workspace) {
    console.error(
      'usage: make-workspace-index.mjs <workspace folder> [--out <folder>] [--label "..."] [--example]',
    );
    process.exit(2);
  }
  return args;
}

function listRound(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isFile() && TOP_LEVEL.includes(name)) files.push(name);
    if (st.isDirectory() && name === 'traces') {
      for (const t of readdirSync(full)) if (t.endsWith('.json')) files.push(`traces/${t}`);
    }
    if (st.isDirectory() && name === 'frames') {
      for (const sensor of readdirSync(full)) {
        const sensorDir = join(full, sensor);
        if (!statSync(sensorDir).isDirectory()) continue;
        for (const f of readdirSync(sensorDir))
          if (f.endsWith('.png')) files.push(`frames/${sensor}/${f}`);
      }
    }
  }
  return files.sort();
}

const args = parseArgs(process.argv.slice(2));
const workspace = resolve(args.workspace);
const out = args.out ? resolve(args.out) : workspace;
const rounds = [];
const ignored = [];
for (const name of readdirSync(workspace)) {
  const dir = join(workspace, name);
  if (!statSync(dir).isDirectory()) continue;
  if (!existsSync(join(dir, 'run_meta.json'))) {
    ignored.push(name);
    continue;
  }
  const files = listRound(dir);
  rounds.push({ dir: name, files });
  if (out !== workspace) {
    mkdirSync(join(out, name), { recursive: true });
    for (const f of files) {
      mkdirSync(join(out, name, f.split('/').slice(0, -1).join('/')), { recursive: true });
      cpSync(join(dir, f), join(out, name, f));
    }
  }
}
mkdirSync(out, { recursive: true });
const index = {
  schema_version: 1,
  label: args.label ?? (args.example ? 'Example workspace (bundled)' : workspace.split('/').pop()),
  example: args.example,
  generated_at: new Date().toISOString(),
  rounds,
  ignored,
};
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(
  `${rounds.length} round(s), ${ignored.length} ignored folder(s) -> ${join(out, 'index.json')}`,
);
