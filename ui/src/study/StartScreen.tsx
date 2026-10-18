import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cx } from '@/utils/format';

import { PROFESSIONS } from './config';
import { logEvent, startLog } from './log';
import { newId, newSession, saveSession, type StudySession } from './session';

/** The study's first screen: the participant's background and their anonymous ID. */
export function StartScreen({ onStart }: { onStart: (s: StudySession) => void }) {
  const id = useMemo(newId, []);
  const [profession, setProfession] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const isOther = profession === 'Other';
  const value = isOther ? (other.trim() ? `Other: ${other.trim()}` : null) : profession;

  const start = () => {
    if (!value) return;
    const session = newSession(id, value);
    saveSession(session);
    startLog(id);
    logEvent({
      screen: 'start',
      event: 'session_start',
      new: { profession: value, build: session.build },
    });
    onStart(session);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p className="text-sm text-text">
          You will review one test round of an automated-braking car and decide what its failures
          mean and what to do about them. There are no right answers. We are interested in your
          judgement.
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Your background</legend>
        <div role="radiogroup" aria-label="Your background" className="flex flex-col gap-1.5">
          {[...PROFESSIONS, 'Other'].map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={profession === p}
              onClick={() => setProfession(p)}
              className={cx(
                'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                profession === p
                  ? 'border-human bg-human-soft/40 font-medium'
                  : 'border-border hover:border-border-strong',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        {isOther ? (
          <input
            aria-label="Your background, in your words"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="in a few words"
            className="mt-1 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm"
          />
        ) : null}
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          Your anonymous ID: <span className="font-mono font-semibold text-text">{id}</span> (shown
          on every screen)
        </p>
        <Button variant="primary" onClick={start} disabled={!value}>
          Start
        </Button>
      </div>
    </main>
  );
}
