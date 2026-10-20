import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { parseRoute, routeHash } from '@/state/route';

describe('the overview', () => {
  it('has its own address and comes first in the top bar', () => {
    expect(parseRoute('#/overview')).toEqual({ screen: 'overview' });
    expect(routeHash({ screen: 'overview' })).toBe('#/overview');
    window.location.hash = '#/overview';
    render(<App autoOpenExample={false} />);
    const nav = screen.getByRole('navigation', { name: 'Screens' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Workspace', 'Manual']);
    // the logo: the tool's first page, its welcome
    expect(screen.getByRole('link', { name: 'REAL: back to the first page' })).toHaveAttribute(
      'href',
      '#/welcome',
    );
    // the workflow line under the header starts here
    const flow = screen.getByRole('navigation', { name: 'Workflow' });
    expect(within(flow).getByRole('link', { current: 'step' })).toHaveTextContent('Overview');
  });

  it('explains how the tool works and leads on to the workspace', () => {
    window.location.hash = '#/overview';
    render(<App autoOpenExample={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'How REAL works' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One round, step by step' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Continue to the Workspace/ })).toHaveAttribute(
      'href',
      '#/',
    );
  });
});
