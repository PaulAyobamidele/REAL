import { FileError } from '@/services/schemas';

import {
  KNOWN_FILES,
  NotWritableError,
  type FileSource,
  type Listing,
  type RoundEntry,
} from './fileSource';

/**
 * Files the reviewer dropped on the page or picked with a folder input.
 * Read-only: a dropped file cannot be written back, so signing offers the
 * files as downloads. Paths come from `webkitRelativePath` (folder input) or
 * from walking the dropped directory entries.
 */
export interface NamedFile {
  /** Path relative to whatever was dropped, with '/' separators. */
  path: string;
  file: File;
}

/** Files from a drop event: walks dropped folders with the directory-entry API where available. */
export async function filesFromDataTransfer(data: DataTransfer): Promise<NamedFile[]> {
  const out: NamedFile[] = [];
  const items = Array.from(data.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => Boolean(e));
  if (entries.length) {
    for (const entry of entries) await walkEntry(entry, '', out);
    return out;
  }
  for (const file of Array.from(data.files ?? [])) out.push({ path: file.name, file });
  return out;
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries returns in batches; keep reading until an empty batch
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const step = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          step();
        }
      }, reject);
    step();
  });
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: NamedFile[]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ path, file });
  } else if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const child of children) await walkEntry(child, path, out);
  }
}

/** Files from a `<input type="file" webkitdirectory>` change event. */
export function filesFromInput(list: FileList): NamedFile[] {
  return Array.from(list).map((file) => ({
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    file,
  }));
}

export class DroppedFilesSource implements FileSource {
  readonly kind = 'files' as const;
  readonly canWrite = false;
  readonly isExample = false;
  readonly label: string;
  private readonly byPath = new Map<string, File>();
  private readonly objectUrls = new Map<string, string>();

  /**
   * The root is the common first path segment when every path shares one
   * (a dropped folder); the paths are then taken relative to it. A folder
   * that holds run_meta.json itself is a single round.
   */
  constructor(files: NamedFile[]) {
    const firsts = new Set(files.map((f) => f.path.split('/')[0] ?? ''));
    const single = firsts.size === 1 && files.every((f) => f.path.includes('/'));
    const root = single ? ([...firsts][0] ?? '') : '';
    this.label = root || 'dropped files';
    for (const f of files) {
      const rel = root ? f.path.slice(root.length + 1) : f.path;
      this.byPath.set(rel, f.file);
    }
    const rootIsRound = this.byPath.has(KNOWN_FILES.runMeta);
    if (rootIsRound) {
      // treat the folder as one round named after itself
      const prefix = `${this.label}/`;
      const moved = new Map<string, File>();
      for (const [p, file] of this.byPath) moved.set(prefix + p, file);
      this.byPath.clear();
      for (const [p, file] of moved) this.byPath.set(p, file);
    }
  }

  async list(): Promise<Listing> {
    const byDir = new Map<string, string[]>();
    for (const path of this.byPath.keys()) {
      const slash = path.indexOf('/');
      if (slash < 0) continue; // a loose file at the root is not part of any round
      const dir = path.slice(0, slash);
      const rel = path.slice(slash + 1);
      // only the files the interface reads at depth, to keep listings small
      const depth = rel.split('/').length;
      if (depth > 1 && !rel.startsWith('traces/') && !rel.startsWith('frames/')) continue;
      (byDir.get(dir) ?? byDir.set(dir, []).get(dir))?.push(rel);
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
    return this.byPath.has(path);
  }

  private file(path: string): File {
    const file = this.byPath.get(path);
    if (!file) throw new FileError('missing', path, 'not among the dropped files');
    return file;
  }

  async readText(path: string): Promise<string> {
    return this.file(path).text();
  }

  async mediaUrl(path: string): Promise<string> {
    const cached = this.objectUrls.get(path);
    if (cached) return cached;
    const url = URL.createObjectURL(this.file(path));
    this.objectUrls.set(path, url);
    return url;
  }

  async writeText(): Promise<void> {
    throw new NotWritableError(this.label);
  }
}
