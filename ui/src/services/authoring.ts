import { z } from 'zod';

import type { GoalModelSource } from '@/domain/goalModel';
import { studyCatalog, studyCheck, studyMatch } from '@/study/authoringData';
import { STUDY } from '@/study/config';

import { requirementContextSchema } from './schemas';
import { StaticSource } from './workspace/staticSource';

/**
 * The authoring helper (`python -m scripts.redsl.serve`): the project's own
 * parser and the lists the requirement form offers, read from the code. The
 * dev server proxies `/authoring` to it; a build served elsewhere reaches it
 * on 127.0.0.1:8765 directly (it allows localhost origins). Reviewing never
 * needs it; writing a requirement does, because the parser is the gate.
 */
export const HELPER_COMMAND = 'sim_env/bin/python -m scripts.redsl.serve';

const roleSchema = z.object({
  task: z.string(),
  modules: z.array(z.string()),
  default: z.string().nullable().optional(),
  source: z.string(),
});

export const authoringCatalogSchema = z.object({
  temporal_ops: z.array(z.string()),
  operators: z.array(z.string()),
  roles: z.object({ perception: roleSchema, braking: roleSchema }),
  assumption_quantities: z.array(
    z.object({
      name: z.string(),
      level: z.string(),
      unit: z.string().nullable(),
      source: z.string(),
      available: z.boolean(),
    }),
  ),
  soft_goal_quantities: z.array(z.object({ name: z.string(), meaning: z.string() })),
  scenario_vocab: z.record(z.record(z.string())),
  /** Real lines of docs/examples/R_baseline.dsl, shown beneath the open fields; per role where they differ. */
  examples: z
    .object({ by_role: z.record(z.record(z.string().nullable())).optional() })
    .catchall(z.string().nullable()),
  /** Wording gathered from every docs/examples/*.dsl, for the editor's suggestions. */
  suggestions: z
    .object({
      goal: z.array(z.string()),
      scenario: z.array(z.string()),
      free_assumption: z.array(z.string()),
      free_soft_goal: z.array(z.string()),
      perception: z.record(z.array(z.string())),
      braking: z.record(z.array(z.string())),
    })
    .optional(),
  not_covered: z.array(z.string()),
});
export type AuthoringCatalog = z.infer<typeof authoringCatalogSchema>;

const operationJson = z
  .object({
    tasks: z.array(z.string()).optional(),
    condition: z.string().nullable().optional(),
    module: z.string().nullable().optional(),
    inputs: z.array(z.string()).optional(),
    outputs: z.array(z.string()).optional(),
  })
  .passthrough();

const subGoalJson = z
  .object({
    objective: z.string().nullable().optional(),
    agent: z.string().nullable().optional(),
    operations: z.array(operationJson).optional(),
    refinement: z.unknown().optional(),
  })
  .passthrough();

export type SubGoalJson = z.infer<typeof subGoalJson>;

export const goalTreeJsonSchema = z
  .object({
    temporal: z.string().nullable().optional(),
    objective: z.string().nullable().optional(),
    // two sub-goals or more: a combinator and the list; one sub-goal: the sub-goal itself
    refinement: z
      .union([
        z
          .object({ combinator: z.string().nullable().optional(), goals: z.array(subGoalJson) })
          .passthrough(),
        subGoalJson,
      ])
      .nullable()
      .optional(),
    scenario: z.string().nullable().optional(),
  })
  .passthrough();
export type GoalTreeJson = z.infer<typeof goalTreeJsonSchema>;

const classified = z
  .object({
    text: z.string(),
    kind: z.string(),
    quantity: z.string().nullable(),
    op: z.string().nullable(),
    value: z.unknown(),
    message: z.string(),
  })
  .passthrough();
export type ClassifiedItem = z.infer<typeof classified>;

const moduleCheck = z.object({
  module: z.string().nullable(),
  task: z.string(),
  runs: z.boolean(),
  default: z.string().nullable().optional(),
});

export const checkResultSchema = z.union([
  z.object({
    ok: z.literal(false),
    error: z.object({
      message: z.string(),
      line: z.number().nullable(),
      column: z.number().nullable(),
    }),
  }),
  z.object({
    ok: z.literal(true),
    tree: goalTreeJsonSchema,
    covered: z.string().nullable(),
    assumptions: z.array(classified),
    soft_goals: z.array(classified),
    scenario_constraints: z.record(z.string()),
    modules: z.object({ perception: moduleCheck, braking: moduleCheck }),
  }),
]);
export type CheckResult = z.infer<typeof checkResultSchema>;

