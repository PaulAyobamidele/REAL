import type { RoundSummary } from '@/domain/lineage';
import type { AnalysisReport, DecisionsDoc } from '@/services/schemas';
import { prepareSigning, type SigningResult } from '@/services/signing';

import { carOf, CARS, savedCarOf, type CarId } from './car';
import { unratedDiagnoses } from './helpfulness';
import { flushDecisionLog } from './decisionLog';
import { endSession, setUpload } from './ended';
import { logEvent, logLines } from './log';
import { STUDY_MENU } from './menu';
import { loadSession } from './session';
import { StudySource } from './studySource';
import { uploadConfigured, uploadSession } from './upload';
import { downloadZip } from './zip';

/**
 * Signing in the study build (brief 4.7, 4.8): the participant's ID signs; R1
 * is the tool's (never edited by hand); its car must be one of the four with a
 * pre-computed run, bundled with this site; the decisions record the study
 * (who, which round, the car, that the tool's verdicts were hidden, the menu
 * offered); and everything - with the interaction log - downloads as one zip.
 * Every attempt is logged, and so is the reason when signing is refused.
 */

/** What blocks signing before anything is built (shown on the page; checked again on signing). */
export function studyBlockers(doc: DecisionsDoc, r1: string): string[] {
  const out: string[] = [];
  for (const [text, a] of Object.entries(doc.assumptions ?? {}))
    if (a.new_text?.includes('"')) out.push(`the new text for "${text}" contains a double quote`);
  if (!savedCarOf(r1)) out.push('this car has no saved run in this study');
  const unrated = unratedDiagnoses(doc);
  if (unrated.length)
    out.push(
      `${unrated.length} diagnos${unrated.length === 1 ? 'is' : 'es'} not yet rated as helpful or not (${unrated.join(', ')})`,
    );
  return out;
}

export interface StudySigned {
  result: SigningResult;
  zipName: string;
  files: Record<string, string>;
  car: CarId;
}

export async function signStudy(input: {
  doc: DecisionsDoc;
  report: AnalysisReport;
  r0: string;
  round: RoundSummary;
}): Promise<StudySigned> {
  const session = loadSession();
  if (!session) throw new Error('no participant session');
  flushDecisionLog(); // what is still being typed goes in first
  logEvent({ screen: 'review/5', event: 'sign_attempted' });
  const refuse = (reasons: string[]): never => {
    logEvent({ screen: 'review/5', event: 'sign_refused', new: reasons });
    throw new Error(reasons.join('; '));
  };

  const car = carOf(input.doc).id;
  const signedAt = new Date();
  const meta = input.round.meta as { study_round?: string };
  const doc = {
    ...input.doc,
    study: {
      participant: session.id,
      expertise: session.expertise,
      started_at: session.started_at,
      signed_at: signedAt.toISOString(),
      build: session.build,
      round: { study_round: meta.study_round ?? null, shown_run_id: input.round.id },
      car,
      car_modules: CARS[car],
      verdicts_hidden: true,
      menu_offered: STUDY_MENU.map((m) => ({ choice: m.choice, layer: m.layer, label: m.label })),
      r1_written_by_tool: true,
      runs_replayed: true,
    },
  } as DecisionsDoc;

  let result: SigningResult;
  try {
    result = prepareSigning({
      doc,
      report: input.report,
      r0: input.r0,
      reviewer: session.id,
      r1Override: null,
      decidedAt: signedAt,
    });
  } catch (e) {
    return refuse([e instanceof Error ? e.message : String(e)]);
  }
  const blockers = studyBlockers(input.doc, result.r1);
  if (savedCarOf(result.r1) !== car) blockers.push(`R1 does not run car ${car}`);
  const source = await StudySource.probe();
  const bundled = source ? (await source.bundled()).map((r) => r.car) : [];
  if (
    !bundled.some(
      (c) => c?.braking_mode === CARS[car].braking && c.yolo_model === CARS[car].perception,
    )
  )
    blockers.push(`car ${car} is not among the saved runs of this site`);
  if (blockers.length) refuse(blockers);

  logEvent({
    screen: 'review/5',
    event: 'signed',
    new: { car, r1_changes: result.plan.changes.length },
  });
  // the session ends here; logged before the zip is made, so the zip's log has it
  logEvent({ screen: 'review/5', event: 'session_end', new: { zip: `study_${session.id}.zip` } });
  const folder = `study_${session.id}`;
  const files: Record<string, string> = {};
  for (const [name, text] of Object.entries(result.files)) files[`${folder}/${name}`] = text;
  files[`${folder}/log.jsonl`] = logLines(session.id);
  const zipName = `${folder}.zip`;
  downloadZip(zipName, files);
  endSession(zipName, files); // the session ends at signing
  // sent to the research team as well (when the site has online storage); the download stays the backup
  void sendSession(car, signedAt.toISOString(), files);
  return { result, zipName, files, car };
}

/** Send the signed session to the online storage, and say on the end screen how it went. */
export async function sendSession(
  car: string,
  signedAt: string,
  files: Record<string, string>,
): Promise<void> {
  const session = loadSession();
  if (!uploadConfigured || !session) return;
  const keep = { car, signedAt };
  setUpload({ status: 'sending', at: new Date().toISOString(), ...keep });
  const out = await uploadSession({ session, car, signedAt, files });
  logEvent({ screen: 'end', event: out.ok ? 'upload_sent' : 'upload_failed', new: out });
  setUpload(
    out.ok
      ? { status: 'sent', path: out.path, at: new Date().toISOString(), ...keep }
      : { status: 'failed', message: out.message, at: new Date().toISOString(), ...keep },
  );
}
