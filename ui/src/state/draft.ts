import { buildDecisions } from '@/domain/decisions';
import { isToolProposal } from '@/domain/lineage';
import type {
  AnalysisReport,
  AssumptionVerdict,
  DecisionsDoc,
  Mitigation,
  ObstacleVerdict,
  ScopeVerdict,
} from '@/services/schemas';

/**
 * The draft decision: the one piece of shared state whose loss would hurt.
 * It is a decisions document under construction plus what the interface
 * needs to tell three verdict states apart:
 *   - empty: nothing entered;
 *   - pre-filled: a verdict loaded from a decisions.json already on disk
 *     (the tool's proposal, or an earlier signature), not yet confirmed by
 *     the person reviewing now;
 *   - confirmed: entered or confirmed in this session.
 * The draft is serialisable and mirrored to sessionStorage; it is never the
 * signed file, and the signed file is never read back into it silently.
 */
export interface Prefill {
  reviewer: string | null;
  decidedAt: string | null;
  toolProposal: boolean;
}

export interface SignedRecord {
  at: string;
  mode: 'written' | 'downloaded';
  paths: string[];
  reviewer: string;
}

export interface Confirmed {
  obstacles: Record<string, boolean>;
  scope: Record<string, boolean>;
  assumptions: Record<string, boolean>;
}

export interface Draft {
  runId: string;
  doc: DecisionsDoc;
  confirmed: Confirmed;
  prefill: Prefill | null;
  reviewer: string;
  r1Override: string | null;
  signed: SignedRecord | null;
  startedAt: string;
  updatedAt: string;
}

export type VerdictState = 'empty' | 'prefilled' | 'confirmed';

export function obstacleState(draft: Draft, id: string): VerdictState {
  const entry = draft.doc.obstacles[id];
  if (!entry || entry.verdict === null) return 'empty';
  return draft.confirmed.obstacles[id] ? 'confirmed' : 'prefilled';
}
export function scopeState(draft: Draft, id: string): VerdictState {
  const entry = draft.doc.scope[id];
  if (!entry || entry.verdict === null) return 'empty';
  return draft.confirmed.scope[id] ? 'confirmed' : 'prefilled';
}
export function assumptionState(draft: Draft, text: string): VerdictState {
  const entry = draft.doc.assumptions?.[text];
  if (!entry || entry.verdict === null) return 'empty';
  return draft.confirmed.assumptions[text] ? 'confirmed' : 'prefilled';
}

/** Items still carrying an unconfirmed pre-filled verdict. */
export function unconfirmedCount(draft: Draft): number {
  let n = 0;
  for (const id of Object.keys(draft.doc.obstacles))
    if (obstacleState(draft, id) === 'prefilled') n++;
  for (const id of Object.keys(draft.doc.scope)) if (scopeState(draft, id) === 'prefilled') n++;
  for (const t of Object.keys(draft.doc.assumptions ?? {}))
    if (assumptionState(draft, t) === 'prefilled') n++;
  return n;
}

/**
 * A fresh draft from the report, pre-filled from a decisions.json on disk
 * when there is one (as pages/4_review.py does: the saved human fields are
 * kept, the tool-computed fields are refreshed from the analysis).
 */
export function createDraft(
  report: AnalysisReport,
  previous: AnalysisReport | null,
  existing: DecisionsDoc | null,
  round: number | null,
): Draft {
  const doc = buildDecisions(report, { previous, round: round ?? existing?.round ?? null });
  let prefill: Prefill | null = null;
  if (existing) {
    for (const [oid, entry] of Object.entries(doc.obstacles)) {
      const saved = existing.obstacles[oid];
      if (!saved) continue;
      entry.verdict = saved.verdict;
      entry.renamed_to = saved.renamed_to;
      entry.reason = saved.reason;
      entry.mitigation = saved.mitigation;
    }
    for (const [sid, entry] of Object.entries(doc.scope)) {
      const saved = existing.scope[sid];
      if (!saved) continue;
      entry.verdict = saved.verdict;
      entry.reason = saved.reason;
    }
    for (const [text, entry] of Object.entries(doc.assumptions ?? {})) {
      const saved = existing.assumptions?.[text];
      if (!saved) continue;
      entry.verdict = saved.verdict;
      entry.new_text = saved.new_text;
      entry.reason = saved.reason;
    }
    doc.added_assumptions = (existing.added_assumptions ?? []).map((a) => ({ ...a }));
    prefill = {
      reviewer: existing.reviewer ?? null,
      decidedAt: existing.decided_at ?? null,
      toolProposal: isToolProposal(existing),
    };
  }
  const now = new Date().toISOString();
  return {
    runId: report.run_id,
    doc,
    confirmed: { obstacles: {}, scope: {}, assumptions: {} },
    prefill,
    reviewer: '',
    r1Override: null,
    signed: null,
    startedAt: now,
    updatedAt: now,
  };
}

