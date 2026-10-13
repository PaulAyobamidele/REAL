import type { ReactNode } from 'react';

import { routeHash, type Route } from '@/state/route';
import { useWorkspace } from '@/state/WorkspaceContext';
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
      <header className="glass sticky top-0 z-30 border-b border-border/70">
        <div className="mx-auto flex min-h-12 max-w-[80rem] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2 lg:px-8">
          <a
            href="#/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-text no-underline hover:no-underline"
          >
            <span
              aria-hidden="true"
              className="inline-block size-5 rounded-md bg-gradient-to-br from-human to-[#ff8a5c]"
            />
            real-av
          </a>
          <nav aria-label="Screens" className="flex items-center gap-0.5">
            {(
              [
                {
                  route: { screen: 'workspace' } as Route,
                  label: 'Workspace',
                  active: route.screen === 'workspace',
                },
                {
                  route: { screen: 'author' } as Route,
                  label: 'Write a requirement',
                  active: route.screen === 'author',
                },
                {
                  route: { screen: 'lineage' } as Route,
                  label: 'Rounds',
                  active: route.screen === 'lineage',
                },
              ] as const
            ).map((item) => (
              <a
                key={item.label}
                href={routeHash(item.route)}
                aria-current={item.active ? 'page' : undefined}
                className={cx(
                  'rounded-md px-2.5 py-1 text-sm no-underline transition-colors duration-fast hover:no-underline',
                  item.active ? 'bg-fill font-medium text-text' : 'text-text-muted hover:text-text',
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>
          {inReview ? (
            <span className="ml-auto text-xs text-text-muted">
              Reviewing run <span className="font-mono text-text">{route.runId.slice(0, 8)}</span>
              {workspace?.source.isExample ? ' · example data' : ''}
            </span>
          ) : workspace ? (
            <span className="ml-auto text-xs text-text-muted">
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
