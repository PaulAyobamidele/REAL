import './memoryStorage';

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import { loadWorkspace } from '@/services/workspace';
import type * as StudyConfig from '@/study/config';

import {
  fixtureSource,
  fixtureText,
  MemorySource,
  ROUND_1,
  ROUND_2,
} from '../helpers/memorySource';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

function started() {
  window.localStorage.setItem(
    'real-av.study.session',
    JSON.stringify({ id: 'S-7K3Q', expertise: 'Student', started_at: '', build: 'dev' }),
  );
}

describe('the study workspace', () => {
  it('refuses a round that carries decisions.json; the other round loads', async () => {
    const ws = await loadWorkspace(fixtureSource());
    expect(ws.rounds.map((r) => r.id)).toEqual([ROUND_1]);
    expect(ws.broken.map((b) => b.dir)).toEqual([ROUND_2]);
    expect(ws.broken[0]?.error.message).toMatch(/starts with no decisions/);
  });

  it('never shows the Workspace, so no way to open, drop or swap one', async () => {
    started();
    // the requirement page it leads to reads the site's files: none here
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    window.location.hash = '#/';
    render(<App autoOpenExample={false} initialSource={fixtureSource()} />);
    await waitFor(() => expect(window.location.hash).toBe('#/author'));
    expect(screen.queryByText('The test rounds of this requirement.')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Open a folder' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Drop a folder' })).toBeNull();
    vi.unstubAllGlobals();
  });

  it('does not show a report banner (a researcher note) to participants', async () => {
    started();
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
    expect(document.body).not.toHaveTextContent('Re-judged against the study requirement');
  });
});
