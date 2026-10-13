import { describe, expect, it } from 'vitest';

import {
  buildDecisions,
  completionGaps,
  isComplete,
  obstacleStatus,
  validateDecisions,
} from '@/domain/decisions';
import { analysisReportSchema, decisionsSchema, parseWithSchema } from '@/services/schemas';

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

describe('obstacleStatus', () => {
  it('matches decisions.obstacle_status', () => {
    expect(obstacleStatus('supported', 'supported')).toBe('persisting');
    expect(obstacleStatus('supported', 'not_supported')).toBe('new');
    expect(obstacleStatus('supported', undefined)).toBe('new');
    expect(obstacleStatus('not_supported', 'supported')).toBe('resolved');
    expect(obstacleStatus('insufficient_data', 'supported')).toBe('resolved');
    expect(obstacleStatus('not_supported', 'not_supported')).toBe('absent');
  });
});

describe('buildDecisions on the real round 2 report', () => {
  const doc = buildDecisions(report, { previous, round: 2 });

  it('fills every tool field exactly as the file on disk has it', () => {
    expect(doc.run_id).toBe(ROUND_2);
    expect(doc.parent_run_id).toBe(ROUND_1);
    for (const [id, entry] of Object.entries(onDisk.obstacles)) {
      const built = doc.obstacles[id];
      expect(built, id).toBeDefined();
      expect(built?.status).toBe(entry.status);
      expect(built?.tool_verdict).toBe(entry.tool_verdict);
      expect(built?.evidence).toBe(entry.evidence);
      expect(built?.options).toEqual(entry.options);
      expect(built?.verdict).toBeNull();
      expect(built?.mitigation).toBeNull();
    }
    expect(Object.keys(doc.obstacles)).toEqual(Object.keys(onDisk.obstacles));
    expect(Object.keys(doc.scope)).toEqual(Object.keys(onDisk.scope));
    for (const [sid, entry] of Object.entries(onDisk.scope)) {
      expect(doc.scope[sid]?.evidence).toBe(entry.evidence);
      expect(doc.scope[sid]?.kind).toBe(entry.kind);
      expect(doc.scope[sid]?.description).toBe(entry.description);
      expect(doc.scope[sid]?.suggested_fix).toBe(entry.suggested_fix);
    }
    expect(doc.assumptions).toEqual({});
    expect(doc.added_assumptions).toEqual([]);
  });

  it('is valid but not complete until every verdict is in', () => {
    expect(validateDecisions(doc)).toEqual([]);
    expect(isComplete(doc)).toBe(false);
    expect(completionGaps(doc).join(' ')).toMatch(/6 obstacles without a verdict/);
  });
});

describe('validateDecisions catches bad values like decisions.validate', () => {
  it('names every problem', () => {
    const doc = {
      schema_version: 1 as const,
      run_id: 'r',
      round: null,
      parent_run_id: null,
      reviewer: null,
      decided_at: null,
      obstacles: {
        X: {
          verdict: 'maybe' as never,
          renamed_to: null,
          status: 'new' as const,
          tool_verdict: 'supported',
          evidence: '',
          reason: null,
          mitigation: { layer: 'magic', action: '' },
          options: [],
        },
        Y: {
          verdict: 'reject' as const,
          renamed_to: null,
          status: 'absent' as const,
          tool_verdict: 'x',
          evidence: '',
          reason: null,
          mitigation: { layer: 'system', action: 'x' },
          options: [],
        },
        Z: {
          verdict: 'rename' as const,
          renamed_to: null,
          status: 'new' as const,
          tool_verdict: 'x',
          evidence: '',
          reason: null,
          mitigation: null,
          options: [],
        },
      },
      scope: { s: { verdict: 'nope' as never, kind: 'rule' as const, evidence: '', reason: null } },
      assumptions: {
        'fog_density <= 50': {
          verdict: 'tighten' as const,
          new_text: 'ego_speed <= 5',
          tool_verdict: null,
          kind: 'scenario' as const,
          evidence: '',
          reason: null,
        },
      },
      added_assumptions: [{ text: '  ', reason: null }],
      requirement_changes: [{ kind: 'Q' as never, text: '', from: 'x' }],
    };
    const joined = validateDecisions(doc).join(' ');
    for (const needle of [
      'X: verdict',
      'layer "magic"',
      'needs an action',
      'rejected obstacle cannot',
      'rename needs renamed_to',
      'scope s',
      'about the car under test',
      'text missing',
      'kind "Q"',
    ]) {
      expect(joined, needle).toContain(needle);
    }
  });
});
