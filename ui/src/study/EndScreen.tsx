import { Button } from '@/components/ui/Button';

import type { Ended } from './ended';
import { StudyHeader } from './StudyHeader';
import { downloadZip } from './zip';

/** The study's last screen: the session is over; the zip goes to the researcher. */
export function EndScreen({ ended, participant }: { ended: Ended; participant: string }) {
  return (
    <>
      <StudyHeader participant={participant} />
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-xl flex-col justify-center gap-5 px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Thank you</h1>
        <p className="text-sm text-text">
          Your session is complete. The file <span className="font-mono">{ended.zipName}</span> has
          been downloaded. Please send it to the researcher.
        </p>
        <p className="text-sm text-text-muted">
          Nothing was uploaded. Your anonymous ID:{' '}
          <span className="font-mono font-semibold text-text">{participant}</span>
        </p>
        <div>
          <Button onClick={() => downloadZip(ended.zipName, ended.files)}>Download it again</Button>
        </div>
      </main>
    </>
  );
}
