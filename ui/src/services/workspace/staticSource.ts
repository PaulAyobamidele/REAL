import { z } from 'zod';

import { FileError, parseWithSchema } from '@/services/schemas';

import { NotWritableError, type FileSource, type Listing } from './fileSource';

/**
 * A workspace folder served statically next to the build. A static server
 * cannot list a directory, so the folder carries `index.json`, written by
 * `scripts/make-workspace-index.mjs`:
 *
 *   { "schema_version": 1, "label": "...", "example": true,
 *     "rounds": [{ "dir": "<run id>", "files": ["run_meta.json", ...] }] }
 */
export const WORKSPACE_INDEX = 'index.json';

export const workspaceIndexSchema = z.object({
  schema_version: z.literal(1),
  label: z.string().optional(),
  example: z.boolean().optional(),
  generated_at: z.string().optional(),
  rounds: z.array(z.object({ dir: z.string().min(1), files: z.array(z.string()) })),
  ignored: z.array(z.string()).optional(),
});
export type WorkspaceIndex = z.infer<typeof workspaceIndexSchema>;

export class StaticSource implements FileSource {
  readonly kind = 'static' as const;
  readonly canWrite = false;
  private index: WorkspaceIndex | null = null;

  constructor(
    private readonly baseUrl: string,
    public readonly label: string = baseUrl,
    public readonly isExample: boolean = false,
  ) {}

  /** Probe for an index without throwing: null when there is no static workspace. */
  static async probe(baseUrl: string): Promise<StaticSource | null> {
    try {
      const response = await fetch(`${baseUrl}/${WORKSPACE_INDEX}`, { cache: 'no-store' });
      if (!response.ok) return null;
      const text = await response.text();
      const index = parseWithSchema(text, workspaceIndexSchema, `${baseUrl}/${WORKSPACE_INDEX}`);
      const source = new StaticSource(baseUrl, index.label ?? baseUrl, index.example ?? false);
      source.index = index;
      return source;
    } catch {
      return null;
    }
  }

  private async loadIndex(): Promise<WorkspaceIndex> {
    if (this.index) return this.index;
    const file = `${this.baseUrl}/${WORKSPACE_INDEX}`;
    const response = await fetch(file, { cache: 'no-store' });
    if (!response.ok) throw new FileError('missing', file, `not found (HTTP ${response.status})`);
    this.index = parseWithSchema(await response.text(), workspaceIndexSchema, file);
    return this.index;
  }

  async list(): Promise<Listing> {
    const index = await this.loadIndex();
    return { rounds: index.rounds, ignored: index.ignored ?? [] };
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  async exists(path: string): Promise<boolean> {
    const index = await this.loadIndex();
    const [dir, ...rest] = path.split('/');
    const round = index.rounds.find((r) => r.dir === dir);
    return Boolean(round && round.files.includes(rest.join('/')));
  }

  async readText(path: string): Promise<string> {
    const response = await fetch(this.url(path), { cache: 'no-store' });
    if (response.status === 404) throw new FileError('missing', path, 'not found');
    if (!response.ok)
      throw new FileError('unreadable', path, `could not be read (HTTP ${response.status})`);
    return response.text();
  }

  async mediaUrl(path: string): Promise<string> {
    return this.url(path);
  }

  async writeText(): Promise<void> {
    throw new NotWritableError(this.label);
  }
}
