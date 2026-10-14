import { useCallback, useEffect, useState } from 'react';

import {
  checkCluster,
  checkLaptop,
  ClusterRefusal,
  fetchJob,
  matchRequirement,
  projectRunsSource,
  refreshPartial,
  submitRun,
  type Job,
  type MatchResult,
  type RefusalDetails,
  type RunOptions,
} from '@/services/authoring';
import type { FileSource } from '@/services/workspace';
import { reviewHash } from '@/state/route';

/**
 * Run Test, from the requirement being written to its Test Execution Result,
 * in three steps the panel shows: choose what to run, check it (on this
 * machine: modules and scenes; over ssh: the session and the cluster's code),
 * run it. Nothing reaches the cluster before every check has passed and the
 * reviewer presses Submit. The job is then followed every 30 s (also across a
 * reload: its id is kept in this browser); the helper pulls and analyses the
 * results so far at most every 5 minutes (PARTIAL). When the job ends its run
 * is brought back whole and analysed: a complete run opens at the Test
 * Execution Result; an incomplete one, or a job without a run, is explained.
 * Closing the panel never stops a job.
 */
export type MatchedRun = MatchResult['matches'][number];
export type CheckKey = 'modules' | 'scenes' | 'session' | 'code';
export interface CheckState {
  key: CheckKey;
  status: 'pending' | 'running' | 'ok' | 'failed' | 'skipped';
  detail?: string;
}
export interface Failure {
  message: string;
  kind: string;
  details: RefusalDetails & { checked?: number | null };
}

export type RunTestState =
  | { phase: 'idle' }
  | { phase: 'looking' }
  | { phase: 'choose'; existing: MatchedRun | null }
  | {
      phase: 'checking' | 'ready' | 'submitting';
      existing: MatchedRun | null;
      options: RunOptions;
      checks: CheckState[];
      failure?: Failure;
    }
  | { phase: 'tracking'; job: Job }
  | { phase: 'fetching'; job: Job }
  | { phase: 'opening'; runId: string }
  | { phase: 'ended'; job: Job }
  | { phase: 'error'; message: string; kind?: string; details?: RefusalDetails; job?: Job };

const KEY = 'real-av.run-test.job';
const POLL_MS = 30_000;
const ENDED = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
  'OUT_OF_MEMORY',
  'NODE_FAIL',
  'BOOT_FAIL',
  'DEADLINE',
];
const CHECKS: CheckKey[] = ['modules', 'scenes', 'session', 'code'];