export class HelperUnavailableError extends Error {
  constructor() {
    super(
      `The authoring helper is not running. Start it from the repository root: ${HELPER_COMMAND}`,
    );
    this.name = 'HelperUnavailableError';
  }
}

const BASES = [
  (import.meta.env?.VITE_AUTHORING_URL as string | undefined) ?? '',
  'http://127.0.0.1:8765',
].filter((b, i, all) => all.indexOf(b) === i);

async function call(path: string, init?: RequestInit): Promise<unknown> {
  for (const base of BASES) {
    try {
      const response = await fetch(`${base}${path}`, init);
      if (!response.ok) continue;
      const type = response.headers.get('Content-Type') ?? '';
      if (!type.includes('json')) continue; // a static server answering with index.html
      return await response.json();
    } catch {
      // unreachable at this base; try the next
    }
  }
  throw new HelperUnavailableError();
}

export async function fetchCatalog(): Promise<AuthoringCatalog> {
  // the study build has no helper: the catalog was saved with the build
  if (STUDY) return authoringCatalogSchema.parse(await studyCatalog());
  return authoringCatalogSchema.parse(await call('/authoring/catalog'));
}

export async function checkRequirement(text: string): Promise<CheckResult> {
  if (STUDY) return checkResultSchema.parse(await studyCheck(text));
  return checkResultSchema.parse(
    await call('/authoring/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
  );
}

export const matchResultSchema = z.object({
  ok: z.boolean(),
  searched: z.number(),
  matches: z.array(
    z
      .object({
        run_id: z.string(),
        mode: z.string().nullable().optional(),
        created_at: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        analysed: z.boolean(),
        simulations: z.number().nullable().optional(),
        failures: z.number().nullable().optional(),
        failure_rate: z.number().nullable().optional(),
        stalled: z.number().nullable().optional(),
      })
      .passthrough(),
  ),
});
export type MatchResult = z.infer<typeof matchResultSchema>;

/** The runs in the project's artifacts/runs that ran exactly this requirement (the parser compares). */
export async function matchRequirement(text: string): Promise<MatchResult> {
  if (STUDY) return matchResultSchema.parse(await studyMatch(text));
  return matchResultSchema.parse(
    await call('/authoring/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
  );
}

/** Where the helper serves artifacts/runs as a read-only workspace, tried in order. */
export const PROJECT_RUNS_URLS = BASES.map((b) => `${b}/authoring/runs`);

/** The project's runs as a workspace source, through the helper; null when it is not running. */
export async function projectRunsSource(): Promise<StaticSource | null> {
  for (const url of PROJECT_RUNS_URLS) {
    const source = await StaticSource.probe(url);
    if (source) return source;
  }
  return null;
}

/**
 * The parser's view of a requirement being written, in the shape the goal
 * model reads - the same builder as for a round, with no results yet (no
 * obstacles, no assumption or soft-goal summaries).
 */
export function modelSourceFromCheck(result: Extract<CheckResult, { ok: true }>): GoalModelSource {
  const tree = result.tree as Record<string, unknown>;
  return {
    requirement: requirementContextSchema.parse({
      parsed: true,
      tree: result.tree,
      assumptions: (tree.assumptions as string[] | undefined) ?? [],
      soft_goals: (tree.soft_goals as string[] | undefined) ?? [],
      scenario_text: (tree.scenario as string | undefined) ?? null,
    }),
    obstacles: [],
    soft_goals: [],
    admissibility: { assumptions: [] },
  };
}

// ------------------------------------------------------------------ Run Test

/** The submit options, one per job script variable (scripts/redsl/cluster_jobs.options_from). */
export const runOptionsSchema = z.object({
  search: z.enum(['grid', 'ge', 'list']),
  trials: z.number().optional(),
  time: z.string().optional(),
  population: z.number().optional(),
  generations: z.number().optional(),
  grammar: z.string().optional(),
  scenario_file: z.string().optional(),
  parent_run_id: z.string().optional(),
  round: z.number().optional(),
});
export type RunOptions = z.infer<typeof runOptionsSchema>;
export type Search = RunOptions['search'];
/** The job script's own defaults (infra/hpc/run_real_av.slurm). */
export const DEFAULT_TRIALS: Record<Search, number> = { grid: 5, list: 3, ge: 2 };
export const DEFAULT_TIME = '05:00:00';
export const QUICK_TIME = '00:45:00';
export const GRID_SCENARIOS = 32;

const maybe = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();

export const jobSchema = z
  .object({
    job_id: z.string(),
    requirement: z.string(),
    submitted_at: z.string(),
    state: z.string(),
    progress: maybe(z.object({ done: z.number(), total: z.number() })),
    run_id: maybe(z.string()),
    fetched: z.boolean().optional(),
    message: maybe(z.string()),
    options: runOptionsSchema.partial().optional(),
    command: z.string().optional(),
    started_at: maybe(z.string()),
    elapsed: maybe(z.string()),
    node: maybe(z.string()),
    time_limit: maybe(z.string()),
    ports: maybe(z.string()),
    api_error: maybe(z.string()),
    tracebacks: z.number().optional(),
    mlflow_server_errors: z.number().optional(),
    not_created: z.number().optional(),
    log_tail: z.array(z.string()).optional(),
    partial: maybe(z.object({ done: z.number().nullable(), total: z.number().nullable() })),
    partial_message: maybe(z.string()),
    complete: z.boolean().optional(),
  })
  .passthrough();
export type Job = z.infer<typeof jobSchema>;

/** The lists behind a refusal (scripts/redsl/cluster_jobs.ClusterError details). */
export interface RefusalDetails {
  host?: string;
  sync_commands?: string[];
  differ?: string[];
  missing?: string[];
  tampered?: string[];
  blocking_jobs?: { job_id: string; state: string }[];
  failures?: { scenario: string; error: string }[];
}

/** A cluster step the helper refused, with its reason worded for the reviewer.
 * kind: no_copy | stale_copy | options | parse | module | scenarios | scene |
 * preflight | not_ended | error */
export class ClusterRefusal extends Error {
  constructor(
    message: string,
    readonly kind = 'error',
    readonly details: RefusalDetails = {},
  ) {
    super(message);
    this.name = 'ClusterRefusal';
  }
}

async function cluster(path: string, init?: RequestInit): Promise<unknown> {
  for (const base of BASES) {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, init);
    } catch {
      continue;
    }
    if (!(response.headers.get('Content-Type') ?? '').includes('json')) continue;
    const body = (await response.json()) as { error?: string; kind?: string } & RefusalDetails;
    if (!response.ok)
      throw new ClusterRefusal(
        body.error ?? `the helper answered ${response.status}`,
        body.kind ?? 'error',
        body,
      );
    return body;
  }
  throw new HelperUnavailableError();
}

