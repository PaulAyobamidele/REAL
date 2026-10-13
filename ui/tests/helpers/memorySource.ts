import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { FileError } from '@/services/schemas';
import {
  KNOWN_FILES,
  NotWritableError,
  type FileSource,
  type Listing,
  type RoundEntry,
} from '@/services/workspace';

/**
 * A FileSource over files held in memory: the fixture workspace read from
 * disk at test time, or hand-made files for error cases. Writes are kept in
 * memory so a test can read back what signing produced.
 */
export class MemorySource implements FileSource {
  readonly kind = 'files' as const;
  readonly isExample = false;
  readonly writes = new Map<string, string>();
  private readonly files: Map<string, string>;

  constructor(
    files: Record<string, string> | Map<string, string>,
    public readonly label = 'memory',
    public readonly canWrite = false,
  ) {
    this.files = files instanceof Map ? files : new Map(Object.entries(files));
  }

  static fromDirectory(dir: string, label?: string, canWrite = false): MemorySource {
    const files = new Map<string, string>();
    const walk = (base: string, prefix: string) => {
      for (const name of readdirSync(base)) {
        const full = join(base, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        if (statSync(full).isDirectory()) walk(full, rel);
        else if (!name.endsWith('.mp4') && !name.endsWith('.png') && name !== 'README.md')
          files.set(rel, readFileSync(full, 'utf8'));
      }
    };
    walk(dir, '');
    return new MemorySource(files, label ?? dir.split('/').pop(), canWrite);
  }

  async list(): Promise<Listing> {
    const byDir = new Map<string, string[]>();
    for (const path of [...this.files.keys(), ...this.writes.keys()]) {
      const slash = path.indexOf('/');
      if (slash < 0) continue;
      const dir = path.slice(0, slash);
      const rel = path.slice(slash + 1);
      const list = byDir.get(dir) ?? [];
      if (!list.includes(rel)) list.push(rel);
      byDir.set(dir, list);
    }
    const rounds: RoundEntry[] = [];
    const ignored: string[] = [];
    for (const [dir, files] of [...byDir.entries()].sort()) {
      if (files.includes(KNOWN_FILES.runMeta)) rounds.push({ dir, files: files.sort() });
      else ignored.push(dir);
    }
    return { rounds, ignored };
  }

  async exists(path: string): Promise<boolean> {
    return this.writes.has(path) || this.files.has(path);
  }

  async readText(path: string): Promise<string> {
    const text = this.writes.get(path) ?? this.files.get(path);
    if (text === undefined) throw new FileError('missing', path, 'not found');
    return text;
  }

  async mediaUrl(path: string): Promise<string> {
    return `memory://${path}`;
  }

  async writeText(path: string, text: string): Promise<void> {
    if (!this.canWrite) throw new NotWritableError(this.label);
    this.writes.set(path, text);
  }
}

export const FIXTURE_WORKSPACE = join(__dirname, '..', 'fixtures', 'workspace');
export const ROUND_1 = '35acc09e8c224fdc953e3bf82ba57e96';
export const ROUND_2 = '882fb2fe00bf4568bdb480a281db9e8b';

export function fixtureSource(canWrite = false): MemorySource {
  return MemorySource.fromDirectory(FIXTURE_WORKSPACE, 'fixture workspace', canWrite);
}

export function fixtureText(path: string): string {
  return readFileSync(join(FIXTURE_WORKSPACE, path), 'utf8');
}