function remembered(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function remember(jobId: string | null): void {
  try {
    if (jobId) window.localStorage.setItem(KEY, jobId);
    else window.localStorage.removeItem(KEY);
  } catch {
    // the job is still followed while the page stays open
  }
}

function asFailure(e: unknown): Failure {
  return e instanceof ClusterRefusal
    ? { message: e.message, kind: e.kind, details: e.details }
    : { message: e instanceof Error ? e.message : String(e), kind: 'error', details: {} };
}

/** The checks with `key` set and the ones after a failure marked as not checked. */
function mark(checks: CheckState[], key: CheckKey, status: CheckState['status'], detail?: string) {
  const at = CHECKS.indexOf(key);
  return checks.map((c, i) =>
    c.key === key
      ? { ...c, status, detail }
      : status === 'failed' && i > at
        ? { ...c, status: 'skipped' as const }
        : c,
  );
}

export function useRunTest({
  text,
  fileName,
  open,
}: {
  text: string;
  fileName: string;
  open: (source: FileSource) => Promise<void>;
}) {
  const [state, setState] = useState<RunTestState>({ phase: 'idle' });
  const [shown, setShown] = useState(false);
  const name = fileName.endsWith('.dsl') ? fileName : `${fileName}.dsl`;

  const openRun = useCallback(
    async (runId: string) => {
      setState({ phase: 'opening', runId });
      const source = await projectRunsSource();
      if (!source) {
        setState({
          phase: 'error',
          message: 'the authoring helper does not serve the project runs',
        });
        return;
      }
      await open(source);
      setShown(false);
      window.location.hash = reviewHash(runId, 2);
    },
    [open],
  );

  /** Run test: open the panel; a job already followed is shown, otherwise step 1. */
  const start = useCallback(async () => {
    setShown(true);
    if (['tracking', 'fetching', 'ended'].includes(state.phase)) return;
    setState({ phase: 'looking' });
    try {
      const found = await matchRequirement(text);
      // a grid run is the test execution of the requirement; a GE search is not
      const analysed = found.matches.filter((m) => m.analysed);
      const grid = analysed.filter((m) => m.mode === 'grid');
      const pool = grid.length ? grid : analysed;
      setState({ phase: 'choose', existing: pool[pool.length - 1] ?? null });
    } catch {
      setState({ phase: 'choose', existing: null }); // without the run list, running still works
    }
  }, [text, state.phase]);

  /** Step 2: the checks on this machine, then over ssh; Submit waits for all of them. */
  const check = useCallback(
    async (options: RunOptions) => {
      const existing = 'existing' in state ? state.existing : null;
      let checks: CheckState[] = CHECKS.map((key) => ({
        key,
        status: key === 'modules' ? 'running' : 'pending',
      }));
      const put = (phase: 'checking' | 'ready', failure?: Failure) =>
        setState({ phase, existing, options, checks, failure });
      put('checking');
      try {
        const laptop = await checkLaptop(text, options);
        if (!laptop.ok) {
          const failure: Failure = {
            message: laptop.message ?? 'the check on this machine failed',
            kind: laptop.kind ?? 'error',
            details: { failures: laptop.failures, checked: laptop.checked },
          };
          checks = ['module', 'parse'].includes(failure.kind)
            ? mark(checks, 'modules', 'failed')
            : mark(mark(checks, 'modules', 'ok'), 'scenes', 'failed');
          put('ready', failure);
          return;
        }
        const sut = laptop.system_under_test;
        checks = mark(
          checks,
          'modules',
          'ok',
          sut ? `${sut.braking_mode} · ${sut.yolo_model}` : '',
        );
        checks = mark(checks, 'scenes', 'ok', `${laptop.checked ?? '?'} scenes`);
        checks = mark(checks, 'session', 'running');
        put('checking');
      } catch (e) {
        const failure = asFailure(e);
        checks = mark(checks, 'modules', 'failed');
        put('ready', failure);
        return;
      }
      try {
        await checkCluster();
        checks = mark(mark(checks, 'session', 'ok'), 'code', 'ok');
        put('ready');
      } catch (e) {
        const failure = asFailure(e);
        checks =
          failure.kind === 'no_session'
            ? mark(checks, 'session', 'failed')
            : mark(mark(checks, 'session', 'ok'), 'code', 'failed');
        put('ready', failure);
      }
    },
    [text, state],
  );

  const back = useCallback(() => {
    setState((s) => ({ phase: 'choose', existing: 'existing' in s ? s.existing : null }));
  }, []);

  /** Step 3: submit (the helper repeats the checks; the one on this machine is reused). */
  const submit = useCallback(async () => {
    if (state.phase !== 'ready' || state.failure) return;
    setState({ ...state, phase: 'submitting' });
    try {
      const job = await submitRun(text, name, state.options);
      remember(job.job_id);
      setState({ phase: 'tracking', job });
    } catch (e) {
      setState({ ...state, phase: 'ready', failure: asFailure(e) });
    }
  }, [text, name, state]);

  const follow = useCallback(
    async (jobId: string) => {
      try {
        // the helper pulls and analyses the results so far at most every 5 minutes;
        // otherwise this is the job's status
        const job = await refreshPartial(jobId);
        if (job.fetched) {
          remember(null);
          if (job.run_id && job.complete) await openRun(job.run_id);
          else setState({ phase: 'ended', job });
        } else if (ENDED.includes(job.state)) {
          // every ended job is brought back: a whole run, an incomplete one (labelled), or its log
          setState({ phase: 'fetching', job });
          const back = await fetchJob(jobId);
          remember(null);
          if (back.run_id && back.complete) await openRun(back.run_id);
          else setState({ phase: 'ended', job: back });
        } else {
          setState({ phase: 'tracking', job });
        }
      } catch (e) {
        // keep following: a dropped ssh session is reported, the job id is kept
        const f = asFailure(e);
        setState((s) => ({
          phase: 'error',
          message: f.message,
          kind: f.kind,
          details: f.details,
          job: 'job' in s ? s.job : undefined,
        }));
      }
    },
    [openRun],
  );

  // resume a job submitted earlier from this browser
  useEffect(() => {
    const jobId = remembered();
    if (jobId) void follow(jobId);
  }, [follow]);

  // poll while a job runs
  useEffect(() => {
    if (state.phase !== 'tracking') return;
    const t = window.setTimeout(() => void follow(state.job.job_id), POLL_MS);
    return () => window.clearTimeout(t);
  }, [state, follow]);

  const job = 'job' in state ? state.job : undefined;
  return {
    state,
    shown,
    start,
    check,
    back,
    submit,
    /** closing the panel never stops a job */
    close: () => setShown(false),
    openExisting: () =>
      state.phase === 'choose' && state.existing ? openRun(state.existing.run_id) : undefined,
    /** a partial or incomplete run: the same review, with its banner on top */
    openResults: (runId: string) => openRun(runId),
    retry: () => (state.phase === 'error' && state.job ? follow(state.job.job_id) : start()),
    /** forget an ended job (or a failed one) and start again */
    dismiss: () => {
      if (['error', 'ended'].includes(state.phase)) remember(null);
      setState({ phase: 'idle' });
      setShown(false);
    },
    /** the toolbar's words while a job is followed */
    running:
      state.phase === 'tracking' || state.phase === 'fetching'
        ? job?.progress
          ? `Test running · ${job.progress.done} of ${job.progress.total}`
          : job?.state === 'PENDING'
            ? 'Test queued'
            : 'Test running'
        : null,
  };
}
