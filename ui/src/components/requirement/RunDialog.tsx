import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Instructions } from '@/components/ui/Instructions';
import { RunOptionsForm } from '@/components/requirement/RunOptionsForm';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Disclosure';
import {
  DEFAULT_TIME,
  DEFAULT_TRIALS,
  GRID_SCENARIOS,
  QUICK_TIME,
  scenarioLists,
  type Job,
  type RunOptions,
  type ScenarioList,
} from '@/services/authoring';
import type { CheckState, Failure, RunTestState } from '@/state/runTest';
import { STUDY } from '@/study/config';
import { RUNS_PER_SCENARIO, SCENARIOS, TIME_LIMIT } from '@/study/replay';
import { cx, displayDate } from '@/utils/format';

const SHOWN = 12;
const STEPS = ['Choose', 'Check', 'Run'] as const;

type Actions = {
  check: (o: RunOptions) => void;
  back: () => void;
  submit: () => void;
  close: () => void;
  openExisting: () => void;
  openResults: (runId: string) => void;
  retry: () => void;
  dismiss: () => void;
};

const quickOf = (lists: ScenarioList[]): RunOptions | null =>
  lists[0] ? { search: 'list', trials: 1, time: QUICK_TIME, scenario_file: lists[0].path } : null;
const FULL: RunOptions = { search: 'grid' };
const same = (a: RunOptions | null, b: RunOptions) =>
  Boolean(a) && JSON.stringify(a) === JSON.stringify(JSON.parse(JSON.stringify(b)));

function stepOf(phase: RunTestState['phase']): number {
  if (phase === 'looking' || phase === 'choose') return 0;
  if (phase === 'checking' || phase === 'ready' || phase === 'submitting') return 1;
  return 2;
}

/**
 * Run Test as a guided panel: 1 choose what to run, 2 check it, 3 run it.
 * Closing it never stops a job; the toolbar button reopens it.
 */
