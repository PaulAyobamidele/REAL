import {
  NotWritableError,
  StaticSource,
  type FileSource,
  type Listing,
} from '@/services/workspace';

import { loadSession } from './session';

/**
 * The study's rounds, bundled next to the build by scripts/make-study-site.mjs:
 * the round under review in ./workspace and the pre-computed follow-ups in
 * ./followups. As in the real tool, a round appears only once the participant
 * has run it: the source lists only the rounds this participant has revealed
 * (by a replayed run), kept in the browser per participant.
 */
export const STUDY_BASES = ['./workspace', './followups'];

const memoryRevealed = new Set<string>(); // when the browser has no storage

function revealedKey(): string {
  return `real-av.study.revealed.${loadSession()?.id ?? 'none'}`;
}

export function revealed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(revealedKey()) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function reveal(dir: string): void {
  const next = [...new Set([...revealed(), dir])];
  try {
    window.localStorage.setItem(revealedKey(), JSON.stringify(next));
  } catch {
    // without storage the round stays visible until the page is reloaded
  }
  memoryRevealed.add(dir);
}

export interface BundledRound {
  dir: string;
  studyRound: string;
  car: { braking_mode: string; yolo_model: string } | null;
  requirement: string | null;
}

export class StudySource implements FileSource {
  readonly kind = 'static' as const;
  readonly canWrite = false;
  readonly isExample = false;
  readonly label = 'Test rounds';

  constructor(private readonly parts: StaticSource[]) {}

  static async probe(): Promise<StudySource | null> {
    const parts = (await Promise.all(STUDY_BASES.map((b) => StaticSource.probe(b)))).filter(
      (p): p is StaticSource => p !== null,
    );
    return parts.length ? new StudySource(parts) : null;
  }

  private async owner(dir: string): Promise<StaticSource | null> {
    for (const part of this.parts)
      if ((await part.list()).rounds.some((r) => r.dir === dir)) return part;
    return null;
  }

  async list(): Promise<Listing> {
    const shown = new Set([...revealed(), ...memoryRevealed]);
    const rounds = [];
    for (const part of this.parts)
      rounds.push(...(await part.list()).rounds.filter((r) => shown.has(r.dir)));
    return { rounds, ignored: [] };
  }

  /** Every bundled round, revealed or not, with what the replay needs to pick one. */
  async bundled(): Promise<BundledRound[]> {
    const out: BundledRound[] = [];
    for (const part of this.parts)
      for (const r of (await part.list()).rounds) {
        const meta = JSON.parse(await part.readText(`${r.dir}/run_meta.json`)) as {
          study_round?: string;
          system_under_test?: { braking_mode: string; yolo_model: string };
          requirement?: string;
        };
        out.push({
          dir: r.dir,
          studyRound: meta.study_round ?? r.dir,
          car: meta.system_under_test ?? null,
          requirement: meta.requirement ?? null,
        });
      }
    return out;
  }

  async exists(path: string): Promise<boolean> {
    const part = await this.owner(path.split('/')[0] ?? '');
    return part ? part.exists(path) : false;
  }

  async readText(path: string): Promise<string> {
    const part = await this.owner(path.split('/')[0] ?? '');
    if (!part) throw new Error(`${path}: not in this session`);
    return part.readText(path);
  }

  async mediaUrl(path: string): Promise<string> {
    const part = await this.owner(path.split('/')[0] ?? '');
    if (!part) throw new Error(`${path}: not in this session`);
    return part.mediaUrl(path);
  }

  async writeText(): Promise<void> {
    throw new NotWritableError(this.label);
  }
}
