import { z } from 'zod';

/**
 * run_meta.json: the provenance a run writes about itself. Only `run_id` is
 * guaranteed; every other field appeared at some point in the project's
 * history, so all are optional and unknown keys are kept.
 */
export const runMetaSchema = z
  .object({
    run_id: z.string().min(1),
    mode: z.string().optional(),
    requirement: z.string().nullable().optional(),
    scenario_text: z.string().nullable().optional(),
    constraints: z.record(z.string()).nullable().optional(),
    system_under_test: z
      .object({
        braking_mode: z.string().nullable().optional(),
        yolo_model: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    scene: z.record(z.unknown()).nullable().optional(),
    parent_run_id: z.string().nullable().optional(),
    round: z.number().int().nullable().optional(),
    requirement_source: z.string().nullable().optional(),
    grammar_file: z.string().nullable().optional(),
    grammar_sha256: z.string().nullable().optional(),
    template_sha256: z.string().nullable().optional(),
    n_scenarios: z.number().nullable().optional(),
    trials_per_scenario: z.number().nullable().optional(),
    seed: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    finished_at: z.string().nullable().optional(),
    worst_phenotype: z.string().nullable().optional(),
    worst_pct: z.number().nullable().optional(),
  })
  .passthrough();

export type RunMeta = z.infer<typeof runMetaSchema>;
