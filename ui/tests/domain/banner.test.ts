import { describe, expect, it } from 'vitest';

import { BANNER_TITLE, bannerKind } from '@/domain/banner';

describe("a report's banner", () => {
  it('is titled by what it says', () => {
    expect(BANNER_TITLE[bannerKind('PARTIAL (3 of 32 scenarios) - the job is still running')]).toBe(
      'Results so far',
    );
    expect(BANNER_TITLE[bannerKind('INCOMPLETE (20 of 32 scenarios) - the job ended early')]).toBe(
      'Incomplete run',
    );
    // a re-judging note is about the round, never an incomplete run
    expect(
      BANNER_TITLE[
        bannerKind('Re-judged 2026-10-16 against the v2 study requirement. Same simulations.')
      ],
    ).toBe('About this round');
  });
});