export type DraftAction =
  | { type: 'obstacle/verdict'; id: string; verdict: ObstacleVerdict | null }
  | { type: 'obstacle/renamed_to'; id: string; value: string }
  | { type: 'obstacle/reason'; id: string; value: string }
  | { type: 'obstacle/mitigation'; id: string; mitigation: Mitigation | null }
  | { type: 'obstacle/confirm'; id: string }
  | { type: 'scope/verdict'; id: string; verdict: ScopeVerdict | null }
  | { type: 'scope/reason'; id: string; value: string }
  | { type: 'scope/confirm'; id: string }
  | { type: 'assumption/verdict'; text: string; verdict: AssumptionVerdict | null }
  | { type: 'assumption/new_text'; text: string; value: string }
  | { type: 'assumption/reason'; text: string; value: string }
  | { type: 'assumption/confirm'; text: string }
  | { type: 'added_assumptions/set'; lines: string[] }
  | { type: 'reviewer/set'; value: string }
  | { type: 'r1/override'; value: string | null }
  | { type: 'signed'; record: SignedRecord; doc: DecisionsDoc };

const orNull = (s: string): string | null => (s === '' ? null : s);

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  const next = structuredClone(draft);
  next.updatedAt = new Date().toISOString();
  switch (action.type) {
    case 'obstacle/verdict': {
      const o = next.doc.obstacles[action.id];
      if (!o) return draft;
      o.verdict = action.verdict;
      // a rejected or deferred obstacle cannot carry a mitigation (decisions.validate)
      if (action.verdict === 'reject' || action.verdict === 'defer' || action.verdict === null)
        o.mitigation = null;
      if (action.verdict !== 'rename') o.renamed_to = null;
      next.confirmed.obstacles[action.id] = action.verdict !== null;
      return next;
    }
    case 'obstacle/renamed_to': {
      const o = next.doc.obstacles[action.id];
      if (!o) return draft;
      o.renamed_to = orNull(action.value);
      next.confirmed.obstacles[action.id] = true;
      return next;
    }
    case 'obstacle/reason': {
      const o = next.doc.obstacles[action.id];
      if (!o) return draft;
      o.reason = orNull(action.value);
      return next;
    }
    case 'obstacle/mitigation': {
      const o = next.doc.obstacles[action.id];
      if (!o) return draft;
      o.mitigation = action.mitigation;
      next.confirmed.obstacles[action.id] = true;
      return next;
    }
    case 'obstacle/confirm':
      next.confirmed.obstacles[action.id] = true;
      return next;
    case 'scope/verdict': {
      const s = next.doc.scope[action.id];
      if (!s) return draft;
      s.verdict = action.verdict;
      next.confirmed.scope[action.id] = action.verdict !== null;
      return next;
    }
    case 'scope/reason': {
      const s = next.doc.scope[action.id];
      if (!s) return draft;
      s.reason = orNull(action.value);
      return next;
    }
    case 'scope/confirm':
      next.confirmed.scope[action.id] = true;
      return next;
    case 'assumption/verdict': {
      const a = next.doc.assumptions?.[action.text];
      if (!a) return draft;
      a.verdict = action.verdict;
      if (action.verdict !== 'tighten' && action.verdict !== 'loosen') a.new_text = null;
      next.confirmed.assumptions[action.text] = action.verdict !== null;
      return next;
    }
    case 'assumption/new_text': {
      const a = next.doc.assumptions?.[action.text];
      if (!a) return draft;
      a.new_text = orNull(action.value);
      next.confirmed.assumptions[action.text] = true;
      return next;
    }
    case 'assumption/reason': {
      const a = next.doc.assumptions?.[action.text];
      if (!a) return draft;
      a.reason = orNull(action.value);
      return next;
    }
    case 'assumption/confirm':
      next.confirmed.assumptions[action.text] = true;
      return next;
    case 'added_assumptions/set':
      next.doc.added_assumptions = action.lines
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text) => ({ text, reason: null }));
      return next;
    case 'reviewer/set':
      next.reviewer = action.value;
      return next;
    case 'r1/override':
      next.r1Override = action.value;
      return next;
    case 'signed':
      next.signed = action.record;
      next.doc = action.doc;
      next.prefill = {
        reviewer: action.record.reviewer,
        decidedAt: action.doc.decided_at,
        toolProposal: false,
      };
      next.confirmed = { obstacles: {}, scope: {}, assumptions: {} };
      for (const id of Object.keys(next.doc.obstacles)) next.confirmed.obstacles[id] = true;
      for (const id of Object.keys(next.doc.scope)) next.confirmed.scope[id] = true;
      for (const t of Object.keys(next.doc.assumptions ?? {})) next.confirmed.assumptions[t] = true;
      return next;
    default:
      return draft;
  }
}

// ------------------------------------------------------------------ sessionStorage

const KEY_PREFIX = 'real-review:draft:';

export function draftKey(runId: string): string {
  return `${KEY_PREFIX}${runId}`;
}

export function loadDraft(runId: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(runId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return parsed && parsed.runId === runId && parsed.doc ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    sessionStorage.setItem(draftKey(draft.runId), JSON.stringify(draft));
  } catch {
    // storage may be unavailable (private mode, quota): the draft lives in memory only
  }
}

export function clearDraft(runId: string): void {
  try {
    sessionStorage.removeItem(draftKey(runId));
  } catch {
    // nothing to clear
  }
}
