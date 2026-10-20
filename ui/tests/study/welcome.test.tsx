import './memoryStorage';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import type * as StudyConfig from '@/study/config';
import { loadSession } from '@/study/session';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

describe('the REAL logo in the study build', () => {
  it('leads back to the welcome page, where the session goes on', async () => {
    window.localStorage.setItem(
      'real-av.study.session',
      JSON.stringify({ id: 'S-7K3Q', expertise: 'Robotics', started_at: '', build: 'dev' }),
    );
    window.location.hash = '#/overview';
    render(<App autoOpenExample={false} />);
    const logo = await screen.findByRole('link', { name: 'REAL: back to the first page' });
    expect(logo).toHaveAttribute('href', '#/welcome');

    await act(async () => {
      window.location.hash = '#/welcome';
    });
    // the same participant, the expertise kept, Continue - never a new session
    expect(await screen.findByRole('heading', { level: 1, name: 'REAL' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your expertise')).toHaveValue('Robotics');
    expect(screen.getByText('S-7K3Q')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your expertise'), {
      target: { value: 'Robotics, safety' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(window.location.hash).toBe('#/overview');
    expect(loadSession()).toMatchObject({ id: 'S-7K3Q', expertise: 'Robotics, safety' });
  });
});
