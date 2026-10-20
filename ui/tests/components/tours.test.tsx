import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { tourOf } from '@/tour/tours';

import { fixtureSource, ROUND_2 } from '../helpers/memorySource';

/** Every stop of a page's tour points at something on that page. */
async function stopsOnPage(hash: string, key: string, heading: string | RegExp) {
  window.location.hash = '#/';
  render(<App autoOpenExample={false} initialSource={fixtureSource(true)} />);
  await screen.findAllByText('fixture workspace', {}, { timeout: 10_000 });
  await act(async () => {
    window.location.hash = hash;
  });
  await screen.findByRole('heading', { level: 1, name: heading });
  // the parts that load after the heading (tables, the report's sections)
  await new Promise((r) => setTimeout(r, 300));
  const missing = tourOf(key)
    .filter((s) => s.element && !document.querySelector(s.element))
    .map((s) => s.title);
  return missing;
}

describe('the guided tours', () => {
  it('has a tour button in the header', async () => {
    window.location.hash = '#/overview';
    render(<App autoOpenExample={false} />);
    expect(
      await screen.findByRole('button', { name: 'Take the tour of this page' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['#/overview', 'overview', 'How REAL works'],
    [`#/review/${ROUND_2}/1`, 'step1', /The requirement under test/],
    [`#/review/${ROUND_2}/2`, 'step2', /Test Execution Report/],
    [`#/review/${ROUND_2}/3`, 'step3', /Failure Analysis/],
    [`#/review/${ROUND_2}/4`, 'step4', /Obstacle triage/],
    [`#/review/${ROUND_2}/5`, 'step5', /Requirement revision/],
  ])('%s: every stop is on the page', async (hash, key, heading) => {
    expect(await stopsOnPage(hash, key, heading)).toEqual([]);
  });
});
