// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// @ts-expect-error - a plain build script, without type declarations
import { copyRecordings } from '../../scripts/make-study-site.mjs';

describe("the study site carries CARLA's recordings", () => {
  it('copies a job’s playable video as videos/<scenario id>.mp4, matched by the recorded phenotype', () => {
    const root = mkdtempSync(join(tmpdir(), 'real-rec-'));
    const study = join(root, 'artifacts', 'study');
    const src = join(study, 'presented', 'r');
    const dest = join(root, 'out', 'r');
    mkdirSync(src, { recursive: true });
    mkdirSync(dest, { recursive: true });
    writeFileSync(
      join(src, 'run_meta.json'),
      JSON.stringify({ merged_from: [{ run_id: 'jobA' }, { run_id: 'jobB' }, { run_id: 'jobC' }] }),
    );
    writeFileSync(
      join(src, 'simulations.csv'),
      'scenario_id,phenotype\n6,"Adult, Light, LR"\n7,"Child, Dark, RL"\n',
    );
    const job = (id: string, phenotype: string, playable: boolean) => {
      const dir = join(root, 'artifacts', 'runs', id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'run_meta.json'), JSON.stringify({ worst_phenotype: phenotype }));
      writeFileSync(join(dir, playable ? 'best_scenario_h264.mp4' : 'best_scenario.mp4'), id);
    };
    job('jobA', 'Adult, Light, LR', true); // recorded test case 6, playable
    job('jobB', 'Child, Dark, RL', false); // recorded 7, but only the mp4v original
    job('jobC', 'not in this round', true); // recorded something else
    expect(copyRecordings(study, src, dest)).toEqual(['videos/6.mp4']);
    expect(readFileSync(join(dest, 'videos', '6.mp4'), 'utf8')).toBe('jobA');
  });
});
