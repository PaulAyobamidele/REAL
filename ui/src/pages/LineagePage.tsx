import { Fragment } from 'react';

import { EmptyState } from '@/components/feedback';
import { ChangeRow, RoundRow } from '@/components/lineage/RoundRow';
import { KindChip } from '@/components/ui/Chip';
import { links, requirementVersions } from '@/domain/lineage';
import { useWorkspace } from '@/state/WorkspaceContext';

/** The rounds of the workspace, oldest first, with the change between each pair. */
export function LineagePage() {
  const { workspace, state } = useWorkspace();
  if (!workspace) {
    return (
      <EmptyState title="No workspace loaded" action={<a href="#/">Load a workspace</a>}>
        {state.status === 'loading' ? `Loading ${state.label}…` : null}
      </EmptyState>
    );
  }
  const rounds = workspace.rounds;
  const versions = requirementVersions(rounds);
  const chain = links(rounds);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl lg:text-3xl">Rounds</h1>
        <p className="prose-width text-base text-text-muted">
          Oldest first. Same letter, same requirement.
        </p>
        <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Change kinds">
          {(['S', 'R', 'D', 'T'] as const).map((k) => (
            <li key={k}>
              <KindChip kind={k} long />
            </li>
          ))}
        </ul>
      </header>
      {rounds.length === 0 ? (
        <EmptyState title="No rounds in this workspace" />
      ) : (
        <ol className="flex flex-col" aria-label="Rounds in order">
          {rounds.map((round, i) => (
            <Fragment key={round.id}>
              {i > 0 && chain[i - 1] ? (
                <li aria-label={`Change between round ${i} and round ${i + 1}`}>
                  <ChangeRow link={chain[i - 1]!} />
                </li>
              ) : null}
              <li>
                <RoundRow round={round} version={versions.get(round.id) ?? null} />
              </li>
            </Fragment>
          ))}
        </ol>
      )}
      {workspace.broken.length ? (
        <p className="text-sm text-text-muted">
          Not in the chain (unreadable): {workspace.broken.map((b) => b.dir).join(', ')}. See the
          Workspace screen.
        </p>
      ) : null}
    </div>
  );
}
