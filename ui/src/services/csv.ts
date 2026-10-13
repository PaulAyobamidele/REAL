import Papa from 'papaparse';

import type { CsvRow } from '@/domain/evidence';
import { FileError } from '@/services/schemas';

/**
 * simulations.csv as the file has it: every cell a string, no coercion. The
 * columns differ between scene versions (39 to 58 of them), so rows are
 * records keyed by header and consumers ask for the columns they know.
 */
export function parseSimulationsCsv(text: string, file: string): CsvRow[] {
  const result = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const fatal = result.errors.filter((e) => e.type !== 'FieldMismatch');
  if (fatal.length) {
    throw new FileError(
      'malformed',
      file,
      `could not be parsed as CSV (${fatal[0]?.message ?? 'unknown error'})`,
      fatal.slice(0, 8).map((e) => `row ${e.row ?? '?'}: ${e.message}`),
    );
  }
  const headers = result.meta.fields ?? [];
  for (const required of ['scenario_id', 'sim_index', 'passed']) {
    if (!headers.includes(required)) {
      throw new FileError('malformed', file, `column "${required}" is missing`, [
        `columns present: ${headers.join(', ')}`,
      ]);
    }
  }
  return result.data;
}