export function RunDialog({
  state,
  fileName,
  onFileName,
  actions,
  title = 'Run this requirement on the cluster',
}: {
  state: RunTestState;
  fileName: string;
  onFileName: (name: string) => void;
  actions: Actions;
  title?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && actions.close();
    window.addEventListener('keydown', onKey);
    box.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);
  const step = stepOf(state.phase);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="Compliance test"
        className="card flex w-full max-w-2xl flex-col gap-4 p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            title="Close - a running job keeps running"
            onClick={actions.close}
            className="rounded-full px-2 text-lg leading-none text-text-muted hover:bg-fill"
          >
            ×
          </button>
        </div>
        <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? 'step' : undefined}
              className={cx(
                'border-t-2 pt-1.5 text-xs',
                i < step && 'border-human text-text-muted',
                i === step && 'border-human font-semibold text-text',
                i > step && 'border-border text-text-faint',
              )}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        {state.phase === 'looking' ? <Muted>Looking for results of this requirement…</Muted> : null}
        {state.phase === 'choose' ? (
          <Choose state={state} fileName={fileName} onFileName={onFileName} actions={actions} />
        ) : null}
        {state.phase === 'checking' || state.phase === 'ready' || state.phase === 'submitting' ? (
          <Check state={state} actions={actions} />
        ) : null}
        {step === 2 ? <Run state={state} actions={actions} /> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 1. Choose

function Choose({
  state,
  fileName,
  onFileName,
  actions,
}: {
  state: Extract<RunTestState, { phase: 'choose' }>;
  fileName: string;
  onFileName: (name: string) => void;
  actions: Actions;
}) {
  const [lists, setLists] = useState<ScenarioList[]>([]);
  const [options, setOptions] = useState<RunOptions>(FULL);
  const picked = useRef(false);
  const setPicked = (v: boolean) => {
    picked.current = v;
  };
  useEffect(() => {
    if (STUDY) return; // the study replays the saved full test only: no lists to offer
    void scenarioLists().then((l) => {
      setLists(l);
      // the cheaper choice first, once a list is known, unless the reviewer already chose
      const quick = quickOf(l);
      if (quick && !picked.current) setOptions(quick);
    });
  }, []);
  const quick = quickOf(lists);
  const custom = !same(quick, options) && !same(FULL, options);
  const e = state.existing;
  return (
    <>
      {e ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-fill px-3 py-2.5">
          <p className="text-sm">
            This requirement already has results:{' '}
            <span className="text-text-muted">
              {e.mode ?? 'run'} run <span className="num">{e.run_id.slice(0, 8)}</span> ·{' '}
              {displayDate(e.created_at)}
              {e.simulations != null ? ` · ${e.simulations} simulations` : ''}
            </span>
          </p>
          <Button size="sm" onClick={actions.openExisting}>
            Open the latest result
          </Button>
        </div>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm">{e ? 'Or run it again:' : 'What should run?'}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {STUDY ? null : (
            <Choice
              title="Quick check"
              lines={
                lists[0]
                  ? [
                      `${lists[0].scenarios} scenarios × 1 run`,
                      'about 45 min',
                      lists[0].path.split('/').pop() ?? '',
                    ]
                  : ['needs a scenario list in the project']
              }
              selected={same(quick, options)}
              disabled={!quick}
              onSelect={() => {
                if (quick) setOptions(quick);
                setPicked(true);
              }}
            />
          )}
          <Choice
            title="Full test"
            lines={
              STUDY
                ? [`${SCENARIOS} scenarios × ${RUNS_PER_SCENARIO} runs`, 'up to 5 h']
                : [
                    `${GRID_SCENARIOS} scenarios × ${DEFAULT_TRIALS.grid} runs`,
                    `up to ${DEFAULT_TIME.slice(0, 2).replace(/^0/, '')} h`,
                  ]
            }
            selected={same(FULL, options)}
            onSelect={() => {
              setOptions(FULL);
              setPicked(true);
            }}
          />
        </div>
        {custom ? (
          <p className="text-xs text-text-muted">Custom: {describe(options, lists)}</p>
        ) : null}
      </fieldset>
      {STUDY ? null : (
        <Disclosure summary="More options (search, runs, time limit, provenance)">
          <div className="pt-2">
            <RunOptionsForm
              value={options}
              onChange={(o) => {
                setOptions(o);
                setPicked(true);
              }}
              lists={lists}
            />
          </div>
        </Disclosure>
      )}
      <label className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        Saved as <code>requirements/</code>
        {STUDY ? (
          <code>{fileName}</code>
        ) : (
          <input
            aria-label="File name"
            value={fileName}
            onChange={(ev) => onFileName(ev.target.value)}
            className="w-48 rounded-md border border-border bg-surface-raised px-2 py-0.5 font-mono text-xs text-text"
          />
        )}
      </label>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="quiet" onClick={actions.close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => actions.check(options)}
          disabled={options.search === 'list' && !options.scenario_file}
        >
          Check and run →
        </Button>
      </div>
    </>
  );
}

function describe(o: RunOptions, lists: ScenarioList[]): string {
  if (STUDY) return `${SCENARIOS} scenarios × ${RUNS_PER_SCENARIO} runs, up to ${TIME_LIMIT}`;
  const trials = o.trials ?? DEFAULT_TRIALS[o.search];
  const time = o.time ?? DEFAULT_TIME;
  if (o.search === 'grid') return `${GRID_SCENARIOS} scenarios × ${trials} runs, up to ${time}`;
  if (o.search === 'list') {
    const n = lists.find((l) => l.path === o.scenario_file)?.scenarios;
    return `${n ?? '?'} listed scenarios × ${trials} runs, up to ${time}`;
  }
  return `GE search, ${o.population ?? 16} × ${o.generations ?? 6} generations, up to ${time}`;
}

function Choice({
  title,
  lines,
  selected,
  disabled,
  onSelect,
}: {
  title: string;
  lines: string[];
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors',
        selected ? 'border-human bg-human-soft/40' : 'border-border hover:border-border-strong',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden="true"
          className={cx(
            'inline-block size-3 rounded-full border-2',
            selected ? 'border-human bg-human' : 'border-border-strong',
          )}
        />
        {title}
      </span>
      {lines.map((l) => (
        <span key={l} className="pl-5 text-xs text-text-muted">
          {l}
        </span>
      ))}
    </button>
  );
}

