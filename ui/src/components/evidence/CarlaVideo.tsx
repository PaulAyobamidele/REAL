import { FileErrorNotice, Loading } from '@/components/feedback';
import type { RoundSummary } from '@/domain/lineage';
import { useAsync } from '@/hooks/useAsync';
import { useWorkspace } from '@/state/WorkspaceContext';
import { STUDY } from '@/study/config';
import { logEvent } from '@/study/log';

/** In the study, playing the recording is evidence opened: logged like a click. */
function logVideo(
  event: 'video_played' | 'video_paused' | 'video_ended',
  file: string,
  at: number,
) {
  if (!STUDY) return;
  logEvent({
    screen: window.location.hash.replace(/^#\/?/, '') || 'workspace',
    event,
    target: file,
    new: { at_s: Math.round(at * 10) / 10 },
  });
}

/** CARLA's camera recording of a test case, with what it is and is not. */
export function CarlaVideo({
  round,
  file,
  title = 'What the car’s camera saw',
}: {
  round: RoundSummary;
  file: string;
  title?: string;
}) {
  const { mediaUrl } = useWorkspace();
  const state = useAsync(() => mediaUrl(round, file), [round.dir, file]);
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2" aria-label="CARLA recording">
      <h3 className="text-sm font-semibold">{title}</h3>
      {state.status === 'ready' ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- simulator footage, no speech
        <video
          src={state.data}
          controls
          preload="metadata"
          onPlay={(e) => logVideo('video_played', file, e.currentTarget.currentTime)}
          onPause={(e) => logVideo('video_paused', file, e.currentTarget.currentTime)}
          onEnded={(e) => logVideo('video_ended', file, e.currentTarget.currentTime)}
          className="aspect-[4/3] w-full rounded-xl bg-black"
        />
      ) : state.status === 'error' ? (
        <FileErrorNotice error={state.error} />
      ) : (
        <Loading what={file} />
      )}
      <figcaption className="text-xs text-text-muted">
        CARLA camera recording of this test case. It is a separate re-run made for the video, not
        one of the counted runs, so its outcome can differ from theirs.
      </figcaption>
    </figure>
  );
}
