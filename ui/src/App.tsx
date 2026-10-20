import { useEffect, useState } from 'react';

import { AppShell } from '@/layouts/AppShell';
import { AuthorPage } from '@/pages/AuthorPage';
import { LineagePage } from '@/pages/LineagePage';
import { ManualPage } from '@/pages/ManualPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { WelcomePage } from '@/pages/WelcomePage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import type { FileSource } from '@/services/workspace';
import { DraftProvider } from '@/state/DraftContext';
import { routeHash, useRoute } from '@/state/route';
import { WorkflowProvider } from '@/state/workflow';
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
  // the study has no Workspace: its address leads to the requirement under test
  const noWorkspace = STUDY && route.screen === 'workspace';
  useEffect(() => {
    if (noWorkspace) window.location.replace(routeHash({ screen: 'author' }));
  }, [noWorkspace]);
  return (
    <WorkflowProvider>
      <AppShell route={route}>
        {route.screen === 'overview' ? <OverviewPage /> : null}
        {route.screen === 'workspace' && !STUDY ? (
          <WorkspacePage focusRuns={route.runs ?? null} />
        ) : null}
        {route.screen === 'lineage' ? <LineagePage /> : null}
        {route.screen === 'author' ? <AuthorPage /> : null}
        {route.screen === 'manual' ? <ManualPage /> : null}
        {route.screen === 'example' ? (
          <ReviewPage key={`${route.runId}:example`} runId={route.runId} step={1} example />
        ) : null}
        {route.screen === 'review' ? (
          <ReviewPage key={route.runId} runId={route.runId} step={route.step} focus={route.focus} />
        ) : null}
      </AppShell>
    </WorkflowProvider>
  );
}

export function App({
  autoOpenExample = true,
  initialSource = null,
}: {
  autoOpenExample?: boolean;
  initialSource?: FileSource | null;
}) {
  const [route] = useRoute();
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
  // the normal tool's first page: REAL, what it does, the user's expertise
  if (!STUDY && route.screen === 'welcome') return <WelcomePage />;
  if (STUDY && !session) return <StartScreen onStart={setSession} />;
  // the REAL logo leads back to the welcome page; the session goes on
  if (STUDY && session && !finished && route.screen === 'welcome')
    return <StartScreen existing={session} onStart={setSession} />;
  if (STUDY && session && finished) return <EndScreen ended={finished} participant={session.id} />;
  return (
    <WorkspaceProvider autoOpenExample={autoOpenExample} initialSource={initialSource}>
      <DraftProvider>
        <Screens />
      </DraftProvider>
    </WorkspaceProvider>
  );
}
