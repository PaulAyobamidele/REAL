import { describe, expect, it } from 'vitest';

import { previousOf, sceneVersion, type RoundSummary } from '@/domain/lineage';

const round = (id: string, created: string, version: number | null, parent: string | null = null) =>
  ({
    id,
    dir: id,
    meta: {
      parent_run_id: parent,
      round: null,
      created_at: created,
      scene: version ? { version } : null,
    },
    files: [],
  }) as unknown as RoundSummary;

describe('the previous round, by date, stays within one test scene', () => {
  const r1 = round('r1', '2026-09-23T19:00:00Z', null);
  const r2 = round('r2', '2026-09-23T20:00:00Z', null);
  const c1 = round('c1', '2026-10-16T13:00:00Z', 2);
  const all = [r1, r2, c1];

  it('reads the scene version', () => {
    expect(sceneVersion(r1)).toBeNull();
    expect(sceneVersion(c1)).toBe(2);
  });

  it('round 2 follows round 1 (both on the unrecorded v1 scene); C1 follows nothing', () => {
    expect(previousOf(r2, all)).toEqual({ round: r1, recorded: false });
    expect(previousOf(c1, all)).toBeNull();
  });

  it('skips a round of another scene to the nearest of its own', () => {
    const r3 = round('r3', '2026-10-20T10:00:00Z', null);
    expect(previousOf(r3, [r1, c1, r3])).toEqual({ round: r1, recorded: false });
  });

  it('a recorded parent always wins, whatever the scene', () => {
    const next = round('n', '2026-10-21T10:00:00Z', 3, 'c1');
    expect(previousOf(next, [r1, c1, next])).toEqual({ round: c1, recorded: true });
  });
});
