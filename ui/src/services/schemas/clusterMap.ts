import { z } from 'zod';

/**
 * `cluster_map.json`, written by `python -m scripts.analysis.cluster_map`:
 * every valid encounter of a run placed on a two-axis map of how alike the
 * runs unfolded (event-sequence distance), and the best cut of the
 * hierarchical clustering for each number of clusters. Positions and cuts
 * are computed in Python only; the interface draws them and joins points to
 * its own rows by scenario and simulation index.
 */
export const CLUSTER_MAP_SCHEMA_VERSION = 1;

const nullableNumber = z.number().nullable();

const groupSchema = z
  .object({
    cluster: z.number(),
    size: z.number(),
    medoid: z.object({ scenario_id: z.string(), sim_index: z.number() }),
    medoid_sequence: z.array(z.array(z.string())),
    outcomes: z.record(z.number()),
    failed: z.number(),
    scenarios: z.array(z.string()),
    within_median: z.number(),
    over_represented_settings: z.array(
      z.object({
        setting: z.string(),
        value: z.string(),
        in_cluster: z.number(),
        overall: z.number(),
      }),
    ),
  })
  .passthrough();
export type ClusterGroup = z.infer<typeof groupSchema>;

const cutSchema = z
  .object({
    linkage: z.string(),
    threshold: z.number(),
    clusters: z.number(),
    silhouette: z.number(),
    structure: z.string(),
    assignment: z.array(z.number()),
    groups: z.array(groupSchema),
  })
  .passthrough();
export type ClusterCut = z.infer<typeof cutSchema>;

export const clusterMapSchema = z
  .object({
    schema_version: z.literal(CLUSTER_MAP_SCHEMA_VERSION),
    parameters: z.record(z.unknown()),
    map: z
      .object({
        method: z.string(),
        variance_2d: nullableNumber,
        rank_correlation: nullableNumber,
      })
      .passthrough(),
    points: z.array(
      z
        .object({
          scenario_id: z.string(),
          sim_index: z.number(),
          x: z.number(),
          y: z.number(),
          failure_type: z.string().nullable(),
          failed: z.boolean(),
          sequence: z.array(z.array(z.string())),
        })
        .passthrough(),
    ),
    default_cut: z.number().nullable(),
    cuts: z.array(cutSchema),
  })
  .passthrough()
  .refine((m) => m.cuts.every((c) => c.assignment.length === m.points.length), {
    message: 'every cut assigns every point',
  });
export type ClusterMap = z.infer<typeof clusterMapSchema>;
