import './memoryStorage';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';

import { fixtureText, MemorySource, ROUND_1 } from '../helpers/memorySource';

describe('the normal build', () => {
  it('still shows a report banner on the first review step', async () => {
    const report = JSON.parse(fixtureText(`${ROUND_1}/analysis_report.json`));
    const source = new MemorySource({
      [`${ROUND_1}/run_meta.json`]: fixtureText(`${ROUND_1}/run_meta.json`),
      [`${ROUND_1}/analysis_report.json`]: JSON.stringify({
        ...report,
        banner: 'Re-judged against the study requirement',
      }),
    });
    window.location.hash = `#/review/${ROUND_1}/1`;
    render(<App autoOpenExample={false} initialSource={source} />);
    await screen.findByRole('heading', { name: /The requirement under test/ });
    expect(document.body).toHaveTextContent('Re-judged against the study requirement');
  });
});
