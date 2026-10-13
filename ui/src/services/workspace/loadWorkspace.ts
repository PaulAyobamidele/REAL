import { z } from 'zod';

import { orderRounds, type RoundSummary } from '@/domain/lineage';
import {
  analysisReportSchema,
  clusterMapSchema,
  decisionsSchema,
  FileError,
  parseWithSchema,
  reportVersion,
  runMetaSchema,
  SUPPORTED_REPORT_VERSIONS,
  type ClusterMap,
} from '@/services/schemas';

import { joinPath, KNOWN_FILES, type FileSource } from './fileSource';

/**
 * Discover the rounds of a workspace and load, for each, the files the
 * lineage and review need up front: run_meta.json, analysis_report.json,
 * decisions.json and the requirement text. Per-simulation data (the CSV,
 * traces) is loaded on demand. One unreadable round never stops the others
 * from loading: it is listed with its error.
 */
export interface BrokenRound {
  dir: string;
  error: FileError;
}

export interface Workspace {
  source: FileSource;
  rounds: RoundSummary[];
  broken: BrokenRound[];
  ignored: string[];
  loadedAt: string;
}

async function readOptional(source: FileSource, path: string): Promise<string | null> {
  try {
    return await source.readText(path);
  } catch (error) {
    if (error instanceof FileError && error.kind === 'missing') return null;
    throw error;
  }
}

function asFileError(error: unknown, file: string): FileError {
  if (error instanceof FileError) return error;
  return new FileError('unreadable', file, error instanceof Error ? error.message : String(error));
}

async function loadRound(source: FileSource, dir: string, files: string[]): Promise<RoundSummary> {
  const metaFile = joinPath(dir, KNOWN_FILES.runMeta);
  const meta = parseWithSchema(await source.readText(metaFile), runMetaSchema, metaFile);

  let report: RoundSummary['report'] = null;
  let reportError: FileError | null = null;
  const reportFile = joinPath(dir, KNOWN_FILES.report);
  if (files.includes(KNOWN_FILES.report)) {
    try {
      const parsed = parseWithSchema(
        await source.readText(reportFile),
        analysisReportSchema,
        reportFile,
      );
      const version = reportVersion(parsed);
      if (!(SUPPORTED_REPORT_VERSIONS as readonly number[]).includes(version)) {
        reportError = new FileError(
          'unsupported-version',
          reportFile,
          `schema version ${version} is newer than this build understands (versions ${SUPPORTED_REPORT_VERSIONS.join(', ')})`,
        );
      } else {
        report = parsed;
      }
    } catch (error) {
      reportError = asFileError(error, reportFile);
    }
  }

  let decisions: RoundSummary['decisions'] = null;
  let decisionsError: FileError | null = null;
  const decisionsFile = joinPath(dir, KNOWN_FILES.decisions);
  if (files.includes(KNOWN_FILES.decisions)) {
    try {
      decisions = parseWithSchema(
        await source.readText(decisionsFile),
        decisionsSchema,
        decisionsFile,
      );
    } catch (error) {
      decisionsError = asFileError(error, decisionsFile);
    }
  }

  // R0.dsl is written on signing; before that the requirement is in run_meta.json
  const r0 = files.includes(KNOWN_FILES.r0)
    ? await readOptional(source, joinPath(dir, KNOWN_FILES.r0))
    : null;
  const requirementText = r0 ?? meta.requirement ?? null;

  return {
    id: meta.run_id,
    dir,
    meta,
    report,
    reportError,
    decisions,
    decisionsError,
    requirementText,
    files,
  };
}

export async function loadWorkspace(source: FileSource): Promise<Workspace> {
  const listing = await source.list();
  const rounds: RoundSummary[] = [];
  const broken: BrokenRound[] = [];
  for (const entry of listing.rounds) {
    try {
      rounds.push(await loadRound(source, entry.dir, entry.files));
    } catch (error) {
      broken.push({
        dir: entry.dir,
        error: asFileError(error, joinPath(entry.dir, KNOWN_FILES.runMeta)),
      });
    }
  }
  return {
    source,
    rounds: orderRounds(rounds),
    broken,
    ignored: listing.ignored,
    loadedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ traces

export const traceSchema = z
  .object({
    summary: z.record(z.unknown()).optional(),
    distance_m: z.array(z.number().nullable()).default([]),
    ego_speed: z.array(z.number().nullable()).default([]),
    pedestrian_speed: z.array(z.number().nullable()).optional(),
    detections: z
      .array(
        z
          .object({
            step: z.number(),
            confidence: z.number().nullable(),
            inference_ms: z.number().nullable().optional(),
            ego_speed: z.number().nullable().optional(),
            distance: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
    brakes: z
      .array(
        z
          .object({
            step: z.number(),
            brake: z.number().nullable(),
            ego_speed: z.number().nullable().optional(),
            distance: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();
export type Trace = z.infer<typeof traceSchema>;

export async function loadClusterMap(source: FileSource, dir: string): Promise<ClusterMap> {
  const path = joinPath(dir, KNOWN_FILES.clusterMap);
  return parseWithSchema(await source.readText(path), clusterMapSchema, path);
}

export async function loadTrace(source: FileSource, dir: string, trace: string): Promise<Trace> {
  const path = joinPath(dir, trace);
  return parseWithSchema(await source.readText(path), traceSchema, path);
}
