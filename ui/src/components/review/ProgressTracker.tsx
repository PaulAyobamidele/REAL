import type { StepProgress } from '@/domain/reviewProgress';
import { reviewHash } from '@/state/route';
import { cx } from '@/utils/format';

import { STEP_NAMES } from './stepNames';

/**
 * The review's progress, above every step: five nodes on one track, each
 * with its name and a line of live status. Done steps carry a tick, the
 * current one an accent ring, triage a ring that fills as verdicts are
 * made, and an amber dot marks what needs attention on a step. The track
 * fills up to the current step. That fill and the triage ring are the only
 * motion, and only for readers who allow it. Every node is a link.
 *
 * Narrow screens get a compact form: the step in words, five segments, and
 * the current step's status.
 */
export function ProgressTracker({
  runId,
  step,
  steps,
}: {
  runId: string;
  step: number;
  steps: StepProgress[];
}) {
  const done = steps.filter((s) => s.state === 'done').length;
  const current = steps.find((s) => s.step === step);
  const fill = steps.length > 1 ? (step - 1) / (steps.length - 1) : 0;
  const motion = 'motion-safe:transition-all motion-safe:duration-step motion-safe:ease-standard';

  return (
    <nav
      aria-label="Review progress"
      className="glass sticky top-14 z-20 rounded-2xl px-5 py-3 shadow-card ring-1 ring-border/60"
    >
      {/* compact: below md */}
      <div className="flex flex-col gap-1.5 md:hidden">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-text">
            Step {step} of {steps.length} · {STEP_NAMES[step - 1]}
          </span>
          <span className="text-text-muted">{done} done</span>
        </div>
        <ol className="flex gap-1" aria-label="Steps">
          {steps.map((s) => (
            <li key={s.step} className="flex-1">
              <a
                href={reviewHash(runId, s.step)}
                aria-current={s.step === step ? 'step' : undefined}
                aria-label={`${s.step}. ${STEP_NAMES[s.step - 1]}: ${s.detail}`}
                className={cx(
                  'block h-1.5 rounded-full',
                  s.step === step
                    ? 'bg-human'
                    : s.state === 'done'
                      ? 'bg-human/45'
                      : 'bg-fill-strong',
                )}
              />
            </li>
          ))}
        </ol>
        {current ? (
          <span className="text-[11px] text-text-muted">
            {current.detail}
            {current.attention ? (
              <span className="text-caution"> · {current.attention}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {/* full: md and up */}
      <div className="relative hidden md:block">
        <div className="mb-2 flex items-baseline justify-between text-[11px] text-text-muted">
          <span>
            Review · step <span className="num text-text">{step}</span> of {steps.length}
          </span>
          <span>
            <span className="num text-text">{done}</span> of {steps.length} done
          </span>
        </div>
        {/* the track, behind the nodes, from the first node's centre to the last's */}
        <div
          aria-hidden="true"
          className="absolute top-[37px] right-[10%] left-[10%] h-[3px] rounded-full bg-fill-strong"
        >
          <div
            className={cx('h-full rounded-full bg-human', motion)}
            style={{ width: `${fill * 100}%` }}
          />
        </div>
        <ol className="relative grid grid-cols-5">
          {steps.map((s) => (
            <li key={s.step} className="flex min-w-0 justify-center">
              <a
                href={reviewHash(runId, s.step)}
                aria-current={s.step === step ? 'step' : undefined}
                title={s.attention ? `${s.detail} - ${s.attention}` : s.detail}
                className="group flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 text-center no-underline hover:no-underline"
              >
                <Node s={s} motion={motion} />
                <span
                  className={cx(
                    'max-w-full truncate text-xs',
                    s.state === 'current'
                      ? 'font-semibold text-text'
                      : s.state === 'done'
                        ? 'text-text group-hover:text-human'
                        : 'text-text-muted group-hover:text-text',
                  )}
                >
                  {STEP_NAMES[s.step - 1]}
                </span>
                <span className="max-w-full truncate text-[11px] text-text-muted">
                  {s.detail}
                  {s.attention ? <span className="sr-only">; {s.attention}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

const R = 11;
const C = 2 * Math.PI * (R + 3.5);

function Node({ s, motion }: { s: StepProgress; motion: string }) {
  const ring = s.fraction !== null && s.state !== 'done';
  return (
    <span className="relative inline-flex size-[30px] items-center justify-center">
      {/* the background disc hides the track behind the node */}
      <svg viewBox="0 0 30 30" className="absolute inset-0" aria-hidden="true">
        {ring ? (
          <>
            <circle
              cx="15"
              cy="15"
              r={R + 3.5}
              className="fill-none stroke-fill-strong"
              strokeWidth="2"
            />
            <circle
              cx="15"
              cy="15"
              r={R + 3.5}
              className={cx('fill-none stroke-human', motion)}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - (s.fraction ?? 0))}
              transform="rotate(-90 15 15)"
            />
          </>
        ) : null}
        <circle
          cx="15"
          cy="15"
          r={R}
          className={cx(
            motion,
            s.state === 'done'
              ? 'fill-human stroke-human'
              : s.state === 'current'
                ? 'fill-surface-raised stroke-human'
                : 'fill-surface-raised stroke-border-strong',
          )}
          strokeWidth={s.state === 'current' ? 2.5 : 1.5}
        />
      </svg>
      <span
        className={cx(
          'num relative text-[11px] font-semibold',
          s.state === 'done'
            ? 'text-white'
            : s.state === 'current'
              ? 'text-human'
              : 'text-text-muted',
        )}
      >
        {s.state === 'done' ? (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <path
              d="M2.5 6.2 5 8.6 9.5 3.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          s.step
        )}
      </span>
      {s.attention ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-caution ring-2 ring-surface-raised"
        />
      ) : null}
    </span>
  );
}
