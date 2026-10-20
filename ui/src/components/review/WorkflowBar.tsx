import { reviewHash, routeHash, type Route } from '@/state/route';
import type { WorkflowState } from '@/state/workflow';
import { authorTitle } from '@/study/labels';
import { cx } from '@/utils/format';

import { EXAMPLE_NAME, STEP_NAMES } from './stepNames';

/**
 * The workflow under the header on every page, drawn as a progress track:
 * Overview, Requirements Compliance to Validate, the five review steps and
 * the worked example, each a node named by its page's title, nothing more.
 * Stops before the current one carry a tick, the current one a dark ring,
 * an amber dot marks something to look at; the track fills up to where you
 * are. The review steps lead to the review last opened; before any, they
 * are shown but not links.
 */
export function WorkflowBar({ route, workflow }: { route: Route; workflow: WorkflowState | null }) {
  // stops: Overview 0, requirement 1, step 1 at 2, the example 3, steps 2-5 at 4-7
  const current =
    route.screen === 'overview'
      ? 0
      : route.screen === 'author'
        ? 1
        : route.screen === 'example'
          ? 3
          : route.screen === 'review'
            ? route.step === 1
              ? 2
              : route.step + 2
            : -1;
  const runId =
    route.screen === 'review' || route.screen === 'example'
      ? route.runId
      : (workflow?.runId ?? null);
  const stops = [
    {
      label: 'Overview',
      number: '•',
      href: routeHash({ screen: 'overview' }) as string | null,
    },
    {
      label: authorTitle(),
      number: '•',
      href: routeHash({ screen: 'author' }) as string | null,
    },
    ...STEP_NAMES.flatMap((name, i) => {
      const p = workflow?.steps.find((st) => st.step === i + 1);
      const stop = {
        label: name,
        number: String(i + 1),
        href: runId ? reviewHash(runId, i + 1) : null,
        attention: p?.attention ?? null,
      };
      // the worked example sits between steps 1 and 2
      return i === 0
        ? [
            stop,
            {
              label: EXAMPLE_NAME,
              number: '★',
              href: runId ? routeHash({ screen: 'example', runId }) : null,
              attention: null,
            },
          ]
        : [stop];
    }),
  ] as {
    label: string;
    number: string;
    href: string | null;
    attention?: string | null;
  }[];
  const n = stops.length;
  const fill = current > 0 ? current / (n - 1) : 0;

  return (
    <nav aria-label="Workflow" className="border-b border-border-strong/60 bg-band">
      {/* narrow: where you are, in words */}
      <p className="mx-auto max-w-[80rem] px-5 py-2 text-xs text-text-muted md:hidden">
        {current >= 0 ? (
          <>
            Step {current + 1} of {n} ·{' '}
            <span className="font-semibold text-text">{stops[current]?.label}</span>
          </>
        ) : (
          'Overview › Requirements › Review'
        )}
      </p>
      <div className="relative mx-auto hidden max-w-[80rem] px-5 pt-2.5 pb-2 md:block lg:px-8">
        {/* the track, from the first node's centre to the last */}
        <div
          aria-hidden="true"
          className="absolute top-[1.3rem] h-0.5 bg-fill-strong"
          style={{ left: `calc(${50 / n}% )`, right: `calc(${50 / n}%)` }}
        >
          <div
            className="h-full bg-text motion-safe:transition-[width] motion-safe:duration-step"
            style={{ width: `${fill * 100}%` }}
          />
        </div>
        <ol
          className="relative grid"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
          {stops.map((s, i) => {
            const isCurrent = i === current;
            const done = current > i;
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className={cx(
                    'relative flex size-[1.4rem] items-center justify-center rounded-full text-[10px] font-bold',
                    isCurrent
                      ? 'bg-surface-raised text-text ring-2 ring-text'
                      : done
                        ? 'bg-text text-white'
                        : 'border border-border-strong bg-surface-raised text-text-muted',
                  )}
                >
                  {done ? '✓' : s.number}
                  {s.attention ? (
                    <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-kaos-ref ring-1 ring-band" />
                  ) : null}
                </span>
                <span
                  className={cx(
                    'mt-1 text-center text-[12px] leading-tight',
                    isCurrent ? 'font-bold text-text' : 'font-semibold text-text-muted',
                  )}
                >
                  {s.label}
                </span>
              </>
            );
            const look = 'flex flex-col items-center gap-0.5 px-1 no-underline hover:no-underline';
            return (
              <li key={s.label} className="min-w-0">
                {s.href ? (
                  <a
                    href={s.href}
                    aria-current={isCurrent ? 'step' : undefined}
                    title={s.attention ?? undefined}
                    className={cx(look, 'group')}
                  >
                    {body}
                  </a>
                ) : (
                  <span className={cx(look, 'opacity-60')}>{body}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