// ------------------------------------------------------------------ 2. Check

const CHECK_TEXT: Record<CheckState['key'], string> = {
  modules: 'The modules exist',
  scenes: 'The scenes build in Scenic',
  session: 'Connected to the cluster',
  code: "The cluster has this project's code",
};

function Check({
  state,
  actions,
}: {
  state: Extract<RunTestState, { phase: 'checking' | 'ready' | 'submitting' }>;
  actions: Actions;
}) {
  const allOk = state.phase === 'ready' && !state.failure;
  return (
    <>
      <ul className="flex flex-col gap-1.5" aria-label="Checks">
        <CheckRow status="ok" text="The requirement is complete" />
        {state.checks.map((c) => (
          <CheckRow key={c.key} status={c.status} text={CHECK_TEXT[c.key]} detail={c.detail} />
        ))}
      </ul>
      {state.failure ? (
        <FailureBox
          failure={state.failure}
          actions={actions}
          onRecheck={() => actions.check(state.options)}
        />
      ) : null}
      {allOk ? (
        <p className="text-sm text-text">
          Everything checks out. {describe(state.options, [])} on your allocation.
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="quiet" onClick={actions.back} disabled={state.phase !== 'ready'}>
          ← Back
        </Button>
        {allOk || state.phase === 'submitting' ? (
          <Button
            variant="primary"
            size="sm"
            onClick={actions.submit}
            busy={state.phase === 'submitting'}
          >
            Submit to the cluster
          </Button>
        ) : null}
      </div>
    </>
  );
}

function CheckRow({
  status,
  text,
  detail,
}: {
  status: CheckState['status'];
  text: string;
  detail?: string;
}) {
  const mark = { ok: '✓', failed: '✕', running: '…', pending: '○', skipped: '–' }[status];
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span
        aria-hidden="true"
        className={cx(
          'w-4 text-center',
          status === 'ok' && 'text-pass',
          status === 'failed' && 'text-fail',
          status === 'running' && 'animate-pulse text-human',
          (status === 'pending' || status === 'skipped') && 'text-text-faint',
        )}
      >
        {mark}
      </span>
      <span className={cx(status === 'pending' || status === 'skipped' ? 'text-text-faint' : '')}>
        {text}
        {status === 'skipped' ? ' - not checked' : ''}
      </span>
      {detail ? <span className="text-xs text-text-muted">{detail}</span> : null}
      <span className="sr-only">{status}</span>
    </li>
  );
}

/** One sentence and one button per failure; the lists behind it wait under a fold. */
function FailureBox({
  failure,
  actions,
  onRecheck,
}: {
  failure: Failure;
  actions: Actions;
  onRecheck: () => void;
}) {
  const d = failure.details;
  const host = d.host ?? 'the cluster';
  const edit = ['module', 'scene', 'scenarios', 'parse'].includes(failure.kind);
  const toOptions = failure.kind === 'options';
  const files = [...(d.differ ?? []), ...(d.missing ?? []), ...(d.tampered ?? [])];
  let sentence: ReactNode = failure.message;
  if (failure.kind === 'no_session')
    sentence = (
      <>
        Open a terminal and run <code>ssh {host}</code> once (with your second factor).
      </>
    );
  else if (failure.kind === 'stale_copy')
    sentence = `The cluster's code is out of date (${files.length} file${files.length === 1 ? '' : 's'}).`;
  else if (failure.kind === 'no_copy') sentence = 'The cluster has no copy of this project yet.';
  else if (failure.kind === 'no_answer') sentence = 'The cluster did not answer properly.';
  else if (failure.kind === 'scene')
    sentence = `${d.failures?.length ?? 'Some'}${d.checked ? ` of ${d.checked}` : ''} scenes don't build in Scenic.`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-fail/30 bg-fail-soft/40 px-3 py-2.5">
      <p className="text-sm text-fail">{sentence}</p>
      {d.blocking_jobs?.length ? (
        <p className="text-xs text-text-muted">
          Wait for job{d.blocking_jobs.length > 1 ? 's' : ''}{' '}
          {d.blocking_jobs.map((j) => j.job_id).join(', ')} to end before syncing - they run from
          that copy.
        </p>
      ) : null}
      {files.length || d.sync_commands?.length ? (
        <Disclosure summary="Which files, and how to sync">
          <div className="flex flex-col gap-2 pt-1 text-xs">
            {files.length ? (
              <p className="font-mono text-text-muted">
                {files.slice(0, SHOWN).join(', ')}
                {files.length > SHOWN ? ` and ${files.length - SHOWN} more` : ''}
              </p>
            ) : null}
            <p className="text-text-muted">
              Rebuild the staging copy (infra/hpc/README.md, section 2), then:
            </p>
            {d.sync_commands?.map((c) => (
              <Command key={c} text={c} />
            ))}
          </div>
        </Disclosure>
      ) : null}
      {d.failures?.length ? (
        <Disclosure summary="Scenic's messages">
          <ul className="flex flex-col gap-1 pt-1 text-xs">
            {d.failures.map((f) => (
              <li key={f.scenario}>
                <span className="font-mono">{f.scenario}</span>
                <span className="block text-fail">{f.error}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      <div>
        {edit ? (
          <Button size="sm" onClick={actions.close}>
            Edit the requirement
          </Button>
        ) : toOptions ? (
          <Button size="sm" onClick={actions.back}>
            ← Back to the options
          </Button>
        ) : (
          <Button size="sm" onClick={onRecheck}>
            Check again
          </Button>
        )}
      </div>
    </div>
  );
}

function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code className="min-w-0 flex-1 rounded-md bg-surface-sunken px-2 py-1 font-mono text-[11px] break-all">
        {text}
      </code>
      <Button
        size="sm"
        variant="quiet"
        onClick={() =>
          void navigator.clipboard?.writeText(text).then(
            () => setCopied(true),
            () => undefined,
          )
        }
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ 3. Run

function Run({ state, actions }: { state: RunTestState; actions: Actions }) {
  const job = 'job' in state ? state.job : undefined;
  if (state.phase === 'opening') return <Muted>Opening the review…</Muted>;
  if (!job) return null;
  const queued = job.state === 'PENDING';
  const ended = state.phase === 'fetching' || state.phase === 'ended';
  const p = job.progress;
  return (
    <>
      <ol className="flex flex-col gap-2" aria-label="Progress">
        <Stage status="done" title="Submitted">
          job <span className="num">{job.job_id}</span> · {displayDate(job.submitted_at)}
        </Stage>
        <Stage status={queued ? 'now' : 'done'} title={queued ? 'Waiting in the queue' : 'Started'}>
          {job.started_at
            ? `${displayDate(job.started_at)}${job.node ? ` on ${job.node}` : ''}`
            : null}
        </Stage>
        <Stage status={queued ? 'next' : ended ? 'done' : 'now'} title="Running">
          {p ? `scenario ${p.done} of ${p.total}` : queued ? null : 'starting the simulator'}
          {job.elapsed && !queued ? ` · ${job.elapsed} of ${job.time_limit ?? '?'}` : ''}
        </Stage>
        {!queued && !ended && p ? (
          <li className="pl-6">
            <Progress done={p.done} total={p.total} />
          </li>
        ) : null}
        <Stage
          status={state.phase === 'fetching' ? 'now' : state.phase === 'ended' ? 'done' : 'next'}
          title="Bringing the results back"
        />
        <Stage status="next" title="Opening the review" />
      </ol>

      {state.phase === 'tracking' && job.partial?.done != null && job.run_id ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-fill px-3 py-2">
          <span className="text-sm">
            Results so far: {job.partial.done} of {job.partial.total ?? '?'} scenarios
          </span>
          <Button size="sm" onClick={() => actions.openResults(job.run_id as string)}>
            Look at them
          </Button>
        </div>
      ) : null}
      {state.phase === 'tracking' ? (
        <Instructions>
          You can close this panel; the job keeps running and the results open here.
        </Instructions>
      ) : null}

      {state.phase === 'ended' ? <Ended job={job} actions={actions} /> : null}
      {state.phase === 'error' ? (
        <div className="flex flex-col gap-2 rounded-lg border border-fail/30 bg-fail-soft/40 px-3 py-2.5">
          <p className="text-sm text-fail">
            {state.kind === 'no_session'
              ? `Lost the connection to ${state.details?.host ?? 'the cluster'}: run ssh ${state.details?.host ?? ''} once in a terminal. The job keeps running.`
              : state.message}
          </p>
          <div>
            <Button size="sm" onClick={actions.retry}>
              Check again
            </Button>
          </div>
        </div>
      ) : null}

      <Disclosure summary="Details (ports, errors, log, how to cancel)">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1 text-xs">
          {job.ports ? <Row term="Ports">{job.ports}</Row> : null}
          <Row term="Errors">
            {`${job.tracebacks ?? 0} traceback(s) in the log`}
            {job.mlflow_server_errors
              ? `, around ${job.mlflow_server_errors} MLflow server error report(s) ("Error handling request")`
              : ''}
          </Row>
          {job.not_created ? (
            <Row term="Not created">
              {`${job.not_created} scenario(s) the simulator could not create - listed in the report`}
            </Row>
          ) : null}
          {job.partial_message ? <Row term="Results so far">{job.partial_message}</Row> : null}
          {job.command ? (
            <Row term="Submitted as">
              <code className="break-all">{job.command}</code>
            </Row>
          ) : null}
          <Row term="To cancel">
            the tool never cancels a job; on the cluster run <code>scancel {job.job_id}</code>
          </Row>
        </dl>
        {job.log_tail?.length ? (
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-surface-sunken p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap">
            {job.log_tail.join('\n')}
          </pre>
        ) : null}
      </Disclosure>
    </>
  );
}

function Ended({ job, actions }: { job: Job; actions: Actions }) {
  const p = job.partial ?? job.progress;
  const how =
    job.state === 'TIMEOUT'
      ? 'stopped at its time limit'
      : job.state === 'COMPLETED'
        ? 'finished without a complete run'
        : `ended ${job.state.toLowerCase()}`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-fail/30 bg-fail-soft/40 px-3 py-2.5">
      <p className="text-sm text-fail">
        {job.run_id
          ? `The job ${how}${p?.done != null ? ` after ${p.done} of ${p.total ?? '?'} scenarios` : ''}. What ran was brought back, marked INCOMPLETE.`
          : `The job ${how} before it started running scenarios. Its log is saved in artifacts/job_logs/.`}
      </p>
      {job.message ? <p className="text-xs text-text-muted">{job.message}</p> : null}
      <div className="flex gap-2">
        {job.run_id ? (
          <Button size="sm" onClick={() => actions.openResults(job.run_id as string)}>
            Look at them
          </Button>
        ) : null}
        <Button size="sm" variant="quiet" onClick={actions.dismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Stage({
  status,
  title,
  children,
}: {
  status: 'done' | 'now' | 'next';
  title: string;
  children?: ReactNode;
}) {
  return (
    <li
      className="flex items-baseline gap-2 text-sm"
      aria-current={status === 'now' ? 'step' : undefined}
    >
      <span
        aria-hidden="true"
        className={cx(
          'w-4 text-center',
          status === 'done' && 'text-pass',
          status === 'now' && 'animate-pulse text-human',
          status === 'next' && 'text-text-faint',
        )}
      >
        {status === 'done' ? '✓' : status === 'now' ? '●' : '○'}
      </span>
      <span
        className={cx(status === 'next' && 'text-text-faint', status === 'now' && 'font-medium')}
      >
        {title}
      </span>
      {children ? <span className="text-xs text-text-muted">{children}</span> : null}
    </li>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-faint">{term}</dt>
      <dd className="min-w-0 text-text-muted">{children}</dd>
    </>
  );
}

function Muted({ children }: { children: string }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-fill-strong"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <div
        className="h-full rounded-full bg-human motion-safe:transition-all motion-safe:duration-step"
        style={{ width: `${total ? (done / total) * 100 : 0}%` }}
      />
    </div>
  );
}
