import { Button } from '@/components/ui/Button';

import type { Ended } from './ended';
import { sendSession } from './signing';
import { StudyHeader } from './StudyHeader';
import { uploadConfigured } from './upload';
import { downloadZip } from './zip';

/**
 * The study's last screen: the session is over. The zip is sent to the
 * research team (when the site has online storage) and downloaded as a backup;
 * if sending fails, it can be tried again, or the file sent by hand.
 */
export function EndScreen({ ended, participant }: { ended: Ended; participant: string }) {
  const up = ended.upload;
  return (
    <>
      <StudyHeader participant={participant} />
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-xl flex-col justify-center gap-5 px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Thank you</h1>
        {uploadConfigured && up?.status === 'sent' ? (
          <p className="text-sm text-text" role="status">
            Your session is complete and <strong>has been sent to the research team</strong>. A
            copy, <span className="font-mono">{ended.zipName}</span>, was also downloaded to your
            computer; you do not need to send it.
          </p>
        ) : uploadConfigured && up?.status === 'sending' ? (
          <p className="text-sm text-text" role="status">
            Your session is complete. Sending it to the research team…
          </p>
        ) : uploadConfigured && up?.status === 'failed' ? (
          <div className="flex flex-col gap-3" role="alert">
            <p className="text-sm text-text">
              Your session is complete, but <strong>it could not be sent</strong> to the research
              team ({up.message}). Try again below; if it still fails, please send the downloaded
              file <span className="font-mono">{ended.zipName}</span> to the researcher.
            </p>
            <div>
              <Button
                variant="primary"
                onClick={() => void sendSession(up.car, up.signedAt, ended.files)}
              >
                Try sending again
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text">
            Your session is complete. The file <span className="font-mono">{ended.zipName}</span>{' '}
            has been downloaded. Please send it to the researcher.
          </p>
        )}
        <p className="text-sm text-text-muted">
          Your anonymous ID:{' '}
          <span className="font-mono font-semibold text-text">{participant}</span>
        </p>
        <div>
          <Button onClick={() => downloadZip(ended.zipName, ended.files)}>
            Download your copy again
          </Button>
        </div>
      </main>
    </>
  );
}
