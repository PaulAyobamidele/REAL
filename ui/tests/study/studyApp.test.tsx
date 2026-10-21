import './memoryStorage';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as StudyConfig from '@/study/config';

import { App } from '@/App';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

describe('the study build', () => {
  it('opens on the start screen until a participant has started', () => {
    window.localStorage.clear();
    render(<App autoOpenExample={false} />);
    expect(screen.getByRole('heading', { name: 'REAL' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Screens' })).toBeNull();
  });

  it('resumes a started session and shows the participant on the normal pages', () => {
    window.localStorage.setItem(
      'real-av.study.session',
      JSON.stringify({ id: 'S-7K3Q', expertise: 'Student', started_at: '', build: 'dev' }),
    );
    render(<App autoOpenExample={false} />);
    expect(screen.getByRole('navigation', { name: 'Screens' })).toBeInTheDocument();
    expect(screen.getByText('S-7K3Q')).toBeInTheDocument();
  });

  it('ends at signing: from then on only the thank-you screen, also after a reload', () => {
    window.localStorage.setItem(
      'real-av.study.session',
      JSON.stringify({ id: 'S-7K3Q', expertise: 'Student', started_at: '', build: 'dev' }),
    );
    window.localStorage.setItem(
      'real-av.study.ended.S-7K3Q',
      JSON.stringify({ zipName: 'study_S-7K3Q.zip', files: { 'study_S-7K3Q/a.txt': 'x' }, at: '' }),
    );
    render(<App autoOpenExample={false} />);
    expect(screen.getByRole('heading', { name: 'Thank you' })).toBeInTheDocument();
    expect(screen.getByText(/study_S-7K3Q\.zip/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Screens' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download your copy again' }));
  });
});
