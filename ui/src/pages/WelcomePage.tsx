import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { loadExpertise, saveExpertise } from '@/state/expertise';
import { routeHash } from '@/state/route';
import { StudyHeader } from '@/study/StudyHeader';

/** What REAL does, in the order a user meets it. */
const STATEMENTS: [string, string][] = [
  [
    'Write the requirement',
    'State what the system must achieve in REAL-DSL, keeping three things apart: the system that does it, the domain assumptions it relies on, and the goals it must meet.',
  ],
  [
    'Test it in simulation',
    'REAL generates the test scenarios, as an exhaustive grid, a chosen list or a search for failures, and runs each one in the CARLA driving simulator with the real detector and braking in the loop.',
  ],
  [
    'Understand the failures',
    'A failure counts against the system only when the domain assumptions held. The failures that count are grouped into obstacles, each with its evidence, traces and recordings.',
  ],
  [
    'Refine the requirement',
    'For each obstacle you decide whether the world explains it or the system is at fault. REAL writes the revised requirement, every change labelled, ready for the next round.',
  ],
];

/**
 * The normal tool's first page (#/welcome): REAL, what it does, the user's
 * expertise, and the way in. The study build has its own (study/StartScreen.tsx).
 */
export function WelcomePage() {
  const fieldId = useId();
  const [expertise, setExpertise] = useState(loadExpertise);
  const value = expertise.trim();
  return (
    <>
      <StudyHeader />
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-3xl flex-col items-center justify-center gap-8 px-5 py-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-5xl font-bold tracking-tight">REAL</h1>
          <p className="max-w-xl text-lg text-text-muted">
            A Tool for Refining Autonomous Systems Requirements through Compliance Failure Analysis
          </p>
        </div>

        <ol className="card grid w-full gap-x-8 gap-y-5 p-6 text-left sm:grid-cols-2">
          {STATEMENTS.map(([title, text], i) => (
            <li key={title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-text text-xs font-bold text-white"
              >
                {i + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-text">{title}</span>
                <span className="text-sm leading-6 text-text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ol>

        <form
          className="flex w-full max-w-xl flex-col items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value) return;
            saveExpertise(value);
            window.location.hash = routeHash({ screen: 'overview' });
          }}
        >
          <label htmlFor={fieldId} className="text-sm font-medium">
            Your expertise
          </label>
          <input
            id={fieldId}
            value={expertise}
            onChange={(e) => setExpertise(e.target.value)}
            placeholder="e.g., Robotic Requirement Engineering, Legal Compliance"
            autoComplete="off"
            className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-center text-sm text-text placeholder:text-text-faint focus-visible:border-human focus-visible:outline-none"
          />
          <p className="text-xs text-text-muted">
            Recorded with your decisions when you sign a review.
          </p>
          <Button variant="primary" size="lg" type="submit" disabled={!value}>
            Get started →
          </Button>
        </form>
      </main>
    </>
  );
}
