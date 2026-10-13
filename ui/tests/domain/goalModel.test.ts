import { describe, expect, it } from 'vitest';

import { buildGoalModel, obstacleNodes } from '@/domain/goalModel';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);

describe('buildGoalModel on the real round 2 report', () => {
  const model = buildGoalModel(report);

  it('renders the tree the report carries', () => {
    expect(model.limitation).toBeNull();
    expect(model.root?.kind).toBe('goal');
    const combo = model.root?.children[0];
    expect(combo?.kind).toBe('combination');
    expect(combo && 'combinator' in combo ? combo.combinator : null).toBe('followed by');
    expect(combo?.children.map((c) => ('objective' in c ? c.objective : null))).toEqual([
      'Pedestrian Check',
      'braking',
    ]);
  });

  it('attaches obstacles by name and lists the rest as unattached with a reason', () => {
    expect(model.attachment.get('PedestrianSizeTooSmall')).toBe('goal.r.0.op0'); // the Detect Pedestrian operation
    expect(model.attachment.get('DetectionTooLate')).toBe('goal.r.0.op0');
    expect(model.attachment.get('BrakingNotLatched')).toBe('goal.r.1.op0'); // Apply Brakes
    expect(model.attachment.get('StandoffUnnecessaryStop')).toBeNull();
    const standoff = obstacleNodes(model).find((n) => n.obstacle.id === 'StandoffUnnecessaryStop');
    expect(standoff?.unattachedReason).toMatch(/no soft goal named "Smooth Braking \/ Progress"/);
    expect(standoff?.unattachedReason).toMatch(/PedestrianCrossesWhenSafe/);
    expect(model.unattached.children.map((n) => n.id)).toEqual([
      'obstacle.StandoffUnnecessaryStop',
    ]);
  });

  it('says "none stated" for absent assumptions and soft goals', () => {
    expect(model.assumptions.children).toEqual([]);
    expect(model.assumptions.kind === 'section' && model.assumptions.emptyText).toBe('none stated');
    expect(model.softGoals.children).toEqual([]);
  });

  it('degrades, and says so, when the report has no tree', () => {
    const v1 = {
      ...report,
      schema_version: undefined,
      requirement: { ...report.requirement, tree: undefined },
    };
    const degraded = buildGoalModel(v1);
    expect(degraded.limitation).toMatch(/schema version 1/);
    expect(degraded.root?.children.map((c) => c.kind)).toEqual(['operation', 'operation']);
    expect(degraded.attachment.get('DetectionTooLate')).toBe('goal.op0');
  });
});
