import 'driver.js/dist/driver.css';

import { driver } from 'driver.js';
import { useCallback, useEffect } from 'react';

import type { Route } from '@/state/route';
import { STUDY } from '@/study/config';
import { logEvent } from '@/study/log';

import { tourKey, tourOf } from './tours';

const SEEN = (key: string) => `real.tour.seen.${STUDY ? 'study' : 'tool'}.${key}`;

function seen(key: string): boolean {
  try {
    return window.localStorage.getItem(SEEN(key)) === '1';
  } catch {
    return true; // without storage, never start on its own
  }
}

function markSeen(key: string): void {
  try {
    window.localStorage.setItem(SEEN(key), '1');
  } catch {
    // the tour may start again on this page; harmless
  }
}

/** The tour on screen, if any: in the study, leaving its page closes it (no stale tour). */
let active: { destroy: () => void; leave: () => void } | null = null;

/** Run the tour of a page, from its first stop that is on screen. */
export function startTour(key: string): void {
  const steps = tourOf(key)
    .filter((s) => s.element === null || document.querySelector(s.element))
    .map((s) => ({
      element: s.element ?? undefined,
      popover: { title: s.title, description: s.text },
    }));
  if (!steps.length) return;
  if (STUDY) logEvent({ screen: 'tour', event: 'tour_started', target: key });
  let reached = 0;
  let skipped = false;
  let leftPage = false;
  // recorded once, however the tour ends (Done, Skip, Escape, leaving the page): a Skip
  // pressed while the tour is still drawing does not always reach onDestroyed
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    active = null;
    markSeen(key);
    if (STUDY)
      logEvent({
        screen: 'tour',
        event: 'tour_closed',
        target: key,
        new: { stops_seen: reached, stops: steps.length, skipped, left_page: leftPage },
      });
  };
  const tour = driver({
    steps,
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    popoverClass: 'real-tour',
    overlayColor: '#172033',
    overlayOpacity: 0.45,
    stagePadding: 6,
    stageRadius: 10,
    smoothScroll: true,
    allowKeyboardControl: true,
    // "Skip tour" on every stop but the last (there, Done ends it)
    onPopoverRender: (popover, { state }) => {
      if ((state.activeIndex ?? 0) >= steps.length - 1) return;
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'real-tour-skip';
      skip.textContent = 'Skip tour';
      skip.addEventListener('click', () => {
        skipped = true;
        finish();
        tour.destroy();
      });
      popover.footer.insertBefore(skip, popover.footerButtons);
    },
    onHighlightStarted: (_el, _step, { state }) => {
      reached = Math.max(reached, (state.activeIndex ?? 0) + 1);
    },
    onDestroyed: finish,
  });
  active = {
    destroy: () => tour.destroy(),
    leave: () => {
      leftPage = true;
      finish();
      tour.destroy();
    },
  };
  tour.drive();
}

/**
 * The tour of the page a route shows: started once on a page's first visit
 * (remembered per browser), and on demand from the header. Never on its own
 * under test.
 */
export function useTour(route: Route): () => void {
  const key = tourKey(route);
  useEffect(() => {
    if (!key || seen(key) || import.meta.env?.MODE === 'test') return;
    // let the page draw first: its parts are what the tour points at
    const t = window.setTimeout(() => startTour(key), 900);
    return () => {
      window.clearTimeout(t);
      // the study: a tour still open when the participant leaves its page closes with it
      if (STUDY) active?.leave();
    };
  }, [key]);
  return useCallback(() => {
    if (key) startTour(key);
  }, [key]);
}
