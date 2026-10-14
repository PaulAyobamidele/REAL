import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Notice } from '@/components/ui/Notice';
import { matchRequirement, projectRunsSource, type MatchResult } from '@/services/authoring';
import { routeHash } from '@/state/route';
import { useWorkspace } from '@/state/WorkspaceContext';
import { displayDate, displayPercent } from '@/utils/format';

/**
 * The project's runs that ran exactly the requirement being written, and a
 * way to them: the authoring helper compares goal trees with the project's
 * parser (comments and layout do not count, any real difference does), and
 * "Show these runs in the Workspace" opens artifacts/runs through the helper
 * - no folder picker needed - with these runs first.
 */
export function MatchingRuns({ text, parses }: { text: string; parses: boolean }) {
  const { workspace, open } = useWorkspace();
  const [state, setState] = useState<
    | { status: 'idle' | 'looking' }
    | { status: 'done'; result: MatchResult }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (!parses) {
      setState({ status: 'idle' });
      return;
    }
    let live = true;
    setState({ status: 'looking' });
    matchRequirement(text).then(
      (result) => live && setState({ status: 'done', result }),
      (e: Error) => live && setState({ status: 'error', message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [text, parses]);

  const show = async (ids: string[]) => {
    setOpenError(null);
    setOpening(true);
    try {
      const alreadyOpen = workspace && ids.every((id) => workspace.rounds.some((r) => r.id === id));
      if (!alreadyOpen) {
        const source = await projectRunsSource();
        if (!source) throw new Error('the authoring helper does not serve the project runs');
        await open(source);
      }
      window.location.hash = routeHash({ screen: 'workspace', runs: ids });
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  };

  const matches = state.status === 'done' ? state.result.matches : [];
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Results for this requirement">
      <h2 className="text-base font-semibold">Results for this requirement</h2>
      {state.status === 'idle' ? (
        <p className="text-sm text-text-muted">Shown once the requirement parses.</p>
      ) : null}
      {state.status === 'looking' ? (
        <p className="text-sm text-text-muted">Looking through the project&apos;s runs…</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="text-sm text-text-muted">The runs could not be searched: {state.message}</p>
      ) : null}
      {state.status === 'done' && !matches.length ? (
        <p className="text-sm text-text-muted">
          None of the {state.result.searched} runs in <code>artifacts/runs</code> used exactly this
          requirement. Press Run test to run it on the cluster.
        </p>
      ) : null}
      {matches.length ? (
        <>
          <p className="text-sm text-text-muted">
            {matches.length} of the {state.status === 'done' ? state.result.searched : ''} runs in{' '}
            <code>artifacts/runs</code> used exactly this requirement:
          </p>
          <ul className="flex flex-col gap-1.5">
            {matches.map((m) => (
              <li
                key={m.run_id}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-surface-sunken px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono font-semibold" title={m.run_id}>
                  {m.run_id.slice(0, 8)}…
                </span>
                {m.mode ? <Chip tone="neutral">{m.mode}</Chip> : null}
                <span className="text-text-faint">{displayDate(m.created_at)}</span>
                <span className="num basis-full text-text-muted">
                  {m.analysed
                    ? `${m.simulations ?? '?'} simulations · ${m.failures ?? '?'} failed${m.failure_rate != null ? ` (${displayPercent(m.failure_rate)})` : ''} · ${m.stalled ?? '?'} stopped and never moved`
                    : 'not analysed yet'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              busy={opening}
              onClick={() => show(matches.map((m) => m.run_id))}
            >
              Show these runs in the Workspace →
            </Button>
          </div>
          {openError ? <Notice tone="error">{openError}</Notice> : null}
        </>
      ) : null}
    </section>
  );
}
