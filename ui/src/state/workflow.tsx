import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { StepProgress } from '@/domain/reviewProgress';

/** The review a page is on, for the workflow bar in the top header. */
export interface WorkflowState {
  runId: string;
  step: number;
  steps: StepProgress[];
}

const Ctx = createContext<{
  state: WorkflowState | null;
  set: (s: WorkflowState | null) => void;
} | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, set] = useState<WorkflowState | null>(null);
  return <Ctx.Provider value={{ state, set }}>{children}</Ctx.Provider>;
}

/** The review last opened (kept after leaving it, so the workflow line can lead back). */
export function useWorkflow(): WorkflowState | null {
  return useContext(Ctx)?.state ?? null;
}

/** A review step reports where it is; the header follows. */
export function useReportWorkflow(state: WorkflowState): void {
  const set = useContext(Ctx)?.set;
  const key = `${state.runId}|${state.step}|${state.steps.map((s) => `${s.state}:${s.detail}:${s.attention ?? ''}`).join('|')}`;
  useEffect(() => {
    set?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key holds what changes
  }, [set, key]);
}
