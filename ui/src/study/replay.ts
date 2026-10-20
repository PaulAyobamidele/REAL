import { ClusterRefusal, type Job, type LaptopCheck, type RunOptions } from '@/services/authoring';
import type { FileSource } from '@/services/workspace';

import { logEvent } from './log';
import { reveal, StudySource, type BundledRound } from './studySource';

/**
 * Run Test in the study build: the same calls as the live cluster connection
 * (scripts/redsl/cluster_jobs.py through the helper), answered from the
 * pre-computed rounds. The panel looks and behaves as for a live run - checks,
 * a job number, the queue, the node, scenario n of N - compressed into about a
 * minute; when the "job" ends, the saved round for the requirement's car is
 * revealed in the workspace and opened. Each replay is logged as one, and the
 * spoken briefing tells participants that all runs are pre-computed.
 */
export const SCENARIOS = 288;
export const RUNS_PER_SCENARIO = 3;
export const TIME_LIMIT = '05:00:00';
const QUEUE_MS = 6_000;
const RUN_MS = 50_000;
const CHECK_LAPTOP_MS = 3_000;
const CHECK_CLUSTER_MS = 1_500;
const SUBMIT_MS = 800;
const FETCH_MS = 2_500;
const KEY = 'real-av.study.replay.';

interface Replay {
  job_id: string;
  submitted: number;
  requirement: string;
  target: string; // the neutral run id of the saved round
  studyRound: string;
  node: string;
  ports: string;
}

const memory = new Map<string, Replay>();
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const digits = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => String(b % 10)).join('');

function save(r: Replay): void {
  memory.set(r.job_id, r);
  try {
    window.localStorage.setItem(KEY + r.job_id, JSON.stringify(r));
  } catch {
    // followed for this page only
  }
}

function load(jobId: string): Replay | null {
  try {
    const raw = window.localStorage.getItem(KEY + jobId);
    if (raw) return JSON.parse(raw) as Replay;
  } catch {
    // fall through
  }
  return memory.get(jobId) ?? null;
}

/** The saved round this requirement runs as: the round run with exactly this text. */
async function targetFor(text: string): Promise<BundledRound | null> {
  const source = await StudySource.probe();
  if (!source) return null;
  return (await source.bundled()).find((r) => r.requirement?.trim() === text.trim()) ?? null;
}

/** The job as the status call reports it at time `now`. */
export function jobAt(r: Replay, now: number): Job {
  const t = now - r.submitted;
  const base = {
    job_id: r.job_id,
    requirement: r.requirement,
    submitted_at: new Date(r.submitted).toISOString(),
    time_limit: TIME_LIMIT,
    tracebacks: 0,
    mlflow_server_errors: 0,
    not_created: 0,
  };
  if (t < QUEUE_MS) return { ...base, state: 'PENDING', progress: null, run_id: null };
  const running = t - QUEUE_MS;
  const done = Math.min(SCENARIOS, Math.floor((running / RUN_MS) * SCENARIOS));
  return {
    ...base,
    state: running >= RUN_MS ? 'COMPLETED' : 'RUNNING',
    started_at: new Date(r.submitted + QUEUE_MS).toISOString(),
    // no elapsed time: a replay's real seconds would not look like a cluster run (owner, 2026-10-18)
    node: r.node,
    ports: r.ports,
    progress: { done, total: SCENARIOS },
    run_id: r.target,
    ok: running >= RUN_MS ? true : null,
  };
}

export const replayApi = {
  pollMs: 1_000,

  async checkLaptop(text: string, options: RunOptions): Promise<LaptopCheck> {
    await sleep(CHECK_LAPTOP_MS);
    const target = await targetFor(text);
    logEvent({
      screen: 'run',
      event: 'run_checks',
      target: 'laptop',
      new: { ok: Boolean(target), options },
    });
    if (!target)
      return { ok: false, kind: 'scenarios', message: 'no saved run exists for this requirement' };
    return {
      ok: true,
      kind: null,
      checked: SCENARIOS,
      how: 'every listed scenario',
      system_under_test: target.car,
      failures: [],
    };
  },

  async checkCluster(): Promise<void> {
    await sleep(CHECK_CLUSTER_MS);
    logEvent({ screen: 'run', event: 'run_checks', target: 'cluster', new: { ok: true } });
  },

  async submitRun(text: string, name: string, options: RunOptions): Promise<Job> {
    await sleep(SUBMIT_MS);
    const target = await targetFor(text);
    if (!target) throw new ClusterRefusal('no saved run exists for this requirement', 'scenarios');
    const slot = Number(digits(3));
    const r: Replay = {
      job_id: `5${digits(6)}`,
      submitted: Date.now(),
      requirement: `requirements/${name}`,
      target: target.dir,
      studyRound: target.studyRound,
      node: `ng${digits(5)}`,
      ports: `CARLA ${20000 + slot * 4} (traffic manager ${26000 + slot * 4}), Redis ${33000 + slot}, MLflow ${34000 + slot}, API ${35000 + slot}`,
    };
    save(r);
    logEvent({
      screen: 'run',
      event: 'run_submitted',
      target: r.job_id,
      new: { replay: true, study_round: r.studyRound, shown_run_id: r.target, options },
    });
    return jobAt(r, r.submitted);
  },

  async refreshPartial(jobId: string): Promise<Job> {
    const r = load(jobId);
    if (!r) throw new ClusterRefusal(`no job ${jobId} was submitted from here`);
    return jobAt(r, Date.now());
  },

  async fetchJob(jobId: string): Promise<Job> {
    const r = load(jobId);
    if (!r) throw new ClusterRefusal(`no job ${jobId} was submitted from here`);
    await sleep(FETCH_MS);
    reveal(r.target);
    logEvent({
      screen: 'run',
      event: 'run_finished',
      target: r.job_id,
      new: { replay: true, study_round: r.studyRound, shown_run_id: r.target },
    });
    return { ...jobAt(r, Date.now()), fetched: true, complete: true };
  },

  /**
   * The study's Start Running Compliance Test (owner, 2026-10-19): no panel, no
   * replayed job - the saved round for this requirement is revealed and its
   * review opens at once, at the requirement under test. Logged as a direct open.
   */
  async openDirect(text: string): Promise<string | null> {
    const target = await targetFor(text);
    logEvent({
      screen: 'run',
      event: 'run_opened',
      target: target?.dir,
      new: target
        ? { replay: true, direct: true, study_round: target.studyRound, shown_run_id: target.dir }
        : { ok: false },
    });
    if (!target) return null;
    reveal(target.dir);
    return target.dir;
  },

  async projectRunsSource(): Promise<FileSource | null> {
    return StudySource.probe();
  },
};
