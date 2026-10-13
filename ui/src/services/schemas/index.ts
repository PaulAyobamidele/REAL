import type { ZodType, ZodTypeDef } from 'zod';

export * from './analysisReport';
export * from './clusterMap';
export * from './decisions';
export * from './runMeta';

/**
 * A loading problem that names the file and says what is wrong with it.
 * Three kinds are told apart because the reviewer can act differently on
 * each: a missing file, a file that is not valid JSON or does not match the
 * schema, and a schema version this build does not understand.
 */
export type FileErrorKind = 'missing' | 'malformed' | 'unsupported-version' | 'unreadable';

export class FileError extends Error {
  readonly kind: FileErrorKind;
  readonly file: string;
  readonly details: string[];

  constructor(kind: FileErrorKind, file: string, message: string, details: string[] = []) {
    super(`${file}: ${message}`);
    this.name = 'FileError';
    this.kind = kind;
    this.file = file;
    this.details = details;
  }
}

/**
 * Python's json.dump writes NaN and Infinity as bare tokens, which JSON.parse
 * rejects. Reports from before 2026-10-08 contain them where an average had
 * nothing to average. They stand for "not computable", so they become null,
 * and only when a strict parse has already failed.
 */
export function parseJsonTolerant(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (strictError) {
    const repaired = text.replace(/(?<=[:[,]\s*)-?(?:NaN|Infinity)(?=\s*[,\]}])/g, 'null');
    try {
      return JSON.parse(repaired);
    } catch {
      const reason = strictError instanceof Error ? strictError.message : String(strictError);
      throw new FileError('malformed', file, `not valid JSON (${reason})`);
    }
  }
}

/** Parse text as JSON and validate it against `schema`; errors name the file and the fields. */
export function parseWithSchema<T>(
  text: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  file: string,
): T {
  const data = parseJsonTolerant(text, file);
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues
      .slice(0, 12)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new FileError(
      'malformed',
      file,
      `does not match the expected shape (${details[0] ?? 'unknown field'})`,
      details,
    );
  }
  return result.data;
}
