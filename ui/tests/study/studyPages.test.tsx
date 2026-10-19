import './memoryStorage';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import type * as StudyConfig from '@/study/config';

import { R0, serveStudySite } from './fakeSite';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    'real-av.study.session',
    JSON.stringify({ id: 'S-7K3Q', expertise: 'Student', started_at: '', build: 'dev' }),
  );
  serveStudySite();
});
afterEach(() => vi.unstubAllGlobals());

describe('the study build, before any run', () => {
  it('has no Workspace: its address leads to the requirement under test', async () => {
    window.location.hash = '#/';
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe('#/author'));
    expect(screen.queryByText('No test rounds yet')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Screens' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Overview', 'Requirement under Test', 'Rounds']);
  });

  it('shows the requirement under test read only, without the editing controls', async () => {
    window.location.hash = '#/author';
    render(<App />);
    const text = await screen.findByLabelText('Requirement text');
    expect(text).toHaveValue(R0);
    expect(text).toHaveAttribute('readonly');
    for (const name of [/Load a \.dsl/, 'Start blank', 'Save'])
      expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Editing mode' })).toBeNull();
    expect(screen.queryByLabelText('File name')).toBeNull();
  });

  it('offers only the saved full test in the run panel', async () => {
    window.location.hash = '#/author';
    render(<App />);
    const run = await screen.findByRole('button', { name: /Run test/ });
    await waitFor(() => expect(run).not.toBeDisabled());
    fireEvent.click(run);
    const dialog = await screen.findByRole('dialog', { name: 'Run test' });
    const full = await within(dialog).findByRole('radio', { name: /Full test/ });
    expect(full).toHaveTextContent('288 scenarios × 3 runs');
    expect(within(dialog).queryByRole('radio', { name: /Quick check/ })).toBeNull();
    expect(within(dialog).queryByText(/More options/)).toBeNull();
    expect(dialog).toHaveTextContent('requirements/R0.dsl');
  });
});
