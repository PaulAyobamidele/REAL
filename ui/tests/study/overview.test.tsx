import './memoryStorage';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '@/App';
import type * as StudyConfig from '@/study/config';
import { StartScreen } from '@/study/StartScreen';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

describe('the study overview', () => {
  it('describes the study and what the participant will do, without hints', () => {
    window.localStorage.setItem(
      'real-av.study.session',
      JSON.stringify({ id: 'S-7K3Q', expertise: 'Legal Compliance', started_at: '', build: 'dev' }),
    );
    window.location.hash = '#/overview';
    render(<App autoOpenExample={false} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /REAL's architecture/ })).toBeInTheDocument();
    // no instruction video is set for the study yet: no card that plays nothing
    expect(screen.queryByRole('region', { name: 'Help video' })).toBeNull();
    for (const name of [
      'What this study is about',
      'The system under test',
      'What you will do',
      'What is recorded',
    ])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(
      screen.getByRole('link', { name: /Continue to Requirements Compliance to Validate/ }),
    ).toHaveAttribute('href', '#/author');
    // nothing that points at the tool's judgement or at pre-computed runs
    expect(document.body.textContent).not.toMatch(
      /supported|pre-computed|replay|verdicts? hidden/i,
    );
  });

  it('is where a participant lands after Start', () => {
    window.location.hash = '#/';
    render(<StartScreen onStart={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your expertise'), { target: { value: 'Robotics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(window.location.hash).toBe('#/overview');
  });
});
