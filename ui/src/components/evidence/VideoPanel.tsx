import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/Button';
import { FileName } from '@/components/ui/Section';
import type { RoundSummary } from '@/domain/lineage';
import { KNOWN_FILES, sortFrames } from '@/services/workspace';
import { useWorkspace } from '@/state/WorkspaceContext';

/**
 * The round's representative video: the H.264 file when the run has one,
 * else the original. The original is MPEG-4 part 2 in most runs, which no
 * browser decodes; when playback fails the saved frames are offered as a
 * scrubber instead, and the reason is stated. Never autoplays.
 */
export function VideoPanel({ round }: { round: RoundSummary }) {
  const { mediaUrl } = useWorkspace();
  const file = round.files.includes(KNOWN_FILES.videoH264)
    ? KNOWN_FILES.videoH264
    : round.files.includes(KNOWN_FILES.video)
      ? KNOWN_FILES.video
      : null;
  const frames = useMemo(
    () => sortFrames(round.files.filter((f) => f.startsWith(`${KNOWN_FILES.framesDir}/`))),
    [round.files],
  );
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [explain, setExplain] = useState(false);
  const explainId = useId();
  const scenario =
    round.meta.worst_phenotype ?? (round.meta.best_phenotype as string | undefined) ?? null;

  useEffect(() => {
    let live = true;
    setUrl(null);
    setFailed(false);
    if (file)
      mediaUrl(round, file).then(
        (u) => live && setUrl(u),
        () => live && setFailed(true),
      );
    return () => {
      live = false;
    };
  }, [file, mediaUrl, round]);

  if (!file && !frames.length) {
    return (
      <EmptyState title="No video for this round">
        The run folder has neither <FileName>{KNOWN_FILES.video}</FileName> nor saved frames.
      </EmptyState>
    );
  }

  return (
    <figure className="m-0 flex flex-col gap-2">
      {file ? (
        <figcaption className="flex flex-col gap-1.5 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <FileName>{file}</FileName>
            <button
              type="button"
              aria-expanded={explain}
              aria-controls={explainId}
              title="What does “best scenario” mean?"
              onClick={() => setExplain((v) => !v)}
              className="rounded-sm px-1 text-sm leading-none font-semibold text-human hover:bg-human-soft"
            >
              <span aria-hidden="true">✱</span>
              <span className="sr-only">What does “best scenario” mean?</span>
            </button>
          </span>
          {explain ? (
            <span
              id={explainId}
              className="rounded-lg bg-surface-sunken px-3 py-2 text-xs leading-5 text-text"
            >
              <strong className="font-semibold">
                ✱ “Best” is from the search’s point of view, not the car’s.
              </strong>{' '}
              The search tries to make the requirement fail, so its <em>best</em> scenario is the
              one in which the car did <em>worst</em>: the hardest test case this run found. It is
              the only run recorded on video; every other run has its numbers and a trace, not
              footage.
              {scenario ? (
                <>
                  {' '}
                  In this run: <span className="font-mono">{scenario}</span>.
                </>
              ) : null}
            </span>
          ) : null}
        </figcaption>
      ) : null}
      {file && !failed ? (
        <video
          key={url ?? file}
          controls
          preload="metadata"
          playsInline
          className="w-full rounded-lg border border-border bg-surface-sunken"
          src={url ?? undefined}
          onError={() => setFailed(true)}
        >
          <track kind="captions" />
        </video>
      ) : null}
      {/* an unplayable video is replaced by its saved frames without comment; only when there
          are none is there anything to say (the fix - scripts.evolve.video - is in the README) */}
      {failed && !frames.length ? (
        <p className="text-sm text-text-muted">This browser cannot play the recorded video.</p>
      ) : null}
      {(failed || !file) && frames.length ? <FrameScrubber round={round} frames={frames} /> : null}
    </figure>
  );
}

function FrameScrubber({ round, frames }: { round: RoundSummary; frames: string[] }) {
  const { mediaUrl } = useWorkspace();
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    const frame = frames[index];
    if (frame)
      mediaUrl(round, frame).then(
        (u) => live && setUrl(u),
        () => live && setUrl(null),
      );
    return () => {
      live = false;
    };
  }, [frames, index, mediaUrl, round]);

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(
      () => setIndex((i) => (i + 1 < frames.length ? i + 1 : (setPlaying(false), i))),
      100,
    );
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, frames.length]);

  return (
    <div className="flex flex-col gap-2">
      {url ? (
        <img
          src={url}
          alt={`Frame ${index + 1} of ${frames.length} from the front camera`}
          className="w-full rounded-lg border border-border"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
          {playing ? 'Pause' : 'Play frames'}
        </Button>
        <label className="flex flex-1 items-center gap-2 text-xs text-text-muted">
          <span className="sr-only">Frame</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={index}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            className="w-full"
            aria-valuetext={`frame ${index + 1} of ${frames.length}`}
          />
          <span className="num whitespace-nowrap">
            {index + 1} / {frames.length}
          </span>
        </label>
      </div>
    </div>
  );
}
