import './memoryStorage';

import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Route } from '@/state/route';
import type * as StudyConfig from '@/study/config';

import { logEvent, logLines, startLog } from '@/study/log';
import { loadSession, newId } from '@/study/session';
import { StartScreen } from '@/study/StartScreen';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

beforeEach(() => window.localStorage.clear());

const events = (id: string) =>
  logLines(id)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { event: string; screen: string; participant: string });

describe('the participant', () => {
  it('gets a random anonymous ID without ambiguous characters', () => {
    const ids = new Set(Array.from({ length: 50 }, newId));
    expect(ids.size).toBeGreaterThan(45);
    for (const id of ids) expect(id).toMatch(/^S-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it('shows the tool, asks for expertise in words, and saves and logs the session', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} />);
    expect(screen.getByRole('heading', { level: 1, name: 'REAL' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'A Tool for Refining Autonomous Systems Requirements through Compliance Failure Analysis',
      ),
    ).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Start' });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Your expertise'), {
      target: { value: '  test pilot  ' },
    });
    fireEvent.click(start);
    const session = onStart.mock.calls[0]?.[0] as { id: string; expertise: string };
    expect(session.expertise).toBe('test pilot');
    expect(loadSession()?.id).toBe(session.id); // a reload resumes it
    expect(events(session.id)).toMatchObject([{ event: 'session_start', participant: session.id }]);
  });
});

describe('the log', () => {
  it('appends, never rewrites, and is kept per participant', () => {
    startLog('S-AAAA');
    logEvent({ screen: 'author', event: 'x' });
    startLog('S-BBBB');
    logEvent({ screen: 'author', event: 'y' });
    startLog('S-AAAA');
    logEvent({ screen: 'review/study_C1/4', event: 'z' });
    expect(events('S-AAAA').map((e) => e.event)).toEqual(['x', 'z']);
    expect(events('S-BBBB').map((e) => e.event)).toEqual(['y']);
  });

  it('records every screen and step entered and left', async () => {
    const { useStudyRouteLog } = await import('@/study/useStudyRouteLog');
    startLog('S-CCCC');
    const { rerender } = renderHook(({ route }) => useStudyRouteLog(route), {
      initialProps: { route: { screen: 'author' } as const } as {
        route: Route;
      },
    });
    rerender({ route: { screen: 'review', runId: 'study_C1', step: 2 } });
    expect(events('S-CCCC').map((e) => `${e.event} ${e.screen}`)).toEqual([
      'step_entered author',
      'step_left author',
      'step_entered review/study_C1/2',
    ]);
  });
});
