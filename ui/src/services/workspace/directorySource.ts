import { FileError } from '@/services/schemas';

import {
  KNOWN_FILES,
  NotWritableError,
  type FileSource,
  type Listing,
  type RoundEntry,
} from './fileSource';

/**
 * A folder the reviewer picked with `showDirectoryPicker()` (Chromium). The
 * handle gives read access to every file and, when the browser grants it,
 * write access, so signing writes into the round folder like the CLI does.
 * The picked folder is either a workspace (its sub-folders are rounds) or a
 * single round (it holds run_meta.json itself).
 */
export function directoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<DirectorySource | null> {
  if (!directoryPickerSupported() || !window.showDirectoryPicker) return null;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({ id: 'real-av-workspace', mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
  let writable = false;
  try {
    const state = handle.requestPermission
      ? await handle.requestPermission({ mode: 'readwrite' })
      : 'denied';
    writable = state === 'granted';
  } catch {
    writable = false;
  }
  return DirectorySource.open(handle, writable);
}

type Entry =
  | { kind: 'file'; name: string }
  | { kind: 'directory'; name: string; handle: FileSystemDirectoryHandle };

async function entriesOf(handle: FileSystemDirectoryHandle): Promise<Entry[]> {
  const out: Entry[] = [];
  for await (const [name, child] of handle.entries()) {
    if (child.kind === 'file') out.push({ kind: 'file', name });
    else out.push({ kind: 'directory', name, handle: child as FileSystemDirectoryHandle });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The files of one round folder: its top-level files plus traces/ and frames/front_rgb/. */
async function listRound(handle: FileSystemDirectoryHandle): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await entriesOf(handle)) {
    if (entry.kind === 'file') {
      files.push(entry.name);
    } else if (entry.name === 'traces') {
      for (const t of await entriesOf(entry.handle))
        if (t.kind === 'file') files.push(`traces/${t.name}`);
    } else if (entry.name === 'frames') {
      for (const sensor of await entriesOf(entry.handle)) {
        if (sensor.kind !== 'directory') continue;
        for (const f of await entriesOf(sensor.handle)) {
          if (f.kind === 'file') files.push(`frames/${sensor.name}/${f.name}`);
        }
      }
    }
  }
  return files;
}

export class DirectorySource implements FileSource {
  readonly kind = 'directory' as const;
  readonly isExample = false;
  private readonly objectUrls = new Map<string, string>();

  private constructor(
    private readonly root: FileSystemDirectoryHandle,
    /** When the picked folder is itself a round, its files live at the root. */
    private readonly singleRound: boolean,
    public readonly canWrite: boolean,
  ) {}

  get label(): string {
    return this.root.name;
  }

  static async open(
    handle: FileSystemDirectoryHandle,
    writable: boolean,
  ): Promise<DirectorySource> {
    const names = (await entriesOf(handle)).filter((e) => e.kind === 'file').map((e) => e.name);
    return new DirectorySource(handle, names.includes(KNOWN_FILES.runMeta), writable);
  }

  async list(): Promise<Listing> {
    if (this.singleRound) {
      return { rounds: [{ dir: this.root.name, files: await listRound(this.root) }], ignored: [] };
    }
    const rounds: RoundEntry[] = [];
    const ignored: string[] = [];
    for (const entry of await entriesOf(this.root)) {
      if (entry.kind !== 'directory') continue;
      const files = await listRound(entry.handle);
      if (files.includes(KNOWN_FILES.runMeta)) rounds.push({ dir: entry.name, files });
      else ignored.push(entry.name);
    }
    return { rounds, ignored };
  }

  /** Resolve `<dir>/<a>/<b>` to the directory holding the file and the file name. */
  private async resolve(
    path: string,
    create = false,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const parts = path.split('/').filter(Boolean);
    if (this.singleRound) parts.shift(); // the round's own folder is the root
    const name = parts.pop();
    if (!name) throw new FileError('missing', path, 'not a file path');
    let dir = this.root;
    for (const part of parts) {
      try {
        dir = await dir.getDirectoryHandle(part, { create });
      } catch {
        throw new FileError('missing', path, `folder ${part} not found`);
      }
    }
    return { dir, name };
  }

  private async file(path: string): Promise<File> {
    const { dir, name } = await this.resolve(path);
    try {
      const handle = await dir.getFileHandle(name);
      return await handle.getFile();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new FileError('missing', path, 'not found');
      }
      throw new FileError(
        'unreadable',
        path,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.file(path);
      return true;
    } catch {
      return false;
    }
  }

  async readText(path: string): Promise<string> {
    return (await this.file(path)).text();
  }

  async mediaUrl(path: string): Promise<string> {
    const cached = this.objectUrls.get(path);
    if (cached) return cached;
    const url = URL.createObjectURL(await this.file(path));
    this.objectUrls.set(path, url);
    return url;
  }

  async writeText(path: string, text: string): Promise<void> {
    if (!this.canWrite) throw new NotWritableError(this.label);
    const { dir, name } = await this.resolve(path, false);
    const handle = await dir.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try {
      await stream.write(text);
    } finally {
      await stream.close();
    }
  }
}
