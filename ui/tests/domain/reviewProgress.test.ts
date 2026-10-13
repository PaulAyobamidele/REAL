import { describe, expect, it } from 'vitest';

import { decidedCount, reviewProgress } from '@/domain/reviewProgress';
import { analysisReportSchema, parseWithSchema } from '@/services/schemas';
import { createDraft, draftReducer } from '@/state/draft';

import { fixtureText, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);

describe('review progress', () => {
  it('marks the current step, and the reading steps done once visited', () => {
    const draft = createDraft(report, null, null, 2);
    const steps = reviewProgress({ step: 3, report, draft, visited: new Set([1, 2, 3]) });
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(steps[1]!.detail).toContain(`${report.failure_model.n_scenarios} cases`);
  });

  it('counts triage as decided only for the reviewer’s own verdicts', () => {
    let draft = createDraft(report, null, null, 2);
    const total = decidedCount(draft).total;
    expect(decidedCount(draft).decided).toBe(0);
    const first = Object.keys(draft.doc.obstacles)[0]!;
    draft = draftReducer(draft, { type: 'obstacle/verdict', id: first, verdict: 'reject' });
    const triage = reviewProgress({ step: 1, report, draft, visited: new Set() })[3]!;
    expect(triage.detail).toBe(`1 of ${total} decided`);
    expect(triage.fraction).toBeCloseTo(1 / total);
    expect(triage.state).toBe('upcoming');
  });

  it('flags failed runs on the test result step', () => {
    const steps = reviewProgress({ step: 1, report, draft: null, visited: new Set() });
    expect(Boolean(steps[1]!.attention)).toBe(report.failure_model.failures > 0);
  });
});
