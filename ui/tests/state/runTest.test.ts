import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRunTest } from '@/state/runTest';

const RUN = 'fedcba9876543210fedcba9876543210';
const base = {
  job_id: '4999001',
  requirement: 'requirements/R_new.dsl',
  submitted_at: '2026-10-13T08:00:00Z',
  run_id: RUN,
};
// jsdom here has no localStorage; an in-memory one stands in (as in RequirementViews.test.tsx)
const memory = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
  },
});

let partial: Record<string, unknown>;
let fetched: Record<string, unknown>;
const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  window.localStorage.setItem('real-av.run-test.job', '4999001'); // a job followed across a reload
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url);
      calls.push(path);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      if (path.endsWith('/partial')) return json(partial);
      if (path.endsWith('/fetch')) return json(fetched);
      if (path.endsWith('/index.json'))
        return json({ schema_version: 1, label: 'runs', example: false, rounds: [], ignored: [] });
      return new Response('not found', { status: 404 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('following a job to its end', () => {
  it('polls through the partial endpoint while it runs', async () => {
    partial = { ...base, state: 'RUNNING', progress: { done: 1, total: 4 } };
    const { result } = renderHook(() =>
      useRunTest({ text: 'x', fileName: 'R_new.dsl', open: vi.fn() }),
    );
    await waitFor(() => expect(result.current.state.phase).toBe('tracking'));
    expect(calls.some((c) => c.endsWith('/authoring/jobs/4999001/partial'))).toBe(true);
  });

  it('brings back a run that ended early and explains it instead of opening it', async () => {
    partial = { ...base, state: 'TIMEOUT' };
    fetched = { ...base, state: 'TIMEOUT', fetched: true, complete: false };
    const open = vi.fn();
    const { result } = renderHook(() => useRunTest({ text: 'x', fileName: 'R_new.dsl', open }));
    await waitFor(() => expect(result.current.state.phase).toBe('ended'));
    expect(calls.some((c) => c.endsWith('/fetch'))).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('real-av.run-test.job')).toBeNull();
  });

  it('opens a complete run at its Test Execution Result', async () => {
    partial = { ...base, state: 'COMPLETED' };
    fetched = { ...base, state: 'COMPLETED', fetched: true, complete: true };
    const open = vi.fn(async () => undefined);
    renderHook(() => useRunTest({ text: 'x', fileName: 'R_new.dsl', open }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    await waitFor(() => expect(window.location.hash).toContain(`${RUN}/2`));
  });
});
