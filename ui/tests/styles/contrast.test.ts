// @vitest-environment node
/**
 * Every text/background pair the interface uses, read from the real token
 * file, against WCAG 2.2 AA: 4.5:1 for text, 3:1 for large text and for UI
 * boundaries (focus ring, button edge). If a token changes, this says which
 * pair broke.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '..', '..', 'src', 'styles', 'tokens.css'), 'utf8');
const raw = new Map(
  [...css.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
);

function color(name: string): string {
  let v = raw.get(name);
  for (let i = 0; v && v.startsWith('var(') && i < 5; i++)
    v = raw.get(v.slice('var(--color-'.length, -1));
  if (!v || !/^#[0-9a-f]{6}$/i.test(v))
    throw new Error(`--color-${name} is not a plain hex colour: ${v}`);
  return v;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(color(a)), luminance(color(b))].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const LARGE_OR_UI = 3;

const PAIRS: [string, string, number, string][] = [
  ['text', 'surface', TEXT, 'body text on the page'],
  ['text', 'surface-raised', TEXT, 'body text on a card'],
  ['text', 'surface-sunken', TEXT, 'body text in a panel'],
  ['text-muted', 'surface', TEXT, 'secondary text on the page'],
  ['text-muted', 'surface-raised', TEXT, 'secondary text on a card'],
  ['text-muted', 'surface-sunken', TEXT, 'secondary text in a panel'],
  ['text-faint', 'surface-raised', LARGE_OR_UI, 'placeholders, step numbers'],
  ['header-text', 'header', TEXT, 'the header'],
  ['instructions-text', 'instructions-bg', TEXT, 'the instructions box: ink text on white'],
  [
    'instructions',
    'instructions-bg',
    TEXT,
    'its "What to do" label and step numbers: olive on white',
  ],
  ['text', 'band', TEXT, 'the workflow band: the current step'],
  ['text-muted', 'band', TEXT, 'the workflow band: the other steps and their status'],
  ['human', 'surface-raised', TEXT, 'links and selected labels on a card'],
  ['human', 'surface-sunken', TEXT, 'links in a panel'],
  ['human', 'human-soft', TEXT, 'a selected item'],
  ['action-primary-text', 'action-primary', TEXT, 'text on a primary button (the bright green)'],
  ['human', 'surface', TEXT, 'green text right on the page'],
  ['human', 'surface', LARGE_OR_UI, 'focus ring and button edge on the page'],
  ['fail', 'surface', TEXT, '"failed" on the page'],
  ['fail', 'surface-raised', TEXT, '"failed" on a card'],
  ['fail', 'fail-soft', TEXT, 'a failure chip'],
  ['pass', 'surface-raised', TEXT, '"passed" on a card'],
  ['pass', 'pass-soft', TEXT, 'a pass chip'],
  ['caution', 'surface-raised', TEXT, 'a caution on a card'],
  ['caution', 'caution-soft', TEXT, 'a caution chip'],
  ['set-aside', 'set-aside-soft', TEXT, 'a set-aside chip'],
];

describe('the palette meets WCAG 2.2 AA', () => {
  it.each(PAIRS)('%s on %s: at least %s:1 (%s)', (fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('keeps the brand green for the instructions box only', () => {
    const uses = [...raw.entries()]
      .filter(([, v]) => v === 'var(--color-brand-primary)')
      .map(([n]) => n);
    expect(uses).toEqual(['instructions']);
  });
});
