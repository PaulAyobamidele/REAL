import { describe, expect, it } from 'vitest';

import {
  pyFloatRepr,
  pyPercent,
  pySignedPercent,
  pyStr,
  pyUtcIsoformat,
} from '@/domain/pythonFormat';
import { pyJsonDumps } from '@/domain/pythonJson';

describe('pyPercent reproduces format(x, ".0%")', () => {
  it('rounds like C printf, half to even on exact ties', () => {
    expect(pyPercent(0.03125)).toBe('3%');
    expect(pyPercent(0.7583333333333333)).toBe('76%');
    expect(pyPercent(0.9112903225806451)).toBe('91%');
    expect(pyPercent(0.125)).toBe('12%'); // 12.5 -> even
    expect(pyPercent(0.375)).toBe('38%'); // 37.5 -> even
    expect(pyPercent(0.875)).toBe('88%');
    expect(pyPercent(0.625)).toBe('62%');
    expect(pyPercent(0)).toBe('0%');
    expect(pyPercent(1)).toBe('100%');
    expect(pyPercent(-0.125)).toBe('-12%');
    expect(pyPercent(-0.004)).toBe('-0%'); // Python keeps the sign of a negative zero
    expect(pyPercent(null)).toBe('nan%');
    expect(pyPercent(Number.NaN)).toBe('nan%');
  });
  it('signs like "+.0%"', () => {
    expect(pySignedPercent(0.03223443223443223)).toBe('+3%');
    expect(pySignedPercent(-0.09)).toBe('-9%');
    expect(pySignedPercent(0)).toBe('+0%');
    expect(pySignedPercent(-0.001)).toBe('-0%');
    expect(pySignedPercent(null)).toBe('+nan%');
  });
});

describe('pyFloatRepr reproduces repr(float)', () => {
  it('uses fixed notation for exponents -4..15 and exponential outside', () => {
    expect(pyFloatRepr(0.03125)).toBe('0.03125');
    expect(pyFloatRepr(0.1)).toBe('0.1');
    expect(pyFloatRepr(2)).toBe('2.0');
    expect(pyFloatRepr(80)).toBe('80.0');
    expect(pyFloatRepr(123456789.123)).toBe('123456789.123');
    expect(pyFloatRepr(0.0001)).toBe('0.0001');
    expect(pyFloatRepr(0.00001)).toBe('1e-05');
    expect(pyFloatRepr(1e16)).toBe('1e+16');
    expect(pyFloatRepr(1.5e16)).toBe('1.5e+16');
    expect(pyFloatRepr(1e15)).toBe('1000000000000000.0');
    expect(pyFloatRepr(-0.5)).toBe('-0.5');
    expect(pyFloatRepr(7.582974493380009)).toBe('7.582974493380009');
  });
  it('pyStr matches str() for the scalars the decision file interpolates', () => {
    expect(pyStr(113)).toBe('113');
    expect(pyStr(null)).toBe('None');
    expect(pyStr(true)).toBe('True');
    expect(pyStr('x')).toBe('x');
    expect(pyStr(0.5)).toBe('0.5');
  });
});

describe('pyUtcIsoformat', () => {
  it('writes microseconds and +00:00 as datetime.isoformat does', () => {
    expect(pyUtcIsoformat(new Date('2026-09-23T22:40:10.827Z'))).toBe(
      '2026-09-23T22:40:10.827000+00:00',
    );
  });
});

describe('pyJsonDumps reproduces json.dump(indent=2)', () => {
  it('lays out nested values, escapes non-ASCII, keeps key order', () => {
    const text = pyJsonDumps({
      schema_version: 1,
      run_id: 'abc',
      round: null,
      items: [],
      empty: {},
      nested: { a: [1, 2], b: 'café → x', c: true, d: 0.03125 },
    });
    expect(text).toBe(
      [
        '{',
        '  "schema_version": 1,',
        '  "run_id": "abc",',
        '  "round": null,',
        '  "items": [],',
        '  "empty": {},',
        '  "nested": {',
        '    "a": [',
        '      1,',
        '      2',
        '    ],',
        '    "b": "caf\\u00e9 \\u2192 x",',
        '    "c": true,',
        '    "d": 0.03125',
        '  }',
        '}',
      ].join('\n'),
    );
  });
  it('escapes control characters and quotes the way Python does', () => {
    expect(pyJsonDumps('a"b\\c\nd\t\u0001\u007f')).toBe('"a\\"b\\\\c\\nd\\t\\u0001\\u007f"');
  });
  it('refuses NaN and undefined', () => {
    expect(() => pyJsonDumps({ x: Number.NaN })).toThrow();
    expect(() => pyJsonDumps({ x: undefined as unknown as null })).toThrow();
  });
});
