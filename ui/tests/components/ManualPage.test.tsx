import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { parseRoute, routeHash } from '@/state/route';

describe('the REAL-DSL manual', () => {
  it('is its own page, in the top bar, with every section listed', () => {
    expect(parseRoute('#/manual')).toEqual({ screen: 'manual' });
    expect(routeHash({ screen: 'manual' })).toBe('#/manual');
    window.location.hash = '#/manual';
    render(<App autoOpenExample={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'REAL-DSL Manual' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Screens' });
    expect(within(nav).getByRole('link', { name: 'Manual' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const sections = screen.getByRole('navigation', { name: 'Manual sections' });
    for (const name of ['Name', 'Synopsis', 'Keywords', 'Diagnostics', 'Examples'])
      expect(within(sections).getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'REAL-DSL example' }).length).toBeGreaterThan(3);
  });
});
