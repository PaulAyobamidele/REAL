import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runNumberOf, runOrdinal, type RoundSummary } from '@/domain/lineage';
import type * as Authoring from '@/services/authoring';
import { useRunTest } from '@/state/runTest';

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

const PARENT = 'a'.repeat(32);
const job = {
  job_id: '5000001',
  requirement: 'requirements/R1.dsl',
  submitted_at: '2026-10-20T10:00:00Z',
  run_id: null,
  state: 'PENDING',
};
const submitRun = vi.fn(async () => job);

vi.mock('@/services/authoring', async (original) => ({
  ...(await original<typeof Authoring>()),
  matchRequirement: vi.fn(async () => ({ matches: [] })),
  checkLaptop: vi.fn(async () => ({ ok: true, system_under_test: null })),
  checkCluster: vi.fn(async () => undefined),
  submitRun: (...args: unknown[]) => submitRun(...(args as [])),
  // the job is followed after submitting; here it never answers, so nothing else runs
  refreshPartial: vi.fn(() => new Promise(() => undefined)),
}));

afterEach(() => {
  window.localStorage.clear();
  submitRun.mockClear();
});

const round = (id: string, parent: string | null, n: number | null = null) =>
  ({ id, meta: { parent_run_id: parent, round: n } }) as unknown as RoundSummary;

describe('which run of the requirement a round is', () => {
  it('counts the recorded parents', () => {
    const first = round(PARENT, null);
    const second = round('b'.repeat(32), PARENT);
    const third = round('c'.repeat(32), 'b'.repeat(32));
    const all = [first, second, third];
    expect(runNumberOf(first, all)).toBe(1);
    expect(runNumberOf(second, all)).toBe(2);
    expect(runNumberOf(third, all)).toBe(3);
    expect(runOrdinal(2)).toBe('Second run');
    expect(runOrdinal(9)).toBe('Run 9');
  });

  it('takes a recorded round number when its parent is not in the workspace', () => {
    expect(runNumberOf(round('d'.repeat(32), 'e'.repeat(32), 2), [])).toBe(2);
  });
});

describe('running R1 as the next run', () => {
  it('records its parent and round number, and will open on its report', async () => {
    const { result } = renderHook(() =>
      useRunTest({
        text: 'R1 text',
        fileName: 'R1_test',
        open: vi.fn(),
        landOn: 2,
        provenance: { parent_run_id: PARENT, round: 2 },
      }),
    );
    await act(() => result.current.start());
    await waitFor(() => expect(result.current.state.phase).toBe('choose'));
    await act(() => result.current.check({ search: 'grid' }));
    await waitFor(() => expect(result.current.state.phase).toBe('ready'));
    await act(() => result.current.submit());
    expect(submitRun).toHaveBeenCalledWith('R1 text', 'R1_test.dsl', {
      search: 'grid',
      parent_run_id: PARENT,
      round: 2,
    });
    expect(window.localStorage.getItem('real-av.run-test.land')).toBe('2');
  });
});
