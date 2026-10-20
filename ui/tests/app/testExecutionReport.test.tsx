import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';

import { fixtureSource, ROUND_2 } from '../helpers/memorySource';

describe('the Test Execution Report', () => {
  it('puts the workflow under the header, an instruction above each container, and one way on', async () => {
    render(<App autoOpenExample={false} initialSource={fixtureSource(true)} />);
    await screen.findAllByText('fixture workspace', {}, { timeout: 10_000 });
    await act(async () => {
      window.location.hash = `#/review/${ROUND_2}/2`;
    });
    await screen.findByRole('heading', { name: '2. Test Execution Report' });

    // the workflow line under the header: Overview, the requirement page, then the five steps
    const flow = screen.getByRole('navigation', { name: 'Workflow' });
    const names = [
      'Overview',
      'Requirements Compliance to Validate',
      'The requirement under test',
      'Example',
      'Test Execution Report',
      'Failure Analysis',
      'Obstacle triage',
      'Requirement revision',
    ];
    const stops = within(flow).getAllByRole('link');
    expect(stops).toHaveLength(names.length);
    names.forEach((name, i) => expect(stops[i]).toHaveTextContent(name));
    expect(within(flow).getByRole('link', { current: 'step' })).toHaveTextContent(
      'Test Execution Report',
    );
    expect(screen.queryByText(/^Run [0-9a-f]{32}/)).toBeNull();

    // context, explanation, then what to do - above each container
    const notes = screen.getAllByRole('note', { name: 'Instructions' });
    expect(notes).toHaveLength(3);
    expect(notes[0]).toHaveTextContent('A test case is one scenario');
    expect(notes[2]).toHaveTextContent('Distance');
    for (const n of notes) expect(n.textContent).toMatch(/→/);

    // what failed, beside the requirement
    expect(screen.getByRole('region', { name: 'Where it failed' })).toBeInTheDocument();

    // optional actions are icons, named; the way on is one centred button
    for (const name of [
      'Download the test cases (CSV)',
      'Download every run (CSV)',
      'Download the raw simulations.csv',
      'Expand every test case',
    ])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See Failure Analysis →' })).toBeInTheDocument();
  });

  it('has the worked example on its own page, between steps 1 and 2', async () => {
    window.location.hash = '#/';
    render(<App autoOpenExample={false} initialSource={fixtureSource(true)} />);
    await screen.findAllByText('fixture workspace', {}, { timeout: 10_000 });
    await act(async () => {
      window.location.hash = `#/review/${ROUND_2}/example`;
    });
    await screen.findByRole('heading', { name: 'Example: the best scenario' });
    const flow = screen.getByRole('navigation', { name: 'Workflow' });
    expect(within(flow).getByRole('link', { current: 'step' })).toHaveTextContent('Example');
    expect(await screen.findByRole('region', { name: 'The best scenario' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'Instructions' })).toHaveTextContent('best scenario');
    expect(screen.getByRole('link', { name: '← Back' })).toHaveAttribute(
      'href',
      `#/review/${ROUND_2}/1`,
    );
    expect(screen.getByRole('link', { name: 'See Test Execution Report →' })).toHaveAttribute(
      'href',
      `#/review/${ROUND_2}/2`,
    );
  });
});
