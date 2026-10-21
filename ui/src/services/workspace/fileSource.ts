/**
 * Where a workspace's files come from. Three sources, one interface:
 *   - a folder served statically next to the build (`/workspace/`), listed by
 *     its `index.json` because a static server cannot list directories;
 *   - a folder the reviewer picks with the File System Access API (Chromium),
 *     which can also be written to;
 *   - files the reviewer drops on the page or picks with a folder input
 *     (read-only; signing then offers downloads).
 *
 * Paths are relative to the workspace root, `<round dir>/<file>`, with `/`
 * separators. Nothing derived from file content is ever fetched.
 */

export type SourceKind = 'static' | 'directory' | 'files';

export interface RoundEntry {
  /** The round's folder name (the run id, by convention). */
  dir: string;
  /** Files inside it, relative to the folder: 'run_meta.json', 'traces/0_0.json', ... */
  files: string[];
  /** A line about the round from the workspace index (a bundled example says what it is). */
  note?: string;
}

export interface Listing {
  rounds: RoundEntry[];
  /** Folders that hold no run_meta.json: not rounds, listed so nothing is hidden. */
  ignored: string[];
}

export interface FileSource {
  readonly kind: SourceKind;
  /** What the reviewer sees as the workspace's name. */
  readonly label: string;
  /** Signing writes into the round folder; otherwise it offers downloads. */
  readonly canWrite: boolean;
  /** Bundled example data, to be labelled as such on screen. */
  readonly isExample: boolean;
  list(): Promise<Listing>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  /** A URL a <video> or <img> can use. Object URLs are owned by the source. */
  mediaUrl(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
}

export class NotWritableError extends Error {
  constructor(label: string) {
    super(`${label} cannot be written to from this browser`);
    this.name = 'NotWritableError';
  }
}

/** The files a round folder can hold that this interface knows how to read. */
export const KNOWN_FILES = {
  runMeta: 'run_meta.json',
  report: 'analysis_report.json',
  clusterMap: 'cluster_map.json',
  simulations: 'simulations.csv',
  decisions: 'decisions.json',
  r0: 'R0.dsl',
  r1: 'R1.dsl',
  diff: 'requirement_diff.md',
  videoH264: 'best_scenario_h264.mp4',
  video: 'best_scenario.mp4',
  framesDir: 'frames/front_rgb',
  tracesDir: 'traces',
} as const;

/** Is this file one the interface reads? Lists the rest as "present, not read". */
export function isKnownFile(file: string): boolean {
  if (Object.values(KNOWN_FILES).includes(file as never)) return true;
  return file.startsWith('traces/') || file.startsWith('frames/front_rgb/');
}

/** Sort frame files by their leading frame number (they are unpadded: 10_ sorts before 2_ as text). */
export function sortFrames(files: string[]): string[] {
  const num = (f: string) => {
    const name = f.split('/').pop() ?? f;
    const n = Number.parseInt(name.split('_', 1)[0] ?? '', 10);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  return [...files].sort((a, b) => num(a) - num(b));
}

export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}
