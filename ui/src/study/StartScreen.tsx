import { useId, useMemo, useState } from 'react';

import { Instructions } from '@/components/ui/Instructions';
import { Button } from '@/components/ui/Button';

import { logEvent, startLog } from './log';
import { newId, newSession, saveSession, type StudySession } from './session';
import { StudyHeader } from './StudyHeader';

/** The study's first screen: the tool's name, the participant's expertise in their words, their anonymous ID. */
export function StartScreen({
  onStart,
  existing = null,
}: {
  onStart: (s: StudySession) => void;
  /** revisited (the REAL logo): the session goes on - same ID, expertise kept, Continue */
  existing?: StudySession | null;
}) {
  const fresh = useMemo(newId, []);
  const id = existing?.id ?? fresh;
  const fieldId = useId();
  const [expertise, setExpertise] = useState(existing?.expertise ?? '');
  const value = expertise.trim();

  const start = () => {
    if (!value) return;
    if (existing) {
      // never a new session: that would lose the participant's work
      if (value !== existing.expertise) {
        const updated = { ...existing, expertise: value };
        saveSession(updated);
        logEvent({
          screen: 'start',
          event: 'expertise_changed',
          old: { expertise: existing.expertise },
          new: { expertise: value },
        });
        onStart(updated);
      } else onStart(existing);
      window.location.hash = '#/overview';
      return;
    }
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
        <Instructions label={false} className="w-full">
          <p className="mb-1 font-semibold">Welcome, and thank you for taking part.</p>
          <p>
            You will review one test round of an automated-braking car and decide what its failures
            mean and what to do about them. There are no right answers: we are interested in your
            judgement.
          </p>
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
            {existing ? 'Continue' : 'Start'}
          </Button>
        </form>
      </main>
    </>
  );
}
