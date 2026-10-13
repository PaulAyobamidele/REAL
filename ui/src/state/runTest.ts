import { useCallback, useEffect, useState } from 'react';

import {
  fetchJob,
  jobStatus,
  matchRequirement,
  projectRunsSource,
  submitRun,
  type Job,
} from '@/services/authoring';
import type { FileSource } from '@/services/workspace';
import { reviewHash } from '@/state/route';

/**
 * Run Test, from the requirement being written to its Test Execution Result.
 * A requirement that has already run opens its latest analysed run at once.
 * A new one is submitted to the cluster only after the reviewer confirms;
 * the job is then followed (every 30 s, also across a reload: its id is kept
 * in this browser) until it completes, brought back, analysed, and opened.
 */
export type RunTestState =
  | { phase: 'idle' }
  | { phase: 'looking' }
  | { phase: 'confirm'; again: boolean }
  | { phase: 'submitting' }
  | { phase: 'tracking'; job: Job }
  | { phase: 'fetching'; job: Job }
  | { phase: 'opening'; runId: string }
  | { phase: 'error'; message: string; job?: Job };

const KEY = 'real-av.run-test.job';
const POLL_MS = 30_000;
const ENDED = [
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
  'OUT_OF_MEMORY',
  'NODE_FAIL',
  'BOOT_FAIL',
  'DEADLINE',
];

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
      window.location.hash = reviewHash(runId, 2);
    },
    [open],
  );

  const runTest = useCallback(async () => {
    setState({ phase: 'looking' });
    try {
      const found = await matchRequirement(text);
      // a grid run is the test execution of the requirement; a GE search is not
      const analysed = found.matches.filter((m) => m.analysed);
      const grid = analysed.filter((m) => m.mode === 'grid');
      const latest = (grid.length ? grid : analysed)[(grid.length ? grid : analysed).length - 1];
      if (latest) await openRun(latest.run_id);
      else setState({ phase: 'confirm', again: false });
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [text, openRun]);

  const submit = useCallback(async () => {
    setState({ phase: 'submitting' });
    try {
      const job = await submitRun(text, fileName.endsWith('.dsl') ? fileName : `${fileName}.dsl`);
      remember(job.job_id);
      setState({ phase: 'tracking', job });
    } catch (e) {
      setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [text, fileName]);

  const follow = useCallback(
    async (jobId: string) => {
      try {
        const job = await jobStatus(jobId);
        if (job.fetched && job.run_id) {
          remember(null);
          await openRun(job.run_id);
        } else if (job.state === 'COMPLETED' && job.run_id) {
          setState({ phase: 'fetching', job });
          const back = await fetchJob(jobId);
          remember(null);
          await openRun(back.run_id as string);
        } else if (ENDED.includes(job.state) || job.message) {
          remember(null);
          setState({
            phase: 'error',
            message: job.message ?? `the job ended ${job.state.toLowerCase()}`,
            job,
          });
        } else {
          setState({ phase: 'tracking', job });
        }
      } catch (e) {
        // keep following: a dropped ssh session is reported, the job id is kept
        setState((s) =>
          s.phase === 'tracking'
            ? { phase: 'error', message: e instanceof Error ? e.message : String(e), job: s.job }
            : { phase: 'error', message: e instanceof Error ? e.message : String(e) },
        );
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

  return {
    state,
    runTest,
    submit,
    runAgain: () => setState({ phase: 'confirm', again: true }),
    retry: () => (state.phase === 'error' && state.job ? follow(state.job.job_id) : runTest()),
    dismiss: () => {
      if (state.phase === 'error' && state.job) remember(null);
      setState({ phase: 'idle' });
    },
  };
}
