import { useCallback, useSyncExternalStore } from 'react';

/**
 * Three screens and a step, kept in the URL hash so that reload and the
 * browser's Back button keep their place:
 *   #/            the workspace (what is loaded, from where)
 *   #/?runs=a,b   the workspace with these runs first (the runs of a requirement)
 *   #/lineage     the chain of rounds
 *   #/author      write a requirement (the form, gated by the project's parser)
 *   #/review/<run id>/<step 1-5>[?focus=<evidence filter | obstacle:<id>>]
 * `focus` is how a number elsewhere links into the evidence table.
 */
export type Route =
  | { screen: 'workspace'; runs?: string[] }
  | { screen: 'lineage' }
  | { screen: 'author' }
  | { screen: 'review'; runId: string; step: number; focus?: string };

export const STEP_COUNT = 5;

export function parseRoute(hash: string): Route {
  const [pathPart, query = ''] = hash.replace(/^#/, '').split('?');
  const path = (pathPart ?? '').split('/').filter(Boolean);
  if (path[0] === 'lineage') return { screen: 'lineage' };
  if (path[0] === 'author') return { screen: 'author' };
  if (path[0] === 'review' && path[1]) {
    const step = Number.parseInt(path[2] ?? '1', 10);
    const focus = new URLSearchParams(query).get('focus');
    return {
      screen: 'review',
      runId: decodeURIComponent(path[1]),
      step: Number.isFinite(step) ? Math.min(STEP_COUNT, Math.max(1, step)) : 1,
      ...(focus ? { focus } : {}),
    };
  }
  const runs = new URLSearchParams(query).get('runs');
  return runs
    ? { screen: 'workspace', runs: runs.split(',').filter(Boolean) }
    : { screen: 'workspace' };
}

export function routeHash(route: Route): string {
  switch (route.screen) {
    case 'workspace':
      return route.runs?.length ? `#/?runs=${route.runs.map(encodeURIComponent).join(',')}` : '#/';
    case 'lineage':
      return '#/lineage';
    case 'author':
      return '#/author';
    case 'review': {
      const base = `#/review/${encodeURIComponent(route.runId)}/${route.step}`;
      return route.focus ? `${base}?focus=${encodeURIComponent(route.focus)}` : base;
    }
  }
}

export function reviewHash(runId: string, step: number, focus?: string): string {
  return routeHash({ screen: 'review', runId, step, ...(focus ? { focus } : {}) });
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function snapshot(): string {
  return window.location.hash;
}

export function useRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '#/');
  const navigate = useCallback((route: Route) => {
    const next = routeHash(route);
    if (window.location.hash !== next) window.location.hash = next;
  }, []);
  return [parseRoute(hash), navigate];
}
