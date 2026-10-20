import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunDialog } from '@/components/requirement/RunDialog';
import type { Job } from '@/services/authoring';
import type { CheckState, Failure, RunTestState } from '@/state/runTest';

const JOB: Job = {
  job_id: '4999001',
  requirement: 'requirements/R_new.dsl',
  submitted_at: '2026-10-13T08:00:00Z',
  state: 'RUNNING',
  progress: { done: 3, total: 4 },
  run_id: 'fedcba9876543210fedcba9876543210',
  started_at: '2026-10-13T08:14:32',
  elapsed: '00:21:10',
  node: 'nc00001',
  time_limit: '00:45:00',
  ports: 'CARLA 23288, Redis 33822, MLflow 34822, API 35822',
  tracebacks: 9,
  mlflow_server_errors: 4,
  partial: { done: 2, total: 4 },
  command: 'sbatch --parsable --time=00:45:00 --export=ALL,REAL_SEARCH=list run_real_av.slurm',
};
const SMOKE = { path: 'infra/hpc/smoke/scenarios_v3.txt', scenarios: 4 };

function dialog(state: RunTestState) {
  const actions = {
    check: vi.fn(),
    back: vi.fn(),
    submit: vi.fn(),
    close: vi.fn(),
    openExisting: vi.fn(),
    openResults: vi.fn(),
    retry: vi.fn(),
    dismiss: vi.fn(),
  };
  render(<RunDialog state={state} fileName="R_new.dsl" onFileName={vi.fn()} actions={actions} />);
  return { actions, box: screen.getByRole('dialog', { name: 'Compliance test' }) };
}

const checks = (statuses: CheckState['status'][]): CheckState[] =>
  (['modules', 'scenes', 'session', 'code'] as const).map((key, i) => ({
    key,
    status: statuses[i] ?? 'pending',
  }));

