import type { ReactNode } from 'react';

import { buttonClass } from '@/components/ui/buttonClass';
import { Instructions } from '@/components/ui/Instructions';
import { PageActions } from '@/components/ui/PageActions';
import { reviewHash, routeHash, STEP_COUNT } from '@/state/route';
import { useReportWorkflow } from '@/state/workflow';

import type { StepProgress } from '@/domain/reviewProgress';

import { EXAMPLE_NAME, STEP_CAPTIONS, STEP_NAMES } from './stepNames';

export { STEP_CAPTIONS, STEP_NAMES } from './stepNames';

/**
 * The frame of the five-step review: the title, what to do (the instructions
 * box), the step, and Back / See <next step> centred under it, like the main
 * action of every page. Where the review stands is in the header's workflow
 * bar (WorkflowBar), fed from here. A step that puts an instruction above
 * each of its containers says so with `ownInstructions`, and the box under
 * the title is left out.
 */
export function StepShell({
  runId,
  step,
  progress,
  ownInstructions = false,
  example = false,
  children,
}: {
  runId: string;
  step: number;
  /** Live status per step, for the workflow bar in the header. */
  progress: StepProgress[];
  ownInstructions?: boolean;
  /** the worked example between steps 1 and 2 */
  example?: boolean;
  children: ReactNode;
}) {
  useReportWorkflow({ runId, step, steps: progress });
  const name = STEP_NAMES[step - 1] ?? '';
  const exampleHash = routeHash({ screen: 'example', runId });
  // the order: 1, the example, 2, 3, 4, 5
  const back = example
    ? reviewHash(runId, 1)
    : step === 2
      ? exampleHash
      : step > 1
        ? reviewHash(runId, step - 1)
        : null;
  const next = example
    ? { href: reviewHash(runId, 2), label: STEP_NAMES[1] }
    : step === 1
      ? { href: exampleHash, label: EXAMPLE_NAME }
      : step < STEP_COUNT
        ? { href: reviewHash(runId, step + 1), label: STEP_NAMES[step] }
        : null;
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <h1 className="text-2xl lg:text-3xl">
          {example ? (
            EXAMPLE_NAME
          ) : (
            <>
              <span className="text-text-faint">{step}.</span> {name}
            </>
          )}
        </h1>
        {ownInstructions ? null : (
          <Instructions page className="mt-2" steps={STEP_CAPTIONS[step - 1]} />
        )}
      </header>
      {children}
      <PageActions>
        {back ? (
          <a href={back} className={buttonClass('secondary', 'lg')}>
            ← Back
          </a>
        ) : null}
        {next ? (
          <a href={next.href} className={buttonClass('primary', 'lg')}>
            See {next.label} →
          </a>
        ) : null}
      </PageActions>
    </div>
  );
}
