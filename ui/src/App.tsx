import { useEffect, useState } from 'react';

import { AppShell } from '@/layouts/AppShell';
import { AuthorPage } from '@/pages/AuthorPage';
import { LineagePage } from '@/pages/LineagePage';
import { ReviewPage } from '@/pages/ReviewPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import type { FileSource } from '@/services/workspace';
import { DraftProvider } from '@/state/DraftContext';
import { useRoute } from '@/state/route';
import { WorkspaceProvider } from '@/state/WorkspaceContext';
import { STUDY } from '@/study/config';
import { startLog } from '@/study/log';
import { loadSession, type StudySession } from '@/study/session';
import { installClickLog } from '@/study/clickLog';
import { ended as studyEnded, onEnded } from '@/study/ended';
import { EndScreen } from '@/study/EndScreen';
import { StartScreen } from '@/study/StartScreen';
import { useStudyRouteLog } from '@/study/useStudyRouteLog';

function Screens() {
  const [route] = useRoute();
  useStudyRouteLog(route); // study build: screens and steps entered and left; no-op otherwise
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
  // study build: one participant per browser session, resumed after a reload
  const [session, setSession] = useState<StudySession | null>(() => {
    const s = STUDY ? loadSession() : null;
    if (s) startLog(s.id);
    return s;
  });
  // study build: every click on something interactive is logged (evidence opened)
  useEffect(() => (STUDY && session ? installClickLog() : undefined), [session]);
  // study build: the session ends at signing; from then on only the end screen shows
  const [finished, setFinished] = useState(() => (STUDY ? studyEnded() : null));
  useEffect(() => (STUDY ? onEnded(() => setFinished(studyEnded())) : undefined), []);
  if (STUDY && !session) return <StartScreen onStart={setSession} />;
  if (STUDY && session && finished) return <EndScreen ended={finished} participant={session.id} />;
  return (
    <WorkspaceProvider autoOpenExample={autoOpenExample} initialSource={initialSource}>
      <DraftProvider>
        <Screens />
      </DraftProvider>
    </WorkspaceProvider>
  );
}
