// @vitest-environment node
/**
 * The REAL-DSL editor's colours, light and dark, against WCAG 2.2 AA (4.5:1):
 * every token colour on the editor background (and on its own tint for the
 * module, assumption and soft-goal chips), the gutter text and the status bar.
 */
import { describe, expect, it } from 'vitest';

import { DSL_COLOURS } from '@/components/requirement/dsl/language';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(['light', 'dark'] as const)('the %s editor', (mode) => {
  const c = DSL_COLOURS[mode];
  const pairs: [string, string, string][] = [
    ['text', c.text, c.background],
    ['keyword', c.keyword, c.background],
    ['keyword on the active line', c.keyword, c.activeLine],
    ['MAINTAIN / ACHIEVE', c.temporal, c.background],
    ['string', c.string, c.background],
    ['module on its chip', c.module, c.moduleBg],
    ['assumption on its chip', c.assumption, c.assumptionBg],
    ['soft goal on its chip', c.softGoal, c.softGoalBg],
    ['number on an assumption chip', c.number, c.assumptionBg],
    ['comment', c.comment, c.background],
    ['misspelled word', c.invalid, c.background],
    ['line numbers', c.gutterText, c.gutter],
    ['REAL-DSL badge', c.background, c.temporal],
  ];
  it.each(pairs)('%s reads at 4.5:1 or more', (_, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
