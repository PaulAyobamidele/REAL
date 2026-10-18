/**
 * The files of a round folder that the interface reads, shared by
 * make-workspace-index.mjs and make-study-site.mjs so both copy the same set.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const TOP_LEVEL = [
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

export function listRound(dir) {
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
