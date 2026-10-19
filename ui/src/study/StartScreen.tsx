import { useId, useMemo, useState } from 'react';

import { Instructions } from '@/components/ui/Instructions';
import { Button } from '@/components/ui/Button';

import { logEvent, startLog } from './log';
import { newId, newSession, saveSession, type StudySession } from './session';
import { StudyHeader } from './StudyHeader';

/** The study's first screen: the tool's name, the participant's expertise in their words, their anonymous ID. */
export function StartScreen({ onStart }: { onStart: (s: StudySession) => void }) {
  const id = useMemo(newId, []);
  const fieldId = useId();
  const [expertise, setExpertise] = useState('');
  const value = expertise.trim();

  const start = () => {
    if (!value) return;
    const session = newSession(id, value);
    saveSession(session);
    startLog(id);
    logEvent({
      screen: 'start',
      event: 'session_start',
      new: { expertise: value, build: session.build },
    });
    window.location.hash = '#/overview'; // the first page after Start: what the study is
    onStart(session);
  };

  return (
    <>
      <StudyHeader />
      <main className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-xl flex-col items-center justify-center gap-7 px-5 py-10 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-5xl font-bold tracking-tight">REAL</h1>
          <p className="text-lg text-text-muted">
            A Tool for Refining Autonomous Systems Requirements through Compliance Failure Analysis
          </p>
        </div>
        <Instructions className="w-full">
          You will review one test round of an automated-braking car and decide what its failures
          mean and what to do about them. There are no right answers. We are interested in your
          judgement.
        </Instructions>
        <form
          className="flex w-full flex-col items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start();
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
          <p className="text-sm text-text-muted">
            Your anonymous ID: <span className="font-mono font-semibold text-text">{id}</span>{' '}
            (shown on every screen)
          </p>
          <Button variant="primary" type="submit" disabled={!value}>
            Start
          </Button>
        </form>
      </main>
    </>
  );
}
