import { z } from 'zod';

import { runMetaSchema } from './runMeta';

/**
 * analysis_report.json, written by `python -m scripts.analysis.report`.
 *
 * Two versions are read:
 *   - absent `schema_version` (reports before 2026-10-08): aggregates only.
 *     Loadable, but the goal tree, the per-simulation labels and the change
 *     each mitigation implies are missing, so the interface degrades and says so.
 *   - 2: the full set this interface was built for.
 * Anything newer is refused by name (see `SUPPORTED_REPORT_VERSIONS`).
 *
 * Numbers are read as the file has them. A null where a number is expected
 * means the analysis could not compute it (an empty slice), and is shown as
 * "n/a", never as 0.
 */

export const SUPPORTED_REPORT_VERSIONS = [1, 2] as const;

const nullableNumber = z.number().nullable();

export const operationSchema = z.object({
  task: z.string().nullable(),
  tasks: z.array(z.string()).optional(),
  condition: z.string().nullable(),
  module: z.string().nullable(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
});
export type Operation = z.infer<typeof operationSchema>;

export interface RefinedGoal {
  objective: string | null;
  agent: string | null;
  operations: Operation[];
}
export interface Combination {
  combinator: string;
  goals: Refinement[];
}
export type Refinement = RefinedGoal | Combination;

const refinedGoalSchema: z.ZodType<RefinedGoal> = z.object({
  objective: z.string().nullable(),
  agent: z.string().nullable(),
  operations: z.array(operationSchema),
});
const combinationSchema: z.ZodType<Combination> = z.lazy(() =>
  z.object({ combinator: z.string(), goals: z.array(refinementSchema) }),
);
export const refinementSchema: z.ZodType<Refinement> = z.lazy(() =>
  z.union([combinationSchema, refinedGoalSchema]),
);

export const goalTreeSchema = z.object({
  temporal: z.string().nullable(),
  objective: z.string().nullable(),
  refinement: refinementSchema.nullable(),
  scenario: z.string().nullable(),
  assumptions: z.array(z.string()),
  soft_goals: z.array(z.string()),
});
export type GoalTree = z.infer<typeof goalTreeSchema>;

export const requirementContextSchema = z
  .object({
    parsed: z.boolean().optional(),
    error: z.string().optional(),
    detection_module: z.string().nullable().optional(),
    operations: z.array(operationSchema).optional(),
    assumptions: z.array(z.string()).optional(),
    soft_goals: z.array(z.string()).optional(),
    scenario_text: z.string().nullable().optional(),
    tree: goalTreeSchema.nullable().optional(),
  })
  .passthrough();
export type RequirementContext = z.infer<typeof requirementContextSchema>;

export const ruleSchema = z
  .object({
    name: z.string(),
    param: z.string(),
    op: z.string(),
    value: z.unknown(),
    reason: z.string().optional(),
    source: z.string().optional(),
    as_assumption: z.string().nullable().optional(),
  })
  .passthrough();
export type Rule = z.infer<typeof ruleSchema>;

export const assumptionKindSchema = z.enum(['scenario', 'run', 'free_text', 'rejected']);
export const assumptionSummarySchema = z
  .object({
    text: z.string(),
    kind: assumptionKindSchema,
    quantity: z.string().nullable(),
    message: z.string(),
    held: z.number(),
    broken: z.number(),
    not_measured: z.number(),
    enc_held: z.number().optional(),
    enc_broken: z.number().optional(),
    rate_held: nullableNumber.optional(),
    rate_broken: nullableNumber.optional(),
    verdict: z.string().nullable().optional(),
  })
  .passthrough();
export type AssumptionSummary = z.infer<typeof assumptionSummarySchema>;

export const spuriousGroupSchema = z.object({
  rule: z.string(),
  n: z.number(),
  failures: z.number(),
  scenarios: z.array(z.string()),
});
export type SpuriousGroup = z.infer<typeof spuriousGroupSchema>;

export const admissibilitySchema = z
  .object({
    rules: z.array(ruleSchema),
    assumptions: z.array(assumptionSummarySchema).optional(),
    free_text_assumptions: z.array(z.string()),
    n_admissible: z.number(),
    n_spurious: z.number(),
    spurious: z.array(spuriousGroupSchema),
  })
  .passthrough();

export const softGoalSummarySchema = z
  .object({
    text: z.string(),
    kind: z.enum(['checked', 'free_text', 'rejected']),
    quantity: z.string().nullable(),
    message: z.string(),
    met: z.number(),
    missed: z.number(),
    not_measured: z.number(),
  })
  .passthrough();
export type SoftGoalSummary = z.infer<typeof softGoalSummarySchema>;

export const timingSchema = z
  .object({
    n_detected: z.number().optional(),
    first_detection_distance_m_median: nullableNumber.optional(),
    first_brake_distance_m_median: nullableNumber.optional(),
    speed_at_first_brake_mps_median: nullableNumber.optional(),
    stopping_distance_needed_m_median: nullableNumber.optional(),
    share_detected_too_late: nullableNumber.optional(),
    brake_steps_median: nullableNumber.optional(),
    share_still_moving_at_closest: nullableNumber.optional(),
    mean_inference_ms_median: nullableNumber.optional(),
  })
  .passthrough();
export type Timing = z.infer<typeof timingSchema>;

// No passthrough here: the row is one member of the evidence union below, and
// an index signature would stop `in` narrowing between the members.
export const effectRowSchema = z.object({
  param: z.string(),
  value: z.union([z.string(), z.number()]),
  n: z.number(),
  failures: z.number(),
  failure_rate: nullableNumber,
  failure_rate_others: nullableNumber,
  effect: nullableNumber,
  enough_data: z.boolean(),
  n_distinct_scenarios: nullableNumber.optional(),
  scenario_effect: nullableNumber.optional(),
});
export type EffectRow = z.infer<typeof effectRowSchema>;

export const scenarioRowSchema = z
  .object({
    scenario_id: z.union([z.string(), z.number()]),
    phenotype: z.string().optional(),
    n: z.number(),
    encounters: z.number(),
    failures: z.number(),
    failure_rate: nullableNumber,
    min_distance_m: nullableNumber,
  })
  .passthrough();
export type ScenarioRow = z.infer<typeof scenarioRowSchema>;

export const failureModelSchema = z
  .object({
    n_simulations: z.number(),
    n_no_encounter: z.number(),
    n_encounters: z.number(),
    n_scenarios: z.number(),
    failures: z.number(),
    failure_rate: nullableNumber,
    passes: z.number(),
    passed_clean: z.number(),
    passed_stalled: z.number(),
    failure_types: z.record(z.number()),
    timing: timingSchema,
    by_parameter: z.array(effectRowSchema),
    by_scenario: z.array(scenarioRowSchema),
    warnings: z.array(z.string()),
    n_left_road: z.number().optional(),
    n_not_crossed: z.number().optional(),
    failure_rate_scenarios: nullableNumber.optional(),
    n_distinct_scenarios: z.number().optional(),
    max_repeats_of_a_scenario: z.number().optional(),
  })
  .passthrough();
export type FailureModel = z.infer<typeof failureModelSchema>;

/** Evidence for an obstacle: one of three shapes, by what the obstacle is keyed on. */
export const settingEvidenceSchema = effectRowSchema;
export const behaviourEvidenceSchema = z.object({
  failure_type: z.string(),
  count: z.number(),
  failures: z.number(),
  share: nullableNumber,
});
export const outcomeEvidenceSchema = z.object({
  outcome: z.string(),
  count: z.number(),
  passes: z.number(),
  share: nullableNumber,
});
export const evidenceSchema = z.union([
  behaviourEvidenceSchema,
  outcomeEvidenceSchema,
  settingEvidenceSchema,
]);
export type Evidence = z.infer<typeof evidenceSchema>;

export const changeKindSchema = z.enum(['S', 'R', 'D', 'T']);
export type ChangeKind = z.infer<typeof changeKindSchema>;

/** A requirement change as refine.py records it (see `plan_changes`). */
export const changeSchema = z
  .object({
    kind: changeKindSchema,
    from: z.string(),
    layer: z.string(),
    text: z.string(),
    task: z.string().nullable().optional(),
    module: z.string().nullable().optional(),
    available: z.boolean().optional(),
    clause: z.enum(['assuming', 'ensuring']).optional(),
    item: z.string().optional(),
    target: z.string().optional(),
    replaces: z.string().nullable().optional(),
    remove: z.boolean().optional(),
    no_evidence: z.boolean().optional(),
  })
  .passthrough();
export type Change = z.infer<typeof changeSchema>;

export const toolVerdictSchema = z.enum(['supported', 'not_supported', 'insufficient_data']);
export type ToolVerdict = z.infer<typeof toolVerdictSchema>;

export const obstacleSchema = z
  .object({
    id: z.string(),
    param: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    failure_type: z.string().optional(),
    outcome: z.string().optional(),
    blocks_goal: z.string(),
    domain_property: z.string().nullable(),
    description: z.string(),
    mitigations: z.record(z.string().nullable()),
    source: z.enum(['catalogue', 'candidate']),
    verdict: toolVerdictSchema,
    evidence: evidenceSchema.nullable(),
    detection_failure_share: nullableNumber.optional(),
    changes: z.record(changeSchema).optional(),
  })
  .passthrough();
export type Obstacle = z.infer<typeof obstacleSchema>;

export const simulationRowSchema = z
  .object({
    scenario_id: z.string(),
    sim_index: z.number().nullable(),
    outcome: z.string().nullable(),
    encounter: z.boolean(),
    failed: z.boolean().nullable(),
    admissible: z.boolean().nullable(),
    set_aside_reason: z.string(),
    assumptions: z.record(z.string().nullable()),
    soft_goals: z.record(z.string()),
    trace: z.string().nullable(),
    recording_pass: z.boolean().optional(),
  })
  .passthrough();
export type SimulationLabel = z.infer<typeof simulationRowSchema>;

export const scenarioArtefactSchema = z
  .object({
    id: z.string(),
    metric: z.string(),
    description: z.string(),
    fix: z.string(),
    value: z.unknown(),
  })
  .passthrough();
export type ScenarioArtefact = z.infer<typeof scenarioArtefactSchema>;

export const barsSchema = z.object({
  min_share: z.number(),
  min_effect: z.number(),
  min_n: z.number(),
  min_n_failures: z.number(),
});
export type Bars = z.infer<typeof barsSchema>;

export const analysisReportSchema = z
  .object({
    schema_version: z.number().int().optional(),
    run_id: z.string(),
    analysed_at: z.string(),
    sampling: z.enum(['grid', 'list', 'ge']).optional(),
    banner: z.string().optional(),
    run_meta: runMetaSchema.partial({ run_id: true }).passthrough(),
    requirement: requirementContextSchema,
    admissibility: admissibilitySchema,
    soft_goals: z.array(softGoalSummarySchema).nullable().optional(),
    failure_model: failureModelSchema,
    obstacles: z.array(obstacleSchema),
    not_simulated: z
      .array(z.object({ scenario_id: z.string().nullable(), label: z.string() }))
      .optional(),
    bars: barsSchema.optional(),
    scenario_artefacts: z.array(scenarioArtefactSchema).optional(),
    simulations: z.array(simulationRowSchema).optional(),
  })
  .passthrough();
export type AnalysisReport = z.infer<typeof analysisReportSchema>;

/** The version a report declares; reports from before versioning count as 1. */
export function reportVersion(report: Pick<AnalysisReport, 'schema_version'>): number {
  return report.schema_version ?? 1;
}
