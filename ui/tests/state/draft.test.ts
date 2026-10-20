import { beforeEach, describe, expect, it } from 'vitest';

import { analysisReportSchema, decisionsSchema, parseWithSchema } from '@/services/schemas';
import {
  assumptionState,
  clearDraft,
  createDraft,
  draftReducer,
  loadDraft,
  obstacleState,
  saveDraft,
  scopeState,
  unconfirmedCount,
} from '@/state/draft';

import { fixtureText, ROUND_1, ROUND_2 } from '../helpers/memorySource';

const report = parseWithSchema(
  fixtureText(`${ROUND_2}/analysis_report.json`),
  analysisReportSchema,
  'report',
);
const previous = parseWithSchema(
  fixtureText(`${ROUND_1}/analysis_report.json`),
  analysisReportSchema,
  'report',
);
const onDisk = parseWithSchema(
  fixtureText(`${ROUND_2}/decisions.json`),
  decisionsSchema,
  'decisions',
);

describe('draft decisions', () => {
  beforeEach(() => clearDraft(ROUND_2));

  it('starts empty without a decisions.json on disk', () => {
    const draft = createDraft(report, previous, null, 2);
    expect(draft.prefill).toBeNull();
    expect(obstacleState(draft, 'StandoffUnnecessaryStop')).toBe('empty');
    expect(unconfirmedCount(draft)).toBe(0);
  });

  it('pre-fills from the file on disk and keeps every verdict unconfirmed until the reviewer acts', () => {
    const draft = createDraft(report, previous, onDisk, 2);
    expect(draft.prefill?.toolProposal).toBe(true);
    expect(draft.doc.obstacles.StandoffUnnecessaryStop?.verdict).toBe('accept');
    expect(draft.doc.obstacles.StandoffUnnecessaryStop?.mitigation?.layer).toBe('requirement');
    expect(obstacleState(draft, 'StandoffUnnecessaryStop')).toBe('prefilled');
    expect(scopeState(draft, 'artefact:crossing_trigger_8m')).toBe('prefilled');
    // 4 obstacles + 3 artefacts: the proposal's 2 rejects (the old "noise") start undecided in triage
    expect(unconfirmedCount(draft)).toBe(7);
    expect(draft.reviewer).toBe(''); // the person signing now types their own name

    const confirmed = draftReducer(draft, {
      type: 'obstacle/confirm',
      id: 'StandoffUnnecessaryStop',
    });
    expect(obstacleState(confirmed, 'StandoffUnnecessaryStop')).toBe('confirmed');
    expect(unconfirmedCount(confirmed)).toBe(6);
    const changed = draftReducer(confirmed, {
      type: 'obstacle/verdict',
      id: 'DetectionTooLate',
      verdict: 'defer',
    });
    expect(obstacleState(changed, 'DetectionTooLate')).toBe('confirmed');
    expect(changed.doc.obstacles.DetectionTooLate?.mitigation).toBeNull();
  });

  it('drops the mitigation when an obstacle is rejected or deferred, and renamed_to unless renamed', () => {
    let draft = createDraft(report, previous, null, 2);
    draft = draftReducer(draft, {
      type: 'obstacle/verdict',
      id: 'StandoffUnnecessaryStop',
      verdict: 'accept',
    });
    draft = draftReducer(draft, {
      type: 'obstacle/mitigation',
      id: 'StandoffUnnecessaryStop',
      mitigation: { layer: 'system', action: 'x' },
    });
    expect(draft.doc.obstacles.StandoffUnnecessaryStop?.mitigation?.layer).toBe('system');
    draft = draftReducer(draft, {
      type: 'obstacle/verdict',
      id: 'StandoffUnnecessaryStop',
      verdict: 'reject',
    });
    expect(draft.doc.obstacles.StandoffUnnecessaryStop?.mitigation).toBeNull();
    draft = draftReducer(draft, {
      type: 'obstacle/verdict',
      id: 'AdverseWeather',
      verdict: 'rename',
    });
    draft = draftReducer(draft, {
      type: 'obstacle/renamed_to',
      id: 'AdverseWeather',
      value: 'Fog',
    });
    expect(draft.doc.obstacles.AdverseWeather?.renamed_to).toBe('Fog');
    draft = draftReducer(draft, {
      type: 'obstacle/verdict',
      id: 'AdverseWeather',
      verdict: 'accept',
    });
    expect(draft.doc.obstacles.AdverseWeather?.renamed_to).toBeNull();
  });

  it('handles assumption verdicts and added assumptions', () => {
    let draft = createDraft(report, previous, null, 2);
    draft.doc.assumptions = {
      'fog_density <= 50': {
        verdict: null,
        new_text: null,
        tool_verdict: 'untested',
        kind: 'scenario',
        evidence: '',
        reason: null,
      },
    };
    draft = draftReducer(draft, {
      type: 'assumption/verdict',
      text: 'fog_density <= 50',
      verdict: 'tighten',
    });
    draft = draftReducer(draft, {
      type: 'assumption/new_text',
      text: 'fog_density <= 50',
      value: 'fog_density <= 30',
    });
    expect(assumptionState(draft, 'fog_density <= 50')).toBe('confirmed');
    draft = draftReducer(draft, {
      type: 'assumption/verdict',
      text: 'fog_density <= 50',
      verdict: 'keep',
    });
    expect(draft.doc.assumptions?.['fog_density <= 50']?.new_text).toBeNull();
    draft = draftReducer(draft, {
      type: 'added_assumptions/set',
      lines: [' dry road ', '', 'daylight'],
    });
    expect(draft.doc.added_assumptions).toEqual([
      { text: 'dry road', reason: null },
      { text: 'daylight', reason: null },
    ]);
  });

  it('survives a reload through sessionStorage, separate from the file on disk', () => {
    let draft = createDraft(report, previous, onDisk, 2);
    draft = draftReducer(draft, {
      type: 'obstacle/verdict',
      id: 'AdverseWeather',
      verdict: 'reject',
    });
    draft = draftReducer(draft, { type: 'reviewer/set', value: 'A. Reviewer' });
    saveDraft(draft);
    const restored = loadDraft(ROUND_2);
    expect(restored?.doc.obstacles.AdverseWeather?.verdict).toBe('reject');
    expect(restored?.reviewer).toBe('A. Reviewer');
    expect(restored?.confirmed.obstacles.AdverseWeather).toBe(true);
    expect(onDisk.obstacles.AdverseWeather?.verdict).toBe('reject'); // the file is untouched either way
    expect(loadDraft('other-run')).toBeNull();
  });
});
