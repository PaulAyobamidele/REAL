import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';

import type { RoundSummary } from '@/domain/lineage';
import type { AnalysisReport } from '@/services/schemas';

import {
  createDraft,
  draftReducer,
  loadDraft,
  saveDraft,
  type Draft,
  type DraftAction,
} from './draft';

/**
 * One draft per run id, kept in a reducer and mirrored to sessionStorage on
 * every change, so a reload mid-review does not lose the reviewer's work.
 */
interface DraftsState {
  drafts: Record<string, Draft>;
}

type DraftsAction =
  | { type: 'init'; draft: Draft }
  | { type: 'update'; runId: string; action: DraftAction }
  | { type: 'discard'; runId: string };

function reducer(state: DraftsState, action: DraftsAction): DraftsState {
  switch (action.type) {
    case 'init':
      return { drafts: { ...state.drafts, [action.draft.runId]: action.draft } };
    case 'update': {
      const current = state.drafts[action.runId];
      if (!current) return state;
      const next = draftReducer(current, action.action);
      if (next === current) return state;
      saveDraft(next);
      return { drafts: { ...state.drafts, [action.runId]: next } };
    }
    case 'discard': {
      const drafts = { ...state.drafts };
      delete drafts[action.runId];
      return { drafts };
    }
  }
}

export interface DraftApi {
  draftFor: (runId: string) => Draft | undefined;
  /** The draft for a round: restored from this session if there is one, else built from the files. */
  ensureDraft: (round: RoundSummary, previous: AnalysisReport | null) => Draft | null;
  dispatch: (runId: string, action: DraftAction) => void;
  restart: (round: RoundSummary, previous: AnalysisReport | null) => void;
}

const DraftContext = createContext<DraftApi | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [state, dispatchAll] = useReducer(reducer, { drafts: {} });

  const draftFor = useCallback((runId: string) => state.drafts[runId], [state.drafts]);

  const ensureDraft = useCallback(
    (round: RoundSummary, previous: AnalysisReport | null): Draft | null => {
      const existing = state.drafts[round.id];
      if (existing) return existing;
      if (!round.report) return null;
      const restored = loadDraft(round.id);
      const draft =
        restored ?? createDraft(round.report, previous, round.decisions, round.meta.round ?? null);
      // init during render would be a side effect; defer to a microtask
      queueMicrotask(() => dispatchAll({ type: 'init', draft }));
      return draft;
    },
    [state.drafts],
  );

  const dispatch = useCallback(
    (runId: string, action: DraftAction) => dispatchAll({ type: 'update', runId, action }),
    [],
  );

  const restart = useCallback((round: RoundSummary, previous: AnalysisReport | null) => {
    if (!round.report) return;
    const draft = createDraft(round.report, previous, round.decisions, round.meta.round ?? null);
    saveDraft(draft);
    dispatchAll({ type: 'init', draft });
  }, []);

  const api = useMemo<DraftApi>(
    () => ({ draftFor, ensureDraft, dispatch, restart }),
    [draftFor, ensureDraft, dispatch, restart],
  );
  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

export function useDrafts(): DraftApi {
  const api = useContext(DraftContext);
  if (!api) throw new Error('useDrafts outside DraftProvider');
  return api;
}
