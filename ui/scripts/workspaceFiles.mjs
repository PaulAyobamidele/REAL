/**
 * The files of a round folder that the interface reads, shared by
 * make-workspace-index.mjs and make-study-site.mjs so both copy the same set.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const TOP_LEVEL = [
  'run_meta.json',
  'analysis_report.json',
  'cluster_map.json',
  'simulations.csv',
  'scenarios.csv',
  'decisions.json',
  'R0.dsl',
  'R1.dsl',
  'best_scenario_h264.mp4',
  'best_scenario.mp4',
  'study_quantities.json', // per-run quantities the page re-judges a revised requirement with
];
// Not copied: analysis_report.md and requirement_diff.md. The interface reads neither
// (it renders the report and the diff from the JSON and the decisions); they are the
// researchers' Markdown, and the study's report carries a researcher banner.

export function listRound(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isFile() && TOP_LEVEL.includes(name)) files.push(name);
    if (st.isDirectory() && name === 'traces') {
      for (const t of readdirSync(full)) if (t.endsWith('.json')) files.push(`traces/${t}`);
    }
    // the camera recording of a scenario, videos/<scenario id>.mp4 (hooks/useBestScenario.ts)
    if (st.isDirectory() && name === 'videos') {
      for (const v of readdirSync(full)) if (v.endsWith('.mp4')) files.push(`videos/${v}`);
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
