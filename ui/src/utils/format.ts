/**
 * Display formatting. Values come from the files as they are; a missing
 * value is shown as "n/a", never as 0 or blank. Rounding here is for the
 * eye only and never feeds a file (see domain/pythonFormat for that).
 */
export function displayPercent(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return `${(x * 100).toFixed(digits)}%`;
}

export function displayNumber(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return Number.isInteger(x) ? String(x) : x.toFixed(digits);
}

export function displayCount(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return String(x);
}

export function displayDate(iso: string | null | undefined): string {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function shortId(id: string, length = 8): string {
  return id.length > length ? `${id.slice(0, length)}…` : id;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
