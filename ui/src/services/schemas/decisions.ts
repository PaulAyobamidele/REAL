import { z } from 'zod';

/**
 * decisions.json (schema_version 1) - the human's recorded decisions for one
 * round. The shape is fixed by scripts/analysis/decisions.py; this interface
 * is one of two ways to produce the file and must write exactly that shape.
 * Nulls mean "not decided yet"; wrong values are invalid.
 */

export const DECISIONS_SCHEMA_VERSION = 1;

export const obstacleVerdictSchema = z.enum(['accept', 'rename', 'reject', 'defer']);
export type ObstacleVerdict = z.infer<typeof obstacleVerdictSchema>;
export const OBSTACLE_VERDICTS = obstacleVerdictSchema.options;

export const scopeVerdictSchema = z.enum(['out_of_scope', 'in_scope', 'scenario_defect']);
export type ScopeVerdict = z.infer<typeof scopeVerdictSchema>;
export const SCOPE_VERDICTS = scopeVerdictSchema.options;

export const assumptionVerdictSchema = z.enum(['keep', 'tighten', 'loosen', 'drop']);
export type AssumptionVerdict = z.infer<typeof assumptionVerdictSchema>;
export const ASSUMPTION_VERDICTS = assumptionVerdictSchema.options;

export const obstacleStatusSchema = z.enum(['new', 'persisting', 'resolved', 'absent']);
export type ObstacleStatus = z.infer<typeof obstacleStatusSchema>;

export const layerSchema = z.enum(['data', 'model', 'system', 'requirement', 'scenario']);
export type Layer = z.infer<typeof layerSchema>;
export const LAYERS = layerSchema.options;

export const mitigationSchema = z.object({ layer: z.string(), action: z.string() });
export type Mitigation = z.infer<typeof mitigationSchema>;

export const obstacleDecisionSchema = z
  .object({
    verdict: obstacleVerdictSchema.nullable(),
    renamed_to: z.string().nullable(),
    status: obstacleStatusSchema,
    tool_verdict: z.string(),
    evidence: z.string(),
    reason: z.string().nullable(),
    mitigation: mitigationSchema.nullable(),
    options: z.array(mitigationSchema),
  })
  .passthrough();
export type ObstacleDecision = z.infer<typeof obstacleDecisionSchema>;

export const scopeRuleSchema = z
  .object({
    param: z.string().nullable().optional(),
    op: z.string().nullable().optional(),
    value: z.unknown().optional(),
    source: z.string().nullable().optional(),
  })
  .nullable();

export const scopeDecisionSchema = z
  .object({
    verdict: scopeVerdictSchema.nullable(),
    kind: z.enum(['rule', 'artefact']),
    evidence: z.string(),
    reason: z.string().nullable(),
    rule: scopeRuleSchema.optional(),
    description: z.string().optional(),
    suggested_fix: z.string().optional(),
  })
  .passthrough();
export type ScopeDecision = z.infer<typeof scopeDecisionSchema>;

export const assumptionDecisionSchema = z
  .object({
    verdict: assumptionVerdictSchema.nullable(),
    new_text: z.string().nullable(),
    tool_verdict: z.string().nullable(),
    kind: z.enum(['scenario', 'run', 'free_text', 'rejected']),
    evidence: z.string(),
    reason: z.string().nullable(),
  })
  .passthrough();
export type AssumptionDecision = z.infer<typeof assumptionDecisionSchema>;

export const addedAssumptionSchema = z.object({
  text: z.string(),
  reason: z.string().nullable(),
});
export type AddedAssumption = z.infer<typeof addedAssumptionSchema>;

export const requirementChangeSchema = z
  .object({
    kind: z.enum(['S', 'R', 'D', 'T']),
    text: z.string(),
    from: z.string(),
    layer: z.string().optional(),
    available: z.boolean().optional(),
  })
  .passthrough();
export type RequirementChange = z.infer<typeof requirementChangeSchema>;

export const decisionsSchema = z
  .object({
    schema_version: z.literal(DECISIONS_SCHEMA_VERSION),
    run_id: z.string().min(1),
    round: z.number().int().nullable(),
    parent_run_id: z.string().nullable(),
    reviewer: z.string().nullable(),
    decided_at: z.string().nullable(),
    obstacles: z.record(obstacleDecisionSchema),
    scope: z.record(scopeDecisionSchema),
    assumptions: z.record(assumptionDecisionSchema).optional(),
    added_assumptions: z.array(addedAssumptionSchema).optional(),
    requirement_changes: z.array(requirementChangeSchema).optional(),
    proposed_by_tool: z.boolean().optional(),
  })
  .passthrough();
export type DecisionsDoc = z.infer<typeof decisionsSchema>;
