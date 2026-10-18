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
