import { vi } from 'vitest';

import { CATALOG, TREE } from '../helpers/authoringFixtures';
import { fixtureText, ROUND_1 } from '../helpers/memorySource';

/**
 * A study site as make-study-site.mjs writes it, in memory: the round under
 * review (C1) in ./workspace, one follow-up (C2) in ./followups, and the
 * authoring answers for R0. fetch() is stubbed to serve it.
 */
export const R0 = 'MAINTAIN "Pedestrian Safety" by ...\n';
export const C1 = 'a'.repeat(32);
export const C2 = 'b'.repeat(32);

function round(dir: string, studyRound: string, car: object, requirement: string) {
  return {
    [`${dir}/run_meta.json`]: JSON.stringify({
      ...JSON.parse(fixtureText(`${ROUND_1}/run_meta.json`)),
      run_id: dir,
      study_round: studyRound,
      system_under_test: car,
      requirement,
    }),
    [`${dir}/analysis_report.json`]: JSON.stringify({
      ...JSON.parse(fixtureText(`${ROUND_1}/analysis_report.json`)),
      run_id: dir,
    }),
  };
}

function index(dirs: string[]) {
  return JSON.stringify({
    schema_version: 1,
    label: 'Test rounds',
    example: false,
    rounds: dirs.map((dir) => ({ dir, files: ['run_meta.json', 'analysis_report.json'] })),
    ignored: [],
  });
}

/** What the helper answers for R0 (ok, both modules implemented). */
export const R0_CHECK = {
  ok: true,
  tree: TREE,
  covered: null,
  assumptions: [],
  soft_goals: [],
  scenario_constraints: {},
  modules: {
    perception: { module: 'yolov5s', task: 'Detect Pedestrian', runs: true, default: 'yolov5s' },
    braking: {
      module: 'proportional_braking',
      task: 'Apply Brakes',
      runs: true,
      default: 'emergency_braking',
    },
  },
};

export function serveStudySite(check: unknown = R0_CHECK): Map<string, string> {
  const files = new Map<string, string>(
    Object.entries({
      'workspace/index.json': index([C1]),
      'followups/index.json': index([C2]),
      ...Object.fromEntries(
        Object.entries(
          round(
            C1,
            'study_C1',
            { braking_mode: 'proportional_braking', yolo_model: 'yolov5s' },
            R0,
          ),
        ).map(([k, v]) => [`workspace/${k}`, v]),
      ),
      ...Object.fromEntries(
        Object.entries(
          round(
            C2,
            'study_C2',
            { braking_mode: 'path_aware_braking', yolo_model: 'yolov5s' },
            'R1',
          ),
        ).map(([k, v]) => [`followups/${k}`, v]),
      ),
      'study-authoring/check-R0.json': JSON.stringify({ text: R0, result: check }),
      'study-authoring/catalog.json': JSON.stringify(CATALOG),
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url).replace(/^\.\//, '');
      const body = files.get(path);
      return body === undefined
        ? new Response('not found', { status: 404 })
        : new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return files;
}
