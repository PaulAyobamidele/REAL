import type { ReactNode } from 'react';

import { WorkflowBar } from '@/components/review/WorkflowBar';
import { routeHash, type Route } from '@/state/route';
import { useWorkflow } from '@/state/workflow';
import { useTour } from '@/tour/useTour';
import { STUDY } from '@/study/config';
import { loadSession } from '@/study/session';
import { cx } from '@/utils/format';

/**
 * The chrome, kept simple: the header holds the name, the Manual and the
 * participant's ID (the normal tool: the Workspace, where saved rounds are
 * opened); under it, the workflow as a progress track (WorkflowBar), the
 * same on every page, scrolling with the page.
 */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const workflow = useWorkflow();
  // the page's guided tour: on its first visit, and from the header's ? (tour/useTour.ts)
  const tour = useTour(route);
  const links: { route: Route; label: string }[] = [
    ...(STUDY ? [] : [{ route: { screen: 'workspace' } as Route, label: 'Workspace' }]),
    { route: { screen: 'manual' }, label: 'Manual' },
  ];
  return (
    <div className="min-h-dvh bg-surface text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30">
        <div className="app-header">
          <div className="mx-auto flex min-h-12 max-w-[80rem] items-center gap-5 px-5 py-2 lg:px-8">
            <a
              // each tool's first page: its welcome page (REAL, the user's expertise)
              href={routeHash({ screen: 'welcome' })}
              aria-label="REAL: back to the first page"
              className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white no-underline hover:no-underline"
            >
              <span
                aria-hidden="true"
                className="inline-block size-5 rounded-md bg-header-marker"
              />
              REAL
            </a>
            <button
              type="button"
              onClick={tour}
              aria-label="Take the tour of this page"
              title="Take the tour of this page"
              className="ml-auto flex size-7 items-center justify-center rounded-full border border-white/60 text-sm font-semibold text-white transition-colors duration-fast hover:bg-white/15"
            >
              ?
            </button>
            <nav aria-label="Screens" className="flex items-center gap-0.5">
              {links.map((item) => {
                const active = route.screen === item.route.screen;
                return (
                  <a
                    key={item.label}
                    href={routeHash(item.route)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      // white on the header (13.9:1); the active page is bold and carries a white bar
                      'border-b-[3px] px-2.5 py-1 text-sm text-white no-underline transition-colors duration-fast hover:no-underline',
                      active
                        ? 'border-header-marker font-semibold'
                        : 'border-transparent opacity-85 hover:border-white/50 hover:opacity-100',
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>
            {STUDY ? (
              <span className="text-xs text-white">
                Participant <span className="font-mono font-semibold">{loadSession()?.id}</span>
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <WorkflowBar route={route} workflow={workflow} />
      <main
        id="main"
        className={cx(
          'mx-auto w-full px-5 pt-10 pb-24 lg:px-8',
          // writing a requirement is a two-pane editor, like Overleaf: it gets the screen
          route.screen === 'author' ? 'max-w-[112rem]' : 'max-w-[80rem]',
        )}
      >
        {children}
      </main>
    </div>
  );
}
