import { describe, expect, it } from 'vitest';

import { buildGoalModel } from '@/domain/goalModel';
import { layoutKaos, overlaps } from '@/domain/kaosLayout';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';

import { fixtureText, ROUND_1, ROUND_2 } from '../helpers/memorySource';

const REPORTS = [
  `${ROUND_1}/analysis_report.json`,
  `${ROUND_2}/analysis_report.json`,
  `${ROUND_2}/baseline_D0/analysis_report.json`,
].map((p) => [p, parseWithSchema(fixtureText(p), analysisReportSchema, p)] as const);

describe('the KAOS layout of every fixture report', () => {
  for (const [path, report] of REPORTS) {
    describe(path, () => {
      const layout = layoutKaos(buildGoalModel(report), report);

      it('lays out', () => {
        expect(layout.ok ? null : layout.reason).toBeNull();
      });

      it('draws no two boxes over each other', () => {
        if (!layout.ok) return;
        for (let i = 0; i < layout.boxes.length; i++)
          for (let j = i + 1; j < layout.boxes.length; j++)
            expect(
              overlaps(layout.boxes[i]!, layout.boxes[j]!),
              `${layout.boxes[i]!.id} / ${layout.boxes[j]!.id}`,
            ).toBe(false);
      });

      it('draws every obstacle in the report, attached or in the unattached region', () => {
        if (!layout.ok) return;
        const drawn = layout.boxes.filter((b) => b.kind === 'obstacle').map((b) => b.obstacle!.id);
        expect(drawn.sort()).toEqual(report.obstacles.map((o) => o.id).sort());
        for (const b of layout.boxes.filter((x) => x.kind === 'obstacle'))
          expect(Boolean(b.target) !== Boolean(b.unattached)).toBe(true);
      });

      it('draws nothing that is not in the parse tree or the analysis', () => {
        if (!layout.ok) return;
        const tree = report.requirement.tree!;
        const assumptions = tree.assumptions ?? [];
        const soft = tree.soft_goals ?? [];
        for (const b of layout.boxes) {
          if (b.kind === 'domain') expect(assumptions).toContain(b.title);
          if (b.kind === 'soft') expect(soft).toContain(b.title);
        }
        expect(layout.boxes.filter((b) => b.kind === 'domain')).toHaveLength(assumptions.length);
        expect(layout.boxes.filter((b) => b.kind === 'soft')).toHaveLength(soft.length);
      });
    });
  }
});

describe('a requirement the layout cannot hold', () => {
  it('returns a reason instead of a diagram', () => {
    const [, report] = REPORTS[0]!;
    const noTree = {
      ...report,
      requirement: { ...report.requirement, tree: null, parsed: false, error: 'x' },
    };
    const layout = layoutKaos(buildGoalModel(noTree as typeof report), noTree as typeof report);
    expect(layout.ok).toBe(false);
  });
});
