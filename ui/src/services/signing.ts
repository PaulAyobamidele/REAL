import { planChanges, toRequirementChanges, type Plan } from '@/domain/changes';
import { validateDecisions } from '@/domain/decisions';
import { pyUtcIsoformat } from '@/domain/pythonFormat';
import { pyJsonDumps, type JsonValue } from '@/domain/pythonJson';
import { applyChanges, renderDiff } from '@/domain/requirementText';
import type { AnalysisReport, DecisionsDoc } from '@/services/schemas';

import { joinPath, KNOWN_FILES, type FileSource } from './workspace/fileSource';

/**
 * Signing: the one consequential action. It produces exactly the files the
 * command-line review produces (`refine.refine` after `decisions.save`):
 * decisions.json, R0.dsl, R1.dsl, requirement_diff.md - and writes them into
 * the round folder when the source allows, or hands them to the browser as
 * downloads when it does not. Nothing else in the folder is touched.
 */
export interface SignedFiles {
  'decisions.json': string;
  'R0.dsl': string;
  'R1.dsl': string;
  'requirement_diff.md': string;
}

export interface SigningResult {
  doc: DecisionsDoc;
  files: SignedFiles;
  plan: Plan;
  r1: string;
  /** True when R1 is the reviewer's own text, which this build cannot parse-check. */
  r1Edited: boolean;
}

function withTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

export interface SigningInput {
  doc: DecisionsDoc;
  report: AnalysisReport;
  r0: string;
  reviewer: string;
  r1Override: string | null;
  decidedAt?: Date;
  /** the reviewer's expertise, from the welcome page (recorded as reviewer_expertise) */
  expertise?: string;
}

/** Build the signed document and the four files; throws with the validation problems if invalid. */
export function prepareSigning(input: SigningInput): SigningResult {
  const reviewer = input.reviewer.trim();
  if (!reviewer)
    throw new Error('a reviewer name is required: the decision file records who decided');
  if (!input.r0.trim()) throw new Error('no requirement text (R0) for this round');

  const plan = planChanges(input.doc, input.report, input.r0);
  const r1Generated = applyChanges(input.r0, plan.changes);
  const r1Edited = input.r1Override !== null && input.r1Override.trim() !== r1Generated.trim();
  const r1 = r1Edited && input.r1Override !== null ? input.r1Override : r1Generated;

  const doc: DecisionsDoc = {
    ...input.doc,
    reviewer,
    ...(input.expertise?.trim() ? { reviewer_expertise: input.expertise.trim() } : {}),
    decided_at: pyUtcIsoformat(input.decidedAt ?? new Date()),
    requirement_changes: toRequirementChanges(plan.changes),
  };
  delete (doc as { proposed_by_tool?: boolean }).proposed_by_tool;
  const problems = validateDecisions(doc);
  if (problems.length) throw new Error(`decisions.json invalid: ${problems.join('; ')}`);

  const files: SignedFiles = {
    'decisions.json': pyJsonDumps(doc as unknown as JsonValue),
    'R0.dsl': withTrailingNewline(input.r0),
    'R1.dsl': withTrailingNewline(r1),
    'requirement_diff.md': renderDiff(input.r0, r1, plan.changes, doc.run_id),
  };
  return { doc, files, plan, r1, r1Edited };
}

export type WriteMode = 'written' | 'downloaded';

export interface WriteOutcome {
  mode: WriteMode;
  /** Where each file went: a path in the folder, or the download file name. */
  paths: string[];
}

export async function deliverSignedFiles(
  source: FileSource,
  dir: string,
  files: SignedFiles,
): Promise<WriteOutcome> {
  if (source.canWrite) {
    const paths: string[] = [];
    for (const [name, text] of Object.entries(files)) {
      const path = joinPath(dir, name);
      await source.writeText(path, text);
      paths.push(path);
    }
    return { mode: 'written', paths };
  }
  const paths: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    downloadText(name, text);
    paths.push(name);
  }
  return { mode: 'downloaded', paths };
}

export function downloadText(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const SIGNED_FILE_NAMES = [
  KNOWN_FILES.decisions,
  KNOWN_FILES.r0,
  KNOWN_FILES.r1,
  KNOWN_FILES.diff,
] as const;
