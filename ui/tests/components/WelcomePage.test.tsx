import '../study/memoryStorage';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';
import { loadExpertise } from '@/state/expertise';

describe("the normal tool's welcome page", () => {
  it('shows REAL and what it does, asks for the expertise, then leads to the overview', () => {
    window.localStorage.removeItem('real.tool.expertise');
    window.location.hash = '#/welcome';
    render(<App autoOpenExample={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'REAL' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'A Tool for Refining Autonomous Systems Requirements through Compliance Failure Analysis',
      ),
    ).toBeInTheDocument();
    const steps = screen.getByRole('list');
    expect(within(steps).getAllByRole('listitem')).toHaveLength(4);
    const start = screen.getByRole('button', { name: 'Get started →' });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your expertise'), {
      target: { value: 'Legal Compliance' },
    });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(window.location.hash).toBe('#/overview');
    expect(loadExpertise()).toBe('Legal Compliance');
  });
});