/** Check on this machine, then save requirements/<name> and submit it with these options. */
export async function submitRun(text: string, name: string, options: RunOptions): Promise<Job> {
  return jobSchema.parse(
    await cluster('/authoring/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, name, options }),
    }),
  );
}

/** Run Test's checks on this machine: options, modules, scenes (scripts/redsl/preflight.py). */
export const laptopCheckSchema = z
  .object({
    ok: z.boolean(),
    kind: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    checked: z.number().nullable().optional(),
    how: z.string().nullable().optional(),
    system_under_test: z
      .object({ braking_mode: z.string(), yolo_model: z.string() })
      .nullable()
      .optional(),
    failures: z.array(z.object({ scenario: z.string(), error: z.string() })).optional(),
  })
  .passthrough();
export type LaptopCheck = z.infer<typeof laptopCheckSchema>;

export async function checkLaptop(text: string, options: RunOptions): Promise<LaptopCheck> {
  return laptopCheckSchema.parse(
    await cluster('/authoring/run/check-laptop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, options }),
    }),
  );
}

/** Run Test's checks over ssh: a session, then the cluster's code. Throws ClusterRefusal. */
export async function checkCluster(): Promise<void> {
  await cluster('/authoring/run/check-cluster', { method: 'POST' });
}

export async function jobStatus(jobId: string): Promise<Job> {
  return jobSchema.parse(await cluster(`/authoring/jobs/${jobId}`));
}

/** Status plus, at most every 5 minutes, the results so far pulled and analysed (PARTIAL). */
export async function refreshPartial(jobId: string): Promise<Job> {
  return jobSchema.parse(await cluster(`/authoring/jobs/${jobId}/partial`, { method: 'POST' }));
}

export const scenarioListSchema = z.object({ path: z.string(), scenarios: z.number() });
export type ScenarioList = z.infer<typeof scenarioListSchema>;

/** Scenario lists a list run can use; [] without the helper. */
export async function scenarioLists(): Promise<ScenarioList[]> {
  try {
    const body = z
      .object({ lists: z.array(scenarioListSchema) })
      .safeParse(await cluster('/authoring/lists'));
    return body.success ? body.data.lists : [];
  } catch {
    return [];
  }
}

/** Pull an ended job's run (all of it) and analyse it; resolves when it is in artifacts/runs. */
export async function fetchJob(jobId: string): Promise<Job> {
  return jobSchema.parse(await cluster(`/authoring/jobs/${jobId}/fetch`, { method: 'POST' }));
}