function checking(
  failure?: Failure,
  statuses = ['ok', 'ok', 'ok', 'ok'] as CheckState['status'][],
) {
  return dialog({
    phase: 'ready',
    existing: null,
    options: { search: 'grid' },
    checks: checks(statuses),
    failure,
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ lists: [SMOKE] }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('1. choose', () => {
  it('offers the latest result of a requirement that already ran', () => {
    const { actions, box } = dialog({
      phase: 'choose',
      existing: {
        run_id: '657a1447d0ba43af9c3aa54f3c8698ce',
        mode: 'grid',
        created_at: '2026-10-08T08:51:00Z',
        analysed: true,
        simulations: 159,
      },
    });
    expect(box).toHaveTextContent('This requirement already has results');
    expect(box).toHaveTextContent('159 simulations');
    fireEvent.click(within(box).getByRole('button', { name: 'Open the latest result' }));
    expect(actions.openExisting).toHaveBeenCalled();
  });

  it('starts on the quick check once a list is known, and sends what is chosen', async () => {
    const { actions, box } = dialog({ phase: 'choose', existing: null });
    const quick = within(box).getByRole('radio', { name: /Quick check/ });
    await waitFor(() => expect(quick).toBeChecked());
    expect(quick).toHaveTextContent('4 scenarios × 1 run');
    fireEvent.click(within(box).getByRole('button', { name: /Check and run/ }));
    expect(actions.check).toHaveBeenLastCalledWith({
      search: 'list',
      trials: 1,
      time: '00:45:00',
      scenario_file: SMOKE.path,
    });
    fireEvent.click(within(box).getByRole('radio', { name: /Full test/ }));
    fireEvent.click(within(box).getByRole('button', { name: /Check and run/ }));
    expect(actions.check).toHaveBeenLastCalledWith({ search: 'grid' });
  });

  it('a change under More options is shown as a custom choice', async () => {
    const { box } = dialog({ phase: 'choose', existing: null });
    await waitFor(() =>
      expect(within(box).getByRole('radio', { name: /Quick check/ })).toBeChecked(),
    );
    fireEvent.change(within(box).getByLabelText('Runs per scenario'), { target: { value: '2' } });
    expect(box).toHaveTextContent('Custom: 4 listed scenarios × 2 runs, up to 00:45:00');
    expect(within(box).getByRole('radio', { name: /Quick check/ })).not.toBeChecked();
  });
});

describe('2. check', () => {
  it('submit appears only when every check has passed', () => {
    const { actions, box } = checking();
    fireEvent.click(within(box).getByRole('button', { name: 'Submit to the cluster' }));
    expect(actions.submit).toHaveBeenCalled();
  });

  it('a failure stops the checks after it and gives one sentence and one button', () => {
    const { actions, box } = checking(
      { message: 'no open ssh session', kind: 'no_session', details: { host: 'h' } },
      ['ok', 'ok', 'failed', 'skipped'],
    );
    expect(box).toHaveTextContent('Open a terminal and run ssh h once');
    expect(box).toHaveTextContent("The cluster has this project's code - not checked");
    expect(within(box).queryByRole('button', { name: 'Submit to the cluster' })).toBeNull();
    fireEvent.click(within(box).getByRole('button', { name: 'Check again' }));
    expect(actions.check).toHaveBeenCalledWith({ search: 'grid' });
  });

  it('out-of-date code names the files, the blocking jobs and the commands to copy', () => {
    const { box } = checking(
      {
        message: 'stale',
        kind: 'stale_copy',
        details: {
          differ: Array.from({ length: 14 }, (_, i) => `REAL/scripts/f${i}.py`),
          blocking_jobs: [{ job_id: '5000001', state: 'RUNNING' }],
          sync_commands: ['python -m m --manifest x', 'rsync a h:b', 'scp c h:d'],
        },
      },
      ['ok', 'ok', 'ok', 'failed'],
    );
    expect(box).toHaveTextContent("The cluster's code is out of date (14 files).");
    expect(box).toHaveTextContent('Wait for job 5000001 to end before syncing');
    expect(box).toHaveTextContent('and 2 more');
    expect(within(box).getAllByRole('button', { name: 'Copy' })).toHaveLength(3);
  });

  it.each([
    ['module', 'unknown braking module x', 'Edit the requirement'],
    ['scene', '1 of 4 scenes did not build', 'Edit the requirement'],
    ['options', 'time must be HH:MM:SS', '← Back to the options'],
    ['no_answer', 'did not answer', 'Check again'],
  ])('a %s failure has its own button', (kind, message, button) => {
    const { box } = checking({ message, kind, details: {} }, ['failed']);
    expect(within(box).getByRole('button', { name: button })).toBeInTheDocument();
  });
});

describe('3. run', () => {
  it('shows a timeline, the results so far, and how to cancel without a cancel button', () => {
    const { actions, box } = dialog({ phase: 'tracking', job: JOB });
    expect(box).toHaveTextContent('Submitted');
    expect(box).toHaveTextContent('on nc00001');
    expect(box).toHaveTextContent('scenario 3 of 4 · 00:21:10 of 00:45:00');
    expect(box).toHaveTextContent('Results so far: 2 of 4 scenarios');
    fireEvent.click(within(box).getByRole('button', { name: 'Look at them' }));
    expect(actions.openResults).toHaveBeenCalledWith(JOB.run_id);
    expect(box).toHaveTextContent('scancel 4999001');
    expect(box).toHaveTextContent('4 MLflow server error report(s)');
    expect(within(box).queryByRole('button', { name: /cancel/i })).toBeNull();
  });

  it('a queued job waits in the queue', () => {
    const { box } = dialog({
      phase: 'tracking',
      job: { ...JOB, state: 'PENDING', progress: null, started_at: null },
    });
    expect(within(box).getByText('Waiting in the queue')).toBeInTheDocument();
  });

  it('a job stopped at its time limit is brought back, labelled, and can be opened', () => {
    const { actions, box } = dialog({
      phase: 'ended',
      job: { ...JOB, state: 'TIMEOUT', fetched: true, complete: false },
    });
    expect(box).toHaveTextContent(
      'The job stopped at its time limit after 2 of 4 scenarios. What ran was brought back, marked INCOMPLETE.',
    );
    fireEvent.click(within(box).getByRole('button', { name: 'Look at them' }));
    expect(actions.openResults).toHaveBeenCalledWith(JOB.run_id);
  });

  it('closing never stops anything: Esc and × only close the panel', () => {
    const { actions } = dialog({ phase: 'tracking', job: JOB });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(actions.close).toHaveBeenCalledTimes(2);
    expect(actions.dismiss).not.toHaveBeenCalled();
  });
});
