import { loadSession } from './session';

/**
 * The study session ends at signing (owner, 2026-10-18): the participant's
 * first refinement is what the study needs; R1 is run on the cluster
 * afterwards by the researchers. The signed files are kept in the browser so
 * the end screen can offer the zip again after a reload.
 */
const KEY = 'real-av.study.ended.';
const listeners = new Set<() => void>();

export interface Ended {
  zipName: string;
  files: Record<string, string>;
  at: string;
  /** Sent to the online storage: sending, sent (where), or failed (why). Absent when not set up. */
  upload?: {
    status: 'sending' | 'sent' | 'failed';
    path?: string;
    message?: string;
    at: string;
    /** what a retry sends again */
    car: string;
    signedAt: string;
  };
}

export function endSession(zipName: string, files: Record<string, string>): void {
  const id = loadSession()?.id;
  if (!id) return;
  const ended: Ended = { zipName, files, at: new Date().toISOString() };
  memory = ended;
  try {
    window.localStorage.setItem(KEY + id, JSON.stringify(ended));
  } catch {
    // the end screen still shows; a reload would bring back the signed review
  }
  for (const l of listeners) l();
}

let memory: Ended | null = null;

/** Record how sending the session went, for the end screen (also after a reload). */
export function setUpload(upload: NonNullable<Ended['upload']>): void {
  const id = loadSession()?.id;
  const now = ended();
  if (!id || !now) return;
  const next: Ended = { ...now, upload };
  memory = next;
  try {
    window.localStorage.setItem(KEY + id, JSON.stringify(next));
  } catch {
    // shown while the page stays open
  }
  for (const l of listeners) l();
}

export function ended(): Ended | null {
  const id = loadSession()?.id;
  if (!id) return null;
  try {
    const raw = window.localStorage.getItem(KEY + id);
    if (raw) return JSON.parse(raw) as Ended;
  } catch {
    // fall through
  }
  return memory;
}

export function onEnded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
