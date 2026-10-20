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
    ).toEqual(['Manual']);
    expect(screen.getByText(/^Participant/)).toBeInTheDocument();
    const flow = screen.getByRole('navigation', { name: 'Workflow' });
    expect(within(flow).getByRole('link', { current: 'step' })).toHaveTextContent(
      'Requirements Compliance to Validate',
    );
  });

  it('shows the requirement under test read only, without the editing controls', async () => {
    window.location.hash = '#/author';
    render(<App />);
    const text = await screen.findByLabelText('Requirement text');
    // the same editor, read only: highlighted, no suggestions, no editing
    await waitFor(() => expect(text.textContent).toContain(R0.trim().split('\n')[0]!.trim()));
    expect(text).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByText('read only')).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Instructions' })).toHaveTextContent(
      'This requirement has already been tested',
    );
    for (const name of [/Load a \.dsl/, 'Start blank', 'Save'])
      expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Editing mode' })).toBeNull();
    expect(screen.queryByLabelText('File name')).toBeNull();
  });

  it('opens the review at once, at the requirement under test: no run panel', async () => {
    window.location.hash = '#/author';
    render(<App />);
    const run = await screen.findByRole('button', { name: /Start Running Compliance Test/ });
    await waitFor(() => expect(run).not.toBeDisabled());
    fireEvent.click(run);
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/review\/[0-9a-f]{32}\/1$/));
    expect(screen.queryByRole('dialog', { name: 'Compliance test' })).toBeNull();
  });
});
