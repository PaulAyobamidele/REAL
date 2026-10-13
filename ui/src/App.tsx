import { AppShell } from '@/layouts/AppShell';
import { AuthorPage } from '@/pages/AuthorPage';
import { LineagePage } from '@/pages/LineagePage';
import { ReviewPage } from '@/pages/ReviewPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import type { FileSource } from '@/services/workspace';
import { DraftProvider } from '@/state/DraftContext';
import { useRoute } from '@/state/route';
import { WorkspaceProvider } from '@/state/WorkspaceContext';

function Screens() {
  const [route] = useRoute();
  return (
    <AppShell route={route}>
      {route.screen === 'workspace' ? <WorkspacePage focusRuns={route.runs ?? null} /> : null}
      {route.screen === 'lineage' ? <LineagePage /> : null}
      {route.screen === 'author' ? <AuthorPage /> : null}
      {route.screen === 'review' ? (
        <ReviewPage key={route.runId} runId={route.runId} step={route.step} focus={route.focus} />
      ) : null}
    </AppShell>
  );
}

export function App({
  autoOpenExample = true,
  initialSource = null,
}: {
  autoOpenExample?: boolean;
  initialSource?: FileSource | null;
}) {
  return (
    <WorkspaceProvider autoOpenExample={autoOpenExample} initialSource={initialSource}>
      <DraftProvider>
        <Screens />
      </DraftProvider>
    </WorkspaceProvider>
  );
}
