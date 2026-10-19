import { BUILD } from './config';

/** One participant's session, kept in this browser so a reload resumes it. */
export interface StudySession {
  /** S-XXXX, random, carries no meaning */
  id: string;
  /** the participant's expertise, in their own words */
  expertise: string;
  started_at: string;
  build: string;
}

const KEY = 'real-av.study.session';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `S-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

export function newSession(id: string, expertise: string): StudySession {
  return { id, expertise, started_at: new Date().toISOString(), build: BUILD };
}

export function loadSession(): StudySession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as StudySession) : null;
    return s && typeof s.id === 'string' && typeof s.expertise === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: StudySession): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // a browser without storage still runs the session; a reload starts a new one
  }
}
