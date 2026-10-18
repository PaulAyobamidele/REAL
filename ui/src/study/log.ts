/**
 * The interaction log (brief 4.5): one JSON object per event, appended and
 * never rewritten; kept in this browser (a reload loses nothing) and put in
 * the participant's zip as log.jsonl.
 */
export interface LogEvent {
  participant: string;
  time: string;
  screen: string;
  event: string;
  target?: string;
  old?: unknown;
  new?: unknown;
}

const PREFIX = 'real-av.study.log.';
const memory = new Map<string, string[]>(); // used only once the browser's storage has failed
let storageFailed = false;
let participant: string | null = null;

/** Every event from now on belongs to this participant. */
export function startLog(id: string): void {
  participant = id;
}

function read(id: string): string[] {
  if (!storageFailed) {
    try {
      const raw = window.localStorage.getItem(PREFIX + id);
      return raw ? raw.split('\n') : [];
    } catch {
      storageFailed = true;
    }
  }
  return memory.get(id) ?? [];
}

export function logEvent(e: Omit<LogEvent, 'participant' | 'time'>): void {
  if (!participant) return;
  const line = JSON.stringify({ participant, time: new Date().toISOString(), ...e });
  const lines = [...read(participant), line];
  if (!storageFailed) {
    try {
      window.localStorage.setItem(PREFIX + participant, lines.join('\n'));
      return;
    } catch {
      storageFailed = true; // from now on the log lives in this page; the zip still has it
    }
  }
  memory.set(participant, lines);
}

/** The whole log as JSON lines, for the zip. */
export function logLines(id = participant): string {
  return id ? read(id).join('\n') + (read(id).length ? '\n' : '') : '';
}
