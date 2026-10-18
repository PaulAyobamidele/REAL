import { useEffect, useRef } from 'react';

import type { Route } from '@/state/route';

import { STUDY } from './config';
import { logEvent } from './log';

function where(route: Route): string {
  if (route.screen !== 'review') return route.screen;
  // ?focus= is how a number links into its evidence: part of where the participant went
  return `review/${route.runId}/${route.step}${route.focus ? `?focus=${route.focus}` : ''}`;
}

/** Study build: every screen or step entered and left goes into the log. */
export function useStudyRouteLog(route: Route): void {
  const last = useRef<string | null>(null);
  const now = where(route);
  useEffect(() => {
    if (!STUDY || last.current === now) return;
    if (last.current) logEvent({ screen: last.current, event: 'step_left' });
    logEvent({ screen: now, event: 'step_entered' });
    last.current = now;
  }, [now]);
}
