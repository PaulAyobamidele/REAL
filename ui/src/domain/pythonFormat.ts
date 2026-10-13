/**
 * Text formatting that reproduces Python's, byte for byte, where a string
 * written by this interface must equal what scripts/analysis/decisions.py
 * writes (the `evidence` fields of decisions.json). Kept apart from display
 * formatting, which may say "n/a" where Python prints "nan%".
 */

/** Round half to even on exact ties, as C's correctly-rounded printf does. */
function roundHalfEven(v: number): number {
  const floor = Math.floor(v);
  const diff = v - floor;
  if (diff === 0.5) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(v);
}

/** Python `format(x, '.0%')`: x * 100 (in double arithmetic), rounded to an integer, plus '%'. */
export function pyPercent(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return 'nan%';
  if (!Number.isFinite(x)) return x > 0 ? 'inf%' : '-inf%';
  const v = x * 100;
  const rounded = roundHalfEven(Math.abs(v));
  const negative = v < 0 || Object.is(v, -0);
  // Python keeps the sign of a value that rounds to zero: f"{-0.004:.0%}" == '-0%'
  return `${negative ? '-' : ''}${rounded}%`;
}

/** Python `format(x, '+.0%')`: like pyPercent but always signed. */
export function pySignedPercent(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '+nan%';
  if (!Number.isFinite(x)) return x > 0 ? '+inf%' : '-inf%';
  const text = pyPercent(x);
  return text.startsWith('-') ? text : `+${text}`;
}

/**
 * Python `repr(float)`: the shortest round-tripping digits, in fixed
 * notation for exponents -4..15 and exponential notation ('1e-05', '1.5e+16')
 * outside. Integral floats print with '.0'.
 */
export function pyFloatRepr(n: number): string {
  if (Number.isNaN(n)) return 'nan';
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf';
  if (n === 0) return Object.is(n, -0) ? '-0.0' : '0.0';
  const [mantissa, expText] = n.toExponential().split('e');
  const exponent = Number(expText);
  const sign = n < 0 ? '-' : '';
  const digits = (mantissa ?? '').replace('-', '').replace('.', '');
  if (exponent >= -4 && exponent < 16) {
    if (exponent >= digits.length - 1) {
      return `${sign}${digits}${'0'.repeat(exponent - (digits.length - 1))}.0`;
    }
    if (exponent < 0) {
      return `${sign}0.${'0'.repeat(-exponent - 1)}${digits}`;
    }
    return `${sign}${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`;
  }
  const expSign = exponent < 0 ? '-' : '+';
  const expDigits = String(Math.abs(exponent)).padStart(2, '0');
  const body = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${sign}${body}e${expSign}${expDigits}`;
}

/** Python `str(value)` for the scalar values the decision file interpolates. */
export function pyStr(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number')
    return Number.isInteger(value) ? String(value) : pyFloatRepr(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * `datetime.now(timezone.utc).isoformat()`: microseconds and '+00:00'.
 * JavaScript only has milliseconds, so the last three digits are zero.
 */
export function pyUtcIsoformat(date: Date): string {
  const iso = date.toISOString(); // 2026-09-23T22:40:10.827Z
  const millis = iso.slice(20, 23);
  return `${iso.slice(0, 19)}.${millis}000+00:00`;
}
