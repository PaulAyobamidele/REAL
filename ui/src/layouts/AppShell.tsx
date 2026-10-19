import type { ReactNode } from 'react';

import { routeHash, type Route } from '@/state/route';
import { useWorkspace } from '@/state/WorkspaceContext';
import { STUDY } from '@/study/config';
import { authorTitle } from '@/study/labels';
import { loadSession } from '@/study/session';
import { cx } from '@/utils/format';

/**
 * One top bar for everything: the name, the two screens, and - inside a
 * review - the five steps. Nothing else on the chrome.
 */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { workspace } = useWorkspace();
  const inReview = route.screen === 'review';
  return (
    <div className="min-h-dvh bg-surface text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="app-header sticky top-0 z-30">
        <div className="mx-auto flex min-h-12 max-w-[80rem] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2 lg:px-8">
          <a
            href={STUDY ? routeHash({ screen: 'overview' }) : '#/'}
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white no-underline hover:no-underline"
          >
            <span aria-hidden="true" className="inline-block size-5 rounded-md bg-header-marker" />
            REAL
          </a>
          <nav aria-label="Screens" className="flex items-center gap-0.5">
            {[
              {
                route: { screen: 'overview' } as Route,
                label: 'Overview',
                active: route.screen === 'overview',
              },
              // the study has no Workspace: its one round opens from the run
              ...(STUDY
                ? []
                : [
                    {
                      route: { screen: 'workspace' } as Route,
                      label: 'Workspace',
                      active: route.screen === 'workspace',
                    },
                  ]),
              {
                route: { screen: 'author' } as Route,
                label: authorTitle(),
                active: route.screen === 'author',
              },
              {
                route: { screen: 'lineage' } as Route,
                label: 'Rounds',
                active: route.screen === 'lineage',
              },
              {
                route: { screen: 'manual' } as Route,
                label: 'Manual',
                active: route.screen === 'manual',
              },
            ].map((item) => (
              <a
                key={item.label}
                href={routeHash(item.route)}
                aria-current={item.active ? 'page' : undefined}
                className={cx(
                  // white on the header (13.9:1); the active page is bold and carries a white bar
                  'border-b-[3px] px-2.5 py-1 text-sm text-white no-underline transition-colors duration-fast hover:no-underline',
                  item.active
                    ? 'border-header-marker font-semibold'
                    : 'border-transparent opacity-85 hover:border-white/50 hover:opacity-100',
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>
          {STUDY ? (
            <span className="ml-auto max-w-[20rem] truncate text-xs text-white">
              Participant <span className="font-mono font-semibold">{loadSession()?.id}</span>
            </span>
          ) : inReview ? (
            <span className="ml-auto max-w-[20rem] truncate text-xs text-white">
              Reviewing run <span className="font-mono">{route.runId.slice(0, 8)}</span>
              {workspace?.source.isExample ? ' · example data' : ''}
            </span>
          ) : workspace ? (
            <span className="ml-auto max-w-[20rem] truncate text-xs text-white">
              {workspace.source.label}
              {workspace.source.isExample ? ' · example data' : ''}
            </span>
          ) : null}
        </div>
      </header>
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
