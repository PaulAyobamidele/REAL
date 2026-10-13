import { pyFloatRepr } from './pythonFormat';

/**
 * Serialise exactly as Python's `json.dump(obj, f, indent=2)` does, so that a
 * decisions.json written here is byte-identical to one written by the
 * command-line review:
 *   - two-space indent, one item per line, `"key": value`, no trailing newline
 *   - keys in insertion order
 *   - `ensure_ascii`: every character outside printable ASCII is `\uXXXX`
 *   - integers as integers; other numbers in Python's repr
 *   - `None` -> null; NaN and infinities are refused (they are not JSON)
 *
 * Integer-like object keys would be reordered by JavaScript engines; the
 * decision file has none (obstacle ids, scope ids and assumption texts).
 */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function pyJsonDumps(value: JsonValue, indent = 2): string {
  return serialise(value, indent, 0);
}

function serialise(value: JsonValue, indent: number, depth: number): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return serialiseNumber(value);
  if (typeof value === 'string') return serialiseString(value);
  if (value === undefined) {
    throw new TypeError('undefined is not serialisable; use null');
  }
  const pad = ' '.repeat(indent * (depth + 1));
  const closePad = ' '.repeat(indent * depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${pad}${serialise(item, indent, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${closePad}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  const items = entries.map(
    ([key, item]) => `${pad}${serialiseString(key)}: ${serialise(item, indent, depth + 1)}`,
  );
  return `{\n${items.join(',\n')}\n${closePad}}`;
}

function serialiseNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new TypeError(`${n} is not representable in JSON`);
  }
  return Number.isInteger(n) ? String(n) : pyFloatRepr(n);
}

function serialiseString(s: string): string {
  // JSON.stringify handles quotes, backslashes and control characters the
  // same way Python does; only the non-ASCII escaping differs.
  return JSON.stringify(s).replace(/[\u007f-￿]/g, (ch) => {
    return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}
