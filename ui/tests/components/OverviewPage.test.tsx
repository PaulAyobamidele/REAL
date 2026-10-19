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
    ).toEqual(['Overview', 'Workspace', 'Write a requirement', 'Rounds']);
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
