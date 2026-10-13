import { describe, expect, it } from 'vitest';

import {
  headline,
  links,
  orderRounds,
  previousOf,
  requirementVersions,
  roundState,
} from '@/domain/lineage';
import { loadWorkspace } from '@/services/workspace';

import { fixtureSource, ROUND_1, ROUND_2 } from '../helpers/memorySource';

describe('lineage over the fixture workspace', async () => {
  const workspace = await loadWorkspace(fixtureSource());

  it('orders rounds oldest first by creation time when no round number is recorded', () => {
    expect(workspace.rounds.map((r) => r.id)).toEqual([ROUND_1, ROUND_2]);
    expect(orderRounds([...workspace.rounds].reverse()).map((r) => r.id)).toEqual([
      ROUND_1,
      ROUND_2,
    ]);
  });

  it('reads each round state from the files present', () => {
    const [r1, r2] = workspace.rounds;
    expect(roundState(r1!)).toBe('awaiting-signature');
    expect(roundState(r2!)).toBe('tool-proposal'); // the demo's scripted review is not a person's signature
  });

  it('labels identical requirement texts identically', () => {
    const versions = requirementVersions(workspace.rounds);
    expect(versions.get(ROUND_1)).toBe('A');
    expect(versions.get(ROUND_2)).toBe('A');
  });

  it('links rounds without a recorded parent in date order, carrying the parent decision', () => {
    const chain = links(workspace.rounds);
    expect(chain.length).toBe(1);
    expect(chain[0]?.recorded).toBe(false);
    expect(chain[0]?.changes).toEqual([]); // round 1 holds no decisions.json
    const prev = previousOf(workspace.rounds[1]!, workspace.rounds);
    expect(prev?.round.id).toBe(ROUND_1);
    expect(prev?.recorded).toBe(false);
    expect(previousOf(workspace.rounds[0]!, workspace.rounds)).toBeNull();
  });

  it('takes headline counts straight from the report', () => {
    const h = headline(workspace.rounds[1]!.report!);
    expect(h).toEqual({
      simulations: 160,
      encounters: 128,
      failures: 4,
      failureRate: 0.03125,
      stalled: 113,
      noEncounter: 32,
      setAside: 0,
    });
  });
});
