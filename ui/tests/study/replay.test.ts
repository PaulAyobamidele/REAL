import './memoryStorage';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StudyConfig from '@/study/config';
import { logLines, startLog } from '@/study/log';
import { jobAt, replayApi, SCENARIOS } from '@/study/replay';
import { StudySource } from '@/study/studySource';

import { C1, R0, serveStudySite } from './fakeSite';

vi.mock('@/study/config', async (orig) => ({
  ...(await orig<typeof StudyConfig>()),
  STUDY: true,
}));

const events = () =>
  logLines('S-TEST')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { event: string; new?: Record<string, unknown> });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    'real-av.study.session',
    JSON.stringify({ id: 'S-TEST', expertise: 'Student', started_at: '', build: 'dev' }),
  );
  startLog('S-TEST');
  serveStudySite();
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the replayed run', () => {
  it('queues, runs scenario 1 to 288, and completes in about a minute', () => {
    const r = {
      job_id: '5000001',
      submitted: 0,
      requirement: 'requirements/R0.dsl',
      target: C1,
      studyRound: 'study_C1',
      node: 'ng00001',
      ports: 'p',
    };
    expect(jobAt(r, 3_000)).toMatchObject({ state: 'PENDING', progress: null });
    const mid = jobAt(r, 6_000 + 25_000);
    expect(mid).toMatchObject({ state: 'RUNNING', node: 'ng00001', run_id: C1 });
    expect(mid.progress).toEqual({ done: SCENARIOS / 2, total: SCENARIOS });
    expect(jobAt(r, 6_000 + 50_000)).toMatchObject({
      state: 'COMPLETED',
      progress: { done: SCENARIOS, total: SCENARIOS },
    });
  });

  it('runs the saved round of this requirement, reveals it when fetched, and logs a replay', async () => {
    expect((await (await StudySource.probe())!.list()).rounds).toEqual([]); // nothing run yet

    const check = replayApi.checkLaptop(R0, { search: 'grid' });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await check).toMatchObject({ ok: true, checked: SCENARIOS });

    const submitted = replayApi.submitRun(R0, 'R0.dsl', { search: 'grid' });
    await vi.advanceTimersByTimeAsync(800);
    const job = await submitted;
    expect(job.state).toBe('PENDING');
    expect(job.job_id).toMatch(/^5\d{6}$/);

    vi.setSystemTime(Date.now() + 60_000);
    expect((await replayApi.refreshPartial(job.job_id)).state).toBe('COMPLETED');
    const fetched = replayApi.fetchJob(job.job_id);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(await fetched).toMatchObject({ fetched: true, complete: true, run_id: C1 });

    expect((await (await StudySource.probe())!.list()).rounds.map((r) => r.dir)).toEqual([C1]);
    const log = events();
    expect(log.find((e) => e.event === 'run_submitted')?.new).toMatchObject({
      replay: true,
      study_round: 'study_C1',
      shown_run_id: C1,
    });
    expect(log.find((e) => e.event === 'run_finished')?.new).toMatchObject({ replay: true });
  });

  it('refuses a requirement that has no saved run', async () => {
    const check = replayApi.checkLaptop('MAINTAIN "Something else"', { search: 'grid' });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await check).toMatchObject({ ok: false });
    const submitted = replayApi.submitRun('MAINTAIN "Something else"', 'R0.dsl', {
      search: 'grid',
    });
    const settled = expect(submitted).rejects.toThrow(/no saved run/);
    await vi.advanceTimersByTimeAsync(800);
    await settled;
  });
});

describe('what a replayed job reports', () => {
  it('has no elapsed time, so the panel shows none', () => {
    const r = {
      job_id: '5000001',
      submitted: 0,
      requirement: 'r',
      target: C1,
      studyRound: 'study_C1',
      node: 'n',
      ports: 'p',
    };
    for (const t of [0, 30_000, 60_000]) expect(jobAt(r, t).elapsed).toBeUndefined();
  });
});
