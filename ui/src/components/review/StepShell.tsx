import type { ReactNode } from 'react';

import { reviewHash, STEP_COUNT } from '@/state/route';
import { cx } from '@/utils/format';

import type { StepProgress } from '@/domain/reviewProgress';

import { ProgressTracker } from './ProgressTracker';
import { STEP_CAPTIONS, STEP_NAMES } from './stepNames';

export { STEP_CAPTIONS, STEP_NAMES } from './stepNames';

/**
 * The frame of the five-step review: the progress tracker, a title, one line under it,
 * and two round controls that float bottom right so Back / Next are always
 * in reach. The steps themselves live in the top bar.
 */
export function StepShell({
  runId,
  step,
  roundLabel,
  progress,
  children,
}: {
  runId: string;
  step: number;
  roundLabel: ReactNode;
  /** Live status per step for the progress tracker above the page. */
  progress: StepProgress[];
  children: ReactNode;
}) {
  const name = STEP_NAMES[step - 1] ?? '';
  const back = () => (window.location.hash = reviewHash(runId, step - 1));
  const next = () => (window.location.hash = reviewHash(runId, step + 1));
  return (
    <div className="-mt-6 flex min-w-0 flex-col gap-8">
      <ProgressTracker runId={runId} step={step} steps={progress} />
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-xs font-medium text-text-faint">{roundLabel}</p>
        <h1 className="text-2xl lg:text-3xl">
          <span className="text-text-faint">{step}.</span> {name}
        </h1>
        <p className="prose-width text-base text-text-muted">{STEP_CAPTIONS[step - 1]}</p>
      </header>
      {children}
      <div className="fixed right-5 bottom-5 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={back}
          disabled={step <= 1}
          aria-label="Back"
          title="Back"
          className={cx(
            'float-btn bg-surface-raised/80 text-text',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 10l4-4 4 4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={next}
          disabled={step >= STEP_COUNT}
          aria-label="Next"
          title="Next"
          className="float-btn bg-human text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
